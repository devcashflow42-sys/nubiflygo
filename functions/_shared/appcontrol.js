/* ==========================================================================
   appcontrol.js — Control global de la app Android: versión publicada, URL de
   descarga, mantenimiento y suspensión. Una fila por plataforma en la base
   (app_control) y un historial de cambios administrativos (app_control_audit).

   Módulo puro (sin dependencias): lo usan las Functions de Cloudflare y el
   servidor Node con su propio `db` ({ query(text, params) → { rows, rowCount } }).

     buildStatus(row, client, now)   → JSON público de GET /api/v1/app/status
     validateUpdate / validateMaintenance / validateSuspension → { values } | { error }
     saveSection(db, section, values, admin) → guarda + historial (transacción)
     enforceForClient(row, client)   → bloqueo en el servidor (suspensión,
                                        mantenimiento, versión mínima) o null
   ========================================================================== */

export const PLATFORM = 'android';

/* ─── Tablas (idempotente) ─── */
let ready = null;
export function ensureAppControl(db) {
  if (!ready) {
    ready = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS app_control (
        platform              TEXT PRIMARY KEY CHECK (platform IN ('android')),
        environment           TEXT NOT NULL DEFAULT 'production',
        latest_version        TEXT NOT NULL DEFAULT '1.0.0',
        latest_build          INTEGER NOT NULL DEFAULT 1 CHECK (latest_build >= 1),
        release_date          TIMESTAMPTZ,
        download_url          TEXT,
        min_supported_version TEXT NOT NULL DEFAULT '1.0.0',
        min_supported_build   INTEGER NOT NULL DEFAULT 1 CHECK (min_supported_build >= 1),
        force_update          BOOLEAN NOT NULL DEFAULT false,
        maintenance_active    BOOLEAN NOT NULL DEFAULT false,
        maintenance_message   TEXT,
        maintenance_starts_at TIMESTAMPTZ,
        maintenance_ends_at   TIMESTAMPTZ,
        suspension_active     BOOLEAN NOT NULL DEFAULT false,
        suspension_reason     TEXT,
        suspension_message    TEXT,
        suspended_at          TIMESTAMPTZ,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by            UUID,
        CHECK (min_supported_build <= latest_build)
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS app_control_audit (
        id          BIGSERIAL PRIMARY KEY,
        platform    TEXT NOT NULL,
        section     TEXT NOT NULL CHECK (section IN ('update', 'maintenance', 'suspension')),
        admin_id    UUID,
        admin_email TEXT,
        ip          TEXT,
        before      JSONB,
        after       JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await db.query('CREATE INDEX IF NOT EXISTS idx_app_control_audit_time ON app_control_audit(platform, created_at DESC)');
      await db.query(`INSERT INTO app_control (platform) VALUES ($1) ON CONFLICT (platform) DO NOTHING`, [PLATFORM]);
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}

export async function readConfig(db) {
  await ensureAppControl(db);
  const { rows } = await db.query('SELECT * FROM app_control WHERE platform = $1', [PLATFORM]);
  return rows[0];
}

/* ─── Cliente: versión instalada (query ?build=&version= o cabeceras) ─── */
export function clientInfo(get) {
  const rawBuild = get('build') || get('x-app-build');
  const build = /^\d{1,9}$/.test(String(rawBuild || '').trim()) ? Number(rawBuild) : null;
  const version = String(get('version') || get('x-app-version') || '').trim().slice(0, 32) || null;
  return { build, version: VERSION_RE.test(version || '') ? version : null };
}

const iso = (v) => (v ? new Date(v).toISOString() : null);

// Mantenimiento vigente: activado y dentro de su ventana (si la tiene).
export function maintenanceOn(row, now = new Date()) {
  if (!row || !row.maintenance_active) return false;
  if (row.maintenance_starts_at && now < new Date(row.maintenance_starts_at)) return false;
  if (row.maintenance_ends_at && now >= new Date(row.maintenance_ends_at)) return false;
  return true;
}

/* ─── JSON público ───
   update.available / update.mandatory se calculan con la compilación del
   cliente. Sin compilación no se puede decidir: ambos en false. */
export function buildStatus(row, client = {}, now = new Date()) {
  const b = client.build;
  const known = Number.isInteger(b);
  const available = known && b < row.latest_build;
  const belowMin = known && b < row.min_supported_build;
  const mandatory = available && (belowMin || !!row.force_update);
  const maint = maintenanceOn(row, now);
  const suspended = !!row.suspension_active;
  return {
    success: true,
    status: suspended ? 'suspended' : maint ? 'maintenance' : mandatory ? 'update_required' : 'ok',
    server_time: now.toISOString(),
    app: { platform: row.platform, environment: row.environment },
    suspension: {
      active: suspended,
      reason: suspended ? row.suspension_reason || null : null,
      message: suspended ? row.suspension_message || null : null,
      suspended_at: suspended ? iso(row.suspended_at) : null
    },
    maintenance: {
      active: maint,
      message: row.maintenance_active ? row.maintenance_message || null : null,
      starts_at: row.maintenance_active ? iso(row.maintenance_starts_at) : null,
      ends_at: row.maintenance_active ? iso(row.maintenance_ends_at) : null
    },
    update: {
      available,
      mandatory,
      min_supported_version: row.min_supported_version,
      min_supported_build: row.min_supported_build,
      latest: {
        version: row.latest_version,
        build: row.latest_build,
        release_date: iso(row.release_date),
        download_url: row.download_url || null
      }
    }
  };
}

/* ─── Bloqueo en el servidor (solo peticiones de la app Android) ───
   Devuelve { status, body } si la petición no debe seguir, o null. */
export function enforceForClient(row, client, now = new Date()) {
  if (!row) return null;
  if (row.suspension_active) {
    return { status: 503, body: { error: row.suspension_message || 'El servicio está suspendido temporalmente.', code: 'app_suspended', reason: row.suspension_reason || null } };
  }
  if (maintenanceOn(row, now)) {
    return { status: 503, body: { error: row.maintenance_message || 'Estamos en mantenimiento. Vuelve en unos minutos.', code: 'maintenance', ends_at: iso(row.maintenance_ends_at) } };
  }
  if (Number.isInteger(client.build) && client.build < row.min_supported_build) {
    return { status: 426, body: { error: 'Esta versión de la app ya no es compatible. Actualízala para continuar.', code: 'update_required', min_supported_build: row.min_supported_build, download_url: row.download_url || null } };
  }
  return null;
}

/* ─── Bloqueo para la app Android (lo usan los middlewares) ───
   Solo peticiones con X-NubiFly-Client: android. Quedan libres el propio
   /app/status (la app necesita leerlo) y /admin (para poder reactivar).
   La configuración se guarda 15 s en memoria para no leer la base en cada
   petición; /app/status siempre lee la vigente. */
const EXEMPT_RE = /^\/api\/v1\/(app\/status|admin)(\/|$)/i;
let cache = { row: null, at: 0 };
export async function appGateFor(db, path, get) {
  if (String(get('x-nubifly-client') || '').toLowerCase() !== 'android') return null;
  if (EXEMPT_RE.test(path)) return null;
  if (!cache.row || Date.now() - cache.at > 15000) {
    try { cache = { row: await readConfig(db), at: Date.now() }; }
    catch { return null; }                       // si la base falla, no se bloquea por esto
  }
  return enforceForClient(cache.row, clientInfo(get));
}
export function resetAppGateCache() { cache = { row: null, at: 0 }; }

/* ─── Validación de lo que envía el administrador ─── */
const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function text(v, max, name) {
  if (v === null) return { v: null };
  if (typeof v !== 'string') return { error: name + ' debe ser texto o null.' };
  const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (t.length > max) return { error: name + ': máximo ' + max + ' caracteres.' };
  return { v: t || null };
}
function date(v, name) {
  if (v === null) return { v: null };
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) || isNaN(Date.parse(v))) {
    return { error: name + ' debe ser una fecha ISO 8601 con zona (p. ej. 2026-10-19T18:00:00Z) o null.' };
  }
  return { v: new Date(v).toISOString() };
}
function build(v, name) {
  if (!Number.isInteger(v) || v < 1 || v > 2100000000) return { error: name + ' debe ser un número entero mayor que 0.' };
  return { v };
}
function version(v, name) {
  if (typeof v !== 'string' || !VERSION_RE.test(v)) return { error: name + ' debe tener el formato 1.2.3.' };
  return { v };
}
// Solo https, con dominio (no IP ni localhost), sin usuario/contraseña en la URL.
export function validDownloadUrl(v) {
  if (v === null) return { v: null };
  if (typeof v !== 'string' || v.length > 2048) return { error: 'download_url debe ser una URL https de hasta 2048 caracteres o null.' };
  let u;
  try { u = new URL(v.trim()); } catch { return { error: 'download_url no es una URL válida.' }; }
  if (u.protocol !== 'https:') return { error: 'download_url debe usar https://.' };
  if (u.username || u.password) return { error: 'download_url no puede llevar usuario ni contraseña.' };
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || /^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) {
    return { error: 'download_url debe apuntar a un dominio público.' };
  }
  return { v: u.toString() };
}
// Aplica un validador si el campo viene; devuelve error o deja el valor en out.
function take(src, key, fn, out, col) {
  if (!has(src, key)) return null;
  const r = fn(src[key], key);
  if (r.error) return r.error;
  out[col || key] = r.v;
  return null;
}
function unknownKeys(src, allowed) {
  const extra = Object.keys(src).filter(k => !allowed.includes(k));
  return extra.length ? 'Campos no permitidos: ' + extra.join(', ') + '.' : null;
}

// PUT /admin/app/update — campos omitidos se conservan.
export function validateUpdate(src, current) {
  if (!isObj(src)) return { error: 'El cuerpo debe ser un objeto JSON.' };
  const allowed = ['version', 'build', 'download_url', 'release_date', 'min_supported_version', 'min_supported_build', 'mandatory', 'environment'];
  const bad = unknownKeys(src, allowed); if (bad) return { error: bad };
  const out = {};
  const err = take(src, 'version', version, out, 'latest_version')
    || take(src, 'build', build, out, 'latest_build')
    || take(src, 'download_url', validDownloadUrl, out)
    || take(src, 'release_date', date, out)
    || take(src, 'min_supported_version', version, out)
    || take(src, 'min_supported_build', build, out)
    || take(src, 'mandatory', (v) => typeof v === 'boolean' ? { v } : { error: 'mandatory debe ser true o false.' }, out, 'force_update')
    || take(src, 'environment', (v) => ['production', 'staging'].includes(v) ? { v } : { error: 'environment debe ser "production" o "staging".' }, out);
  if (err) return { error: err };
  if (!Object.keys(out).length) return { error: 'No hay nada que actualizar.' };
  const latest = has(out, 'latest_build') ? out.latest_build : current.latest_build;
  const min = has(out, 'min_supported_build') ? out.min_supported_build : current.min_supported_build;
  if (min > latest) return { error: 'min_supported_build no puede ser mayor que build (' + latest + ').' };
  // Nueva compilación publicada sin fecha → ahora.
  if (has(out, 'latest_build') && out.latest_build !== current.latest_build && !has(out, 'release_date')) out.release_date = new Date().toISOString();
  return { values: out };
}

// PUT /admin/app/maintenance — "active" es obligatorio.
export function validateMaintenance(src) {
  if (!isObj(src)) return { error: 'El cuerpo debe ser un objeto JSON.' };
  const bad = unknownKeys(src, ['active', 'message', 'starts_at', 'ends_at']); if (bad) return { error: bad };
  if (typeof src.active !== 'boolean') return { error: 'active (true/false) es obligatorio.' };
  const out = { maintenance_active: src.active };
  const err = take(src, 'message', (v) => text(v, 500, 'message'), out, 'maintenance_message')
    || take(src, 'starts_at', date, out, 'maintenance_starts_at')
    || take(src, 'ends_at', date, out, 'maintenance_ends_at');
  if (err) return { error: err };
  const s = out.maintenance_starts_at, e = out.maintenance_ends_at;
  if (s && e && new Date(e) <= new Date(s)) return { error: 'ends_at debe ser posterior a starts_at.' };
  if (!src.active) Object.assign(out, { maintenance_starts_at: null, maintenance_ends_at: null });
  return { values: out };
}

// PUT /admin/app/suspension — "active" es obligatorio.
export function validateSuspension(src) {
  if (!isObj(src)) return { error: 'El cuerpo debe ser un objeto JSON.' };
  const bad = unknownKeys(src, ['active', 'reason', 'message', 'suspended_at']); if (bad) return { error: bad };
  if (typeof src.active !== 'boolean') return { error: 'active (true/false) es obligatorio.' };
  const out = { suspension_active: src.active };
  const err = take(src, 'reason', (v) => text(v, 200, 'reason'), out, 'suspension_reason')
    || take(src, 'message', (v) => text(v, 500, 'message'), out, 'suspension_message')
    || take(src, 'suspended_at', date, out);
  if (err) return { error: err };
  if (src.active && !has(out, 'suspended_at')) out.suspended_at = new Date().toISOString();
  if (!src.active) Object.assign(out, { suspended_at: null, suspension_reason: null, suspension_message: null });
  return { values: out };
}

/* ─── Guardar + historial en una sola transacción ─── */
const SECTION_COLS = {
  update: ['environment', 'latest_version', 'latest_build', 'release_date', 'download_url', 'min_supported_version', 'min_supported_build', 'force_update'],
  maintenance: ['maintenance_active', 'maintenance_message', 'maintenance_starts_at', 'maintenance_ends_at'],
  suspension: ['suspension_active', 'suspension_reason', 'suspension_message', 'suspended_at']
};
const pick = (row, cols) => Object.fromEntries(cols.map(c => [c, row[c] instanceof Date ? row[c].toISOString() : row[c] ?? null]));

export async function saveSection(db, section, values, admin) {
  await ensureAppControl(db);
  const allowed = SECTION_COLS[section];
  const cols = Object.keys(values).filter(c => allowed.includes(c));   // nunca columnas fuera de la sección
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).concat(['updated_at = now()', `updated_by = $${cols.length + 2}`]);
  const params = [PLATFORM, ...cols.map(c => values[c]), admin.id];
  // Una sola sentencia: lee el valor anterior, actualiza y escribe el historial
  // de forma atómica (funciona igual con Neon por HTTP y con pg).
  const { rows } = await db.query(
    `WITH before AS (SELECT * FROM app_control WHERE platform = $1),
          upd AS (UPDATE app_control SET ${sets.join(', ')} WHERE platform = $1 RETURNING *),
          log AS (INSERT INTO app_control_audit (platform, section, admin_id, admin_email, ip, before, after)
                  SELECT $1, $${cols.length + 3}, $${cols.length + 2}, $${cols.length + 4}, $${cols.length + 5},
                         (SELECT to_jsonb(b) FROM before b), (SELECT to_jsonb(u) FROM upd u))
     SELECT * FROM upd`,
    params.concat([section, admin.email || null, admin.ip || null]));
  return rows[0];
}

// Historial reciente (solo la sección que cambió de cada registro).
export async function readAudit(db, limit = 50) {
  await ensureAppControl(db);
  const { rows } = await db.query(
    `SELECT id, section, admin_email, ip, before, after, created_at FROM app_control_audit
     WHERE platform = $1 ORDER BY created_at DESC, id DESC LIMIT $2`, [PLATFORM, Math.min(200, Math.max(1, limit))]);
  return rows.map(r => ({
    id: Number(r.id), section: r.section, admin_email: r.admin_email, ip: r.ip,
    before: r.before ? pick(r.before, SECTION_COLS[r.section]) : null,
    after: r.after ? pick(r.after, SECTION_COLS[r.section]) : null,
    created_at: iso(r.created_at)
  }));
}

// Vista del administrador: la configuración completa tal cual.
export function adminView(row) {
  return {
    platform: row.platform, environment: row.environment,
    update: {
      version: row.latest_version, build: row.latest_build, release_date: iso(row.release_date),
      download_url: row.download_url || null, min_supported_version: row.min_supported_version,
      min_supported_build: row.min_supported_build, mandatory: !!row.force_update
    },
    maintenance: { active: !!row.maintenance_active, in_effect: maintenanceOn(row), message: row.maintenance_message || null, starts_at: iso(row.maintenance_starts_at), ends_at: iso(row.maintenance_ends_at) },
    suspension: { active: !!row.suspension_active, reason: row.suspension_reason || null, message: row.suspension_message || null, suspended_at: iso(row.suspended_at) },
    updated_at: iso(row.updated_at)
  };
}
