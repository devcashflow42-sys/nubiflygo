/* ==========================================================================
   _middleware.js — Rutas de NubiFlyGo en Cloudflare Pages
   Mismas rutas que el servidor Express, pero servidas por Cloudflare:
       /        → public/main.html   (landing)
       /login   → public/login.html  (acceso)
       /main    → public/home.html   (la app)
   · /*.html  redirige (301) a su ruta limpia.
   · /api y /auth: antes de llegar a su función pasan por las capas de
     seguridad (_shared/security.js): sin datos en la barra de direcciones,
     solo la app o una API key, límite de cuerpo y cabeceras de seguridad.
   · css, js e imágenes se sirven tal cual (con cabeceras de seguridad).
   No usa localStorage/sessionStorage ni guarda tokens en el navegador.
   ========================================================================== */

import { apiGate, withSecurityHeaders, hasApiKey, fromApp, secLog } from './_shared/security.js';
import { migrateLegacySession } from './_shared/http.js';
import { getDb } from './_shared/db.js';
import { appGateFor } from './_shared/appcontrol.js';

// App Android suspendida, en mantenimiento o con una versión menor a la mínima:
// se bloquea aquí, en el servidor (no solo en la app).
async function androidGate(request, env, path) {
  const hit = await appGateFor(getDb(env), path, (k) => request.headers.get(k));
  if (!hit) return null;
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (hit.status === 503) h['Retry-After'] = '300';
  return new Response(JSON.stringify(Object.assign({ success: false }, hit.body)), { status: hit.status, headers: h });
}

const PAGES = { '/': 'main.html', '/login': 'login.html', '/main': 'home.html' };
const CLEAN = { '/main.html': '/', '/index.html': '/', '/login.html': '/login', '/home.html': '/main' };

// Secciones de la app (SPA): todas sirven home.html para que la entrada directa
// y la recarga abran la sección correcta. El front (nav.js) ajusta la vista
// según la URL. Admite también el detalle /project/<id> y /note/<id>.
const APP_SECTIONS = new Set(['main', 'project', 'note', 'archive', 'report', 'apikeys', 'automation', 'settings', 'notifications']);

// Toda respuesta pasa por la transición de la cookie de sesión (ver http.js).
export async function onRequest(ctx) {
  return migrateLegacySession(ctx.request, ctx.env, await route(ctx));
}

async function route({ request, env, next }) {
  const url = new URL(request.url);
  const path = url.pathname;

  // API: capas de seguridad y después su función.
  if (path === '/api' || path.startsWith('/api/')) {
    const blocked = apiGate(request, env) || await androidGate(request, env, path);
    if (blocked) return withSecurityHeaders(blocked, 'api');
    return withSecurityHeaders(await next(), 'api', hasApiKey(request));
  }
  // OAuth: el inicio de sesión con idToken (POST) solo desde la propia app.
  if (path.startsWith('/auth/')) {
    if (request.method === 'POST' && !fromApp(request, url)) {
      secLog('blocked', request, { status: 403, reason: 'cross_site' });
      return withSecurityHeaders(json({ error: 'Solicitud no permitida.' }, 403), 'api');
    }
    const appBlocked = await androidGate(request, env, path);
    if (appBlocked) return withSecurityHeaders(appBlocked, 'api');
    return withSecurityHeaders(await next(), 'api');
  }

  // Ocultar .html → ruta limpia
  if (CLEAN[path]) return Response.redirect(url.origin + CLEAN[path] + url.search, 301);

  // Enlace compartido: /s/<token> → página pública del archivo.
  if (/^\/s\/[A-Za-z0-9]{22}\/?$/.test(path)) return withSecurityHeaders(await serveAsset(env, url, '/share.html'), 'page');

  // Páginas con ruta limpia
  const file = PAGES[path];
  if (file) return withSecurityHeaders(await serveAsset(env, url, '/' + file), 'page');

  // Secciones de la app (incluye detalle /seccion/<id>) → sirve home.html.
  const first = path.split('/')[1] || '';
  if (APP_SECTIONS.has(first)) return withSecurityHeaders(await serveAsset(env, url, '/home.html'), 'page');

  // Recursos estáticos (css/js/imágenes).
  const res = await next();

  // Ruta desconocida sin extensión (enlace viejo o typo) → a la portada.
  // Los archivos con extensión que no existan sí devuelven su 404 normal.
  if (res.status === 404 && !/\.[a-z0-9]+$/i.test(path)) {
    return Response.redirect(url.origin + '/', 302);
  }
  return withSecurityHeaders(res, /\.html?$/i.test(path) ? 'page' : 'asset');
}

// Sirve un archivo de /public siguiendo la redirección interna de Pages.
async function serveAsset(env, url, assetPath) {
  let res = await env.ASSETS.fetch(new Request(url.origin + assetPath));
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('Location');
    if (loc) res = await env.ASSETS.fetch(new Request(new URL(loc, url.origin)));
  }
  // Nueva respuesta para poder ajustar cabeceras de caché de la página.
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
