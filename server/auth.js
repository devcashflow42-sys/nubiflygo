/* ==========================================================================
   auth.js — Contraseñas (bcrypt), sesión JWT en cookie httpOnly y middleware.
   El token NUNCA se expone al JavaScript del navegador: va en una cookie
   httpOnly, por lo que no se usa localStorage ni sessionStorage.
   ========================================================================== */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { ensureSecurity, secretOk } from './security.js';

// Cookie de sesión. La anterior («ritmogo_session») se acepta solo durante la
// transición (LEGACY_SESSION_COOKIE ≠ "off"); migrateLegacySession la cambia
// por la nueva sin cerrar la sesión. Copia de functions/_shared/http.js (misma lógica).
export const SESSION_COOKIE = 'nubiflygo_session';
export const LEGACY_SESSION_COOKIE = 'ritmogo_session';
const COOKIE = SESSION_COOKIE;
const legacyOn = () => String(process.env.LEGACY_SESSION_COOKIE || 'on').toLowerCase() !== 'off';
// SameSite=Lax: la cookie viaja en la navegación de vuelta de Google/GitHub
// (GET de primer nivel) y no en peticiones de otros sitios.
const cookieOpts = (req, maxAge) => ({
  httpOnly: true,
  secure: config.isProd || !!(req && req.secure),   // HTTPS en producción (o si la petición ya es HTTPS)
  sameSite: 'lax',
  maxAge,
  path: '/'
});

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// La sesión lleva la versión de sesión (sv): al cambiar la contraseña sube y
// los tokens anteriores (otros dispositivos) dejan de valer.
export function issueSession(res, user) {
  if (!secretOk(config.jwtSecret)) throw new Error('JWT_SECRET no está configurado.');
  const token = jwt.sign({ sub: user.id, email: user.email, sv: Number(user.session_version) || 0 }, config.jwtSecret, {
    expiresIn: config.sessionDays + 'd', algorithm: 'HS256'
  });
  res.cookie(COOKIE, token, cookieOpts(res.req, config.sessionDays * 24 * 60 * 60 * 1000));
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
  res.clearCookie(LEGACY_SESSION_COOKIE, { path: '/' });
}

// Transición: si llega la cookie antigua y no la nueva, se emite la nueva con
// el MISMO token (misma caducidad: no se alarga ni se cierra la sesión) y se
// caduca la antigua con sus atributos originales (sin Domain, Path=/).
export function migrateLegacySession(req, res, next) {
  const old = req.cookies?.[LEGACY_SESSION_COOKIE];
  if (!old) return next();
  if (!req.cookies[COOKIE] && legacyOn() && secretOk(config.jwtSecret)) {
    try {
      const p = jwt.verify(old, config.jwtSecret, { algorithms: ['HS256'] });
      const left = p && typeof p.exp === 'number' ? p.exp * 1000 - Date.now() : 0;
      if (p && p.sub && left > 0) {
        req.cookies[COOKIE] = old;              // esta misma petición ya usa la nueva
        res.cookie(COOKIE, old, cookieOpts(req, left));
      }
    } catch { /* token inválido o vencido: solo se caduca */ }
  }
  res.clearCookie(LEGACY_SESSION_COOKIE, { path: '/' });
  next();
}

// Lee la cookie y devuelve { id, email, sv } si el token es válido (firma y vencimiento).
export function readSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token || !secretOk(config.jwtSecret)) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (!p || !p.sub || typeof p.exp !== 'number') return null;
    return { id: p.sub, email: p.email, sv: Number(p.sv) || 0 };
  } catch {
    return null;
  }
}

// Middleware: exige sesión válida y vigente (la cuenta existe y la sesión no
// fue revocada por un cambio de contraseña).
export function requireAuth(req, res, next) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'No autenticado.' });
  ensureSecurity()
    .then(() => query('SELECT session_version FROM users WHERE id = $1', [user.id]))
    .then(({ rows }) => {
      if (!rows[0] || (Number(rows[0].session_version) || 0) !== user.sv) return res.status(401).json({ error: 'No autenticado.' });
      req.user = user;
      next();
    }, next);
}
