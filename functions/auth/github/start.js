/* ==========================================================================
   /auth/github/start — Inicia el login con GitHub por REDIRECCIÓN (OAuth 2.0).
   Al hacer clic, el navegador va a la pantalla de autorización de GitHub y
   vuelve a /auth/github/callback. El client_id viaja en la URL (no es secreto);
   el client_secret vive SOLO en las variables de entorno y se usa en el callback.
   Variables:
     GITHUB_CLIENT_ID       (obligatoria)
     GITHUB_REDIRECT_URI    (opcional; por defecto, el dominio real + /auth/github/callback)
   ========================================================================== */

export function resolveGithubRedirectUri(request, env) {
  if (env.GITHUB_REDIRECT_URI) return env.GITHUB_REDIRECT_URI;
  return new URL(request.url).origin + '/auth/github/callback';
}

export async function onRequest({ request, env }) {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return Response.redirect(new URL('/login?error=github_config', request.url).toString(), 302);
  }

  // Estado anti-CSRF: se guarda en cookie y se verifica en el callback.
  const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', resolveGithubRedirectUri(request, env));
  // read:user → nombre y foto · user:email → correos (también los privados).
  authUrl.searchParams.set('scope', 'read:user user:email');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('allow_signup', 'true');

  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': `gh_oauth_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store'
    }
  });
}
