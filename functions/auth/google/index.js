/* ==========================================================================
   /auth/google — Login con Google por idToken (patrón Syrtra).
   Es la ruta que usan Google Identity (botón/One Tap en la web) y la app
   Android: mandan el "credential" (idToken) y el servidor lo VERIFICA antes de
   dejar la sesión. Al no depender de una redirección, no sufre el "me lo
   cancelaba" del navegador: si el usuario cierra One Tap, la web simplemente no
   llama aquí (no hay error).

     GET  /auth/google   → { configured, clientId }   (para iniciar Google Identity en la web)
     POST /auth/google   → { credential }  →  verifica, crea/inicia sesión, deja cookie, { user }
     OPTIONS             → preflight CORS (para la app o un dominio distinto)

   Variables de entorno:
     GOOGLE_CLIENT_ID            (obligatoria) — client_id web (también es la "aud" del token)
     GOOGLE_ALLOWED_AUDIENCES    (opcional)    — otros client_id válidos (p. ej. Android), separados por comas
     JWT_SECRET                  (obligatoria) — firma de la cookie de sesión
   ========================================================================== */

import { getDb } from '../../_shared/db.js';
import { json, issueSession, CORS } from '../../_shared/http.js';
import { verifyGoogleIdToken, upsertGoogleUser } from '../../_shared/google.js';
import { recordLogin } from '../../_shared/notify.js';
import { rateLimit, tooMany, clientIp, serverError, secLog } from '../../_shared/security.js';

// Mensajes claros por cada código de error de la verificación.
const MSG = {
  token_missing: 'No llegó el token de Google.',
  token_format: 'El token de Google no tiene el formato esperado.',
  token_alg: 'El token de Google usa un algoritmo no permitido.',
  token_kid: 'El token de Google no indica su llave.',
  token_key: 'No se encontró la llave pública de Google para este token.',
  token_signature: 'La firma del token de Google no es válida.',
  token_iss: 'El token no fue emitido por Google.',
  token_aud: 'El token de Google es para otra aplicación (client_id distinto).',
  token_expired: 'El token de Google caducó. Inténtalo de nuevo.',
  token_early: 'El token de Google aún no es válido (revisa la hora del dispositivo).',
  token_nonce: 'La comprobación de seguridad (nonce) no coincide.',
  token_email: 'Google no compartió un correo.',
  token_email_unverified: 'El correo de Google no está verificado.',
  jwks_fetch: 'No se pudieron obtener las llaves de Google. Inténtalo de nuevo.'
};

// GET → datos públicos para arrancar Google Identity en el navegador.
// El client_id NO es secreto (va en el navegador por diseño); el secreto es el
// client_secret, que nunca sale de las variables de entorno del servidor.
export async function onRequestGet({ env }) {
  const clientId = env.GOOGLE_CLIENT_ID || null;
  return json({ configured: !!clientId, clientId });
}

// POST → recibe el credential (idToken), lo verifica y deja la cookie de sesión.
export async function onRequestPost({ request, env }) {
  if (!env.JWT_SECRET) return json({ error: 'El servidor no tiene configurada la sesión (JWT_SECRET).' }, 500);
  if (!env.GOOGLE_CLIENT_ID) return json({ error: 'El acceso con Google aún no está configurado.' }, 503);

  // Capa 3: límite de intentos por conexión.
  const rl = await rateLimit(getDb(env), 'google-ip:' + clientIp(request), 30, 900);
  if (!rl.ok) { secLog('rate_limited', request, { what: 'google' }); return tooMany(rl.retryAfter); }

  let b = {};
  try { b = await request.json(); } catch { b = {}; }
  const credential = String(b.credential || b.id_token || b.idToken || '').slice(0, 8192);

  let profile;
  try {
    profile = await verifyGoogleIdToken(credential, env, { nonce: b.nonce });
  } catch (e) {
    const code = String(e && e.message || 'token');
    secLog('google_token_rejected', request, { code: MSG[code] ? code : 'token' });
    return json({ error: MSG[code] || 'No se pudo validar el acceso con Google.', code: MSG[code] ? code : 'token' }, 401);
  }

  try {
    const db = getDb(env);
    const user = await upsertGoogleUser(db, env, profile, request);
    await recordLogin(db, user, request.headers.get('User-Agent'), clientIp(request), 'Google');
    return json(
      { user: { id: user.id, name: user.name, email: user.email } },
      200,
      { 'Set-Cookie': await issueSession(user, env) }
    );
  } catch (e) {
    const ref = serverError(e, 'auth/google');
    return json({ error: 'No se pudo iniciar sesión. Inténtalo de nuevo (código ' + ref + ').', ref }, 500);
  }
}

// Preflight CORS (cuando la llamada viene de otro origen, p. ej. la app).
export async function onRequestOptions({ request }) {
  const reqHeaders = request.headers.get('Access-Control-Request-Headers');
  const headers = { ...CORS };
  if (reqHeaders) headers['Access-Control-Allow-Headers'] = reqHeaders;
  return new Response(null, { status: 204, headers });
}
