'use strict';
/* components/nav.js — Router y chrome: go, renderNav, renderCrumbs, renderTopActions, iconFor. */

  /* ───────────── Router ───────────── */
  // Cada sección tiene su propia URL limpia (enlace directo / compartir).
  // La app sigue siendo una sola página; aquí solo cambiamos la barra de
  // direcciones con history.pushState (sin recargar, sin tocar el servidor).
  const ROUTE_TO_PATH = {
    dashboard: '/main',
    projects: '/project',
    notes: '/note',
    files: '/archive',
    apikeys: '/apikeys',
    trash: '/trash',
    settings: '/settings',
    notifications: '/notifications'
  };
  const PATH_TO_ROUTE = {
    main: 'dashboard', project: 'projects', note: 'notes',
    archive: 'files', apikeys: 'apikeys', trash: 'trash',
    settings: 'settings', notifications: 'notifications'
  };

  // URL que corresponde al estado actual (incluye el id del proyecto/nota abierto).
  function urlForState() {
    let p = ROUTE_TO_PATH[state.route] || '/main';
    if (state.route === 'projects' && state.projectId) p += '/' + encodeURIComponent(state.projectId);
    if (state.route === 'notes' && state.noteId) p += '/' + encodeURIComponent(state.noteId);
    return p;
  }
  // Refleja el estado en la barra de direcciones.
  function syncUrl(replace) {
    try {
      const u = urlForState();
      if (location.pathname + location.search === u) return;
      const st = { route: state.route, projectId: state.projectId, noteId: state.noteId };
      history[replace ? 'replaceState' : 'pushState'](st, '', u);
    } catch (e) { /* history no disponible */ }
  }
  // Lee la URL y ajusta el estado (al entrar directo o al usar atrás/adelante).
  function applyUrl(pathname) {
    const seg = String(pathname || '').replace(/^\/+|\/+$/g, '').split('/');
    state.route = PATH_TO_ROUTE[seg[0]] || 'dashboard';
    state.projectId = null;
    state.noteId = null;
    state.search = '';
    if (state.route === 'projects' && seg[1]) state.projectId = decodeURIComponent(seg[1]);
    if (state.route === 'notes' && seg[1]) state.noteId = decodeURIComponent(seg[1]);
  }
  window.applyUrl = applyUrl;
  window.syncUrl = syncUrl;

  function go(route, params = {}) {
    if (window.closeUploadPage) window.closeUploadPage(true);   // sale de «Subir archivos»
    state.route = route;
    if ('projectId' in params) { state.projectId = params.projectId; state.projectTab = 'docs'; }
    if ('noteId' in params) state.noteId = params.noteId;
    syncUrl(false);
    render();
    // La sección nueva empieza arriba (el panel central o la ventana en móvil).
    try { const b = document.getElementById('board'); if (b) b.scrollTop = 0; window.scrollTo(0, 0); } catch (e) {}
    if (matchMedia('(max-width: 900px)').matches) closeMobile();
  }

  // Atrás/adelante del navegador: vuelve a la sección correspondiente.
  window.addEventListener('popstate', function () {
    if (window.closeUploadPage) window.closeUploadPage(true);
    applyUrl(location.pathname);
    render();
  });

  /* ───────────── Listas plegables del menú (Proyectos, Notas) ─────────────
     Cada sección con sub-lista tiene un botón para mostrarla u ocultarla.
     Por defecto están OCULTAS; la elección se recuerda en este dispositivo. */
  const FOLD_NAMES = { projects: 'proyectos', notes: 'notas' };
  // Estado en memoria (lo que se ve); se guarda en el dispositivo aparte. Así el
  // botón responde aunque el guardado falle y no depende de otras pestañas.
  const navFoldState = Object.assign({}, (readPrefs() || {}).navFold);
  function foldOpen(key) { return navFoldState[key] === true; }   // por defecto: oculta
  function applyNavFold() {
    document.querySelectorAll('#nav .nav-fold[data-fold]').forEach(btn => {
      const key = btn.dataset.fold, open = foldOpen(key);
      const sub = document.getElementById(btn.getAttribute('aria-controls'));
      if (sub) sub.classList.toggle('is-folded', !open);
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      const txt = (open ? 'Ocultar' : 'Mostrar') + ' lista de ' + (FOLD_NAMES[key] || key);
      btn.title = txt; btn.setAttribute('aria-label', txt);
    });
  }
  function toggleNavFold(key) {
    navFoldState[key] = !foldOpen(key);
    const p = readPrefs() || {};
    p.navFold = Object.assign({}, p.navFold, { [key]: navFoldState[key] });
    writePrefs(p);
    applyNavFold();
  }
  // Otra pestaña cambió la elección: se refleja aquí también.
  window.addEventListener('storage', (e) => {
    if (e.key !== PREF_KEY) return;
    let f = {};
    try { f = (JSON.parse(e.newValue || '{}') || {}).navFold || {}; } catch (er) {}
    Object.keys(FOLD_NAMES).forEach(k => { navFoldState[k] = f[k] === true; });
    applyNavFold();
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('#nav .nav-fold[data-fold]');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    toggleNavFold(btn.dataset.fold);
  });

  /* ───────────── Nav / sidebar render ───────────── */
  function renderNav() {
    document.querySelectorAll('#nav a[data-route]').forEach(a => {
      a.classList.toggle('active', a.dataset.route === state.route);
    });
    // Contadores: mientras su lista no llega, una píldora con brillo (no un «0»).
    const count = (id, ready, n) => {
      const c = $(id); if (!c) return;
      c.classList.toggle('is-loading', !ready);
      c.textContent = ready ? n : '0';
      if (ready) c.removeAttribute('aria-hidden'); else c.setAttribute('aria-hidden', 'true');
    };
    count('#count-projects', typeof projectsLoaded === 'undefined' || projectsLoaded, store.projects.length);
    count('#count-notes', typeof notesLoaded === 'undefined' || notesLoaded, store.notes.length);
    count('#count-keys', typeof apiKeysLoaded === 'undefined' || apiKeysLoaded, store.apiKeys.length);
    count('#count-files', typeof filesLoaded === 'undefined' || filesLoaded, (store.files || []).filter(f => !f.project_id).length);
    const ct = $('#count-trash'); if (ct) ct.textContent = (store.trash || []).length;

    const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    const PLUS = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    const delBtn = (onDelete) => el('button', {
      class: 'sub-del', title: t('common.delete'), 'aria-label': t('common.delete'),
      onclick: (e) => { e.stopPropagation(); onDelete(); },
      html: TRASH
    });

    // Sub-lista de Proyectos
    const sub = $('#project-sub-nav');
    sub.innerHTML = '';
    store.projects.slice(0, 6).forEach(p => {
      sub.appendChild(el('a', {
        'data-pid': p.id,
        class: (state.route === 'projects' && state.projectId === p.id) ? 'active' : '',
        onclick: () => go('projects', { projectId: p.id })
      }, [
        el('span', { class: 'proj-dot', style: { '--c': safeColor(p.color) } }),
        el('span', { class: 'label' }, p.name),
        delBtn(() => confirmDeleteProject(p))
      ]));
    });
    if (store.projects.length === 0) {
      sub.appendChild(el('a', { class: 'sub-add', onclick: () => openProjectModal() }, [
        el('span', { html: PLUS }), t('sidebar.newProject')
      ]));
    }

    // Sub-lista de Notas (mismo diseño)
    const nsub = $('#note-sub-nav');
    if (nsub) {
      nsub.innerHTML = '';
      store.notes.slice(0, 6).forEach(n => {
        nsub.appendChild(el('a', {
          'data-nid': n.id,
          class: (state.route === 'notes' && state.noteId === n.id) ? 'active' : '',
          onclick: () => go('notes', { noteId: n.id })
        }, [
          el('span', { class: 'proj-dot', style: { '--c': noteColor(n) } }),
          el('span', { class: 'label' }, n.title || t('common.untitled')),
          delBtn(() => deleteNote(n))
        ]));
      });
      if (store.notes.length === 0) {
        nsub.appendChild(el('a', { class: 'sub-add', onclick: () => createNote() }, [
          el('span', { html: PLUS }), t('sidebar.newNote')
        ]));
      }
    }
    applyNavFold();
  }

  /* ───────────── Breadcrumbs ───────────── */
  function renderCrumbs() {
    const c = $('#crumbs');
    const parts = [];
    if (state.route === 'dashboard') parts.push({ label: t('nav.dashboard'), here: true });
    if (state.route === 'projects') {
      parts.push({ label: t('nav.projects'), onClick: () => go('projects', { projectId: null }) });
      const p = store.projects.find(x => x.id === state.projectId);
      if (p) parts.push({ label: p.name, here: true });
      else parts[parts.length-1].here = true;
    }
    if (state.route === 'project-form') {
      parts.push({ label: t('nav.projects'), onClick: () => go('projects') });
      parts.push({ label: state.editingProject ? t('routes.edit') : t('routes.newProject'), here: true });
    }
    if (state.route === 'notes') {
      parts.push({ label: t('nav.notes'), onClick: () => go('notes', { noteId: null }) });
      const n = store.notes.find(x => x.id === state.noteId);
      if (n) parts.push({ label: n.title || t('common.untitled'), here: true });
      else parts[parts.length-1].here = true;
    }
    if (state.route === 'apikeys') parts.push({ label: t('nav.apiKeys'), here: true });
    if (state.route === 'settings') parts.push({ label: 'Configuración', here: true });
    if (state.route === 'notifications') parts.push({ label: 'Notificaciones', here: true });

    c.innerHTML = '';
    parts.forEach((p, i) => {
      if (i > 0) c.appendChild(el('span', { class: 'sep' }, '/'));
      const span = el('span', {
        class: p.here ? 'here' : '',
        style: p.onClick ? { cursor: 'pointer' } : {},
        onclick: p.onClick || null
      }, p.label);
      c.appendChild(span);
    });
  }

  /* ───────────── Top actions per view ───────────── */
  function renderTopActions() {
    const actions = $('#board-top-actions');
    actions.innerHTML = '';
    // Share stays as a universal action
    const share = el('button', { class: 'icon-btn', title: t('common.share'), onclick: () => toast(t('common.linkCopied')) });
    share.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
    actions.appendChild(share);
    const more = el('button', { class: 'icon-btn', title: t('common.more') });
    more.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';
    actions.appendChild(more);
  }

  /* ───────────── Info panel ───────────── */
  function iconFor(kind) {
    if (kind === 'project') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
    if (kind === 'note') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    if (kind === 'doc') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>';
    if (kind === 'key') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 7.5-7.5 1.65 1.65 1.5-1.5-3.15-3.15-9 9"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
  }
