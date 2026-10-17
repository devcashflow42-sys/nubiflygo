/* ==========================================================================
   http.js — Utilidades HTTP para las Pages Functions: JSON, cookies y sesión.
   La sesión viaja en una cookie httpOnly; el token nunca se expone al JS.
   ========================================================================== */

import { verifyJWT, signJWT } from './crypto.js';
import { getDb } from './db.js';
import { ensureSecurityColumns, secretOk } from './security.js';

const COOKIE = 'ritmogo_session';

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...extraHeaders }
  });
}

// Cabeceras CORS: permiten que apps externas/móviles llamen a la API con su
// API key desde cualquier origen. La auth por API key no usa cookies, así que
// es seguro permitir cualquier origen.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key',
  'Access-Control-Max-Age': '86400'
};

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Cabecera Set-Cookie con el token de sesión (httpOnly).
export function sessionCookie(token, days) {
  const maxAge = days * 24 * 60 * 60;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// La sesión lleva la versión de sesión del usuario (sv): si cambia (p. ej. al
// cambiar la contraseña), los tokens anteriores dejan de valer.
export async function issueSession(user, env) {
  if (!secretOk(env.JWT_SECRET)) throw new Error('JWT_SECRET no está configurado.');
  const days = Number(env.SESSION_DAYS) || 7;
  let sv = user.session_version;
  if (sv == null) {
    const db = getDb(env);
    await ensureSecurityColumns(db);
    const { rows } = await db.query('SELECT session_version FROM users WHERE id = $1', [user.id]);
    sv = rows[0] ? rows[0].session_version : 0;
  }
  const token = await signJWT({ sub: user.id, email: user.email, sv: Number(sv) || 0 }, env.JWT_SECRET, days);
  return sessionCookie(token, days);
}

// Devuelve { id, email, sv } si hay sesión válida, o null.
export async function getUser(request, env) {
  const token = parseCookies(request)[COOKIE];
  if (!token || !secretOk(env.JWT_SECRET)) return null;
  const p = await verifyJWT(token, env.JWT_SECRET);
  return p && p.sub ? { id: p.sub, email: p.email, sv: Number(p.sv) || 0 } : null;
}
