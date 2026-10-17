/* ==========================================================================
   /auth/google/callback — Fin del login con Google por REDIRECCIÓN (OAuth 2.0).
   Google vuelve aquí con un "code". Se verifica el estado anti-CSRF, se cambia
   el code por un token, se obtiene el perfil, se crea/inicia sesión del usuario
   y se deja la cookie de sesión. Luego va a /main.
   Variables:
     GOOGLE_CLIENT_ID      (obligatoria)
     GOOGLE_CLIENT_SECRET  (obligatoria)  ← SECRETO, solo en el servidor
     GOOGLE_REDIRECT_URI   (opcional; debe COINCIDIR con el usado en /start)
   ========================================================================== */

import { getDb } from '../../_shared/db.js';
import { issueSession, parseCookies } from '../../_shared/http.js';
import { clientIp } from '../../_shared/security.js';
import { recordLogin } from '../../_shared/notify.js';
import { resolveRedirectUri, upsertGoogleUser } from '../../_shared/google.js';

function back(request, error) {
  return Response.redirect(new URL('/login?error=' + error, request.url).toString(), 302);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error') || !code) return back(request, 'google');

  // Verifica el estado anti-CSRF (debe venir en la URL y coincidir con la cookie).
  const cookieState = parseCookies(request)['g_oauth_state'];
  if (!state || !cookieState || state !== cookieState) return back(request, 'google_state');

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back(request, 'google_config');
  const redirectUri = resolveRedirectUri(request, env);

  try {
    // 1) Intercambia el código por un token de acceso.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !token.access_token) return back(request, 'google_token');

    // 2) Obtiene el perfil del usuario (correo, nombre, foto).
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + token.access_token }
    });
    const info = await infoRes.json().catch(() => ({}));
    const email = (info.email || '').trim().toLowerCase();
    if (!infoRes.ok || !email) return back(request, 'google_profile');
    // Solo correos verificados por Google (si no, alguien podría entrar a una
    // cuenta ajena con un correo que no es suyo).
    if (info.email_verified !== true && info.email_verified !== 'true') return back(request, 'google_unverified');

    const profile = {
      sub: info.sub,
      email,
      name: (info.name || info.given_name || email.split('@')[0] || 'Usuario').slice(0, 80),
      picture: (info.picture || '').slice(0, 500) || null
    };

    // 3) Crea o recupera el usuario (misma lógica que /auth/google por idToken).
    const db = getDb(env);
    const user = await upsertGoogleUser(db, env, profile, request);
    await recordLogin(db, user, request.headers.get('User-Agent'), clientIp(request), 'Google');

    // 4) Deja la cookie de sesión, borra la de estado y entra a la app.
    const headers = new Headers({ 'Location': new URL('/main', request.url).toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', await issueSession(user, env));
    headers.append('Set-Cookie', 'g_oauth_state=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return back(request, 'google');
  }
}
