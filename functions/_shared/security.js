/* ==========================================================================
   security.js — Capas de seguridad de la API (Cloudflare Pages Functions).
   Las aplica _middleware.js a TODA petición de /api antes de llegar a los
   servicios, así ninguna ruta se queda sin protección por olvido.

   Capa 1 · Acceso: la API solo responde a la app o a una API key.
     · La barra de direcciones nunca muestra datos: una navegación directa
       (escribir /api/v1/... o abrir un enlace) recibe 401 sin tocar la base,
       aunque haya sesión. Excepción: abrir/descargar TU archivo desde la app.
     · Con la cookie de sesión, la petición debe venir de la propia app
       (Sec-Fetch-Site: same-origin, o el mismo Origin, o la cabecera
       X-NubiFly-Client). Otra web no puede usar tu sesión (CSRF).
   Capa 3 · Límites: cuerpo JSON acotado y límite de intentos por IP/cuenta
     (tabla rate_limits en Postgres, sin servicios extra).
   Capa 4 · Errores sin detalles internos (solo un código de referencia).
   Capa 5 · Cabeceras de seguridad del navegador y registro de eventos.
   (La capa 2 —permisos y alcance de las API keys— vive en api.js.)
   ========================================================================== */

export const CLIENT_HEADER = 'X-NubiFly-Client';

// Contenido binario del propio usuario que la app carga con <audio>/<img> o
// abre/descarga en otra pestaña: no es una lista de datos.
const BINARY_RE = /^\/api\/v1\/(?:files\/[0-9a-f-]{36}\/(?:download|thumb)|account\/avatar)\/?$/i;
// Sin sesión: solo el estado mínimo del servicio.
const PUBLIC_SHARE_RE = /^\/api\/v1\/public\/shares\/[A-Za-z0-9]{22}(\/(preview|download))?\/?$/;
const PUBLIC_RE = /^\/api\/v1\/(health|billing\/webhook)\/?$/i;   // el webhook lo llama Mercado Pago
// Destinos de navegación (la página entera o un marco).
const NAV_DEST = new Set(['document', 'iframe', 'frame', 'embed', 'object', 'fencedframe']);
// Cuerpo JSON máximo (la foto de perfil viaja como data URL de hasta 2 MB).
const JSON_MAX = 1024 * 1024;
const JSON_MAX_AVATAR = 3 * 1024 * 1024;

const lower = (request, name) => (request.headers.get(name) || '').toLowerCase();

function hostOf(value) {
  try { return new URL(value).host.toLowerCase(); } catch { return ''; }
}

// ¿La petición trae una API key en la cabecera? (Authorization: Bearer o X-API-Key)
export function hasApiKey(request) {
  const authz = request.headers.get('Authorization') || '';
  return /^Bearer\s+\S/i.test(authz) || !!(request.headers.get('X-API-Key') || '').trim();
}
// Una clave en la URL (?key=) queda en el historial, en los registros y en
// capturas: ya no se acepta.
function keyInUrl(url) {
  return url.searchParams.has('key') || url.searchParams.has('api_key');
}

// ¿La petición sale de la propia app (mismo origen)?
export function fromApp(request, url) {
  const own = (url || new URL(request.url)).host.toLowerCase();
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null' && hostOf(origin) !== own) return false;    // otra web: nunca
  // App Android/iOS: sin Origin y con su cabecera. Va ANTES de Sec-Fetch-Site
  // porque algunos WebView/clientes HTTP mandan "none" o "cross-site" y la app
  // quedaba bloqueada con 403. Seguro: otra web ya se descartó arriba por Origin.
  if (!origin && request.headers.get(CLIENT_HEADER)) return true;
  const site = lower(request, 'sec-fetch-site');
  if (site) return site === 'same-origin';                                    // navegadores actuales
  if (origin && origin !== 'null') return true;                               // mismo Origin
  if (request.headers.get(CLIENT_HEADER)) return true;                        // fetch de la app
  const ref = request.headers.get('Referer');
  return !!ref && hostOf(ref) === own;                                        // navegadores antiguos
}

export function isNavigation(request) {
  return lower(request, 'sec-fetch-mode') === 'navigate' || NAV_DEST.has(lower(request, 'sec-fetch-dest'));
}

/* Capa 1 + límite de cuerpo. Devuelve una Response si hay que rechazar la
   petición, o null si puede seguir (la autenticación la hacen los servicios). */
export function apiGate(request) {
  if (request.method === 'OPTIONS') return null;
  const url = new URL(request.url);
  const path = url.pathname;

  // Cuerpo demasiado grande (se corta antes de leerlo).
  const len = Number(request.headers.get('Content-Length') || 0);
  const isJson = lower(request, 'content-type').includes('application/json');
  if (isJson && len > (/^\/api\/v1\/account\/avatar\/?$/i.test(path) ? JSON_MAX_AVATAR : JSON_MAX)) {
    return deny(request, 413, 'El cuerpo de la petición es demasiado grande.', 'body_too_large');
  }

  // Enlaces compartidos: públicos y de solo lectura (la página /s/<token> y su
  // botón de descarga, que es una navegación normal).
  if (PUBLIC_SHARE_RE.test(path) && (request.method === 'GET' || request.method === 'HEAD')) return null;

  // La barra de direcciones nunca muestra datos de la API.
  if (isNavigation(request)) {
    if (BINARY_RE.test(path) && lower(request, 'sec-fetch-site') === 'same-origin' && !keyInUrl(url)) return null;
    return deny(request, 401, 'Autenticación requerida.', 'navigation');
  }

  if (keyInUrl(url)) return deny(request, 401, 'Envía la API key en la cabecera Authorization: Bearer sk_... (por seguridad no se acepta en la URL).', 'key_in_url');
  if (hasApiKey(request)) return null;               // la valida authenticate()
  if (PUBLIC_RE.test(path)) return null;

  // Sesión del navegador (cookie): solo desde la propia app.
  if (!fromApp(request, url)) return deny(request, 403, 'Solicitud no permitida.', 'cross_site');
  return null;
}

function deny(request, status, message, reason) {
  secLog('blocked', request, { status, reason });
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

/* ─── Capa 5 · Cabeceras de seguridad ─── */
// Páginas: la app usa manejadores en línea (onclick) y estilos en línea, y
// Google para iniciar sesión; todo lo demás queda cerrado.
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
// Respuestas de la API: nada se ejecuta aunque se abran como página.
export const API_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox";

const COMMON = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'X-Permitted-Cross-Domain-Policies': 'none'
};

// Devuelve la respuesta con las cabeceras de seguridad. kind: 'api' | 'page' | 'asset'.
// crossOrigin: la petición vino con API key (apps externas pueden incrustar el recurso).
export function withSecurityHeaders(res, kind, crossOrigin) {
  let out;
  try { out = new Response(res.body, res); } catch { return res; }
  const h = out.headers;
  for (const [k, v] of Object.entries(COMMON)) if (!h.has(k)) h.set(k, v);
  if (kind === 'api') {
    // Los archivos (PDF, imágenes, audio) pueden fijar su propia política.
    if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', API_CSP);
    if (!h.has('Cache-Control')) h.set('Cache-Control', 'no-store');
    h.set('Cross-Origin-Resource-Policy', crossOrigin ? 'cross-origin' : 'same-origin');
  } else if (kind === 'page') {
    h.set('Content-Security-Policy', PAGE_CSP);
  }
  return out;
}

/* ─── Capa 4 · Archivos subidos ───
   Lo que el navegador podría EJECUTAR (HTML, SVG, XML, JavaScript…) nunca se
   muestra en la página: se descarga siempre como adjunto. Lo demás (imagen,
   audio, video, PDF, texto) se puede ver en línea. */
const ACTIVE_MIME = /^(text\/(html|xml|javascript|ecmascript|xsl|x-[a-z]*script)|application\/(xhtml\+xml|xml|javascript|ecmascript|x-javascript|x-shockwave-flash|wasm|java-archive|x-msdownload|x-sh)|image\/svg\+xml|multipart\/)/i;
export function isActiveMime(mime) { return ACTIVE_MIME.test(String(mime || '')); }

// Cabeceras de descarga seguras para un archivo del usuario.
export function fileHeaders(name, mime, wantInline) {
  const active = isActiveMime(mime) || /\.(html?|xhtml|svgz?|xml|xsl|js|mjs)$/i.test(String(name || ''));
  const inline = wantInline && !active;
  const type = active ? 'application/octet-stream' : (mime || 'application/octet-stream');
  const ascii = String(name || 'archivo').replace(/[^\x20-\x7e]|["\\]/g, '_');
  const headers = {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(String(name || 'archivo'))}`,
    'X-Content-Type-Options': 'nosniff'
  };
  // El visor de PDF del navegador no funciona dentro de un "sandbox" (y el
  // PDF no corre con permisos de la página).
  headers['Content-Security-Policy'] = /^application\/pdf$/i.test(type)
    ? "frame-ancestors 'self'"
    : "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox";
  return headers;
}

/* ─── Columnas de seguridad ───
   Se crean solas una vez por instancia si la base aún no las tiene:
   · api_keys.rl_window / rl_count → peticiones por minuto de cada clave.
   · api_keys.expires_at → vencimiento de la clave.
   · users.session_version → al cambiar la contraseña sube y las sesiones
     anteriores dejan de valer. */
// Primero una consulta de solo lectura: los ALTER TABLE (que bloquean la tabla
// un instante) solo se ejecutan si de verdad falta algo.
const SECURITY_DDL = {
  'api_keys.rl_window': 'ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rl_window TIMESTAMPTZ',
  'api_keys.rl_count': 'ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rl_count INTEGER NOT NULL DEFAULT 0',
  'api_keys.expires_at': 'ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ',
  'users.session_version': 'ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0'
};
let securityColumnsReady = false;
export async function ensureSecurityColumns(db) {
  if (securityColumnsReady) return;
  const { rows } = await db.query(
    `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name IN ('api_keys', 'users')
       AND column_name IN ('rl_window', 'rl_count', 'expires_at', 'session_version')`);
  const have = new Set(rows.map(r => r.c));
  for (const [c, sql] of Object.entries(SECURITY_DDL)) if (!have.has(c)) await db.query(sql);
  securityColumnsReady = true;
}

/* ─── Capa 3 · Límite de intentos ───
   Ventana fija por clave (p. ej. "login-ip:1.2.3.4"). Una sola consulta.
   Devuelve { ok, count, retryAfter }. Si la base falla, deja pasar (no
   bloquea a todos por un fallo pasajero). */
let rlReady = false;
async function ensureRateTable(db) {
  if (rlReady) return;
  await db.query(`CREATE TABLE IF NOT EXISTS rate_limits (
    key          TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    count        INTEGER NOT NULL DEFAULT 0
  )`);
  rlReady = true;
}
export async function rateLimit(db, key, limit, windowSec) {
  try {
    await ensureRateTable(db);
    const { rows } = await db.query(
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
// Lee el contador sin sumar (p. ej. fallos de inicio de sesión de un correo).
export async function rateCount(db, key, windowSec) {
  try {
    await ensureRateTable(db);
    const { rows } = await db.query(
      `SELECT count, GREATEST(1, ceil(extract(epoch FROM (window_start + make_interval(secs => $2) - now()))))::int AS retry
       FROM rate_limits WHERE key = $1 AND window_start >= now() - make_interval(secs => $2)`,
      [String(key).slice(0, 200), windowSec]);
    return rows[0] ? { count: rows[0].count, retryAfter: rows[0].retry } : { count: 0, retryAfter: 0 };
  } catch { return { count: 0, retryAfter: 0 }; }
}
export async function rateReset(db, key) {
  try { await db.query('DELETE FROM rate_limits WHERE key = $1', [String(key).slice(0, 200)]); } catch {}
}
export function tooMany(retryAfter, message) {
  return new Response(JSON.stringify({ error: message || 'Demasiados intentos. Espera un momento e inténtalo de nuevo.', retry_after: retryAfter }), {
    status: 429,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter || 60) }
  });
}

// IP del cliente. En IPv6 se usa el bloque /64 (una conexión suele tener
// millones de direcciones; así no se esquiva el límite cambiando de una a otra).
export function clientIp(request) {
  const ip = request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() || 'local';
  return ipBlock(ip);
}
export function ipBlock(ip) {
  ip = String(ip || '').trim().toLowerCase();
  if (!ip.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/^::ffff:/, '');
  const [head, tail] = ip.split('::');
  const a = head ? head.split(':') : [], b = tail !== undefined && tail ? tail.split(':') : [];
  const full = tail === undefined ? a : a.concat(Array(Math.max(0, 8 - a.length - b.length)).fill('0'), b);
  return full.slice(0, 4).map(x => (x || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// JWT_SECRET usable (vacío o el valor de ejemplo → no se firma ni se acepta nada).
export function secretOk(s) { return !!s && s !== 'GENERATE_SECURE_RANDOM_SECRET'; }

/* ─── Capa 4 + 5 · Errores y registro ───
   El cliente solo ve un mensaje genérico con un código; el detalle queda en el
   registro del servidor (Cloudflare → Logs). */
export function errorRef() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function serverError(err, where) {
  const ref = errorRef();
  try { console.error(JSON.stringify({ level: 'error', ref, where: where || '', message: String(err && err.message || err).slice(0, 500) })); } catch {}
  return ref;
}
export function secLog(event, request, data) {
  try {
    const url = new URL(request.url);
    console.warn(JSON.stringify({ level: 'security', event, method: request.method, path: url.pathname, ip: clientIp(request), ...(data || {}) }));
  } catch {}
}
