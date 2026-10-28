/* ==========================================================================
   account — cuenta del usuario: registro, login, logout, perfil e invitado.
   La sesión viaja en cookie httpOnly (JWT). El login con Google va aparte, en
   /auth/google (idToken) y /auth/google/start|callback (redirección).
     POST /account/register   POST /account/login   POST /account/logout
     GET  /account/profile     PATCH /account/profile   POST /account/guest
     GET  /account/avatar      POST /account/avatar     DELETE /account/avatar
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json, issueSession, clearCookie } from '../../../_shared/http.js';
import { hashPassword, verifyPassword } from '../../../_shared/crypto.js';
import { smallMaxBytes, movieMaxBytes } from '../../../_shared/movies.js';
import { accountRoute, rowIsAdmin, isAdminEmail } from '../../../_shared/api.js';
import { EMAIL_RE, normLang, body, cleanInterests, cleanBirthday, isBirthdayToday } from '../../../_shared/util.js';
import { rateLimit, rateReset, tooMany, clientIp, secLog, ensureSecurityColumns } from '../../../_shared/security.js';
import { recordLogin, notifySafe, hourKey, deviceInfo, deviceLabel, ensureNotifications } from '../../../_shared/notify.js';
import { ensureBilling, effectivePlan, PLANS } from '../../../_shared/billing.js';

// Límites de intentos (capa 3). Ventanas en segundos.
const LIMITS = {
  loginIp:   { n: 30, win: 900 },    // 30 intentos de inicio de sesión por IP cada 15 min
  loginFail: { n: 8,  win: 900 },    // 8 intentos por cuenta DESDE la misma conexión cada 15 min
  loginAcct: { n: 100, win: 900 },   // 100 por cuenta desde todas partes (ataque repartido)
  register:  { n: 10, win: 3600 },   // 10 cuentas nuevas por IP por hora
  guest:     { n: 10, win: 3600 },   // 10 invitados por IP por hora
  password:  { n: 10, win: 900 }     // 10 cambios de contraseña por cuenta cada 15 min
};

// Da forma a una fila de login_devices para "Sesiones activas".
function sessionShape(r, hereLabel) {
  const info = deviceInfo(r.user_agent);
  const detail = [info.os + (info.osVersion ? ' ' + info.osVersion : ''), info.model || null]
    .filter(Boolean).join(' · ');
  return {
    device: info.label,
    model: info.model || null,
    detail: detail || info.os,
    ip: r.ip || null,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
    current: r.device === hereLabel
  };
}

export const handle = accountRoute(async ({ seg, request, env, method, auth }) => {
  const action = seg[1];
  const db = getDb(env);

  if (action === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  }

  // Sesiones activas: los dispositivos donde se ha iniciado sesión (reales).
  if (action === 'sessions' && method === 'GET') {
    if (!auth) return json({ error: 'No autenticado.' }, 401);
    await ensureNotifications(db);
    const here = deviceLabel(request.headers.get('User-Agent'));
    const { rows } = await db.query(
      `SELECT device, ip, user_agent, first_seen, last_seen
       FROM login_devices WHERE user_id = $1 ORDER BY last_seen DESC LIMIT 50`, [auth.user.id]);
    return json({ items: rows.map(r => sessionShape(r, here)) }, 200, { 'Cache-Control': 'no-store' });
  }

  // Preferencias de interfaz guardadas en la cuenta (no en el navegador).
  if (action === 'profile' || action === 'avatar') { await ensureUiPrefsColumn(db); await ensureOnboardingColumns(db); await ensureBilling(db); }

  if (action === 'profile' && method === 'GET') {
    if (!auth) return json({ error: 'No autenticado.' }, 401);
    const { rows } = await db.query(`SELECT ${PROFILE_COLS} FROM users WHERE id = $1`, [auth.user.id]);
    if (!rows[0]) return json({ error: 'Usuario no encontrado.' }, 404);
    if (auth.viaKey) {
      // La fecha de nacimiento solo la ve su dueño en la app («Solo tú puedes
      // verlo»): una integración con API key no la recibe.
      delete rows[0].birthday;
    } else {
      // La app pide el perfil al arrancar: es el momento de felicitarle.
      await birthdayGreeting(db, rows[0]);
    }
    return json({ user: shapeUser(rows[0], env) });
  }

  // Ajustes: actualizar el propio perfil (nombre, idioma, gustos, cumpleaños y,
  // opcionalmente, la contraseña —requiere la actual—). El correo no se cambia
  // aquí (no hay forma de cambiarlo en toda la API).
  if (action === 'profile' && method === 'PATCH') {
    if (!auth) return json({ error: 'No autenticado.' }, 401);
    const b = await body(request);
    const sets = [];
    const vals = [];
    let i = 2;
    if (typeof b.name === 'string') {
      const nm = b.name.trim();
      if (nm.length < 2) return json({ error: 'El nombre debe tener al menos 2 caracteres.' }, 400);
      sets.push('name = $' + (i++)); vals.push(nm.slice(0, 80));
    }
    if (typeof b.language === 'string') {
      sets.push('language = $' + (i++)); vals.push(normLang(b.language));
    }
    if (b.ui_prefs !== undefined) {
      const ui = cleanUiPrefs(b.ui_prefs);
      if (!ui) return json({ error: 'Preferencias de interfaz no válidas.' }, 400);
      // Mezcla superficial: solo cambia las claves enviadas.
      sets.push(`ui_prefs = coalesce(ui_prefs, '{}'::jsonb) || $${i++}::jsonb`); vals.push(JSON.stringify(ui));
    }
    if (b.interests !== undefined) {
      const list = cleanInterests(b.interests);
      if (!list) return json({ error: 'Lista de gustos no válida.' }, 400);
      sets.push('interests = $' + (i++)); vals.push(JSON.stringify(list));
    }
    if (b.birthday !== undefined) {
      const bd = cleanBirthday(b.birthday);
      if (bd === false) return json({ error: 'Revisa tu fecha de nacimiento.' }, 400);
      sets.push('birthday = $' + (i++)); vals.push(bd || null);
    }
    // Bienvenida terminada. Solo se MARCA (nunca se deshace desde el cliente) y
    // solo si el perfil quedó completo: si no, "obligatoria" sería solo la
    // pantalla, y una petición suelta la saltaría dejando la cuenta sin datos.
    if (b.onboarded === true) {
      let okGustos = Array.isArray(b.interests) && cleanInterests(b.interests).length > 0;
      let okFecha = b.birthday !== undefined && !!cleanBirthday(b.birthday);
      if (!okGustos || !okFecha) {
        const cur = await db.query(`SELECT jsonb_array_length(coalesce(interests, '[]'::jsonb)) AS n, birthday FROM users WHERE id = $1`, [auth.user.id]);
        const r = cur.rows[0] || {};
        if (b.interests === undefined) okGustos = (Number(r.n) || 0) > 0;
        if (b.birthday === undefined) okFecha = !!r.birthday;
      }
      if (!okGustos) return json({ error: 'Elige al menos un tipo de contenido.' }, 400);
      if (!okFecha) return json({ error: 'Pon tu fecha de nacimiento para continuar.' }, 400);
      sets.push('onboarded_at = coalesce(onboarded_at, now())');
    }
    let newSession = false;
    if (b.new_password) {
      const np = String(b.new_password);
      if (np.length < 8) return json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' }, 400);
      if (np.length > 200) return json({ error: 'La contraseña es demasiado larga (máx. 200 caracteres).' }, 400);
      const rl = await rateLimit(db, 'password:' + auth.user.id, LIMITS.password.n, LIMITS.password.win);
      if (!rl.ok) return tooMany(rl.retryAfter);
      const cur = await db.query('SELECT password_hash FROM users WHERE id = $1', [auth.user.id]);
      const ok = cur.rows[0] && await verifyPassword(String(b.current_password || '').slice(0, 200), cur.rows[0].password_hash);
      if (!ok) { secLog('password_change_failed', request, { user: auth.user.id }); return json({ error: 'La contraseña actual no es correcta.' }, 403); }
      sets.push('password_hash = $' + (i++)); vals.push(await hashPassword(np));
      // Las demás sesiones abiertas (otros dispositivos) se cierran.
      sets.push('session_version = coalesce(session_version, 0) + 1');
      newSession = true;
    }
    if (!sets.length) return json({ error: 'Nada que actualizar.' }, 400);
    const { rows } = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1
       RETURNING ${PROFILE_COLS}${newSession ? ', session_version' : ''}`,
      [auth.user.id, ...vals]);
    if (!rows[0]) return json({ error: 'Usuario no encontrado.' }, 404);
    if (!newSession) return json({ user: shapeUser(rows[0], env) });
    // Esta sesión sigue abierta con un token nuevo.
    const cookie = await issueSession({ id: auth.user.id, email: rows[0].email, session_version: rows[0].session_version }, env);
    try { await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [auth.user.id, 'account', 'Contraseña cambiada (se cerraron las demás sesiones)']); } catch {}
    delete rows[0].session_version;
    return json({ user: shapeUser(rows[0], env) }, 200, { 'Set-Cookie': cookie });
  }

  // Foto de perfil. Se guarda en la propia tabla users (avatar_data, como data
  // URL ya redimensionada por el navegador), así funciona aunque no haya
  // almacenamiento S3 configurado. avatar_url apunta a GET /account/avatar con
  // un parámetro de versión para que el navegador no muestre la foto antigua.
  if (action === 'avatar') {
    if (!auth) return json({ error: 'No autenticado.' }, 401);
    await ensureAvatarColumn(db);

    if (method === 'GET') {
      const { rows } = await db.query('SELECT avatar_data FROM users WHERE id = $1', [auth.user.id]);
      const parsed = parseImageDataUrl(rows[0] && rows[0].avatar_data);
      if (!parsed) return json({ error: 'Sin foto de perfil.' }, 404);
      return new Response(parsed.bytes, {
        status: 200,
        headers: { 'Content-Type': parsed.mime, 'Cache-Control': 'private, max-age=31536000, immutable' }
      });
    }

    if (method === 'POST') {
      const b = await body(request);
      const parsed = parseImageDataUrl(b.image);
      if (!parsed) return json({ error: 'La imagen no es válida. Usa JPG, PNG, WEBP o GIF.' }, 400);
      if (parsed.bytes.length > AVATAR_MAX_BYTES) return json({ error: 'La imagen es demasiado grande (máx. 2 MB).' }, 413);
      const url = '/api/v1/account/avatar?v=' + Date.now().toString(36);
      const { rows } = await db.query(
        `UPDATE users SET avatar_data = $2, avatar_url = $3 WHERE id = $1 RETURNING ${PROFILE_COLS}`,
        [auth.user.id, String(b.image), url]);
      if (!rows[0]) return json({ error: 'Usuario no encontrado.' }, 404);
      return json({ user: shapeUser(rows[0], env) });
    }

    if (method === 'DELETE') {
      const { rows } = await db.query(
        `UPDATE users SET avatar_data = NULL, avatar_url = NULL WHERE id = $1 RETURNING ${PROFILE_COLS}`,
        [auth.user.id]);
      if (!rows[0]) return json({ error: 'Usuario no encontrado.' }, 404);
      return json({ user: shapeUser(rows[0], env) });
    }

    return json({ error: 'Método no permitido.' }, 405);
  }

  // Cuenta de invitado: prueba temporal (24 h por defecto) con funciones
  // limitadas. Al expirar, authenticate() la elimina con todos sus datos.
  if (action === 'guest' && method === 'POST') {
    const rl = await rateLimit(db, 'guest-ip:' + clientIp(request), LIMITS.guest.n, LIMITS.guest.win);
    if (!rl.ok) { secLog('rate_limited', request, { what: 'guest' }); return tooMany(rl.retryAfter, 'Demasiadas cuentas de invitado desde esta conexión. Inténtalo más tarde.'); }
    const hours = Number(env.GUEST_HOURS) || 24;
    const rnd = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, '');
    const gName = 'Invitado ' + rnd.slice(0, 4).toUpperCase();
    const gEmail = 'guest_' + rnd.slice(0, 12) + '_' + Date.now().toString(36) + '@guest.nubiflygo';
    const hash = await hashPassword('guest_' + rnd);
    const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const gb = await body(request);
    const lang = normLang(gb.language);
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, is_guest, guest_expires_at, language) VALUES ($1, $2, $3, true, $4, $5) RETURNING id, name, email, created_at, is_guest, guest_expires_at, language',
      [gName, gEmail, hash, expires, lang]);
    const user = rows[0];
    try { await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [user.id, 'account', 'Sesión de invitado iniciada']); } catch {}
    await recordLogin(db, user, request.headers.get('User-Agent'), clientIp(request), 'invitado');
    return json({ user }, 201, { 'Set-Cookie': await issueSession(user, env) });
  }

  if (method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const b = await body(request);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');

  if (action === 'register') {
    const rl = await rateLimit(db, 'register-ip:' + clientIp(request), LIMITS.register.n, LIMITS.register.win);
    if (!rl.ok) { secLog('rate_limited', request, { what: 'register' }); return tooMany(rl.retryAfter, 'Demasiados registros desde esta conexión. Inténtalo más tarde.'); }
    if (name.length < 2) return json({ error: 'El nombre es obligatorio.' }, 400);
    if (name.length > 80) return json({ error: 'El nombre es demasiado largo (máx. 80 caracteres).' }, 400);
    if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'El correo no es válido.' }, 400);
    // El correo de administración no se puede registrar con contraseña (sin
    // verificar el correo, cualquiera podría reclamarlo): entra con Google.
    if (isAdminEmail(email, env)) return json({ error: 'Este correo debe entrar con Google.' }, 403);
    if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
    if (password.length > 200) return json({ error: 'La contraseña es demasiado larga (máx. 200 caracteres).' }, 400);
    const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return json({ error: 'Ya existe una cuenta con ese correo.' }, 409);
    const hash = await hashPassword(password);
    const lang = normLang(b.language);
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, language) VALUES ($1, $2, $3, $4) RETURNING id, name, email, created_at, language',
      [name, email, hash, lang]);
    const user = rows[0];
    await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [user.id, 'account', 'Cuenta creada']);
    await recordLogin(db, user, request.headers.get('User-Agent'), clientIp(request), 'correo y contraseña');
    return json({ user }, 201, { 'Set-Cookie': await issueSession(user, env) });
  }

  if (action === 'login') {
    // Capa 3: límite por conexión y bloqueo temporal de la cuenta tras varios
    // intentos fallidos (contra adivinar contraseñas).
    const ip = clientIp(request);
    const rl = await rateLimit(db, 'login-ip:' + ip, LIMITS.loginIp.n, LIMITS.loginIp.win);
    if (!rl.ok) { secLog('rate_limited', request, { what: 'login' }); return tooMany(rl.retryAfter); }
    if (email.length > 254 || !EMAIL_RE.test(email) || password.length < 1 || password.length > 200) return json({ error: 'Correo o contraseña incorrectos.' }, 401);
    // Se cuenta ANTES de comprobar (atómico: peticiones en paralelo no se cuelan).
    // El bloqueo fuerte es por cuenta + conexión: un extraño no puede bloquear tu
    // cuenta desde otra conexión; el tope por cuenta frena ataques repartidos.
    const pairKey = 'login-fail:' + email + '|' + ip, acctKey = 'login-acct:' + email;
    const pair = await rateLimit(db, pairKey, LIMITS.loginFail.n, LIMITS.loginFail.win);
    const acct = await rateLimit(db, acctKey, LIMITS.loginAcct.n, LIMITS.loginAcct.win);
    // El tope por cuenta no bloquea al dueño desde una conexión donde ya entró antes:
    // así un extraño no puede dejarlo fuera de su cuenta con intentos fallidos.
    const acctBlocked = !acct.ok && !(await knownLoginIp(db, email, ip));
    if (!pair.ok || acctBlocked) {
      const wait = Math.max(pair.ok ? 0 : pair.retryAfter, acctBlocked ? acct.retryAfter : 0);
      secLog('login_locked', request, { email });
      // Aviso al dueño de la cuenta (si existe), como mucho uno por hora.
      try {
        const own = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (own.rows[0]) await notifySafe(db, own.rows[0].id, {
          type: 'warning', dedupe: hourKey('login-locked'),
          title: 'Intentos de acceso bloqueados',
          body: 'Detectamos varios intentos fallidos de iniciar sesión en tu cuenta y los bloqueamos temporalmente. Si no fuiste tú, cambia tu contraseña.',
          link: '/settings'
        });
      } catch {}
      return tooMany(wait, 'Demasiados intentos fallidos para esta cuenta. Espera ' + Math.ceil(wait / 60) + ' min e inténtalo de nuevo.');
    }
    await ensureSecurityColumns(db);
    const { rows } = await db.query('SELECT id, name, email, password_hash, session_version FROM users WHERE email = $1', [email]);
    const user = rows[0];
    // Mismo trabajo exista o no la cuenta (el tiempo de respuesta no la delata).
    const valid = await verifyPassword(password, user ? user.password_hash : await dummyHash());
    if (!user || !valid) {
      secLog('login_failed', request, { email });
      return json({ error: 'Correo o contraseña incorrectos.' }, 401);
    }
    await rateReset(db, pairKey);
    await rateReset(db, acctKey);
    await recordLogin(db, user, request.headers.get('User-Agent'), ip, 'correo y contraseña');
    return json({ user: { id: user.id, name: user.name, email: user.email } }, 200, { 'Set-Cookie': await issueSession(user, env) });
  }

  return json({ error: 'Ruta de cuenta no encontrada.' }, 404);
});

// ¿El dueño de este correo ya inició sesión antes desde esta IP?
async function knownLoginIp(db, email, ip) {
  try {
    const { rows } = await db.query(
      'SELECT 1 FROM login_devices d JOIN users u ON u.id = d.user_id WHERE u.email = $1 AND d.ip = $2 LIMIT 1', [email, ip]);
    return rows.length > 0;
  } catch { return false; }
}

// Hash de relleno (se calcula una vez por instancia) para comparar en tiempo
// constante cuando el correo no existe.
let DUMMY = null;
async function dummyHash() { if (!DUMMY) DUMMY = await hashPassword(crypto.randomUUID()); return DUMMY; }

/* ---------------- Ayudantes del perfil ---------------- */

// Columnas públicas del perfil (nunca incluye password_hash ni avatar_data).
// La fecha de nacimiento sale con to_char para que los dos controladores de
// base de datos (neon http y pg) devuelvan siempre el mismo texto AAAA-MM-DD.
const PROFILE_COLS = `id, name, email, created_at, is_guest, guest_expires_at, language, plan, is_admin,
  avatar_url, ui_prefs, plan_expires_at, plan_cancel_at_period_end,
  interests, to_char(birthday, 'YYYY-MM-DD') AS birthday, onboarded_at`;

// Planes sin pago: el usuario "todavía no tiene un plan de pago".
const FREE_PLANS = ['free', ''];

// Añade al usuario los campos derivados del plan que usa la interfaz.
function shapeUser(u, env) {
  u.is_admin = rowIsAdmin(u, env);
  // Un plan de pago vencido cuenta como Gratis.
  u.plan = u.is_admin ? 'unlimited' : effectivePlan(u);
  u.plan_label = u.is_admin ? 'Sin límites' : (u.is_guest ? 'Invitado' : (u.plan === 'free' ? 'Gratis' : (PLANS[u.plan] ? PLANS[u.plan].name : u.plan)));
  u.has_paid_plan = !u.is_admin && !u.is_guest && !FREE_PLANS.includes(u.plan);
  if (!u.has_paid_plan) { u.plan_expires_at = null; u.plan_cancel_at_period_end = false; }
  if (!Array.isArray(u.interests)) u.interests = [];
  // Límites de subida: normal y películas (solo planes de pago y el administrador).
  u.limits = { upload_max_bytes: smallMaxBytes(env), movie_max_bytes: movieMaxBytes(env), movies: !!(u.is_admin || u.has_paid_plan) };
  return u;
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

// Valida una data URL de imagen y devuelve { mime, bytes } o null.
function parseImageDataUrl(v) {
  const m = IMAGE_DATA_URL_RE.exec(String(v || ''));
  if (!m) return null;
  let bin;
  try { bin = atob(m[2]); } catch { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.length ? { mime: m[1], bytes } : null;
}

// Crea la columna avatar_data si la base aún no la tiene (una vez por instancia).
let avatarColumnReady = false;
async function ensureAvatarColumn(db) {
  if (avatarColumnReady) return;
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT');
  avatarColumnReady = true;
}

// Columna de preferencias de interfaz (orden/posición de los widgets flotantes).
let uiPrefsColumnReady = false;
async function ensureUiPrefsColumn(db) {
  if (uiPrefsColumnReady) return;
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb`);
  uiPrefsColumnReady = true;
}

/* Columnas de la bienvenida: gustos, cumpleaños y la marca de "ya completada".
   Las cuentas que ya existían al publicar la bienvenida se dan por completadas
   (si no, verían la pantalla de golpe):
   - si la marca se crea aquí, toda cuenta que ya está es de antes;
   - si ya estaba (alguien aplicó antes el .sql), se usa una fecha fija, que
     nunca alcanza a una cuenta nueva por mucho que tarde en completarla. */
const ONBOARDING_SINCE = '2026-10-22';
// Primero una lectura (como ensureSecurityColumns): un ALTER TABLE bloquea la
// tabla aunque la columna ya exista, así que solo se lanza si de verdad falta.
const ONBOARDING_DDL = {
  interests: `ALTER TABLE users ADD COLUMN IF NOT EXISTS interests JSONB NOT NULL DEFAULT '[]'::jsonb`,
  birthday: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE',
  onboarded_at: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ'
};
let onboardingColumnsReady = false;
async function ensureOnboardingColumns(db) {
  if (onboardingColumnsReady) return;
  const { rows } = await db.query(
    `SELECT column_name AS c FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'users'
       AND column_name IN ('interests', 'birthday', 'onboarded_at')`);
  const have = new Set(rows.map(r => r.c));
  for (const [c, sql] of Object.entries(ONBOARDING_DDL)) if (!have.has(c)) await db.query(sql);
  if (!have.has('onboarded_at')) {
    await db.query('UPDATE users SET onboarded_at = created_at WHERE onboarded_at IS NULL');
  } else {
    // Solo se escribe si queda alguna cuenta antigua por marcar.
    const old = await db.query('SELECT 1 FROM users WHERE onboarded_at IS NULL AND created_at < $1 LIMIT 1', [ONBOARDING_SINCE]);
    if (old.rows.length) await db.query('UPDATE users SET onboarded_at = created_at WHERE onboarded_at IS NULL AND created_at < $1', [ONBOARDING_SINCE]);
  }
  onboardingColumnsReady = true;
}

// Felicitación del día de su cumpleaños. El dedupe_key («birthday:<año>») deja
// pasar una sola al año aunque recargue la página muchas veces, y la tabla
// conserva esa marca aunque borre el aviso.
async function birthdayGreeting(db, u) {
  if (!u.birthday || u.is_guest || !isBirthdayToday(u.birthday)) return;
  const first = String(u.name || '').trim().split(/\s+/)[0] || '';
  await notifySafe(db, u.id, {
    type: 'info',
    title: '¡Feliz cumpleaños' + (first ? ', ' + first : '') + '!',
    body: 'Que tengas un gran día. Gracias por estar en NubiFlyGo.',
    link: '/settings',
    dedupe: 'birthday:' + new Date().toISOString().slice(0, 4)
  });
}

// Solo se aceptan claves conocidas y valores válidos (nada de datos libres).
const WIDGET_IDS = ['music'];
function cleanUiPrefs(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  if (v.widgets !== undefined) {
    const w = v.widgets;
    if (!w || typeof w !== 'object') return null;
    // Lista corta y sin duplicados (tamaño acotado: nada de trabajo cuadrático).
    const raw = Array.isArray(w.order) ? w.order : [];
    if (raw.length > WIDGET_IDS.length * 4) return null;
    const order = [];
    for (const x of raw) if (WIDGET_IDS.includes(x) && !order.includes(x)) order.push(x);
    WIDGET_IDS.forEach(id => { if (!order.includes(id)) order.push(id); });
    out.widgets = { order, dock: w.dock === 'top' ? 'top' : 'bottom' };
    // Altura libre del contenedor: 0 (abajo) … 1 (arriba), con 3 decimales.
    if (typeof w.y === 'number' && Number.isFinite(w.y)) out.widgets.y = Math.round(Math.min(1, Math.max(0, w.y)) * 1000) / 1000;
  }
  return Object.keys(out).length ? out : null;
}

