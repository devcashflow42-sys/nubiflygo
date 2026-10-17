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

const COOKIE = 'ritmogo_session';

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
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd || !!(res.req && res.req.secure),   // HTTPS en producción (o si la petición ya es HTTPS)
    sameSite: 'lax',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
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
