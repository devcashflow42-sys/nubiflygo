/* ==========================================================================
   http.js — Utilidades HTTP para las Pages Functions: JSON, cookies y sesión.
   La sesión viaja en una cookie httpOnly; el token nunca se expone al JS.
   ========================================================================== */

import { verifyJWT, signJWT } from './crypto.js';
import { getDb } from './db.js';
import { ensureSecurityColumns, secretOk } from './security.js';

// Cookie de sesión. La anterior («ritmogo_session») se acepta solo durante la
// transición (LEGACY_SESSION_COOKIE ≠ "off"): migrateLegacySession() la cambia
// por la nueva sin cerrar la sesión y la caduca con sus mismos atributos
// (sin Domain, Path=/). Ver MIGRACION-NUBIFLYGO.md.
export const SESSION_COOKIE = 'nubiflygo_session';
export const LEGACY_SESSION_COOKIE = 'ritmogo_session';
const COOKIE = SESSION_COOKIE;
const COOKIE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';
// Dominio oficial. Los enlaces públicos (archivos compartidos) se generan
// siempre con él, aunque la petición llegue por *.pages.dev; APP_URL lo cambia
// y en pruebas locales se usa el propio servidor.
export const CANONICAL_ORIGIN = 'https://nubiflygo.com';
export function publicOrigin(env, request) {
  if (env && env.APP_URL) return String(env.APP_URL).replace(/\/+$/, '');
  const u = new URL(request.url);
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) ? u.origin : CANONICAL_ORIGIN;
}
export const legacySessionsOn = (env) => String((env && env.LEGACY_SESSION_COOKIE) || 'on').toLowerCase() !== 'off';

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
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
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
// SameSite=Lax: la cookie viaja en la navegación de vuelta de Google/GitHub
// (GET de primer nivel) y no en peticiones de otros sitios.
export function sessionCookie(token, days) {
  const maxAge = days * 24 * 60 * 60;
  return `${COOKIE}=${token}; ${COOKIE_ATTRS}; Max-Age=${maxAge}`;
}
export function clearCookie() {
  return `${COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`;
}
export function clearLegacyCookie() {
  return `${LEGACY_SESSION_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`;
}

// Transición de la cookie: si llega la antigua y no la nueva, se emite la nueva
// con el MISMO token (mismo usuario, misma caducidad: no se alarga ni se cierra
// la sesión) y se caduca la antigua. Si la respuesta ya fija la cookie nueva
// (inicio o cierre de sesión), se respeta y solo se caduca la antigua.
export async function migrateLegacySession(request, env, response) {
  const cookies = parseCookies(request);
  const old = cookies[LEGACY_SESSION_COOKIE];
  if (!old) return response;
  const res = new Response(response.body, response);   // cabeceras editables
  const setting = (res.headers.get('Set-Cookie') || '').includes(COOKIE + '=');
  if (!cookies[COOKIE] && !setting && legacySessionsOn(env) && secretOk(env.JWT_SECRET)) {
    const p = await verifyJWT(old, env.JWT_SECRET);
    const left = p ? p.exp - Math.floor(Date.now() / 1000) : 0;
    if (p && p.sub && left > 0) res.headers.append('Set-Cookie', `${COOKIE}=${old}; ${COOKIE_ATTRS}; Max-Age=${left}`);
  }
  res.headers.append('Set-Cookie', clearLegacyCookie());
  return res;
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
  const c = parseCookies(request);
  const token = c[COOKIE] || (legacySessionsOn(env) ? c[LEGACY_SESSION_COOKIE] : null);
  if (!token || !secretOk(env.JWT_SECRET)) return null;
  const p = await verifyJWT(token, env.JWT_SECRET);
  return p && p.sub ? { id: p.sub, email: p.email, sv: Number(p.sv) || 0 } : null;
}
