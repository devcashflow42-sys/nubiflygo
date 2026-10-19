/* ==========================================================================
   routes/account.js — /api/v1/account/*
   register · login · logout · profile (GET/PATCH) · avatar (GET/POST/DELETE)
   ========================================================================== */

import { Router } from 'express';
import { query } from '../db.js';
import { hashPassword, verifyPassword, issueSession, clearSession, requireAuth } from '../auth.js';
import { rateLimit, rateReset, tooMany, clientIp, secLog, ensureSecurity, isAdminEmail } from '../security.js';
import { recordLogin, notifySafe, hourKey } from '../notify.js';
import { ensureBilling, effectivePlan, PLANS } from '../billing.js';
const db = { query };

export const account = Router();
// Hash bcrypt de relleno (comparación de igual costo cuando el correo no existe).
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.dPzbtfq8wfp0X8vhn1vF6mMyH4b6';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Límites de intentos (capa 3), igual que en Cloudflare. Ventanas en segundos.
const LIMITS = {
  loginIp:   { n: 30, win: 900 },
  loginFail: { n: 8,  win: 900 },    // por cuenta + conexión
  loginAcct: { n: 100, win: 900 },   // por cuenta desde todas partes
  register:  { n: 10, win: 3600 },
  password:  { n: 10, win: 900 }
};

function validCredentials(body, needName) {
  body = body || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (needName && name.length < 2) return { error: 'El nombre es obligatorio.' };
  if (name.length > 80) return { error: 'El nombre es demasiado largo (máx. 80 caracteres).' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'El correo no es válido.' };
  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  if (password.length > 200) return { error: 'La contraseña es demasiado larga (máx. 200 caracteres).' };
  return { name, email, password };
}

// POST /register
account.post('/register', async (req, res, next) => {
  try {
    const rl = await rateLimit('register-ip:' + clientIp(req), LIMITS.register.n, LIMITS.register.win);
    if (!rl.ok) { secLog('rate_limited', req, { what: 'register' }); return tooMany(res, rl.retryAfter, 'Demasiados registros desde esta conexión. Inténtalo más tarde.'); }
    const v = validCredentials(req.body, true);
    if (v.error) return res.status(400).json({ error: v.error });
    // El correo de administración no se registra con contraseña (no hay verificación de correo).
    if (isAdminEmail(v.email)) return res.status(403).json({ error: 'Este correo no se puede registrar con contraseña.' });

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [v.email]);
    if (exists.rowCount) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });

    const hash = await hashPassword(v.password);
    const { rows } = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [v.name, v.email, hash]
    );
    const user = rows[0];
    await query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [user.id, 'account', 'Cuenta creada']);
    await recordLogin(db, user, req.get('User-Agent'), clientIp(req), 'correo y contraseña');
    issueSession(res, user);
    res.status(201).json({ user });
  } catch (err) { next(err); }
});

// ¿El dueño de este correo ya inició sesión antes desde esta IP? (igual que en functions/)
async function knownLoginIp(email, ip) {
  try {
    const { rows } = await query(
      'SELECT 1 FROM login_devices d JOIN users u ON u.id = d.user_id WHERE u.email = $1 AND d.ip = $2 LIMIT 1', [email, ip]);
    return rows.length > 0;
  } catch { return false; }
}

// POST /login
account.post('/login', async (req, res, next) => {
  try {
    // Capa 3: límite por conexión y bloqueo temporal de la cuenta tras varios fallos.
    const rl = await rateLimit('login-ip:' + clientIp(req), LIMITS.loginIp.n, LIMITS.loginIp.win);
    if (!rl.ok) { secLog('rate_limited', req, { what: 'login' }); return tooMany(res, rl.retryAfter); }
    const v = validCredentials(req.body, false);
    if (v.error) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    // Se cuenta antes de comprobar; bloqueo fuerte por cuenta + conexión y tope por cuenta.
    const pairKey = 'login-fail:' + v.email + '|' + clientIp(req), acctKey = 'login-acct:' + v.email;
    const pair = await rateLimit(pairKey, LIMITS.loginFail.n, LIMITS.loginFail.win);
    const acct = await rateLimit(acctKey, LIMITS.loginAcct.n, LIMITS.loginAcct.win);
    // El tope por cuenta no bloquea al dueño desde una conexión donde ya entró antes.
    const acctBlocked = !acct.ok && !(await knownLoginIp(v.email, clientIp(req)));
    if (!pair.ok || acctBlocked) {
      const wait = Math.max(pair.ok ? 0 : pair.retryAfter, acctBlocked ? acct.retryAfter : 0);
      secLog('login_locked', req, { email: v.email });
      // Aviso al dueño de la cuenta (si existe), como mucho uno por hora.
      try {
        const own = await query('SELECT id FROM users WHERE email = $1', [v.email]);
        if (own.rows[0]) await notifySafe(db, own.rows[0].id, {
          type: 'warning', dedupe: hourKey('login-locked'),
          title: 'Intentos de acceso bloqueados',
          body: 'Detectamos varios intentos fallidos de iniciar sesión en tu cuenta y los bloqueamos temporalmente. Si no fuiste tú, cambia tu contraseña.',
          link: '/settings'
        });
      } catch {}
      return tooMany(res, wait, 'Demasiados intentos fallidos para esta cuenta. Espera ' + Math.ceil(wait / 60) + ' min e inténtalo de nuevo.');
    }
    await ensureSecurity();
    const { rows } = await query('SELECT id, name, email, password_hash, session_version FROM users WHERE email = $1', [v.email]);
    const user = rows[0];
    // Mismo mensaje y mismo trabajo exista o no la cuenta (no filtra cuentas).
    const valid = await verifyPassword(v.password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !valid) {
      secLog('login_failed', req, { email: v.email });
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    await rateReset(pairKey);
    await rateReset(acctKey);
    await recordLogin(db, user, req.get('User-Agent'), clientIp(req), 'correo y contraseña');
    issueSession(res, user);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) { next(err); }
});

// POST /logout
account.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// Columnas públicas del perfil (nunca incluye password_hash ni avatar_data).
const PROFILE_COLS = 'id, name, email, created_at, is_guest, guest_expires_at, language, plan, is_admin, avatar_url, ui_prefs, plan_expires_at, plan_cancel_at_period_end';

// Preferencias de interfaz en la cuenta (orden/posición de los widgets flotantes).
let uiPrefsReady = false;
async function ensureUiPrefs() {
  if (uiPrefsReady) return;
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb`);
  uiPrefsReady = true;
}
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
account.use(['/profile', '/avatar'], (req, res, next) => { ensureUiPrefs().then(() => ensureBilling(db)).then(() => next(), next); });
const LANGS = ['es', 'en', 'pt', 'fr', 'de', 'it', 'zh', 'ja'];
const normLang = (v) => { const c = String(v || '').slice(0, 2).toLowerCase(); return LANGS.includes(c) ? c : 'es'; };

// Campos derivados del plan que usa la interfaz (igual que en functions/).
function shapeUser(u) {
  const admins = String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  u.is_admin = !!u.is_admin || admins.includes(String(u.email || '').toLowerCase());
  // Un plan de pago vencido cuenta como Gratis.
  u.plan = u.is_admin ? 'unlimited' : effectivePlan(u);
  u.plan_label = u.is_admin ? 'Sin límites' : (u.is_guest ? 'Invitado' : (u.plan === 'free' ? 'Gratis' : (PLANS[u.plan] ? PLANS[u.plan].name : u.plan)));
  u.has_paid_plan = !u.is_admin && !u.is_guest && u.plan !== 'free';
  if (!u.has_paid_plan) { u.plan_expires_at = null; u.plan_cancel_at_period_end = false; }
  return u;
}

// GET /profile
account.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${PROFILE_COLS} FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ user: shapeUser(rows[0]) });
  } catch (err) { next(err); }
});

// PATCH /profile — nombre, idioma y, opcionalmente, la contraseña (requiere la actual).
account.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const vals = [];
    let i = 2;
    if (typeof b.name === 'string') {
      const nm = b.name.trim();
      if (nm.length < 2) return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
      sets.push('name = $' + (i++)); vals.push(nm.slice(0, 80));
    }
    if (typeof b.language === 'string') {
      sets.push('language = $' + (i++)); vals.push(normLang(b.language));
    }
    if (b.ui_prefs !== undefined) {
      const ui = cleanUiPrefs(b.ui_prefs);
      if (!ui) return res.status(400).json({ error: 'Preferencias de interfaz no válidas.' });
      sets.push(`ui_prefs = coalesce(ui_prefs, '{}'::jsonb) || $${i++}::jsonb`); vals.push(JSON.stringify(ui));
    }
    let newSession = false;
    if (b.new_password) {
      const np = String(b.new_password);
      if (np.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      if (np.length > 200) return res.status(400).json({ error: 'La contraseña es demasiado larga (máx. 200 caracteres).' });
      const rl = await rateLimit('password:' + req.user.id, LIMITS.password.n, LIMITS.password.win);
      if (!rl.ok) return tooMany(res, rl.retryAfter);
      const cur = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const ok = cur.rows[0] && await verifyPassword(String(b.current_password || '').slice(0, 200), cur.rows[0].password_hash);
      if (!ok) { secLog('password_change_failed', req, { user: req.user.id }); return res.status(403).json({ error: 'La contraseña actual no es correcta.' }); }
      sets.push('password_hash = $' + (i++)); vals.push(await hashPassword(np));
      // Las demás sesiones abiertas (otros dispositivos) se cierran.
      sets.push('session_version = coalesce(session_version, 0) + 1');
      newSession = true;
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar.' });
    const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${PROFILE_COLS}, session_version`, [req.user.id, ...vals]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (newSession) {
      issueSession(res, { id: req.user.id, email: rows[0].email, session_version: rows[0].session_version });
      await query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [req.user.id, 'account', 'Contraseña cambiada (se cerraron las demás sesiones)']).catch(() => {});
    }
    delete rows[0].session_version;
    res.json({ user: shapeUser(rows[0]) });
  } catch (err) { next(err); }
});

// Foto de perfil: se guarda en users.avatar_data (data URL redimensionada en el navegador).
const IMAGE_DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
function parseImageDataUrl(v) {
  const m = IMAGE_DATA_URL_RE.exec(String(v || ''));
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  return bytes.length ? { mime: m[1], bytes } : null;
}

// GET /avatar
account.get('/avatar', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT avatar_data FROM users WHERE id = $1', [req.user.id]);
    const parsed = parseImageDataUrl(rows[0] && rows[0].avatar_data);
    if (!parsed) return res.status(404).json({ error: 'Sin foto de perfil.' });
    res.set('Cache-Control', 'private, max-age=31536000, immutable').type(parsed.mime).send(parsed.bytes);
  } catch (err) { next(err); }
});

// POST /avatar  { image: 'data:image/jpeg;base64,...' }
account.post('/avatar', requireAuth, async (req, res, next) => {
  try {
    const image = req.body && req.body.image;
    const parsed = parseImageDataUrl(image);
    if (!parsed) return res.status(400).json({ error: 'La imagen no es válida. Usa JPG, PNG, WEBP o GIF.' });
    if (parsed.bytes.length > AVATAR_MAX_BYTES) return res.status(413).json({ error: 'La imagen es demasiado grande (máx. 2 MB).' });
    const url = '/api/v1/account/avatar?v=' + Date.now().toString(36);
    const { rows } = await query(
      `UPDATE users SET avatar_data = $2, avatar_url = $3 WHERE id = $1 RETURNING ${PROFILE_COLS}`,
      [req.user.id, String(image), url]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ user: shapeUser(rows[0]) });
  } catch (err) { next(err); }
});

// DELETE /avatar
account.delete('/avatar', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE users SET avatar_data = NULL, avatar_url = NULL WHERE id = $1 RETURNING ${PROFILE_COLS}`,
      [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ user: shapeUser(rows[0]) });
  } catch (err) { next(err); }
});
