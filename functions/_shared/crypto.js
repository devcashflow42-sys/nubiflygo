/* ==========================================================================
   crypto.js — Cifrado con Web Crypto (funciona en Cloudflare Workers).
   · Contraseñas: PBKDF2-HMAC-SHA256.
   · Sesión: JWT HS256 (firmado con JWT_SECRET).
   No usa dependencias de Node; sirve igual en el navegador y en Workers.
   ========================================================================== */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes) {
  let s = ''; const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function unb64(str) {
  const s = atob(str); const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
const b64url = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ub64url = str => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));

// Comparación en tiempo constante (evita filtrar por tiempos).
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const PBKDF2_ITER = 100000;

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = unb64(parts[2]);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return safeEqual(b64(bits), parts[3]);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64(sig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signJWT(payload, secret, days) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + days * 86400 };
  const data = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify(body));
  return data + '.' + await hmac(secret, data);
}

export async function verifyJWT(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const expected = await hmac(secret, parts[0] + '.' + parts[1]);
  if (!safeEqual(parts[2], expected)) return null;
  let body;
  try { body = JSON.parse(ub64url(parts[1])); } catch { return null; }
  // Sin vencimiento no vale (todas las sesiones que emitimos lo llevan).
  if (!body || typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}
