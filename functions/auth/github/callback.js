/* ==========================================================================
   /auth/github/callback — Fin del login con GitHub por REDIRECCIÓN (OAuth 2.0).
   GitHub vuelve aquí con un "code". Se verifica el estado anti-CSRF, se cambia
   el code por un token, se obtienen el perfil y el correo principal verificado,
   se crea/inicia sesión del usuario y se deja la cookie de sesión. Luego va a /main.
   Variables:
     GITHUB_CLIENT_ID      (obligatoria)
     GITHUB_CLIENT_SECRET  (obligatoria)  ← SECRETO, solo en el servidor
     GITHUB_REDIRECT_URI   (opcional; debe COINCIDIR con el usado en /start)
   ========================================================================== */

import { getDb } from '../../_shared/db.js';
import { issueSession, parseCookies } from '../../_shared/http.js';
import { clientIp } from '../../_shared/security.js';
import { recordLogin } from '../../_shared/notify.js';
import { upsertGoogleUser } from '../../_shared/google.js';
import { resolveGithubRedirectUri } from './start.js';

// La API de GitHub exige User-Agent en cada petición.
const GH_HEADERS = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'NubiFlyGo', 'X-GitHub-Api-Version': '2022-11-28' };

function back(request, error) {
  return Response.redirect(new URL('/login?error=' + error, request.url).toString(), 302);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error') || !code) return back(request, 'github');

  const cookieState = parseCookies(request)['gh_oauth_state'];
  if (!state || !cookieState || state !== cookieState) return back(request, 'github_state');

  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back(request, 'github_config');

  try {
    // 1) Intercambia el código por un token de acceso.
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'NubiFlyGo' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: resolveGithubRedirectUri(request, env)
      })
    });
    const token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !token.access_token) return back(request, 'github_token');
    const auth = { ...GH_HEADERS, 'Authorization': 'Bearer ' + token.access_token };

    // 2) Perfil (nombre, usuario, foto) y correos.
    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: auth }),
      fetch('https://api.github.com/user/emails', { headers: auth })
    ]);
    const info = await userRes.json().catch(() => ({}));
    const emails = await emailsRes.json().catch(() => []);
    if (!userRes.ok || !info.id) return back(request, 'github_profile');

    // Solo correos verificados por GitHub: primero el principal, si no, otro
    // verificado. Así nadie entra a una cuenta ajena con un correo que no es suyo.
    const list = Array.isArray(emails) ? emails.filter(e => e && e.verified && e.email) : [];
    const chosen = list.find(e => e.primary) || list.find(e => !String(e.email).endsWith('@users.noreply.github.com')) || null;
    const email = chosen ? String(chosen.email).trim().toLowerCase() : '';
    if (!email) return back(request, 'github_email');

    const profile = {
      sub: 'github:' + info.id,
      email,
      name: (info.name || info.login || email.split('@')[0] || 'Usuario').slice(0, 80),
      picture: (info.avatar_url || '').slice(0, 500) || null,
      source: 'GitHub'
    };

    // 3) Crea o recupera el usuario (misma lógica que Google, por correo).
    const db = getDb(env);
    const user = await upsertGoogleUser(db, env, profile, request);
    await recordLogin(db, user, request.headers.get('User-Agent'), clientIp(request), 'GitHub');

    // 4) Cookie de sesión, borra la de estado y entra a la app.
    const headers = new Headers({ 'Location': new URL('/main', request.url).toString(), 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', await issueSession(user, env));
    headers.append('Set-Cookie', 'gh_oauth_state=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return back(request, 'github');
  }
}
