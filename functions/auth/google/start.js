/* ==========================================================================
   /auth/google/start — Inicia el login con Google por REDIRECCIÓN (OAuth 2.0).
   Es el respaldo del botón: al hacer clic, el navegador va a la pantalla de
   Google, elige cuenta y vuelve a /auth/google/callback. Este camino NO se
   "cancela" solo como One Tap; siempre lleva a la pantalla de Google.
   El client_id viaja en la URL (no es secreto); el client_secret vive SOLO en
   las variables de entorno del servidor y se usa en el callback.
   Variables:
     GOOGLE_CLIENT_ID       (obligatoria)
     GOOGLE_REDIRECT_URI    (opcional; por defecto, el dominio real + /auth/google/callback)
   ========================================================================== */

import { resolveRedirectUri } from '../../_shared/google.js';

export async function onRequest({ request, env }) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.redirect(new URL('/login?error=google_config', request.url).toString(), 302);
  }
  const redirectUri = resolveRedirectUri(request, env);

  // Estado anti-CSRF: valor aleatorio que se guarda en cookie y se verifica
  // en el callback (así nadie puede "colar" un callback que no iniciamos).
  const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'select_account');

  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      // Cookie de estado (10 min). Path=/auth para que llegue al callback.
      // Secure + HttpOnly + SameSite=Lax (se envía en la vuelta de Google,
      // que es una navegación GET de nivel superior).
      'Set-Cookie': `g_oauth_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store'
    }
  });
}
