/* ==========================================================================
   notify.js — Notificaciones del usuario (se guardan en PostgreSQL).
   Copia de functions/_shared/notify.js para el servidor Node (misma lógica).
   Tipos: info · feature (novedades) · billing (suscripción) · security
   (inicios de sesión) · warning (abuso / bloqueos).
   · notify()          crea una notificación (con dedupe opcional: no repite).
   · recordLogin()     registra el dispositivo; si es nuevo, avisa al usuario.
   · checkBilling()    avisa si la suscripción vence pronto o ya venció.
   Las tablas se crean solas la primera vez (CREATE … IF NOT EXISTS).
   ========================================================================== */

export const NOTIF_TYPES = ['info', 'feature', 'billing', 'security', 'warning'];

let ready = false;
export async function ensureNotifications(db) {
  if (ready) return;
  await db.query(`CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'info',
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    link        TEXT,
    dedupe_key  TEXT,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now())`);
  // Borrado suave: la notificación borrada se oculta pero queda su marca (dedupe),
  // así un aviso que el usuario ya eliminó no se vuelve a crear.
  await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
  await db.query('CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS login_devices (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device      TEXT NOT NULL,
    ip          TEXT,
    first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, device))`);
  await db.query('ALTER TABLE login_devices ADD COLUMN IF NOT EXISTS user_agent TEXT');
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ');
  ready = true;
}

// Solo enlaces internos (/main, /settings…) o https: nada de javascript:.
export function cleanLink(v) {
  const s = String(v || '').trim().slice(0, 500);
  if (!s) return null;
  if (/^\/(?!\/)/.test(s) || /^https:\/\//i.test(s)) return s;
  return null;
}

export async function notify(db, userId, n) {
  await ensureNotifications(db);
  const type = NOTIF_TYPES.includes(n.type) ? n.type : 'info';
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, type, title, body, link, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [userId, type, String(n.title || '').slice(0, 140), String(n.body || '').slice(0, 1000), cleanLink(n.link), n.dedupe ? String(n.dedupe).slice(0, 200) : null]);
  return rows[0] || null;
}

// Nunca rompe el flujo principal (login, API…): si falla, solo se registra.
export function notifySafe(db, userId, n) {
  return notify(db, userId, n).catch(e => { console.error('[notify]', e && e.message); return null; });
}

/* -------- Dispositivo a partir del User-Agent --------
   deviceInfo() devuelve { browser, os, osVersion, model, label }.
   label es "Chrome en Android" (+ el modelo del teléfono si se detecta),
   y osVersion/model se muestran como detalle en "Sesiones activas". */
export function deviceInfo(ua) {
  const s = String(ua || '').slice(0, 300);   // acotar: evita cómputo caro con un UA enorme
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iPod/i.test(s) ? 'iOS'
    : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'macOS'
    : /CrOS/i.test(s) ? 'ChromeOS' : /Linux/i.test(s) ? 'Linux' : 'otro sistema';
  const browser = /Edg\//i.test(s) ? 'Edge' : /OPR\/|Opera/i.test(s) ? 'Opera' : /SamsungBrowser/i.test(s) ? 'Samsung Internet'
    : /Firefox\//i.test(s) ? 'Firefox' : /Chrome\//i.test(s) ? 'Chrome' : /Safari\//i.test(s) ? 'Safari'
    : /NubiFlyGo|okhttp|Dalvik/i.test(s) ? 'App' : 'Navegador';
  let osVersion = '', m;
  if (os === 'Android' && (m = s.match(/Android\s+([\d.]+)/i))) osVersion = m[1];
  else if (os === 'iOS' && (m = s.match(/OS\s+([\d_]+)/i))) osVersion = m[1].replace(/_/g, '.');
  else if (os === 'Windows' && (m = s.match(/Windows NT\s+([\d.]+)/i))) osVersion = ({ '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' })[m[1]] || m[1];
  // Modelo del teléfono (Android): "...; Android 13; SM-G991B) ..." o "; Pixel 7 Build/..."
  let model = '';
  if (os === 'Android' && (m = s.match(/Android[^;)]*;\s*([^;)]{1,60})/i))) {   // sin ambigüedad: a prueba de ReDoS
    model = m[1].replace(/\s+Build\b.*$/i, '').trim().replace(/\s*wv$/i, '');
    if (!/\d/.test(model) && model.length <= 2) model = '';   // "K" y otros marcadores vacíos
  }
  return { browser, os, osVersion, model, label: browser + ' en ' + os };
}

// Etiqueta corta (clave del dispositivo): incluye el modelo para distinguir teléfonos.
export function deviceLabel(ua) {
  const d = deviceInfo(ua);
  return d.label + (d.model ? ' · ' + d.model : '');
}

export async function recordLogin(db, user, ua, ip, how) {
  try {
    await ensureNotifications(db);
    const device = deviceLabel(ua);
    const ins = await db.query(
      `INSERT INTO login_devices (user_id, device, ip, user_agent) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, device) DO UPDATE SET last_seen = now(), ip = EXCLUDED.ip, user_agent = EXCLUDED.user_agent
       RETURNING (xmax = 0) AS is_new`, [user.id, device, ip ? String(ip).slice(0, 64) : null, ua ? String(ua).slice(0, 400) : null]);
    const isNew = ins.rows[0] && ins.rows[0].is_new;
    const { rows } = await db.query('SELECT count(*)::int AS n FROM login_devices WHERE user_id = $1', [user.id]);
    const total = rows[0] ? rows[0].n : 1;
    if (isNew && total <= 1) {   // bienvenida solo con el primer dispositivo, una vez
      await notify(db, user.id, {
        type: 'feature', dedupe: 'welcome',
        title: '¡Bienvenido a NubiFlyGo!',
        body: 'Aquí verás avisos de seguridad, de tu suscripción y las novedades de la plataforma.',
        link: '/main'
      });
    } else if (isNew) {
      await notify(db, user.id, {
        type: 'security',
        title: 'Nuevo inicio de sesión',
        body: 'Se inició sesión' + (how ? ' con ' + how : '') + ' desde ' + device + (ip ? ' (IP ' + ip + ')' : '') +
          '. Si no fuiste tú, cambia tu contraseña en Configuración.',
        link: '/settings'
      });
    }
  } catch (e) { console.error('[recordLogin]', e && e.message); }
}

/* -------- Suscripción: vence en ≤ 3 días o ya venció (una vez por fecha) -------- */
export async function checkBilling(db, userId) {
  try {
    await ensureNotifications(db);
    const { rows } = await db.query('SELECT plan, plan_expires_at FROM users WHERE id = $1', [userId]);
    const u = rows[0];
    if (!u || !u.plan_expires_at || !u.plan || u.plan === 'free') return;
    const exp = new Date(u.plan_expires_at), day = exp.toISOString().slice(0, 10);
    const left = exp.getTime() - Date.now();
    if (left <= 0) {
      await notify(db, userId, {
        type: 'billing', dedupe: 'billing-expired:' + day,
        title: 'Pago de suscripción pendiente',
        body: 'Tu plan ' + u.plan + ' venció el ' + day + '. Renueva tu pago para no perder las funciones de tu plan.',
        link: '/settings'
      });
    } else if (left <= 3 * 86400000) {
      await notify(db, userId, {
        type: 'billing', dedupe: 'billing-soon:' + day,
        title: 'Tu suscripción vence pronto',
        body: 'Tu plan ' + u.plan + ' vence el ' + day + '. Revisa tu método de pago para evitar interrupciones.',
        link: '/settings'
      });
    }
  } catch (e) { console.error('[checkBilling]', e && e.message); }
}

// Clave de dedupe por hora (para avisos de abuso: como mucho uno por hora).
export function hourKey(prefix) { return prefix + ':' + new Date().toISOString().slice(0, 13); }
