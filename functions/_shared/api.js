/* ==========================================================================
   api.js — Núcleo compartido de la API: autenticación (cookie o API key),
   verificación de administrador, CRUD genérico y los "envoltorios" de ruta que
   usa cada servicio. Separar esto en un solo sitio evita repetir la misma
   comprobación de sesión en cada carpeta y hace que un cambio de seguridad se
   aplique a toda la API a la vez.
   ========================================================================== */

import { getDb } from './db.js';
import { json, getUser } from './http.js';
import { deleteObject } from './storage.js';
import { preflight, segmentsOf, body, UUID_RE, GUEST_LIMITS, CRUD_MAX, PROJECT_ICON_IDS, COLOR_RE } from './util.js';
import { serverError, secLog, ensureSecurityColumns } from './security.js';
import { ensureTrashColumns } from './trash.js';
import { notifySafe, hourKey } from './notify.js';

/* ---------------- Administrador ----------------
   Se verifica en el SERVIDOR por correo (variable de entorno ADMIN_EMAILS,
   separados por comas) y/o por la columna users.is_admin. El correo NO está en
   el código: vive solo en la variable de entorno. No se asigna desde el cliente. */
export function adminEmails(env) {
  return String((env && env.ADMIN_EMAILS) || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
export function isAdminEmail(email, env) {
  return adminEmails(env).includes(String(email || '').toLowerCase());
}
export function rowIsAdmin(row, env) {
  return isAdminEmail(row && row.email, env) || !!(row && row.is_admin);
}

/* ---------------- Estado de configuración ---------------- */
export function storageReady(env) {
  return !!(env.AWS_ENDPOINT_URL_S3 && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) || !!globalThis.__NUBIFLYGO_STORAGE__;
}
export function missingConfig(env) {
  const m = [];
  if (!env.DATABASE_URL) m.push('DATABASE_URL');
  if (!env.JWT_SECRET || env.JWT_SECRET === 'GENERATE_SECURE_RANDOM_SECRET') m.push('JWT_SECRET');
  return m;
}

/* ---------------- Autenticación ----------------
   Por cookie de sesión o por API key (Authorization: Bearer <key> o X-API-Key;
   nunca en la URL). Devuelve { user, viaKey, permission, projectId, isGuest }
   o null. Con API key también cuenta las peticiones del minuto (en la misma
   consulta que marca last_used): si pasa el límite, { limited, retryAfter }. */
// La API key solo se lee de la cabecera (nunca de la URL).
export function apiKeyOf(request) {
  const authz = request.headers.get('Authorization') || '';
  return /^Bearer\s/i.test(authz) ? authz.replace(/^Bearer\s+/i, '').trim() : (request.headers.get('X-API-Key') || '').trim();
}

export async function authenticate(request, env) {
  const key = apiKeyOf(request);
  if (key) {
    if (!/^sk_[a-f0-9]{8,60}$/i.test(key)) return null;
    const db = getDb(env);
    await ensureSecurityColumns(db);
    await ensureTrashColumns(db);
    const { rows } = await db.query(
      `UPDATE api_keys ak SET last_used = now(),
         rl_count = CASE WHEN ak.rl_window = date_trunc('minute', now()) THEN ak.rl_count + 1 ELSE 1 END,
         rl_window = date_trunc('minute', now())
       FROM users u
       WHERE ak.value = $1 AND u.id = ak.user_id AND (ak.expires_at IS NULL OR ak.expires_at > now())
         AND ak.deleted_at IS NULL
       RETURNING ak.id, ak.permission, ak.project_id, ak.rl_count, u.id AS user_id, u.email, u.is_guest,
         (60 - extract(second FROM now()))::int AS retry`, [key]);
    const k = rows[0];
    if (!k) return null;
    const auth = {
      user: { id: k.user_id, email: k.email }, viaKey: true, keyId: k.id,
      // Permiso: 'all' (o 'write', el «Restringido con escritura» de la app) escribe;
      // cualquier otro valor queda en solo lectura (si hay duda, se cierra).
      permission: k.permission === 'all' || k.permission === 'write' ? 'all' : 'read',
      projectId: k.project_id || null, isGuest: !!k.is_guest
    };
    const rpm = Number(env.API_KEY_RPM) || 120;
    if (k.rl_count > rpm) { auth.limited = true; auth.retryAfter = Math.max(1, k.retry || 60); }
    return auth;
  }
  const u = await getUser(request, env);
  if (!u) return null;
  // Invitado: si la cuenta temporal ya expiró, se elimina (con todos sus datos)
  // y se trata como no autenticado → vuelve al login.
  const db = getDb(env);
  await ensureSecurityColumns(db);
  const { rows } = await db.query('SELECT is_guest, guest_expires_at, session_version FROM users WHERE id = $1', [u.id]);
  if (!rows[0]) return null;  // la cuenta ya no existe
  // Sesión revocada (p. ej. se cambió la contraseña): el token viejo ya no vale.
  if ((Number(rows[0].session_version) || 0) !== (Number(u.sv) || 0)) return null;
  const isGuest = !!rows[0].is_guest;
  if (isGuest && rows[0].guest_expires_at && new Date(rows[0].guest_expires_at).getTime() <= Date.now()) {
    try { await deleteUserCascade(db, env, u.id); } catch {}
    return null;
  }
  return { user: u, viaKey: false, permission: 'all', isGuest, guestExpiresAt: rows[0].guest_expires_at || null };
}

/* ---------------- Capa 2 · Permisos de cada credencial ----------------
   · Una API key NUNCA administra claves ni entra a /admin, ni cambia la
     cuenta (eso solo desde la app con tu sesión).
   · Solo lectura: nada que no sea GET.
   · Clave de un proyecto: solo ese proyecto y su contenido (documentos,
     notas y archivos del proyecto); no puede borrar el proyecto en sí.
   · Cuenta de invitado: ninguna clave sirve, tampoco las de sus proyectos.
     Es una cuenta temporal y sin verificar; con una clave se podría
     automatizar el abuso de la API (crear invitados en serie y usarlos).
   Devuelve null si se permite, o { status, error }. */
export const GUEST_KEY_ERROR = 'Las API keys requieren una cuenta. Crea una cuenta gratis para generarlas y usarlas.';
export function keyPolicy(auth, seg, method) {
  if (!auth || !auth.viaKey) return null;
  if (auth.isGuest) return { status: 403, error: GUEST_KEY_ERROR };
  // En minúsculas: el enrutador no distingue mayúsculas, así que con «Trash»
  // o «ApiKeys» la comparación exacta dejaba pasar la petición.
  const svc = String(seg[0] || '').toLowerCase();
  if (svc === 'apikeys' || svc === 'admin') return { status: 403, error: 'Las API keys no pueden administrar claves ni entrar a la administración. Usa la app con tu sesión.' };
  // La papelera es de la cuenta: restaurar o borrar para siempre se hace desde
  // la app, nunca desde una integración.
  if (svc === 'trash') return { status: 403, error: 'La papelera solo se usa desde la app con tu sesión.' };
  if (svc === 'account' && !(method === 'GET' && (seg[1] === 'profile' || seg[1] === 'avatar'))) {
    return { status: 403, error: 'Con una API key solo puedes leer el perfil. Los cambios de cuenta se hacen en la app.' };
  }
  if (auth.permission === 'read' && method !== 'GET') return { status: 403, error: 'Esta API key es de solo lectura (sin permiso de escritura).' };
  if (auth.projectId) {
    const own = svc === 'projects' && seg[1] && String(seg[1]).toLowerCase() === String(auth.projectId).toLowerCase();
    if (own && !(seg.length === 2 && method === 'DELETE')) return null;
    if (svc === 'documents' || svc === 'notes' || svc === 'files') return null;   // se acotan al proyecto en cada servicio
    return { status: 403, error: 'Esta API key solo puede usar su proyecto: /api/v1/projects/' + auth.projectId };
  }
  return null;
}
// Proyecto al que está limitada la petición (solo claves de proyecto).
export function scopeOf(auth) { return auth && auth.viaKey && auth.projectId ? auth.projectId : null; }

// ¿El proyecto es del usuario (y está dentro del alcance de la clave)?
export async function ownsProject(db, userId, projectId, scope) {
  if (!projectId) return true;
  if (!UUID_RE.test(String(projectId))) return false;
  if (scope && String(projectId).toLowerCase() !== String(scope).toLowerCase()) return false;
  const { rows } = await db.query('SELECT 1 FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [projectId, userId]);
  return !!rows[0];
}

// Elimina una cuenta y TODOS sus datos (proyectos, notas, documentos, archivos
// —incluido el binario del almacenamiento— y claves, por ON DELETE CASCADE).
export async function deleteUserCascade(db, env, userId) {
  try {
    const { rows } = await db.query(`SELECT storage_key, meta->>'thumb_key' AS thumb_key FROM files WHERE user_id = $1`, [userId]);
    for (const f of rows) {
      try { await deleteObject(env, f.storage_key); } catch {}
      if (f.thumb_key) { try { await deleteObject(env, f.thumb_key); } catch {} }
    }
  } catch {}
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
}

/* ==========================================================================
   Uso real de las API keys: cada petición hecha con una clave suma un éxito
   (respuesta < 400) o una falla (≥ 400 o error del servidor) en el día UTC.
   La tabla se crea sola si la base aún no la tiene.
   ========================================================================== */
let usageTableReady = false;
export async function ensureUsageTable(db) {
  if (usageTableReady) return;
  await db.query(`CREATE TABLE IF NOT EXISTS api_key_usage (
    key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    day    DATE NOT NULL,
    ok     INTEGER NOT NULL DEFAULT 0,
    err    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key_id, day)
  )`);
  usageTableReady = true;
}

// Nunca rompe la respuesta: si falla el registro, la petición sigue igual.
export async function recordKeyUsage(env, auth, status) {
  if (!auth || !auth.viaKey || !auth.keyId) return;
  try {
    const db = getDb(env);
    await ensureUsageTable(db);
    const ok = status < 400 ? 1 : 0;
    await db.query(
      `INSERT INTO api_key_usage (key_id, day, ok, err)
       VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2, $3)
       ON CONFLICT (key_id, day) DO UPDATE SET ok = api_key_usage.ok + EXCLUDED.ok, err = api_key_usage.err + EXCLUDED.err`,
      [auth.keyId, ok, 1 - ok]);
  } catch {}
}

// Error 500 sin detalles internos: el cliente recibe un código de referencia y
// el detalle queda en el registro del servidor.
export function errorResponse(err, request) {
  const ref = serverError(err, request ? new URL(request.url).pathname : '');
  return json({ error: 'Error del servidor. Inténtalo de nuevo (código ' + ref + ').', ref }, 500);
}

// Ejecuta la lógica de la ruta y registra el resultado si vino con API key.
async function runAndRecord(env, auth, fn, request) {
  let res;
  try { res = await fn(); }
  catch (err) { res = errorResponse(err, request); }
  await recordKeyUsage(env, auth, res.status);
  // Abuso: una API key superó su límite por minuto → aviso al dueño (máx. 1 por hora).
  if (auth && auth.viaKey && auth.limited) {
    await notifySafe(getDb(env), auth.user.id, {
      type: 'warning', dedupe: hourKey('apikey-limit:' + auth.keyId),
      title: 'Uso excesivo de una API key',
      body: 'Una de tus API keys superó el límite de peticiones por minuto y se están rechazando llamadas. Revisa la app o el servicio que la usa.',
      link: '/apikeys'
    });
  }
  return res;
}

// Aplica la capa 2 (o el límite por minuto de la clave) antes de la lógica.
function gate(request, auth, seg) {
  if (!auth || !auth.viaKey) return null;
  if (auth.limited) {
    secLog('rate_limited', request, { key: auth.keyId });
    return json({ error: 'Demasiadas peticiones con esta API key. Espera un momento.', retry_after: auth.retryAfter }, 429, { 'Retry-After': String(auth.retryAfter) });
  }
  const deny = keyPolicy(auth, seg, request.method);
  if (deny) { secLog('key_denied', request, { key: auth.keyId }); return json({ error: deny.error }, deny.status); }
  return null;
}

/* ==========================================================================
   Envoltorios de ruta — cada servicio exporta su lógica envuelta en uno de
   estos. Centralizan OPTIONS (CORS), la captura de errores y, cuando toca, la
   sesión obligatoria. Así cada carpeta solo escribe SU lógica.
   ========================================================================== */

// Ruta pública (sin sesión): health.
export function publicRoute(logicFn) {
  return async (context) => {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return preflight(request);
    try { return await logicFn({ request, env, method: request.method }); }
    catch (err) { return errorResponse(err, request); }
  };
}

// Ruta de cuenta (la sesión es opcional: register/login/guest no la exigen;
// profile/logout la comprueban dentro). Entrega 'auth' (puede ser null).
export function accountRoute(logicFn) {
  return async (context) => {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return preflight(request);
    try {
      const auth = await authenticate(request, env);
      const seg = segmentsOf(request);
      return await runAndRecord(env, auth, async () => {
        // Una API key solo puede leer el perfil (capa 2).
        const denied = gate(request, auth, seg);
        if (denied) return denied;
        return await logicFn({ request, env, method: request.method, auth, seg });
      }, request);
    } catch (err) { return errorResponse(err, request); }
  };
}

// Ruta de datos (exige sesión). Aplica el permiso de la API key (solo lectura
// no puede escribir) y marca isGuest/isAdmin en el usuario.
export function dataRoute(logicFn) {
  return async (context) => {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return preflight(request);
    try {
      const auth = await authenticate(request, env);
      if (!auth) return json({ error: 'No autenticado.' }, 401);
      // Las columnas de la papelera se crean solas una vez por instancia; de
      // aquí para abajo TODA lectura filtra por deleted_at.
      await ensureTrashColumns(getDb(env));
      const seg = segmentsOf(request);
      return await runAndRecord(env, auth, async () => {
        const denied = gate(request, auth, seg);
        if (denied) return denied;
        const user = auth.user;
        user.isGuest = !!auth.isGuest;
        // Administrador: solo con la sesión de la app (nunca con una API key).
        user.isAdmin = !auth.viaKey && isAdminEmail(user.email, env);
        return await logicFn({ request, env, method: request.method, user, auth, seg, scope: scopeOf(auth) });
      }, request);
    } catch (err) { return errorResponse(err, request); }
  };
}

/* ==========================================================================
   CRUD genérico (projects/notes/documents). Cada usuario solo ve y modifica lo
   suyo (se filtra por user_id en cada consulta). Con una clave de proyecto
   (scope) todo se acota además a ese proyecto. Un project_id enviado debe ser
   un proyecto del usuario; los textos tienen un largo máximo.
   ========================================================================== */
function crudValue(table, col, v) {
  if (col === 'published') return v === true || v === 'true';
  if (table === 'projects' && col === 'icon') {
    // Lista cerrada de iconos; null o '' vuelven a «Auto».
    if (v === null || v === '') return null;
    return typeof v === 'string' && PROJECT_ICON_IDS.includes(v) ? v : undefined;
  }
  if (table === 'projects' && col === 'color') {
    // Solo hexadecimal (y nunca null: la columna no admite vacíos).
    return typeof v === 'string' && COLOR_RE.test(v) ? v.toLowerCase() : undefined;
  }
  if (v === null) return null;
  if (typeof v === 'object') return undefined;                 // nada de objetos/arreglos
  const max = (CRUD_MAX[table] && CRUD_MAX[table][col]) || 2000;
  return String(v).slice(0, max);
}
export async function handleCrud(table, columns, id, request, env, method, user, scope) {
  const db = getDb(env);
  const cols = ['id', ...columns, 'created_at', 'updated_at'].join(', ');
  const scoped = !!scope && columns.includes('project_id');
  const scopeSql = scoped ? ' AND project_id = $' : '';

  if (!id) {
    if (method === 'GET') {
      const { rows } = await db.query(
        `SELECT ${cols} FROM ${table} WHERE user_id = $1 AND deleted_at IS NULL${scoped ? scopeSql + '2' : ''} ORDER BY created_at DESC`,
        scoped ? [user.id, scope] : [user.id]);
      return json({ items: rows });
    }
    if (method === 'POST') {
      // Límite para invitados (proyectos/notas).
      if (user.isGuest && (table === 'projects' || table === 'notes')) {
        const cap = GUEST_LIMITS[table];
        // Cuenta también lo que está en la papelera: si no, bastaba con
        // borrar y volver a crear para saltarse el tope.
        const { rows: c } = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [user.id]);
        if (((c[0] && c[0].n) || 0) >= cap) {
          return json({ error: 'Como invitado puedes crear hasta ' + cap + ' ' + (table === 'projects' ? 'proyectos' : 'notas') + '. Crea una cuenta gratis para tener más.' }, 403);
        }
      }
      const b = await body(request);
      if (scoped) {
        if (b.project_id != null && String(b.project_id).toLowerCase() !== String(scope).toLowerCase()) return json({ error: 'Esta API key solo puede crear en su proyecto.' }, 403);
        b.project_id = scope;
      }
      const sent = columns.filter(c => b[c] !== undefined && b[c] !== null && b[c] !== '');
      if (!sent.length) return json({ error: 'Faltan datos para crear el registro.' }, 400);
      const vals = sent.map(c => crudValue(table, c, b[c]));
      if (vals.some(v => v === undefined)) return json({ error: 'Datos no válidos.' }, 400);
      if (sent.includes('project_id') && !(await ownsProject(db, user.id, b.project_id, scope))) return json({ error: 'Proyecto no encontrado.' }, 404);
      const ph = sent.map((_, i) => `$${i + 2}`).join(', ');
      const { rows } = await db.query(
        `INSERT INTO ${table} (user_id, ${sent.join(', ')}) VALUES ($1, ${ph}) RETURNING ${cols}`,
        [user.id, ...vals]);
      return json({ item: rows[0] }, 201);
    }
    return json({ error: 'Método no permitido.' }, 405);
  }

  if (!UUID_RE.test(id)) return json({ error: 'Id no válido.' }, 400);
  if (method === 'GET') {
    const { rows } = await db.query(`SELECT ${cols} FROM ${table} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL${scoped ? scopeSql + '3' : ''}`,
      scoped ? [id, user.id, scope] : [id, user.id]);
    return rows[0] ? json({ item: rows[0] }) : json({ error: 'No encontrado.' }, 404);
  }
  if (method === 'PATCH') {
    const b = await body(request);
    const sent = columns.filter(c => c in b);
    if (!sent.length) return json({ error: 'Nada que actualizar.' }, 400);
    const vals = sent.map(c => crudValue(table, c, b[c]));
    if (vals.some(v => v === undefined)) return json({ error: 'Datos no válidos.' }, 400);
    if (sent.includes('project_id')) {
      if (scoped && String(b.project_id || '').toLowerCase() !== String(scope).toLowerCase()) return json({ error: 'Esta API key no puede sacar elementos de su proyecto.' }, 403);
      if (!(await ownsProject(db, user.id, b.project_id, scope))) return json({ error: 'Proyecto no encontrado.' }, 404);
    }
    const sets = sent.map((c, i) => `${c} = $${i + 3}`);
    sets.push('updated_at = now()');
    const params = [id, user.id, ...vals];
    if (scoped) params.push(scope);
    const { rows } = await db.query(
      `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL${scoped ? scopeSql + params.length : ''} RETURNING ${cols}`,
      params);
    return rows[0] ? json({ item: rows[0] }) : json({ error: 'No encontrado.' }, 404);
  }
  if (method === 'DELETE') {
    // A la papelera, no fuera: se guarda 30 días y se puede restaurar.
    const { rowCount } = await db.query(
      `UPDATE ${table} SET deleted_at = now(), trashed_with_project = false
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL${scoped ? scopeSql + '3' : ''}`,
      scoped ? [id, user.id, scope] : [id, user.id]);
    return rowCount ? json({ ok: true, trashed: true }) : json({ error: 'No encontrado.' }, 404);
  }
  return json({ error: 'Método no permitido.' }, 405);
}
