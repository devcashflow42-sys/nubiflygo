'use strict';
// Loaded in the head of private pages only. Never trusts cached browser data.
(function () {
  const root = document.documentElement;
  const originalFetch = window.fetch.bind(window);
  let redirecting = false, pending = null;
  root.dataset.authState = 'checking';
  function paint(mode) {
    root.dataset.authState = mode;
    if (!document.body) return;
    let panel = document.getElementById('auth-guard');
    if (!panel) { panel = document.createElement('section'); panel.id = 'auth-guard'; document.body.appendChild(panel); }
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    const expired = mode === 'expired', failed = mode === 'error';
    panel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/></svg>' +
      (expired ? '<small>401 · ACCESO REQUERIDO</small>' : '') +
      '<h1>' + (expired ? 'Volviendo al inicio de sesión' : failed ? 'No pudimos verificar tu acceso' : 'Verificando tu sesión') + '</h1><p>' +
      (expired ? 'Inicia sesión para continuar de forma segura.' : failed ? 'Comprueba tu conexión y vuelve a intentarlo.' : 'Un momento, estamos comprobando tu acceso.') + '</p>' +
      (failed ? '<button type="button">Reintentar</button>' : expired ? '<a href="/login">Ir al login</a>' : '');
    if (failed) panel.querySelector('button').onclick = check;
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
  async function check() {
    if (redirecting || pending) return pending;
    paint('checking');
    pending = (async function () {
      try {
        const r = await window.fetch('/api/v1/account/profile', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-NubiFly-Client': 'web' }, signal: AbortSignal.timeout(15000) });
        if (redirecting) return;
        if (!r.ok) throw new Error('profile');
        const data = await r.json();
        if (!data || !data.user) throw new Error('profile');
        if (!data.user.is_guest && data.user.onboarded_at === null && !location.pathname.startsWith('/bienvenida')) { location.replace('/bienvenida'); return; }
        delete root.dataset.authState;
        document.getElementById('auth-guard')?.remove();
      } catch (_) { if (!redirecting) paint('error'); }
      finally { pending = null; }
    })();
    return pending;
  }
  window.NubiAuth = { requireLogin, check };
  document.addEventListener('DOMContentLoaded', function () { paint(root.dataset.authState || 'checking'); check(); });
  window.addEventListener('pagehide', function () { if (!redirecting) paint('checking'); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) check(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
  setInterval(function () { if (document.visibilityState === 'visible') check(); }, 60000);
})();
