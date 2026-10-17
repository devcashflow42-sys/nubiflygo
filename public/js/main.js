'use strict';
/* main.js — Entrada: searchInput, render, drawer/tema, handlers globales y arranque. */

  /* ───────────── Search ───────────── */
  function searchInput(placeholder) {
    const wrap = el('div', { class: 'search' }, [
      el('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' }),
      el('input', { type: 'search', placeholder, value: state.search })
    ]);
    const inp = wrap.querySelector('input');
    inp.addEventListener('input', () => { state.search = inp.value; render(true); });
    return wrap;
  }

  /* ───────────── Main render ───────────── */
  function render(fromSearch) {
    renderNav();
    renderCrumbs();
    renderTopActions();
    renderInfo();
    // La Configuración ocupa todo el ancho (sin panel de info a la derecha).
    app.setAttribute('data-info', state.route === 'settings' ? 'hidden' : 'shown');
    // Hide default board-top for views that bring their own toolbar
    const bt = document.querySelector('.board-top');
    const minimal = (state.route === 'projects' && state.projectId) || state.route === 'project-form';
    bt.classList.toggle('minimal', !!minimal);
    const views = {
      dashboard: viewDashboard,
      projects: viewProjects,
      'project-form': viewProjectForm,
      notes: viewNotes,
      files: viewFiles,
      reports: viewReports,
      apikeys: viewApiKeys,
      automation: viewAutomation,
      settings: viewSettings,
      notifications: viewNotifications
    };
    (views[state.route] || viewDashboard)();
    // When a search re-render fires we want the input to stay focused
    if (fromSearch) {
      const s = document.querySelector('.search input');
      if (s) { s.focus(); const l = s.value.length; try { s.setSelectionRange(l, l); } catch {} }
    }
  }

  /* ───────────── Nav bindings ───────────── */
  document.querySelectorAll('#nav a[data-route]').forEach(a => {
    a.addEventListener('click', () => { state.projectId = null; state.noteId = null; state.search = ''; go(a.dataset.route); });
  });

  /* ───────────── Drawer / theme ───────────── */
  const app = $('#app');
  function toggleDrawer() {
    const next = app.getAttribute('data-drawer') === 'collapsed' ? 'open' : 'collapsed';
    app.setAttribute('data-drawer', next);
    const p = readPrefs(); p.drawer = next; writePrefs(p);
  }
  // Al abrir el menú (drawer) en móvil, bloqueamos el scroll del fondo para
  // que el contenido de atrás no se mueva. Al cerrarlo, se restaura.
  function openMobile() {
    app.setAttribute('data-mobile-open', 'true');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  function closeMobile() {
    app.setAttribute('data-mobile-open', 'false');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme');
    let next;
    if (current === 'dark') next = 'light';
    else if (current === 'light') next = 'dark';
    else next = matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    const p = readPrefs(); p.theme = next; writePrefs(p);
  }
  window.toggleDrawer = toggleDrawer;
  window.openMobile = openMobile;
  window.closeMobile = closeMobile;
  window.toggleTheme = toggleTheme;

  /* ───────────── Boot ───────────── */
  (function init() {
    const p = readPrefs();
    if (p.drawer === 'collapsed') app.setAttribute('data-drawer', 'collapsed');
    // Tema fijo (nunca automático): usa el guardado, o Claro por defecto. Así
    // la app no sigue el modo del sistema por su cuenta.
    document.documentElement.setAttribute('data-theme', p.theme === 'dark' ? 'dark' : 'light');
    applyStaticStrings();
    // Entrada directa / recarga: abre la sección indicada en la URL
    // (/main, /project, /note, /archive, /report, /apikeys, /automation).
    try { if (typeof applyUrl === 'function') applyUrl(location.pathname); } catch (e) {}
    try { if (typeof syncUrl === 'function') syncUrl(true); } catch (e) {}
    render();
  })();
