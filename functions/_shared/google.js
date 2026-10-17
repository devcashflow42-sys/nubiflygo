/* ==========================================================================
   google.js — Núcleo de seguridad del login con Google (Cloudflare Workers).
   Mismo esquema que Syrtra: el servidor VERIFICA el idToken de Google antes de
   confiar en él. Dos caminos de entrada, una sola lógica de usuario:
     · POST /auth/google   → la web (Google Identity) y la app Android mandan el
                             idToken; aquí se comprueba su firma y sus datos.
     · /auth/google/callback → la redirección clásica (OAuth 2.0) trae un "code"
                             que start/callback cambian por el perfil.
   La verificación es local (firma RS256 contra las llaves públicas de Google),
   no "confía" en el contenido del token sin comprobarlo. Esto es lo que evita
   que un token falso o caducado inicie sesión.
   ========================================================================== */

const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const LANGS = ['es', 'en', 'pt', 'fr', 'de', 'it', 'zh', 'ja'];

/* -------- utilidades base64url -------- */
const dec = new TextDecoder();
function ub64urlToBytes(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const s = atob(str);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
function ub64urlToString(str) {
  return dec.decode(ub64urlToBytes(str));
}
function ub64urlToJSON(str) {
  try { return JSON.parse(ub64urlToString(str)); } catch { return null; }
}

/* -------- JWKS de Google (llaves públicas) con caché en memoria --------
   Las llaves cambian de vez en cuando; se cachean el tiempo que indique
   Cache-Control (o 1 h por defecto) para no pedirlas en cada login. */
let _jwksCache = { keys: null, exp: 0 };

async function getGoogleKeys() {
  const now = Date.now();
  if (_jwksCache.keys && now < _jwksCache.exp) return _jwksCache.keys;
  const res = await fetch(JWKS_URL, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error('jwks_fetch');
  const data = await res.json();
  // Respeta el max-age que manda Google (si no, 1 hora).
  let ttl = 3600;
  const cc = res.headers.get('Cache-Control') || '';
  const m = cc.match(/max-age=(\d+)/);
  if (m) ttl = Math.max(300, Number(m[1]) || 3600);
  const byKid = {};
  for (const k of (data.keys || [])) byKid[k.kid] = k;
  _jwksCache = { keys: byKid, exp: now + ttl * 1000 };
  return byKid;
}

async function importRsaKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/* -------- Audiencias aceptadas --------
   El idToken trae "aud" = el client_id que lo pidió. Aceptamos el client_id
   web y, opcionalmente, otros (p. ej. el de la app Android) separados por comas
   en GOOGLE_ALLOWED_AUDIENCES. Así el MISMO servidor sirve a la web y a Android,
   igual que en Syrtra. */
export function allowedAudiences(env) {
  const out = [];
  if (env.GOOGLE_CLIENT_ID) out.push(String(env.GOOGLE_CLIENT_ID).trim());
  for (const extra of String(env.GOOGLE_ALLOWED_AUDIENCES || '').split(',')) {
    const v = extra.trim();
    if (v) out.push(v);
  }
  return out;
}

/* ==========================================================================
   verifyGoogleIdToken — EL corazón de la seguridad.
   Comprueba, en este orden:
     1) Estructura y algoritmo (RS256, nunca "none").
     2) Firma RS256 contra la llave pública de Google del "kid" del token.
     3) Emisor (iss) = Google.
     4) Audiencia (aud) = nuestro client_id (o uno permitido).
     5) No caducado (exp) con un pequeño margen de reloj.
     6) Correo presente y verificado (email_verified).
   Devuelve el perfil { sub, email, name, picture } o lanza un error con un
   código corto para que el endpoint responda con un mensaje claro.
   ========================================================================== */
export async function verifyGoogleIdToken(idToken, env, opts = {}) {
  if (!idToken || typeof idToken !== 'string') throw new Error('token_missing');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('token_format');

  const header = ub64urlToJSON(parts[0]);
  const payload = ub64urlToJSON(parts[1]);
  if (!header || !payload) throw new Error('token_format');
  if (header.alg !== 'RS256') throw new Error('token_alg');   // nunca aceptamos "none"
  if (!header.kid) throw new Error('token_kid');

  // Firma.
  const keys = await getGoogleKeys();
  const jwk = keys[header.kid];
  if (!jwk) throw new Error('token_key');     // "kid" desconocido → token no es de Google
  const key = await importRsaKey(jwk);
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const sig = ub64urlToBytes(parts[2]);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
  if (!ok) throw new Error('token_signature');

  // Emisor.
  if (!GOOGLE_ISS.includes(payload.iss)) throw new Error('token_iss');

  // Audiencia (a quién se le emitió el token).
  const auds = allowedAudiences(env);
  if (auds.length && !auds.includes(payload.aud)) throw new Error('token_aud');

  // Caducidad (con margen de 60 s por desfase de reloj).
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp + 60) throw new Error('token_expired');
  if (payload.nbf && now + 60 < payload.nbf) throw new Error('token_early');

  // Nonce (anti-repetición), solo si se pidió comprobarlo.
  if (opts.nonce && payload.nonce && opts.nonce !== payload.nonce) throw new Error('token_nonce');

  // Correo verificado.
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email) throw new Error('token_email');
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (!verified) throw new Error('token_email_unverified');

  return {
    sub: payload.sub,
    email,
    name: String(payload.name || payload.given_name || email.split('@')[0] || 'Usuario').slice(0, 80),
    picture: (String(payload.picture || '').slice(0, 500)) || null
  };
}

/* -------- Idioma y redirect_uri -------- */
export function detectLang(request) {
  const al = (request.headers.get('Accept-Language') || '').slice(0, 2).toLowerCase();
  return LANGS.includes(al) ? al : 'es';
}

// redirect_uri para el flujo de redirección. Si está GOOGLE_REDIRECT_URI, se usa
// tal cual (debe coincidir EXACTO con el registrado en Google Cloud Console). Si
// no, se construye con el dominio real desde el que llegó la petición, para que
// funcione igual en ritmogo.site, en *.pages.dev o en una vista previa.
export function resolveRedirectUri(request, env) {
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
  const origin = new URL(request.url).origin;
  return origin + '/auth/google/callback';
}

/* ==========================================================================
   upsertGoogleUser — crea el usuario si no existe, o recupera el que ya está,
   buscando por correo. Mantiene al día la foto de perfil. Una sola función para
   los dos caminos (idToken y redirección), así no hay lógica duplicada.
   ========================================================================== */
export async function upsertGoogleUser(db, env, profile, request) {
  const email = profile.email;
  const found = await db.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
  let user = found.rows[0];

  if (!user) {
    // Contraseña aleatoria no usable: estas cuentas entran solo por Google/GitHub.
    const hash = await hashUnusablePassword();
    const ins = await db.query(
      'INSERT INTO users (name, email, password_hash, language, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email',
      [profile.name, email, hash, detectLang(request), profile.picture]);
    user = ins.rows[0];
    try { await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [user.id, 'account', 'Cuenta creada con ' + (profile.source || 'Google')]); } catch {}
  } else if (profile.picture) {
    try { await db.query('UPDATE users SET avatar_url = $2 WHERE id = $1', [user.id, profile.picture]); } catch {}
  }
  return user;
}

// Hash PBKDF2 de una contraseña aleatoria (no usable para iniciar sesión con
// correo). No importamos crypto.js para no crear dependencias circulares.
async function hashUnusablePassword() {
  const enc = new TextEncoder();
  const random = 'google_' + crypto.randomUUID() + crypto.randomUUID();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = 100000;
  const key = await crypto.subtle.importKey('raw', enc.encode(random), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
  const b64 = (bytes) => { let s = ''; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
  return `pbkdf2$${iter}$${b64(salt)}$${b64(bits)}`;
}
