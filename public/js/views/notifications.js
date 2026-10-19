'use strict';
/* views/notifications.js — Vista Notificaciones: avisos de seguridad (inicio de
   sesión en otro dispositivo), suscripción (pago pendiente), abuso y novedades.
   Todo se guarda en el servidor (/api/v1/notifications): leída / no leída,
   borrar y "marcar todas". El contador del menú y de la campana se actualiza
   solo (tiempo real + revisión periódica). */

  const NOTIF_TYPES = {
    security: { label: 'Seguridad',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
    billing:  { label: 'Suscripción', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
    warning:  { label: 'Advertencia', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
    feature:  { label: 'Novedades',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>' },
    info:     { label: 'Información', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' }
  };
  const NOTIF_FILTERS = [
    { id: 'all', label: 'Todas' }, { id: 'unread', label: 'No leídas' },
    { id: 'security', label: 'Seguridad' }, { id: 'billing', label: 'Suscripción' },
    { id: 'warning', label: 'Advertencias' }, { id: 'feature', label: 'Novedades' }
  ];
  const BELL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

  const notifState = { items: [], unread: 0, loaded: false, loading: false, error: null, filter: 'all', off: false };

  function notifQuery() {
    const f = notifState.filter;
    if (f === 'unread') return '?status=unread';
    if (NOTIF_TYPES[f]) return '?type=' + f;
    return '';
  }

  // Carga la lista (si la vista está abierta) o solo el contador.
  function refreshNotifications() {
    if (notifState.off) return Promise.resolve();
    const full = state.route === 'notifications';
    const req = full ? apiGet('/notifications' + notifQuery()) : apiGet('/notifications/unread');
    if (full && !notifState.loaded) { notifState.loading = true; }
    return req.then(d => {
      notifState.unread = d.unread || 0;
      if (full) { notifState.items = d.items || []; notifState.loaded = true; notifState.error = null; }
    }).catch(err => {
      if (err && err.status === 401) notifState.off = true;   // sin sesión: no insistir
      if (full) notifState.error = err;
    }).then(() => {
      notifState.loading = false;
      updateNotifBadge();
      if (state.route === 'notifications') (window.safeRender || render)();
    });
  }
  window.refreshNotifications = refreshNotifications;

  function updateNotifBadge() {
    const n = notifState.unread, txt = n > 99 ? '99+' : String(n);
    const c = document.getElementById('count-notifs');
    if (c) { c.textContent = txt; c.hidden = n === 0; }
    document.querySelectorAll('.bell-badge').forEach(b => { b.textContent = txt; b.hidden = n === 0; });
  }

  // Campana de la barra superior (visible también en móvil).
  function notifBellButton() {
    const b = el('button', {
      class: 'icon-btn bell-btn' + (state.route === 'notifications' ? ' on' : ''),
      title: 'Notificaciones', 'aria-label': 'Notificaciones',
      onclick: () => { state.projectId = null; state.noteId = null; go('notifications'); }
    });
    b.innerHTML = BELL_SVG;
    const badge = el('span', { class: 'bell-badge' });
    b.appendChild(badge);
    setTimeout(updateNotifBadge, 0);
    return b;
  }

  /* ─── Acciones (se guardan en el servidor) ─── */
  function setNotifRead(n, read) {
    const prev = n.read_at;
    n.read_at = read ? (prev || new Date().toISOString()) : null;
    notifState.unread = Math.max(0, notifState.unread + (read ? (prev ? 0 : -1) : (prev ? 1 : 0)));
    if (notifState.filter === 'unread' && read) notifState.items = notifState.items.filter(x => x.id !== n.id);
    updateNotifBadge(); render();
    return apiPatch('/notifications/' + n.id, { read }).then(d => {
      notifState.unread = d.unread; updateNotifBadge();
    }).catch(err => { n.read_at = prev; toast(err.message); refreshNotifications(); });
  }
  function deleteNotif(n) {
    notifState.items = notifState.items.filter(x => x.id !== n.id);
    if (!n.read_at) notifState.unread = Math.max(0, notifState.unread - 1);
    updateNotifBadge(); render();
    apiDelete('/notifications/' + n.id).then(d => { notifState.unread = d.unread; updateNotifBadge(); toast('Notificación eliminada'); })
      .catch(err => { toast(err.message); refreshNotifications(); });
  }
  function markAllNotifsRead() {
    apiPost('/notifications/read-all').then(d => {
      toast(d.updated ? 'Todas marcadas como leídas' : 'No había notificaciones sin leer');
      return refreshNotifications();
    }).catch(err => toast(err.message));
  }
  function clearReadNotifs() {
    confirmDialog('Borrar notificaciones leídas', 'Se eliminarán todas las notificaciones que ya leíste. Esta acción no se puede deshacer.', 'Borrar').then(ok => {
      if (!ok) return;
      apiDelete('/notifications?status=read').then(d => {
        toast(d.deleted ? (d.deleted === 1 ? '1 notificación eliminada' : d.deleted + ' notificaciones eliminadas') : 'No había notificaciones leídas');
        return refreshNotifications();
      }).catch(err => toast(err.message));
    });
  }
  function openNotif(n) {
    const goLink = () => {
      if (!n.link) return;
      if (/^https:\/\//i.test(n.link)) { window.open(n.link, '_blank', 'noopener'); return; }
      applyUrl(n.link); syncUrl(false); render();
    };
    if (!n.read_at) setNotifRead(n, true).then(goLink); else goLink();
  }

  /* ─── Vista ─── */
  function viewNotifications() {
    const v = $('#view');
    v.innerHTML = '';
    if (!notifState.loaded && !notifState.loading) refreshNotifications();

    v.appendChild(pageToolbar({ back: () => go('dashboard'), title: 'Notificaciones' }));
    v.appendChild(el('div', { class: 'board-head notif-head' }, [
      el('div', {}, [
        el('h2', {}, 'Notificaciones'),
        el('p', { class: 'subtitle' }, notifState.unread
          ? (notifState.unread === 1 ? 'Tienes 1 notificación sin leer.' : 'Tienes ' + notifState.unread + ' notificaciones sin leer.')
          : 'Avisos de seguridad, de tu suscripción y novedades de NubiFlyGo.')
      ]),
      el('div', { class: 'notif-head-actions' }, [
        el('button', { class: 'btn btn-ghost', disabled: notifState.unread ? null : 'disabled', onclick: markAllNotifsRead, html:
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Marcar todas como leídas' }),
        el('button', { class: 'btn btn-danger', onclick: clearReadNotifs, title: 'Borrar las notificaciones leídas', html:
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg> Borrar leídas' })
      ])
    ]));

    const body = el('div', { class: 'board-body' });
    body.appendChild(el('div', { class: 'chips notif-filters', role: 'tablist' }, NOTIF_FILTERS.map(f =>
      el('button', {
        class: 'chip' + (notifState.filter === f.id ? ' on' : ''), role: 'tab',
        'aria-selected': notifState.filter === f.id ? 'true' : 'false',
        onclick: () => { if (notifState.filter === f.id) return; notifState.filter = f.id; notifState.loaded = false; notifState.items = []; render(); }
      }, [ f.label, f.id === 'unread' && notifState.unread ? el('span', { class: 'chip-count' }, String(notifState.unread)) : null ].filter(Boolean))
    )));

    if (!notifState.loaded) {
      body.appendChild(el('div', { class: 'notif-list' }, [0, 1, 2].map(() => el('div', { class: 'notif-item notif-skel' }, [
        el('span', { class: 'notif-ico' }), el('div', { class: 'notif-main' }, [ el('span', { class: 'sk-line w60' }), el('span', { class: 'sk-line w90' }) ])
      ]))));
    } else if (notifState.error && !notifState.items.length) {
      body.appendChild(notifEmpty('No se pudieron cargar las notificaciones', notifState.error.message || 'Inténtalo de nuevo en un momento.'));
    } else if (!notifState.items.length) {
      body.appendChild(notifState.filter === 'all'
        ? notifEmpty('No tienes notificaciones', 'Aquí aparecerán los avisos de seguridad, de tu suscripción y las novedades de NubiFlyGo.')
        : notifState.filter === 'unread'
          ? notifEmpty('¡Estás al día!', 'No tienes notificaciones sin leer.')
          : notifEmpty('Nada por aquí', 'No hay notificaciones de este tipo.'));
    } else {
      const list = el('div', { class: 'notif-list' });
      notifState.items.forEach(n => list.appendChild(notifRow(n)));
      body.appendChild(list);
    }
    v.appendChild(body);
  }

  function notifRow(n) {
    const meta = NOTIF_TYPES[n.type] || NOTIF_TYPES.info;
    const unread = !n.read_at;
    const ts = Date.parse(n.created_at) || Date.now();
    // Solo "marcar como leída" y solo cuando está sin leer (una palomita clara).
    // Al leerla ya no reaparece el botón, así no se vuelve a marcar sin querer.
    const readBtn = unread ? el('button', {
      class: 'icon-btn', title: 'Marcar como leída', 'aria-label': 'Marcar como leída',
      onclick: (e) => { e.stopPropagation(); setNotifRead(n, true); },
      html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    }) : null;
    const delBtn = el('button', {
      class: 'icon-btn', title: 'Eliminar', 'aria-label': 'Eliminar notificación',
      onclick: (e) => { e.stopPropagation(); deleteNotif(n); },
      html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
    });
    return el('div', {
      class: 'notif-item' + (unread ? ' unread' : ''), role: 'button', tabindex: '0',
      'data-type': NOTIF_TYPES[n.type] ? n.type : 'info',
      onclick: () => openNotif(n),
      onkeydown: (e) => { if (e.key === 'Enter') openNotif(n); }
    }, [
      el('span', { class: 'notif-ico', html: meta.icon }),
      el('div', { class: 'notif-main' }, [
        el('div', { class: 'notif-top' }, [
          el('span', { class: 'notif-title' }, n.title),
          el('span', { class: 'notif-time', title: new Date(ts).toLocaleString('es-MX') }, timeAgo(ts))
        ]),
        n.body ? el('p', { class: 'notif-body' }, n.body) : null,
        el('div', { class: 'notif-meta' }, [
          el('span', { class: 'notif-tag' }, meta.label),
          n.link ? el('span', { class: 'notif-link' }, 'Ver detalles →') : null
        ].filter(Boolean))
      ].filter(Boolean)),
      el('div', { class: 'notif-actions' }, [ readBtn, delBtn ].filter(Boolean)),
      unread ? el('span', { class: 'notif-dot', 'aria-label': 'No leída' }) : null
    ].filter(Boolean));
  }

  function notifEmpty(title, text) {
    return el('div', { class: 'notif-empty' }, [
      el('div', { class: 'notif-empty-ico', html: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' }),
      el('h3', {}, title),
      el('p', {}, text)
    ]);
  }

  // Contador al arrancar y revisión periódica (respaldo del tiempo real).
  setTimeout(refreshNotifications, 400);
  setInterval(() => { if (!document.hidden) refreshNotifications(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshNotifications(); });
