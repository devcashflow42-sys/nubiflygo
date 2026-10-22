'use strict';
/* session.js — Carga el usuario de la sesión y lo muestra en la barra lateral.
   Si no hay sesión válida, lleva a /login. El token va en cookie httpOnly;
   aquí no se guarda ningún token. */
(function () {
  function initials(name, email) {
    const base = String(name || email || 'U').trim();
    const parts = base.split(/\s+/).filter(Boolean);
    const ini = parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
    return ini.toUpperCase();
  }

  // Pinta el avatar: la foto de perfil (p. ej. de Google) o las iniciales.
  // referrerpolicy=no-referrer es necesario para que Google sirva la imagen.
  function paintAvatar(elm, u, ini) {
    if (!elm) return;
    elm.textContent = '';
    // Solo la foto guardada en el servidor (subida en Configuración o la de
    // Google). Nada local: en un equipo compartido otra cuenta la vería.
    const url = (u && u.avatar_url) || '';
    if (url) {
      const img = document.createElement('img');
      // IMPORTANTE: fijar referrerPolicy, estilos y manejadores ANTES de src,
      // porque la carga empieza al asignar src. Sin no-referrer antes, Google
      // (lh3.googleusercontent.com) puede rechazar la imagen.
      img.referrerPolicy = 'no-referrer';
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.decoding = 'async';
      img.alt = (u && u.name) || 'Perfil';
      img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block';
      img.onerror = function () { elm.textContent = ini; };  // si no carga → iniciales
      img.src = url;
      elm.appendChild(img);
    } else {
      elm.textContent = ini;
    }
  }
  window.paintAvatar = paintAvatar;

  // Aviso dentro de la interfaz (no borra el diseño). Estilos en línea para que
  // se vea aunque el CSS externo no haya cargado.
  function showServerBanner(message, opts) {
    opts = opts || {};
    try {
      const existing = document.getElementById('server-banner');
      if (existing) {
        const m = existing.querySelector('.sb-msg');
        if (m) m.textContent = message;
        return;
      }
      const bar = document.createElement('div');
      bar.id = 'server-banner';
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2000;display:flex;align-items:center;gap:10px;' +
        'padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top,0px));' +
        'background:#15171A;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif;' +
        'font-size:13.5px;font-weight:500;box-shadow:0 2px 12px rgba(0,0,0,.28)';
      const icon = document.createElement('span');
      icon.style.cssText = 'display:inline-flex;flex-shrink:0;color:#ffd166';
      icon.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      const msg = document.createElement('span');
      msg.className = 'sb-msg';
      msg.textContent = message;
      msg.style.cssText = 'flex:1;min-width:0;line-height:1.35';
      bar.appendChild(icon); bar.appendChild(msg);
      if (opts.login !== false) {
        const btn = document.createElement('button');
        btn.textContent = 'Iniciar sesión';
        btn.style.cssText = 'flex-shrink:0;background:#fff;color:#15171A;border:0;border-radius:8px;padding:7px 12px;font:600 13px inherit;cursor:pointer';
        btn.onclick = function () { window.location.href = '/login'; };
        bar.appendChild(btn);
      }
      const x = document.createElement('button');
      x.setAttribute('aria-label', 'Cerrar');
      x.innerHTML = '&times;';
      x.style.cssText = 'flex-shrink:0;background:transparent;color:#fff;border:0;font-size:20px;line-height:1;cursor:pointer;padding:0 2px;opacity:.85';
      x.onclick = function () { bar.remove(); };
      bar.appendChild(x);
      document.body.appendChild(bar);
    } catch (e) {}
  }
  window.showServerBanner = showServerBanner;

  // Marca la cuenta como "Invitado" en la barra lateral cuando no hay sesión,
  // para no mostrar datos de demostración.
  function showGuestPlaceholder() {
    try {
      const row = document.querySelector('.sidebar-foot .user-row'); if (row) row.classList.remove('is-loading');
      const nameEl = document.querySelector('.sidebar-foot .user-name');
      const mailEl = document.querySelector('.sidebar-foot .user-mail');
      if (nameEl) { nameEl.removeAttribute('data-i18n'); nameEl.textContent = 'Invitado'; }
      if (mailEl) { mailEl.removeAttribute('data-i18n'); mailEl.textContent = 'Sin iniciar sesión'; }
    } catch (e) {}
  }

  // Carga el usuario de la sesión. Devuelve una promesa compartida para que
  // otras vistas (p. ej. Configuración) puedan esperarla sin repetir la
  // petición. Rechaza con err.status = 401 si no hay sesión.
  let _userPromise = null;
  window.loadCurrentUser = function (force) {
    if (_userPromise && !force) return _userPromise;
    window.currentUserError = null;
    _userPromise = fetch('/api/v1/account/profile', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-NubiFly-Client': 'web' } })
      .then(function (r) {
        if (!r.ok) { const err = new Error('profile-' + r.status); err.status = r.status; throw err; }
        return r.json();
      })
      .then(function (data) {
        const u = data && data.user;
        if (!u) throw new Error('Respuesta sin usuario.');
        window.currentUser = u;
        // Cuenta nueva a la que le falta la bienvenida: se la pedimos antes de
        // entrar. Los invitados no la ven (su cuenta se borra al caducar).
        // La pantalla hace la comprobación contraria, así que no hay bucle.
        if (!u.is_guest && u.onboarded_at === null) { location.replace('/bienvenida'); }
        return u;
      });
    // Si falla, se recuerda el error (las vistas muestran el aviso en vez de
    // reintentar en bucle) y se permite reintentar más tarde.
    _userPromise.catch(function (err) { window.currentUserError = err || new Error('error'); _userPromise = null; });
    return _userPromise;
  };

  // Pinta nombre, correo y foto del usuario en la barra lateral.
  window.refreshUserChrome = function (u) {
    if (!u) return;
    const row = document.querySelector('.sidebar-foot .user-row'); if (row) row.classList.remove('is-loading');
    try { window.paintPlanCard(u); } catch (e) {}
    const nameEl = document.querySelector('.sidebar-foot .user-name');
    const mailEl = document.querySelector('.sidebar-foot .user-mail');
    const avEl = document.querySelector('.sidebar-foot .avatar');
    // Quitamos data-i18n para que el cambio de idioma no reponga el nombre demo.
    if (nameEl) { nameEl.removeAttribute('data-i18n'); nameEl.textContent = u.name || u.email; }
    if (mailEl) { mailEl.removeAttribute('data-i18n'); mailEl.textContent = u.email || ''; }
    if (avEl) { paintAvatar(avEl, u, initials(u.name, u.email)); }
  };

  // Tarjeta «Plan actual» de la barra lateral, según el plan real de la cuenta.
  const ICN_SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M19 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity=".75"/></svg>';
  const ICN_BOLT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
  function goBilling() {
    try { if (typeof state !== 'undefined') state.settingsTab = 'billing'; if (typeof go === 'function') go('settings'); } catch (e) {}
  }
  /* ─── Tarjeta de almacenamiento del menú lateral (reemplaza «Plan actual») ───
     · Escritorio: «3.0 MB usados de 2 GB», barra por tipo de archivo
       (imágenes, videos, música, documentos, otros) con su leyenda.
     · Teléfono/tablet (cajón): barra de rayitas que se llenan según el
       espacio usado; si pasa del 80 % avisa «casi lleno».
     · Plan y botón: Mejorar plan · Gestionar suscripción · Crear cuenta. */
  const GB = 1024 * 1024 * 1024;
  const PLAN_QUOTA = { free: 2 * GB, gratis: 2 * GB, pro: 100 * GB, mega: 1024 * GB, super: 5 * 1024 * GB };
  const STG_TYPES = [
    { id: 'image', label: 'Imágenes', color: '#2f7de1' },
    { id: 'video', label: 'Videos', color: '#5bb8e8' },
    { id: 'audio', label: 'Música', color: '#35b98f' },
    { id: 'doc', label: 'Documentos', color: '#f2b92c' },
    { id: 'other', label: 'Otros', color: '#8b5cf6' },
    // Lo borrado sigue ocupando plan hasta que se va de la papelera; se pinta
    // aparte para que el total de la tarjeta sea el mismo que bloquea las
    // subidas.
    { id: 'trash', label: 'Papelera', color: '#6b6a63' }
  ];
  const ICN_CLOUD_S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19H8a5.5 5.5 0 1 1 1.06-10.9A6.5 6.5 0 0 1 21 11.5 3.75 3.75 0 0 1 17.5 19z"/></svg>';
  function fmtQuota(b) { return b >= 1024 * GB ? (b / (1024 * GB)) + ' TB' : (b / GB) + ' GB'; }
  // Uso por tipo con los archivos que ya conoce la página (los de proyectos incluidos).
  function storageUsage() {
    const by = { image: 0, video: 0, audio: 0, doc: 0, other: 0, trash: 0 };
    let total = 0;
    (typeof store !== 'undefined' && Array.isArray(store.files) ? store.files : []).forEach(f => {
      const n = Number(f.size) || 0;
      const k = window.mediaKind ? window.mediaKind(f.mime || f.type, f.title) : 'other';
      by[k === 'pdf' ? 'doc' : k === 'archive' ? 'other' : (by[k] != null ? k : 'other')] += n;
      total += n;
    });
    const enPapelera = Number(typeof store !== 'undefined' ? store.trashBytes : 0) || 0;
    by.trash = enPapelera;
    total += enPapelera;
    return { by, total };
  }
  let lastUser = null;
  window.paintPlanCard = function (u) {
    const slot = document.getElementById('plan-card');
    if (!slot) return;
    if (u === undefined) u = lastUser;
    lastUser = u;
    slot.innerHTML = '';
    if (!u) return;
    let plan, btn, action;
    if (u.is_admin) { plan = 'Sin límites'; btn = 'Ver facturación'; action = goBilling; }
    else if (u.is_guest) { plan = 'Invitado'; btn = 'Crear cuenta gratis'; action = function () { window.location.href = '/login'; }; }
    else if (u.has_paid_plan) { const l = String(u.plan_label || u.plan || 'Pro'); plan = l.charAt(0).toUpperCase() + l.slice(1); btn = 'Gestionar suscripción'; action = goBilling; }
    else { plan = 'Gratis'; btn = 'Mejorar plan'; action = goBilling; }
    const upgrade = !u.is_admin && !u.has_paid_plan;
    const crown = !!u.has_paid_plan && window.ICN_CROWN;
    const row = document.querySelector('.sidebar-foot .user-row');
    if (row) { row.classList.toggle('is-paid', !!u.has_paid_plan); row.title = u.has_paid_plan ? 'Mi cuenta · Plan ' + plan : 'Mi cuenta'; }

    const quota = u.is_admin ? 0 : (PLAN_QUOTA[String(u.plan || 'free').toLowerCase()] || PLAN_QUOTA.free);
    const use = storageUsage();
    const pct = quota ? Math.min(100, use.total / quota * 100) : 0;
    const full = pct >= 80;
    const pctTxt = !quota ? '' : pct > 0 && pct < 1 ? 'menos del 1 %' : Math.round(pct) + ' %';
    const ofTxt = quota ? 'usados de ' + fmtQuota(quota) : 'usados · sin límite';
    // En la tarjeta el espacio es poco: sin «usados» no se corta con cifras largas.
    const shortOf = quota ? 'de ' + fmtQuota(quota) : 'sin límite';
    const mkBtn = () => el('button', { type: 'button', class: 'plan-btn', onclick: action }, [ upgrade ? el('span', { class: 'plan-bolt', html: ICN_BOLT }) : null, btn ].filter(Boolean));

    // Barra (escritorio): la parte llena es el % usado del plan y, dentro,
    // cada tramo es un tipo de archivo, con su proporción. Con muy poco uso
    // queda una franja de 8 px para que se vea (sin exagerar el %) y se pinta
    // de un solo color, el del tipo que más ocupa: varios tramos en tan poco
    // espacio se verían como una rayita rota (la leyenda sigue detallando).
    // Sin límite (admin) no hay barra: solo la leyenda.
    const fill = el('div', { class: 'stg-fill' });
    const legend = el('ul', { class: 'stg-legend' });
    // La barra mide unos 184 px en el menú: con eso se calcula cuántos píxeles
    // le tocarían a cada tipo. Los que no llegan a 1.5 px no se pintan (se
    // verían como una raya de nada y dejaban la punta chata); su tamaño sigue
    // en la leyenda.
    const fillPx = Math.max(184 * pct / 100, 8);
    const used = STG_TYPES.filter(tp => use.by[tp.id] > 0 && (!use.total || fillPx * use.by[tp.id] / use.total >= 1.5))
      .sort((a, b) => use.by[b.id] - use.by[a.id]);   // el que más ocupa, primero
    used.forEach(tp => {
      const n = use.by[tp.id];
      fill.appendChild(el('span', { class: 'stg-seg', style: { flexGrow: String(n), background: tp.color }, title: tp.label + ': ' + formatBytes(n) }));
    });
    STG_TYPES.forEach(tp => {
      const n = use.by[tp.id];
      if (!n) return;
      legend.appendChild(el('li', {}, [ el('i', { style: { background: tp.color } }), el('span', { class: 'stg-l' }, tp.label), el('span', { class: 'stg-n' }, formatBytes(n)) ]));
    });
    // «Estrecha»: no caben ~6 px por tramo dentro de lo usado (la barra mide
    // unos 184 px en el menú).
    if (used.length > 1 && pct < used.length * 3.5) fill.classList.add('is-tiny');
    fill.style.width = 'max(' + pct.toFixed(2) + '%, ' + (used.length ? 8 : 0) + 'px)';
    const bar = quota ? el('div', { class: 'stg-bar', role: 'img', 'aria-label': formatBytes(use.total) + ' ' + ofTxt + (pctTxt ? ' (' + pctTxt + ')' : '') }, [ fill ]) : null;
    const desk = el('div', { class: 'stg-desk' }, [
      el('div', { class: 'stg-amount' }, [ el('strong', {}, formatBytes(use.total)), el('span', {}, ' ' + shortOf) ]),
      bar,
      legend.children.length ? legend : el('p', { class: 'stg-empty' }, 'Aún no has subido archivos.')
    ]);

    // Rayitas (cajón del teléfono): 20 marcas, se llenan según el % usado.
    const TICKS = 20, on = quota ? Math.max(use.total > 0 ? 1 : 0, Math.round(pct / 100 * TICKS)) : 0;
    const ticks = el('div', { class: 'stg-ticks', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': 'Espacio usado' });
    for (let i = 0; i < TICKS; i++) ticks.appendChild(el('i', { class: i < on ? 'on' : '' }));
    const mob = el('div', { class: 'stg-mob' }, [
      el('p', { class: 'stg-sub' }, full && upgrade ? 'Mejora tu plan para tener más espacio.' : formatBytes(use.total) + ' de ' + (quota ? fmtQuota(quota) : 'espacio ilimitado') + (pctTxt ? ' · ' + pctTxt : '')),
      ticks
    ]);

    slot.appendChild(el('section', { class: 'plan-card stg' + (crown ? ' is-paid' : '') + (full ? ' is-full' : ''), 'aria-label': 'Almacenamiento' }, [
      el('div', { class: 'stg-head' }, [
        el('span', { class: 'stg-ico', html: ICN_CLOUD_S }),
        el('span', { class: 'stg-title' }, full ? 'Espacio casi lleno' : 'Almacenamiento'),
        el('span', { class: 'stg-plan' + (crown ? ' is-paid' : '') }, [ crown ? el('span', { class: 'stg-crown', html: crown }) : null, plan ].filter(Boolean))
      ]),
      desk, mob, mkBtn()
    ]));
    // Versión mini (menú colapsado): solo el icono redondo
    slot.appendChild(el('button', { type: 'button', class: 'plan-mini' + (crown ? ' is-paid' : ''), title: 'Almacenamiento: ' + formatBytes(use.total) + ' ' + ofTxt + ' · Plan ' + plan, 'aria-label': 'Almacenamiento y plan', onclick: action, html: crown || ICN_CLOUD_S }));
  };

  // Limpieza: versiones anteriores guardaban la foto solo en este dispositivo.
  try { const p0 = readPrefs(); if (p0 && p0.settings && p0.settings.avatarLocal) { delete p0.settings.avatarLocal; writePrefs(p0); } } catch (e) {}

  window.loadCurrentUser()
    .then(function (u) {
      // Idioma de la cuenta (guardado en el servidor): si difiere del actual,
      // cambia la interfaz a ese idioma (consistencia entre dispositivos).
      let rendered = false;
      try {
        if (u.language && typeof setLanguage === 'function' && typeof getLang === 'function' && getLang() !== u.language) {
          setLanguage(u.language);
          if (typeof render === 'function') { render(); rendered = true; }
        }
      } catch (e) {}
      // Configuración muestra los datos del usuario: si ya estaba abierta
      // (entrada directa a /settings), se redibuja con los datos reales.
      try { if (!rendered && typeof state !== 'undefined' && (state.route === 'settings' || state.route === 'dashboard') && typeof render === 'function') render(); } catch (e) {}
      window.refreshUserChrome(u);
      // Carga todos los datos desde el servidor (base de datos), no de caché,
      // para que el Inicio y los contadores salgan correctos desde el arranque.
      try { if (typeof loadProjects === 'function') loadProjects(); } catch (e) {}
      try { if (typeof loadNotes === 'function') loadNotes(); } catch (e) {}
      try { if (typeof loadFiles === 'function') loadFiles(); } catch (e) {}
      try { if (typeof ensureApiKeys === 'function') ensureApiKeys(); } catch (e) {}
    })
    .catch(function (err) {
      // 401: sin sesión. NO redirigimos ni vaciamos la pantalla: dejamos ver el
      // diseño y mostramos un aviso con botón para iniciar sesión.
      try { const row = document.querySelector('.sidebar-foot .user-row'); if (row) row.classList.remove('is-loading'); } catch (e) {}
      if (err && err.status === 401) { showGuestPlaceholder(); showServerBanner('No has iniciado sesión o tu sesión expiró (error 401).'); }
      else if (err && err.status) { showServerBanner('No se pudo conectar con el servidor (error ' + err.status + '). Mostrando la interfaz.'); }
      // Configuración abierta: que muestre el aviso en vez de quedarse cargando.
      try { if (typeof state !== 'undefined' && (state.route === 'settings' || state.route === 'dashboard') && typeof render === 'function') render(); } catch (e) {}
    });

  // Nombre legible del tema actual (para el menú de perfil).
  function themeLabel() {
    const th = document.documentElement.getAttribute('data-theme');
    if (th === 'dark') return 'Oscuro';
    if (th === 'light') return 'Claro';
    return 'Automático';
  }

  // Menú emergente del perfil (popup flotante anclado al usuario de la barra
  // lateral). Tarjeta de cuenta + tema, ajustes, plan y cerrar sesión.
  let _profileClose = null;
  window.openProfileSheet = function (evt) {
    if (evt && evt.stopPropagation) evt.stopPropagation();
    if (_profileClose) { _profileClose(); return; }  // segundo toque: cerrar
    const u = window.currentUser || {};
    const name = u.name || u.email || 'Usuario';
    const email = u.email || '';
    const isGuest = !!u.is_guest;
    const isAdmin = !!u.is_admin;
    const planLabel = u.plan_label || (u.plan === 'free' ? 'Gratis' : (u.plan || 'Gratis'));
    const anchor = (evt && evt.currentTarget) || document.querySelector('.user-row');

    function guestLeft(iso) {
      const ms = new Date(iso).getTime() - Date.now();
      if (!(ms > 0)) return 'expira pronto';
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
      return 'expira en ' + (h > 0 ? h + ' h' + (m ? ' ' + m + ' m' : '') : m + ' m');
    }

    // SVGs
    const ICN_THEME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
    const ICN_SETTINGS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    const ICN_PLAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20l-2-11-5 4-3-7-3 7-5-4-2 11z"/></svg>';
    const ICN_LOGOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';

    function ini() {
      const base = String(name || 'U').trim().split(/\s+/).filter(Boolean);
      return (base.length > 1 ? base[0][0] + base[1][0] : String(name).slice(0, 2)).toUpperCase();
    }
    function rightVal(txt) { return el('span', { style: { marginLeft: 'auto', color: 'var(--fg-muted)', fontWeight: '500', fontSize: '12.5px' } }, txt); }
    const ROW = { fontSize: '13.5px', padding: '9px 10px', gap: '11px' };

    // Tarjeta de cuenta (cabecera del menú): avatar a la izquierda; nombre,
    // correo y la insignia alineados en la columna de la derecha.
    const avatarEl = el('div', { class: 'avatar', style: { width: '40px', height: '40px', fontSize: '13px', flexShrink: '0', overflow: 'hidden' } }, ini());
    paintAvatar(avatarEl, u, ini());
    const card = el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '9px 10px 11px' } }, [
      avatarEl,
      el('div', { style: { minWidth: '0', flex: '1' } }, [
        el('div', { style: { fontSize: '10px', fontWeight: '600', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '2px' } }, 'Mi cuenta'),
        el('div', { style: { fontWeight: '700', fontSize: '14px', color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, name),
        el('div', { style: { fontSize: '11.5px', color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '1px 0 8px' } }, email),
        (function () {
          // Estado real de la cuenta: Admin (Sin límites) · Invitado · Gratis/plan.
          if (isAdmin) {
            return el('span', { style: { display: 'inline-block', fontSize: '11px', fontWeight: '700', color: 'var(--on-accent, #fff)', background: 'var(--fg)', borderRadius: '999px', padding: '3px 11px' } }, 'Sin límites');
          }
          if (isGuest) {
            return el('span', { style: { display: 'inline-block', fontSize: '11px', fontWeight: '600', color: 'var(--accent, #2b5fff)', border: '1px solid color-mix(in srgb, var(--accent, #2b5fff) 40%, transparent)', borderRadius: '999px', padding: '3px 11px' } }, 'Invitado · ' + (u.guest_expires_at ? guestLeft(u.guest_expires_at) : 'prueba'));
          }
          return el('span', { style: { display: 'inline-block', fontSize: '11px', fontWeight: '600', color: 'var(--fg-muted)', border: '1px solid var(--border-strong)', borderRadius: '999px', padding: '3px 11px' } }, planLabel);
        })()
      ])
    ]);

    // Fila "Cambiar tema" (no cierra; alterna y actualiza su valor)
    const themeVal = rightVal(themeLabel());
    const themeRow = el('button', { type: 'button', class: 'popup-item', style: ROW, onclick: function (e) { e.stopPropagation(); try { toggleTheme(); } catch (er) {} themeVal.textContent = themeLabel(); } }, [
      el('span', { html: ICN_THEME, style: { display: 'inline-flex' } }), el('span', {}, 'Cambiar tema'), themeVal
    ]);
    const settingsRow = el('button', { type: 'button', class: 'popup-item', style: ROW, onclick: function () { close(); setTimeout(function () { if (typeof go === 'function') { go('settings'); } else { openSettings(); } }, 10); } }, [
      el('span', { html: ICN_SETTINGS, style: { display: 'inline-flex' } }), el('span', {}, 'Ajustes')
    ]);
    // Invitado: en vez de "Plan de pago / Mejorar", ofrecemos crear la cuenta
    // (su prueba es temporal y se borra al expirar).
    const planBtn = isAdmin ? null : el('span', { style: { marginLeft: 'auto', background: 'var(--fg)', color: 'var(--bg)', fontWeight: '600', fontSize: '12px', borderRadius: '999px', padding: '5px 12px' } }, isGuest ? 'Registrarse' : 'Mejorar');
    const planRow = el('button', { type: 'button', class: 'popup-item', style: ROW, onclick: function () {
      close();
      if (isAdmin) { setTimeout(function () { toast('Cuenta de administrador · Sin límites'); }, 10); return; }
      if (isGuest) { window.location.href = '/login'; return; }
      // Abre Configuración → Facturación (muestra el plan o, si aún no tiene
      // plan de pago, el aviso correspondiente).
      setTimeout(function () { if (typeof state !== 'undefined') state.settingsTab = 'billing'; if (typeof go === 'function') go('settings'); }, 10);
    } }, [
      el('span', { html: ICN_PLAN, style: { display: 'inline-flex' } }), el('span', {}, isAdmin ? 'Administrador' : (isGuest ? 'Crear cuenta gratis' : 'Plan de pago')), planBtn
    ].filter(Boolean));
    const logoutRow = el('button', { type: 'button', class: 'popup-item danger', style: ROW, onclick: function () { close(); setTimeout(function () { if (window.logout) window.logout(); }, 10); } }, [
      el('span', { html: ICN_LOGOUT, style: { display: 'inline-flex' } }), el('span', {}, 'Cerrar sesión')
    ]);

    const p = el('div', { class: 'popup', id: 'profile-popup', role: 'menu', style: { width: 'min(272px, calc(100vw - 28px))', padding: '6px' } }, [
      card,
      el('div', { class: 'popup-sep' }),
      themeRow, settingsRow, planRow,
      el('div', { class: 'popup-sep' }),
      logoutRow
    ]);
    document.body.appendChild(p);

    // Posición: encima del usuario (el pie está abajo), alineado a su izquierda,
    // siempre dentro de la pantalla.
    const r = anchor ? anchor.getBoundingClientRect() : { left: 12, right: 312, top: window.innerHeight - 60, bottom: window.innerHeight - 10 };
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - pw - 12);
    left = Math.max(12, left);
    let top = r.top - ph - 8;                       // encima del usuario
    if (top < 10) top = Math.min(r.bottom + 8, window.innerHeight - ph - 10);  // si no cabe, debajo
    p.style.left = left + 'px';
    p.style.top = top + 'px';

    const close = function () {
      if (p.parentNode) p.remove();
      document.removeEventListener('click', onOutside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
      _profileClose = null;
    };
    const onOutside = function (e) { if (!p.contains(e.target)) close(); };
    // Al hacer scroll (con el menú dentro del popup, no cuenta) se cierra, para
    // que no quede flotando separado del usuario.
    const onScroll = function (e) { if (!p.contains(e.target)) close(); };
    _profileClose = close;
    setTimeout(function () {
      document.addEventListener('click', onOutside, true);
      window.addEventListener('resize', close);
      window.addEventListener('scroll', onScroll, true);
    }, 10);
  };

  // Ajustes de la cuenta: editar nombre, idioma y (si no es Google/invitado)
  // la contraseña. Guarda en el servidor con PATCH /api/v1/account/profile.
  window.openSettings = function () {
    const u = window.currentUser || {};
    const nameInp = el('input', { type: 'text', value: u.name || '', placeholder: 'Tu nombre' });
    const mailInp = el('input', { type: 'text', value: u.email || '', disabled: '' });
    const LANGS = [['es', 'Español'], ['en', 'English'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['zh', '中文'], ['ja', '日本語']];
    const langSel = el('select', {}, LANGS.map(function (p) { return el('option', { value: p[0] }, p[1]); }));
    langSel.value = u.language || 'es';
    const curPass = el('input', { type: 'password', placeholder: 'Contraseña actual', autocomplete: 'current-password' });
    const newPass = el('input', { type: 'password', placeholder: 'Nueva contraseña (mín. 8)', autocomplete: 'new-password' });

    const bodyEl = el('div', {}, [
      el('div', { class: 'field' }, [el('label', {}, 'Nombre'), nameInp]),
      el('div', { class: 'field' }, [el('label', {}, 'Correo'), mailInp]),
      el('div', { class: 'field' }, [el('label', {}, 'Idioma'), langSel]),
      u.is_guest ? null : el('div', { class: 'field' }, [
        el('label', {}, 'Cambiar contraseña (opcional)'),
        curPass,
        el('div', { style: { height: '8px' } }),
        newPass
      ])
    ].filter(Boolean));

    let m, saving = false;
    async function save() {
      if (saving) return;
      const payload = {};
      const nm = nameInp.value.trim();
      if (nm && nm !== u.name) payload.name = nm;
      if (langSel.value && langSel.value !== u.language) payload.language = langSel.value;
      if (newPass.value) { payload.new_password = newPass.value; payload.current_password = curPass.value; }
      if (!Object.keys(payload).length) { toast('No hay cambios que guardar'); return; }
      saving = true;
      try {
        const d = await apiPatch('/account/profile', payload);
        window.currentUser = d.user;
        // Refresca la barra lateral (nombre, correo, foto).
        window.refreshUserChrome(d.user);
        // Aplica el idioma si cambió.
        try {
          if (d.user.language && typeof setLanguage === 'function' && typeof getLang === 'function' && getLang() !== d.user.language) {
            setLanguage(d.user.language);
            if (typeof render === 'function') render();
          }
        } catch (e) {}
        m.close();
        toast('Ajustes guardados');
      } catch (e) {
        toast(e.message || 'No se pudo guardar');
      } finally { saving = false; }
    }

    m = modal({
      title: 'Ajustes',
      body: bodyEl,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Guardar', kind: 'primary', onClick: function () { save(); return false; }, keepOpen: true }
      ]
    });
  };

  // Cierra sesión en el servidor y vuelve al login. Limpia los datos en memoria
  // para que la siguiente cuenta NO vea nada de la anterior.
  window.logout = function () {
    try {
      if (window.store) { store.projects = []; store.notes = []; store.files = []; store.apiKeys = []; store.activity = []; }
      window.currentUser = null;
    } catch (e) {}
    fetch('/api/v1/account/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-NubiFly-Client': 'web' } })
      .catch(function () {})
      .then(function () { window.location.href = '/login'; });
  };
})();
