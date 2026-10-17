/* ==========================================================================
   security.js — Capas de seguridad del servidor Express (mismas reglas que
   functions/_shared/security.js en Cloudflare).
   Capa 1 · Acceso: la barra de direcciones nunca muestra datos de la API y,
            con la cookie de sesión, la petición debe venir de la propia app
            (o de un origen de ALLOWED_ORIGINS).
   Capa 2 · Permisos: cada consulta va filtrada por el usuario; un proyecto
            enviado debe ser suyo (ownsProject).
   Capa 3 · Límites: cuerpo JSON acotado y límite de intentos por IP/cuenta
            (tabla rate_limits en Postgres).
   Capa 4 · Salida segura: errores sin detalles internos y archivos que el
            navegador podría ejecutar (HTML, SVG…) siempre como descarga.
   Capa 5 · Cabeceras de seguridad del navegador y registro de eventos.
   ========================================================================== */

import crypto from 'node:crypto';
import { query } from './db.js';
import { config } from './config.js';

export const CLIENT_HEADER = 'X-NubiFly-Client';
const BINARY_RE = /^\/api\/v1\/(?:files\/[0-9a-f-]{36}\/(?:download|thumb)|account\/avatar)\/?$/i;
const PUBLIC_SHARE_RE = /^\/api\/v1\/public\/shares\/[A-Za-z0-9]{22}(\/(preview|download))?\/?$/;
const PUBLIC_RE = /^\/api\/v1\/(health|billing\/webhook)\/?$/i;   // el webhook lo llama Mercado Pago
const NAV_DEST = new Set(['document', 'iframe', 'frame', 'embed', 'object', 'fencedframe']);

const hostOf = (v) => { try { return new URL(v).host.toLowerCase(); } catch { return ''; } };
const h = (req, name) => String(req.get(name) || '').toLowerCase();

function ownHosts(req) {
  return [req.get('host'), req.get('x-forwarded-host')].filter(Boolean).map(s => String(s).split(',')[0].trim().toLowerCase());
}

// ¿La petición sale de la propia app (o de un origen permitido)?
export function fromApp(req) {
  const own = ownHosts(req);
  const origin = req.get('origin');
  if (origin && origin !== 'null') {
    if (config.allowedOrigins.includes(origin)) return true;          // front en otro dominio (configurado)
    if (!own.includes(hostOf(origin))) return false;                   // otra web: nunca
  }
  const site = h(req, 'sec-fetch-site');
  if (site) return site === 'same-origin';
  if (origin && origin !== 'null') return true;
  if (req.get(CLIENT_HEADER)) return true;
  const ref = req.get('referer');
  return !!ref && own.includes(hostOf(ref));
}
export function isNavigation(req) {
  return h(req, 'sec-fetch-mode') === 'navigate' || NAV_DEST.has(h(req, 'sec-fetch-dest'));
}

// Capa 1: middleware para /api.
export function apiGate(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const path = req.originalUrl.split('?')[0];
  // Enlaces compartidos: públicos y de solo lectura (incluye la descarga, que es una navegación).
  if (PUBLIC_SHARE_RE.test(path) && (req.method === 'GET' || req.method === 'HEAD')) return next();
  if (isNavigation(req)) {
    if (BINARY_RE.test(path) && h(req, 'sec-fetch-site') === 'same-origin') return next();
    return deny(req, res, 401, 'Autenticación requerida.', 'navigation');
  }
  if (req.query && (req.query.key !== undefined || req.query.api_key !== undefined)) {
    return deny(req, res, 401, 'Este servidor no acepta API keys en la URL.', 'key_in_url');
  }
  if (PUBLIC_RE.test(path)) return next();
  if (!fromApp(req)) return deny(req, res, 403, 'Solicitud no permitida.', 'cross_site');
  next();
}
function deny(req, res, status, message, reason) {
  secLog('blocked', req, { status, reason });
  res.status(status).set('Cache-Control', 'no-store').json({ error: message });
}

/* ─── Capa 5 · Cabeceras ─── */
export const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https://accounts.google.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'"
].join('; ');
export const API_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox";

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', API_CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  } else {
    res.setHeader('Content-Security-Policy', PAGE_CSP);
  }
  next();
}

/* ─── Capa 4 · Archivos ─── */
const ACTIVE_MIME = /^(text\/(html|xml|javascript|ecmascript|xsl|x-[a-z]*script)|application\/(xhtml\+xml|xml|javascript|ecmascript|x-javascript|x-shockwave-flash|wasm|java-archive|x-msdownload|x-sh)|image\/svg\+xml|multipart\/)/i;
export function fileHeaders(name, mime, wantInline) {
  const active = ACTIVE_MIME.test(String(mime || '')) || /\.(html?|xhtml|svgz?|xml|xsl|js|mjs)$/i.test(String(name || ''));
  const inline = wantInline && !active;
  const type = active ? 'application/octet-stream' : (mime || 'application/octet-stream');
  const ascii = String(name || 'archivo').replace(/[^\x20-\x7e]|["\\]/g, '_');
  return {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(String(name || 'archivo'))}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': /^application\/pdf$/i.test(type)
      ? "frame-ancestors 'self'"
      : "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox"
  };
}
// Nombre seguro para la clave del almacenamiento (sin "/", "..", ni rarezas).
export function safeKeyName(name) {
  const n = String(name || 'archivo').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^[._-]+/, '').slice(-120);
  return n || 'archivo';
}

/* ─── Columnas y tabla de seguridad (se crean solas una vez) ─── */
let ready = false;
export async function ensureSecurity() {
  if (ready) return;
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ');
  await query(`CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL DEFAULT now(), count INTEGER NOT NULL DEFAULT 0)`);
  ready = true;
}

/* ─── Capa 3 · Límite de intentos ─── */
export async function rateLimit(key, limit, windowSec) {
  try {
    await ensureSecurity();
    const { rows } = await query(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
       RETURNING count, GREATEST(1, ceil(extract(epoch FROM (window_start + make_interval(secs => $2) - now()))))::int AS retry`,
      [String(key).slice(0, 200), windowSec]);
    const r = rows[0] || { count: 0, retry: windowSec };
    return { ok: r.count <= limit, count: r.count, retryAfter: r.retry };
  } catch { return { ok: true, count: 0, retryAfter: 0 }; }
}
export async function rateCount(key, windowSec) {
  try {
    await ensureSecurity();
    const { rows } = await query(
      `SELECT count, GREATEST(1, ceil(extract(epoch FROM (window_start + make_interval(secs => $2) - now()))))::int AS retry
       FROM rate_limits WHERE key = $1 AND window_start >= now() - make_interval(secs => $2)`,
      [String(key).slice(0, 200), windowSec]);
    return rows[0] ? { count: rows[0].count, retryAfter: rows[0].retry } : { count: 0, retryAfter: 0 };
  } catch { return { count: 0, retryAfter: 0 }; }
}
export async function rateReset(key) {
  try { await query('DELETE FROM rate_limits WHERE key = $1', [String(key).slice(0, 200)]); } catch {}
}
export function tooMany(res, retryAfter, message) {
  res.status(429).set('Retry-After', String(retryAfter || 60))
    .json({ error: message || 'Demasiados intentos. Espera un momento e inténtalo de nuevo.', retry_after: retryAfter });
}
// IP del cliente (en IPv6, su bloque /64).
export function clientIp(req) {
  return ipBlock(req.ip || req.socket?.remoteAddress || 'local');
}
export function ipBlock(ip) {
  ip = String(ip || '').trim().toLowerCase();
  if (!ip.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/^::ffff:/, '');
  const [head, tail] = ip.split('::');
  const a = head ? head.split(':') : [], b = tail !== undefined && tail ? tail.split(':') : [];
  const full = tail === undefined ? a : a.concat(Array(Math.max(0, 8 - a.length - b.length)).fill('0'), b);
  return full.slice(0, 4).map(x => (x || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
export function secretOk(s) { return !!s && s !== 'GENERATE_SECURE_RANDOM_SECRET'; }
export function isAdminEmail(email) {
  return String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(String(email || '').toLowerCase());
}

// ¿El proyecto es del usuario?
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function ownsProject(userId, projectId) {
  if (!projectId) return true;
  if (!UUID_RE.test(String(projectId))) return false;
  const { rows } = await query('SELECT 1 FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
  return !!rows[0];
}

// Largo máximo de cada texto (igual que CRUD_MAX en Cloudflare). Devuelve el
// valor recortado, null, o undefined si no es válido (objetos/arreglos).
const CRUD_MAX = {
  projects:  { name: 120, description: 2000, color: 32 },
  notes:     { title: 300, body: 200000, project_id: 36 },
  documents: { title: 300, content: 500000, project_id: 36 }
};
export function cleanValue(table, col, v) {
  if (col === 'published') return v === true || v === 'true';
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return undefined;
  return String(v).slice(0, (CRUD_MAX[table] && CRUD_MAX[table][col]) || 2000);
}

/* ─── Registro ─── */
export function errorRef() { return crypto.randomBytes(4).toString('hex'); }
export function secLog(event, req, data) {
  try { console.warn(JSON.stringify({ level: 'security', event, method: req.method, path: req.originalUrl.split('?')[0], ip: clientIp(req), ...(data || {}) })); } catch {}
}
