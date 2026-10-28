'use strict';
// Loaded in the head of private pages only. Never trusts cached browser data.
// La verificación de sesión es silenciosa: la app se ve (con sus esqueletos)
// mientras se comprueba. La pantalla completa solo sale si la sesión venció
// (401) o si el servidor contesta con un fallo real (faltan variables o datos).
(function () {
  const root = document.documentElement;
  const originalFetch = window.fetch.bind(window);
  let redirecting = false, pending = null, verified = false;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function paint(mode, detail) {
    root.dataset.authState = mode;
    if (!document.body) return;
    let panel = document.getElementById('auth-guard');
    if (!panel) { panel = document.createElement('section'); panel.id = 'auth-guard'; document.body.appendChild(panel); }
    // «Comprobando» tras volver con atrás/adelante: oculta lo guardado, sin texto.
    if (mode === 'checking') { panel.innerHTML = ''; panel.removeAttribute('role'); return; }
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    const expired = mode === 'expired';
    panel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
      (expired ? '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/>'
        : '<path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="16.5" r=".6"/>') + '</svg>' +
      (expired ? '<small>401 · ACCESO REQUERIDO</small>' : '') +
      '<h1>' + (expired ? 'Volviendo al inicio de sesión' : 'El servidor no está listo') + '</h1><p>' +
      (expired ? 'Inicia sesión para continuar de forma segura.' : esc(detail || 'El servidor no pudo cargar tus datos. Vuelve a intentarlo en un momento.')) + '</p>' +
      (expired ? '<a href="/login">Ir al login</a>' : '<button type="button">Reintentar</button>');
    if (!expired) panel.querySelector('button').onclick = function () { check(true); };
  }
  function clear() {
    delete root.dataset.authState;
    document.getElementById('auth-guard')?.remove();
  }
  function requireLogin() {
    if (redirecting) return;
    redirecting = true;
    window.currentUser = null;
    paint('expired');
    window.location.replace('/login');
  }
  function privateApi(input) {
    try { const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); return u.origin === location.origin && u.pathname.startsWith('/api/v1/') && !u.pathname.startsWith('/api/v1/public/'); } catch (_) { return false; }
  }
  window.fetch = async function (input, options) {
    const response = await originalFetch(input, options);
    if (response.status === 401 && privateApi(input)) requireLogin();
    return response;
  };
  // Qué le falta al servidor (variables de entorno o base de datos), según /health.
  async function serverProblem(r) {
    let msg = '';
    try { const body = await r.clone().json(); if (body && typeof body.error === 'string') msg = body.error; } catch (_) {}
    try {
      const h = await originalFetch('/api/v1/health', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const d = await h.json();
      const miss = d && Array.isArray(d.missingConfig) ? d.missingConfig.filter(function (x) { return typeof x === 'string'; }) : [];
      if (miss.length) return 'Faltan variables de entorno en el servidor: ' + miss.join(', ') + '.';
      if (d && d.db === false) return 'El servidor no pudo conectarse a la base de datos.';
    } catch (_) {}
    return msg;
  }
  async function check(manual) {
    if (redirecting || pending) return pending;
    pending = (async function () {
      try {
        const r = await window.fetch('/api/v1/account/profile', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-NubiFly-Client': 'web' }, signal: AbortSignal.timeout(15000) });
        if (redirecting || r.status === 401) return;
        if (!r.ok) {
          // Solo un fallo del servidor en la primera carga (o al reintentar)
          // muestra el aviso; en las revisiones de fondo no se tapa la app.
          if (!verified || manual) paint('error', await serverProblem(r));
          return;
        }
        const data = await r.json();
        if (!data || !data.user) { if (!verified || manual) paint('error'); return; }
        if (!data.user.is_guest && data.user.onboarded_at === null && !location.pathname.startsWith('/bienvenida')) { location.replace('/bienvenida'); return; }
        verified = true;
        clear();
      } catch (_) {
        // Sin conexión o tiempo agotado: no es un problema de configuración.
        // La app ya avisa con su propio banner; aquí no se tapa nada.
        // Tras atrás/adelante la página guardada sigue oculta hasta confirmar.
        if (root.dataset.authState === 'checking') paint('error', 'No pudimos comprobar tu sesión. Revisa tu conexión y vuelve a intentarlo.');
      } finally { pending = null; }
    })();
    return pending;
  }
  window.NubiAuth = { requireLogin, check };
  document.addEventListener('DOMContentLoaded', function () { check(); });
  // Página restaurada con atrás/adelante: puede traer datos de otra sesión,
  // así que se oculta en silencio hasta confirmar.
  window.addEventListener('pageshow', function (event) { if (event.persisted) { verified = false; paint('checking'); check(); } });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', function () { check(); });
  setInterval(function () { if (document.visibilityState === 'visible') check(); }, 60000);
})();
