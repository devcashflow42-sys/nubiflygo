'use strict';
/* views/settings.js — Vista "Configuración".
   Panel profesional con 7 pestañas (General, Espacio de trabajo, Privacidad,
   Notificaciones, Miembros, Facturación, Integraciones).
   Carga los datos reales del usuario (window.currentUser) y guarda:
     · nombre / idioma / contraseña → servidor (PATCH /account/profile)
     · foto de perfil → servidor (POST/DELETE /account/avatar)
     · tema → toggleTheme + preferencias
     · resto de controles → preferencias locales (persisten en el dispositivo)
   Diseño de una sola columna, sin la columna descriptiva izquierda del mockup. */

/* Todo el módulo va dentro de una IIFE: así sus ayudantes (card, row, btn,
   LANGS…) NO se filtran al espacio global compartido por los demás scripts.
   Solo se expone window.viewSettings. */
(function () {

  /* ───────────── Preferencias de la vista (persisten localmente) ───────────── */
  function sGet(key, def) {
    try { const p = readPrefs(); const s = p.settings || {}; return (key in s) ? s[key] : def; }
    catch (e) { return def; }
  }
  function sSet(key, val) {
    try { const p = readPrefs(); p.settings = p.settings || {}; p.settings[key] = val; writePrefs(p); }
    catch (e) {}
  }

  /* ───────────── Iconos ───────────── */
  const SI = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
    at: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
    cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 7.5-7.5 1.65 1.65 1.5-1.5-3.15-3.15-9 9"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
    at2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20l-2-11-5 4-3-7-3 7-5-4-2 11z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    db: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    bars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="7" x2="9" y2="7"/><line x1="15" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="15" y2="12"/><path d="M9 22v-4h6v4"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };

  /* ───────────── Constructores reutilizables ───────────── */
  // Interruptor (switch) ligado a una preferencia local.
  function sToggle(key, def, onChange) {
    const on = sGet(key, def);
    const sw = el('button', { class: 'switch' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false' });
    sw.addEventListener('click', function () {
      const now = !sw.classList.contains('on');
      sw.classList.toggle('on', now);
      sw.setAttribute('aria-checked', now ? 'true' : 'false');
      sSet(key, now);
      if (onChange) onChange(now);
    });
    return sw;
  }
  // Tarjeta de sección con cabecera (icono + título + subtítulo) y cuerpo.
  function card(icon, title, subtitle, bodyNodes, headAction, bodyClass) {
    const head = el('div', { class: 'set-card-head' }, [
      el('div', { class: 'set-card-ico', html: icon }),
      el('div', { class: 'set-card-ht' }, [
        el('h2', {}, title),
        subtitle ? el('p', {}, subtitle) : null
      ].filter(Boolean)),
      headAction ? el('div', { class: 'set-card-head-act' }, headAction) : null
    ].filter(Boolean));
    const body = el('div', { class: 'set-card-body' + (bodyClass ? ' ' + bodyClass : '') }, bodyNodes);
    return el('div', { class: 'set-card' }, [head, body]);
  }
  // Fila con icono + texto a la izquierda y un control a la derecha.
  function row(icon, title, desc, ctl) {
    return el('div', { class: 'set-row' }, [
      icon ? el('div', { class: 'set-row-ico', html: icon }) : null,
      el('div', { class: 'set-row-main' }, [
        el('div', { class: 'tt' }, title),
        desc ? el('div', { class: 'ds' }, desc) : null
      ].filter(Boolean)),
      el('div', { class: 'set-row-ctl' }, Array.isArray(ctl) ? ctl : [ctl])
    ].filter(Boolean));
  }
  // Campo de formulario: etiqueta + control (input/select/textarea ya creado).
  function field(label, control, opts) {
    opts = opts || {};
    const lab = el('label', {}, [ label, opts.optional ? el('span', { class: 'opt' }, '  (opcional)') : null ].filter(Boolean));
    let ctlWrap = control;
    if (opts.icon) {
      ctlWrap = el('div', { class: 'set-ctl-wrap' }, [ el('span', { class: 'ic', html: opts.icon }), control ]);
    }
    return el('div', { class: 'set-field' }, [
      lab, ctlWrap,
      opts.hint ? el('div', { class: 'hint' }, opts.hint) : null
    ].filter(Boolean));
  }
  function input(value, attrs) { return el('input', Object.assign({ type: 'text', value: value || '' }, attrs || {})); }
  function select(value, options, attrs) {
    const s = el('select', attrs || {}, options.map(function (o) {
      const val = Array.isArray(o) ? o[0] : o;
      const txt = Array.isArray(o) ? o[1] : o;
      return el('option', { value: val }, txt);
    }));
    s.value = value;
    return s;
  }
  // Select que persiste una preferencia local al cambiar.
  function prefSelect(key, def, options) {
    const s = select(sGet(key, def), options);
    s.addEventListener('change', function () { sSet(key, s.value); });
    return s;
  }
  function btn(label, kind, onClick, iconHtml) {
    return el('button', { class: 'btn btn-' + kind, type: 'button', onclick: onClick },
      [ iconHtml ? el('span', { html: iconHtml, style: { display: 'inline-flex' } }) : null, label ].filter(Boolean));
  }

  const LANGS = [['es', 'Español (México)'], ['en', 'English (US)'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['zh', '中文'], ['ja', '日本語']];
  const TZS = [
    ['UTC-06:00', 'UTC−06:00 Ciudad de México'], ['UTC-08:00', 'UTC−08:00 Hora del Pacífico'],
    ['UTC-05:00', 'UTC−05:00 Hora del Este'], ['UTC-03:00', 'UTC−03:00 Buenos Aires'],
    ['UTC+00:00', 'UTC±00:00 Londres'], ['UTC+01:00', 'UTC+01:00 Madrid'], ['UTC+02:00', 'UTC+02:00 Atenas']
  ];

  /* ───────────── Pestaña: Configuración general ───────────── */
  function tabGeneral(root, u) {
    // ── Perfil de la cuenta ──
    const nameInp = input(u.name || '', { id: 'set-name', placeholder: 'Tu nombre' });
    const mailInp = input(u.email || '', { id: 'set-email', disabled: '' });
    const userInp = input(sGet('username', (u.email || '').split('@')[0] || ''), { id: 'set-username', placeholder: 'usuario' });
    const langSel = select(u.language || 'es', LANGS, { id: 'set-lang' });
    const bioInp = el('textarea', { id: 'set-bio', placeholder: 'Cuéntanos un poco sobre ti…' }, sGet('bio', ''));

    const ava = el('div', { class: 'set-ava' });
    if (typeof paintAvatar === 'function') paintAvatar(ava, u, initialsOf(u));
    else ava.textContent = initialsOf(u);
    const since = u.created_at ? ('Miembro desde ' + monthYear(u.created_at)) : '';

    const fileInp = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: { display: 'none' } });
    fileInp.addEventListener('change', function () {
      const f = fileInp.files && fileInp.files[0];
      fileInp.value = '';   // permite volver a elegir el mismo archivo
      handleAvatar(f, ava);
    });
    const ICN_UPLOAD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    const avaActs = el('div', { class: 'set-profile-acts' }, [
      btn(u.avatar_url ? 'Cambiar foto' : 'Subir foto', 'ghost', function () { fileInp.click(); }, ICN_UPLOAD),
      u.avatar_url ? btn('Quitar', 'ghost', function () { removeAvatar(ava); }) : null
    ].filter(Boolean));

    const profile = el('div', { class: 'set-profile' }, [
      ava,
      el('div', { class: 'set-profile-meta' }, [
        el('div', { class: 'nm' }, u.name || u.email || 'Usuario'),
        el('div', { class: 'em' }, u.email || ''),
        since ? el('div', { class: 'since' }, since) : null
      ].filter(Boolean)),
      avaActs
    ]);

    const profileBody = el('div', {}, [
      profile, fileInp,
      el('div', { class: 'set-fields' }, [
        field('Nombre completo', nameInp, { icon: SI.user }),
        field('Correo electrónico', mailInp, { icon: SI.mail, hint: 'El correo no puede modificarse aquí.' }),
        field('Nombre de usuario', userInp, { icon: SI.at }),
        field('Idioma de la interfaz', langSel, { icon: SI.globe })
      ]),
      el('div', { class: 'set-fields one' }, [ field('Biografía', bioInp, { optional: true }) ]),
      el('div', { class: 'set-foot' }, [
        btn('Guardar cambios', 'accent', function () { saveProfile({ nameInp: nameInp, langSel: langSel, userInp: userInp, bioInp: bioInp, u: u }); })
      ])
    ]);
    root.appendChild(card(SI.user, 'Perfil de la cuenta', 'Administra la información principal de tu cuenta y cómo se muestra a otros.', [profileBody]));

    // ── Preferencias de la cuenta ──
    const prefBody = el('div', {}, [
      row(SI.sun, 'Tema de la interfaz', 'Claro, oscuro o según tu preferencia.', themeSeg()),
      row(SI.layout, 'Diseño de la interfaz', 'Ancho del contenido y densidad.', prefSelect('layout', 'default', [['default', 'Predeterminado'], ['wide', 'Amplio'], ['focus', 'Enfocado']])),
      row(SI.clock, 'Zona horaria', 'Usada para fechas y recordatorios.', prefSelect('timezone', 'UTC-06:00', TZS)),
      row(SI.cal, 'Formato de fecha', null, prefSelect('dateFormat', 'DD/MM/AAAA', ['DD/MM/AAAA', 'MM/DD/AAAA', 'AAAA-MM-DD'])),
      row(SI.activity, 'Activar animaciones', 'Muestra animaciones en la interfaz.', sToggle('anims', true)),
      row(SI.bars, 'Mostrar accesos rápidos', 'Muestra accesos rápidos en la barra lateral.', sToggle('quickAccess', true)),
      row(SI.box, 'Modo compacto', 'Reduce el tamaño de los elementos.', sToggle('compact', false)),
      row(SI.bell, 'Sonidos de notificación', 'Reproducir sonidos en las notificaciones.', sToggle('sounds', false))
    ]);
    root.appendChild(card(SI.cog, 'Preferencias de la cuenta', 'Configura cómo funciona tu cuenta y tu experiencia de uso.', [prefBody]));

    // ── Seguridad ──
    root.appendChild(securityCard(u));
  }

  // Selector de tema con pastillas (Claro / Oscuro / Auto) — control real.
  function themeSeg() {
    const cur = document.documentElement.getAttribute('data-theme') || 'auto';
    const opts = [['light', 'Claro', SI.sun], ['dark', 'Oscuro', SI.moon], ['auto', 'Auto', SI.cog]];
    const wrap = el('div', { class: 'set-seg' });
    opts.forEach(function (o) {
      const b = el('button', { type: 'button', class: (cur === o[0] ? 'on' : ''), html: o[2] + '<span>' + o[1] + '</span>' });
      b.addEventListener('click', function () {
        setTheme(o[0]);
        wrap.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function securityCard(u) {
    const twofa = sGet('twofa', false);
    const body = el('div', { class: 'set-boxrows' }, [
      el('div', { class: 'set-box' }, [
        el('div', { class: 'set-row-ico', html: SI.lock }),
        el('div', { class: 'set-row-main' }, [ el('div', { class: 'tt' }, 'Contraseña'), el('div', { class: 'ds' }, u.is_guest ? 'No disponible para invitados.' : 'Cámbiala periódicamente para proteger tu cuenta.') ]),
        el('div', { class: 'set-row-ctl' }, [ u.is_guest ? el('span', { class: 'muted' }, '—') : btn('Cambiar contraseña', 'ghost', function () { openPasswordModal(); }) ])
      ]),
      el('div', { class: 'set-box' }, [
        el('div', { class: 'set-row-ico', html: SI.phone }),
        el('div', { class: 'set-row-main' }, [ el('div', { class: 'tt' }, 'Autenticación en dos pasos (2FA)'), el('div', { class: 'ds' }, 'Añade una capa adicional de seguridad.') ]),
        el('div', { class: 'set-row-ctl' }, [ el('span', { class: 'set-badge ' + (twofa ? 'ok' : 'off') }, [ el('span', { class: 'dot' }), twofa ? 'Activado' : 'Desactivado' ]), sToggle('twofa', false, function (on) { toast(on ? 'Autenticación en dos pasos activada' : '2FA desactivado'); setTimeout(function () { render(); }, 150); }) ])
      ]),
      sessionsBlock()
    ]);
    return card(SI.shield, 'Seguridad de la cuenta', 'Gestiona la seguridad de tu cuenta y métodos de inicio de sesión.', [body], null, 'pad');
  }

  /* ───────────── Pestaña: Espacio de trabajo ───────────── */
  function tabWorkspace(root, u) {
    const nameInp = input(sGet('wsName', 'Mi espacio de trabajo'), { placeholder: 'Nombre del espacio' });
    const urlInp = input(sGet('wsUrl', 'nubiflygo'), { placeholder: 'url-del-espacio' });
    const sectorSel = select(sGet('wsSector', 'Tecnología'), ['Tecnología', 'Finanzas', 'Educación', 'Salud', 'Comercio', 'Diseño', 'Otro']);
    const descInp = el('textarea', { placeholder: 'Describe tu espacio de trabajo…' }, sGet('wsDesc', ''));

    bindPref(nameInp, 'wsName'); bindPref(urlInp, 'wsUrl'); bindPref(descInp, 'wsDesc');
    sectorSel.addEventListener('change', function () { sSet('wsSector', sectorSel.value); });

    const logo = el('div', { class: 'set-ava', style: { borderRadius: '12px', background: 'var(--fg)' } }, [ el('span', { html: brandCloud(), style: { color: 'var(--surface)' } }) ]);
    const logoCard = el('div', { class: 'set-profile' }, [
      logo,
      el('div', { class: 'set-profile-meta' }, [
        el('div', { class: 'nm' }, sGet('wsName', 'Mi espacio de trabajo')),
        el('div', { class: 'em' }, (u.plan_label || 'Plan Gratis') + ' · ' + (u.created_at ? 'Creado en ' + monthYear(u.created_at) : 'Creado recientemente'))
      ]),
      btn('Subir imagen', 'ghost', function () { toast('Subida de logotipo — próximamente'); })
    ]);
    root.appendChild(card(SI.box, 'Logotipo e identidad', 'Administra el logotipo y la identidad visual de tu espacio de trabajo.', [logoCard]));

    const info = el('div', {}, [
      el('div', { class: 'set-fields' }, [
        field('Nombre del espacio de trabajo', nameInp, { icon: SI.box }),
        field('URL del espacio de trabajo', urlInp, { icon: SI.link }),
        field('Sector', sectorSel, { icon: SI.building })
      ]),
      el('div', { class: 'set-fields one' }, [ field('Descripción', descInp, { optional: true }) ]),
      el('div', { class: 'set-foot' }, [ btn('Guardar', 'accent', function () { toast('Espacio de trabajo guardado'); }) ])
    ]);
    root.appendChild(card(SI.building, 'Información del espacio de trabajo', 'Edita el nombre, la URL y la descripción de tu espacio.', [info]));

    const prefs = el('div', {}, [
      el('div', { class: 'set-fields' }, [
        field('La semana comienza el', prefSelect('wsWeekStart', 'Lunes', ['Lunes', 'Domingo']), { icon: SI.cal }),
        field('Idioma', select(u.language || 'es', LANGS), { icon: SI.globe }),
        field('Zona horaria', prefSelect('wsTz', 'UTC-06:00', TZS), { icon: SI.clock })
      ]),
      row(SI.team, 'Permitir que los miembros creen proyectos', 'Si se desactiva, solo los administradores podrán crear proyectos.', sToggle('wsMembersCreate', true))
    ]);
    root.appendChild(card(SI.cog, 'Preferencias del espacio de trabajo', 'Configura los ajustes predeterminados y los controles de acceso.', [prefs]));
  }

  /* ───────────── Pestaña: Privacidad y seguridad ───────────── */
  function tabPrivacy(root, u) {
    const priv = el('div', {}, [
      row(SI.user, 'Perfil público', 'Permitir que otros usuarios vean tu perfil.', sToggle('privPublic', true)),
      row(SI.mail, 'Mostrar correo electrónico', 'Tu correo será visible para otros usuarios.', sToggle('privShowEmail', false)),
      row(SI.activity, 'Mostrar actividad', 'Muestra tu actividad reciente en tu perfil.', sToggle('privActivity', true)),
      row(SI.chat, 'Permitir mensajes directos', 'Otros usuarios pueden enviarte mensajes.', sToggle('privDM', true))
    ]);
    root.appendChild(card(SI.shield, 'Privacidad de la cuenta', 'Controla quién puede ver tu información y cómo se muestra tu perfil.', [priv]));

    root.appendChild(securityCard(u));

    const data = el('div', { class: 'set-boxrows' }, [
      el('div', { class: 'set-box' }, [
        el('div', { class: 'set-row-ico', html: SI.download }),
        el('div', { class: 'set-row-main' }, [ el('div', { class: 'tt' }, 'Descargar mis datos'), el('div', { class: 'ds' }, 'Obtén una copia de tu información personal.') ]),
        el('div', { class: 'set-row-ctl' }, [ btn('Descargar', 'ghost', function () { downloadData(u); }) ])
      ]),
      el('div', { class: 'set-box', style: { borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' } }, [
        el('div', { class: 'set-row-ico', html: SI.trash, style: { color: 'var(--danger)' } }),
        el('div', { class: 'set-row-main' }, [ el('div', { class: 'tt' }, 'Eliminar mi cuenta'), el('div', { class: 'ds' }, 'Elimina permanentemente tu cuenta y todos tus datos.') ]),
        el('div', { class: 'set-row-ctl' }, [ btn('Eliminar cuenta', 'danger', function () { confirmDelete(); }) ])
      ])
    ]);
    root.appendChild(card(SI.db, 'Datos y privacidad', 'Controla cómo se utilizan y almacenan tus datos.', [data], null, 'pad'));

    const access = el('div', {}, [
      row(SI.box, 'Aplicaciones conectadas', 'Administra las aplicaciones que tienen acceso a tu cuenta.', btn('Administrar', 'ghost', function () { go('settings'); state.settingsTab = 'integrations'; render(); })),
      row(SI.key, 'Claves de API', 'Gestiona tus claves de API y tokens de acceso.', btn('Ver claves', 'ghost', function () { go('apikeys'); })),
      row(SI.globe, 'Acceso desde ubicaciones', 'Controla desde qué ubicaciones se puede acceder.', prefSelect('privLocations', 'all', [['all', 'Todas las ubicaciones'], ['trusted', 'Solo de confianza']]))
    ]);
    root.appendChild(card(SI.lock, 'Permisos y acceso', 'Gestiona el acceso de aplicaciones y servicios de terceros.', [access]));
  }

  /* ───────────── Pestaña: Notificaciones ───────────── */
  function tabNotifications(root) {
    root.appendChild(card(SI.bell, 'Preferencias de notificaciones', 'Configura cómo y cuándo quieres recibir notificaciones.', [ el('div', {}, [
      row(SI.mail, 'Notificaciones por correo electrónico', 'Recibe actualizaciones importantes en tu correo.', sToggle('nEmail', true)),
      row(SI.phone, 'Notificaciones push', 'Recibe notificaciones en tu navegador o dispositivo.', sToggle('nPush', true)),
      row(SI.chat, 'Notificaciones por SMS', 'Recibe alertas importantes por mensaje de texto.', sToggle('nSms', false)),
      row(SI.monitor, 'Notificaciones en la aplicación', 'Recibe notificaciones dentro de la plataforma.', sToggle('nApp', true))
    ]) ]));

    root.appendChild(card(SI.team, 'Notificaciones del equipo', 'Controla las notificaciones de tu equipo y proyectos.', [ el('div', {}, [
      row(SI.team, 'Invitaciones al equipo', 'Cuando te inviten a un equipo.', sToggle('nInvites', true)),
      row(SI.user, 'Cambios de membresía', 'Cambios en los miembros del equipo.', sToggle('nMembers', true)),
      row(SI.activity, 'Actividad del equipo', 'Actualizaciones sobre la actividad de tu equipo.', sToggle('nTeamActivity', true)),
      row(SI.at2, 'Menciones', 'Cuando alguien te mencione.', sToggle('nMentions', true))
    ]) ]));

    root.appendChild(card(SI.box, 'Notificaciones de proyectos', 'Configura las notificaciones de tus proyectos y archivos.', [ el('div', {}, [
      row(SI.box, 'Actualizaciones de proyectos', 'Cambios en tus proyectos.', sToggle('nProjects', true)),
      row(SI.chat, 'Comentarios', 'Cuando alguien comente en tus archivos o proyectos.', sToggle('nComments', true)),
      row(SI.download, 'Cargas de archivos', 'Cuando se suban nuevos archivos.', sToggle('nUploads', true)),
      row(SI.check, 'Tareas y recordatorios', 'Fechas límite y recordatorios.', sToggle('nTasks', true))
    ]) ]));

    root.appendChild(card(SI.cog, 'Configuración avanzada', 'Personaliza opciones adicionales de notificación.', [ el('div', {}, [
      row(SI.clock, 'Horario de notificaciones', 'Define en qué horario quieres recibirlas.', prefSelect('nSchedule', 'Siempre', ['Siempre', 'Horario laboral', 'Personalizado'])),
      row(SI.bell, 'Modo No molestar', 'Silencia todas las notificaciones temporalmente.', prefSelect('nDnd', 'Desactivado', ['Desactivado', '1 hora', 'Hasta mañana'])),
      row(SI.globe, 'Idioma de las notificaciones', 'Idioma en el que recibirás las notificaciones.', prefSelect('nLang', 'es', LANGS))
    ]) ]));
  }

  /* ───────────── Pestaña: Miembros del equipo ───────────── */
  function tabTeam(root, u) {
    const members = sGet('members', []);
    // Siempre incluye al usuario actual como propietario.
    const owner = { name: u.name || u.email, email: u.email, role: 'Propietario', you: true };
    const all = [owner].concat(members);

    const emailInp = el('input', { type: 'email', placeholder: 'correo@ejemplo.com' });
    const roleSel = select('Editor', [['Editor', 'Editor'], ['Lector', 'Lector'], ['Administrador', 'Administrador']]);
    const invite = el('div', { class: 'set-invite' }, [ emailInp, roleSel, btn('Invitar', 'accent', function () {
      const em = (emailInp.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Introduce un correo válido'); return; }
      const list = sGet('members', []);
      list.push({ name: em.split('@')[0], email: em, role: roleSel.value });
      sSet('members', list); emailInp.value = '';
      toast('Invitación enviada a ' + em); render();
    }) ]);

    const list = el('div', {}, all.map(function (m, idx) {
      const roleCls = m.role === 'Propietario' ? 'admin' : (m.role === 'Administrador' ? 'admin' : (m.role === 'Editor' ? 'editor' : ''));
      return el('div', { class: 'set-member' }, [
        el('div', { class: 'avatar-sm' }, initialsFrom(m.name || m.email)),
        el('div', { class: 'set-member-main' }, [
          el('div', { class: 'nm' }, (m.name || m.email) + (m.you ? ' (tú)' : '')),
          el('div', { class: 'em' }, m.email || '')
        ]),
        el('span', { class: 'role-pill ' + roleCls }, m.role),
        m.you ? null : el('button', { class: 'icon-btn', title: 'Quitar', onclick: function () {
          const l = sGet('members', []); l.splice(idx - 1, 1); sSet('members', l); toast('Miembro eliminado'); render();
        }, html: SI.trash })
      ].filter(Boolean));
    }));

    root.appendChild(card(SI.team, 'Miembros del equipo', 'Invita personas y gestiona sus permisos en el espacio de trabajo.', [ el('div', {}, [invite, list]) ],
      el('span', { class: 'set-badge off' }, all.length + (all.length === 1 ? ' miembro' : ' miembros')), 'pad'));

    const roles = el('div', {}, [
      row(SI.crown, 'Propietario', 'Control total del espacio, facturación y miembros.', el('span', { class: 'role-pill admin' }, 'Tú')),
      row(SI.shield, 'Administrador', 'Gestiona proyectos, miembros y la mayoría de ajustes.', el('span', { class: 'muted' }, 'Acceso amplio')),
      row(SI.pencil, 'Editor', 'Crea y edita proyectos, notas y archivos.', el('span', { class: 'muted' }, 'Edición')),
      row(SI.eye, 'Lector', 'Solo puede ver el contenido compartido.', el('span', { class: 'muted' }, 'Solo lectura'))
    ]);
    root.appendChild(card(SI.lock, 'Roles y permisos', 'Qué puede hacer cada rol dentro del espacio de trabajo.', [roles]));
  }

  /* ───────────── Pestaña: Facturación ─────────────
     Muestra solo datos reales de la cuenta: el plan y el historial vienen de
     /api/v1/billing (pagos verificados con Mercado Pago; ver js/billing.js). */
  // Bloque de estado vacío: icono + título + mensaje (+ botones opcionales).
  function emptyState(icon, title, msg, actions, compact) {
    return el('div', { class: 'set-empty' + (compact ? ' compact' : '') }, [
      el('div', { class: 'set-empty-ico', html: icon }),
      el('h3', {}, title),
      msg ? el('p', {}, msg) : null,
      actions && actions.length ? el('div', { class: 'set-foot' }, actions) : null
    ].filter(Boolean));
  }

  function tabBilling(root, u) {
    // ── Plan actual + planes para contratar (Mercado Pago) ── ver js/billing.js
    const histCard = renderBillingSection(root, u, card);

    // ── Método de pago ── (Mercado Pago: la tarjeta nunca pasa por nuestro servidor)
    root.appendChild(card(SI.card, 'Método de pago', 'Pagos seguros con Mercado Pago.', [
      emptyState(SI.card, 'Pagas con Mercado Pago',
        'Tarjeta de crédito o débito, OXXO, transferencia o saldo de Mercado Pago. Tus datos de pago los guarda Mercado Pago, no NubiFlyGo.', null, true)
    ], null, 'pad'));

    // ── Historial de pagos (real, de Mercado Pago) ──
    root.appendChild(histCard);

    // ── Información de facturación (preferencias locales) ──
    if (u.is_guest) return;
    const nameInp = input(sGet('billName', u.name || ''), { placeholder: 'Nombre o razón social' });
    const mailInp = input(sGet('billEmail', u.email || ''), { type: 'email', placeholder: 'facturacion@ejemplo.com' });
    const countrySel = select(sGet('billCountry', 'MX'), [['MX', 'México'], ['US', 'Estados Unidos'], ['ES', 'España'], ['AR', 'Argentina'], ['CO', 'Colombia']]);
    const rfcInp = input(sGet('billRfc', ''), { placeholder: 'RFC' });
    const billing = el('div', {}, [
      el('div', { class: 'set-fields' }, [
        field('Nombre o razón social', nameInp, { icon: SI.user }),
        field('Correo de facturación', mailInp, { icon: SI.mail }),
        field('País', countrySel, { icon: SI.globe }),
        field('RFC', rfcInp, { icon: SI.building, optional: true })
      ]),
      el('div', { class: 'set-foot' }, [ btn('Guardar información', 'accent', function () {
        const em = mailInp.value.trim();
        if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Introduce un correo de facturación válido'); return; }
        sSet('billName', nameInp.value.trim());
        sSet('billEmail', em);
        sSet('billCountry', countrySel.value);
        sSet('billRfc', rfcInp.value.trim().toUpperCase());
        toast('Información de facturación guardada');
      }) ])
    ]);
    root.appendChild(card(SI.building, 'Información de facturación', 'Gestiona tus datos fiscales y dirección de facturación.', [billing]));
  }

  /* ───────────── Pestaña: Integraciones ─────────────
     Aún no hay conexiones reales con servicios externos: las tarjetas muestran
     el logotipo oficial (SVG) y un botón "Próximamente" desactivado. */
  // Logotipos SVG (trazados de Simple Icons, licencia CC0), viewBox 0 0 24 24.
  const BRAND = {
    'Google Drive': { color: '#4285F4', path: 'M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z' },
    'Dropbox': { color: '#0061FF', path: 'M6 1.807L0 5.629l6 3.822 6.001-3.822L6 1.807zM18 1.807l-6 3.822 6 3.822 6-3.822-6-3.822zM0 13.274l6 3.822 6.001-3.822L6 9.452l-6 3.822zM18 9.452l-6 3.822 6 3.822 6-3.822-6-3.822zM6 18.371l6.001 3.822 6-3.822-6-3.822L6 18.371z' },
    'OneDrive': { color: '#0078D4', path: 'M19.453 9.95q.961.058 1.787.468.826.41 1.442 1.066.615.657.966 1.512.352.856.352 1.816 0 1.008-.387 1.893-.386.885-1.049 1.547-.662.662-1.546 1.049-.885.387-1.893.387H6q-1.242 0-2.332-.475-1.09-.475-1.904-1.29-.815-.814-1.29-1.903Q0 14.93 0 13.688q0-.985.31-1.887.311-.903.862-1.658.55-.756 1.324-1.325.774-.568 1.711-.861.434-.129.85-.187.416-.06.861-.082h.012q.515-.786 1.207-1.413.691-.627 1.5-1.066.808-.44 1.705-.668.896-.229 1.845-.229 1.278 0 2.456.417 1.177.416 2.144 1.16.967.744 1.658 1.78.692 1.038 1.008 2.28zm-7.265-4.137q-1.325 0-2.52.544-1.195.545-2.04 1.565.446.117.85.299.405.181.792.416l4.78 2.86 2.731-1.15q.27-.117.545-.204.276-.088.58-.147-.293-.937-.855-1.705-.563-.768-1.319-1.318-.755-.551-1.658-.856-.902-.304-1.886-.304zM2.414 16.395l9.914-4.184-3.832-2.297q-.586-.351-1.23-.539-.645-.188-1.325-.188-.914 0-1.722.364-.809.363-1.412.978-.604.616-.955 1.436-.352.82-.352 1.723 0 .703.234 1.423.235.721.68 1.284zm16.711 1.793q.563 0 1.078-.176.516-.176.961-.516l-7.23-4.324-10.301 4.336q.527.328 1.13.504.604.175 1.237.175zm3.012-1.852q.363-.727.363-1.523 0-.774-.293-1.407t-.791-1.072q-.498-.44-1.166-.68-.668-.24-1.406-.24-.422 0-.838.1t-.815.252q-.398.152-.785.334-.386.181-.761.345Z' },
    'Slack': { color: '#4A154B', path: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z' },
    'Discord': { color: '#5865F2', path: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z' },
    'GitHub': { color: '#181717', path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' },
    'Notion': { color: '#000000', path: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z' },
    'Zapier': { color: '#FF4F00', path: 'M4.157 0A4.151 4.151 0 0 0 0 4.161v15.678A4.151 4.151 0 0 0 4.157 24h15.682A4.152 4.152 0 0 0 24 19.839V4.161A4.152 4.152 0 0 0 19.839 0H4.157Zm10.61 8.761h.03a.577.577 0 0 1 .23.038.585.585 0 0 1 .201.124.63.63 0 0 1 .162.431.612.612 0 0 1-.162.435.58.58 0 0 1-.201.128.58.58 0 0 1-.23.042.529.529 0 0 1-.235-.042.585.585 0 0 1-.332-.328.559.559 0 0 1-.038-.235.613.613 0 0 1 .17-.431.59.59 0 0 1 .405-.162Zm2.853 1.572c.03.004.061.004.095.004.325-.011.646.064.937.219.238.144.431.355.552.609.128.279.189.582.185.888v.193a2 2 0 0 1 0 .219h-2.498c.003.227.075.45.204.642a.78.78 0 0 0 .646.265.714.714 0 0 0 .484-.136.642.642 0 0 0 .23-.318l.915.257a1.398 1.398 0 0 1-.28.537c-.14.159-.321.284-.521.355a2.234 2.234 0 0 1-.836.136 1.923 1.923 0 0 1-1.001-.245 1.618 1.618 0 0 1-.665-.703 2.221 2.221 0 0 1-.227-1.036 1.95 1.95 0 0 1 .48-1.398 1.9 1.9 0 0 1 1.3-.488Zm-9.607.023c.162.004.325.026.48.079.207.065.4.174.563.314.26.302.393.692.366 1.088v2.276H8.53l-.109-.711h-.065c-.064.163-.155.31-.272.439a1.122 1.122 0 0 1-.374.264 1.023 1.023 0 0 1-.453.083 1.334 1.334 0 0 1-.866-.264.965.965 0 0 1-.329-.801.993.993 0 0 1 .076-.431 1.02 1.02 0 0 1 .242-.363 1.478 1.478 0 0 1 1.043-.303h.952v-.181a.696.696 0 0 0-.136-.454.553.553 0 0 0-.438-.154.695.695 0 0 0-.378.086.48.48 0 0 0-.193.254l-.99-.144a1.26 1.26 0 0 1 .257-.563c.14-.174.321-.302.533-.378.261-.091.54-.136.82-.129.053-.003.106-.007.163-.007Zm4.384.007c.174 0 .347.038.506.114.182.083.34.211.458.374.257.423.377.911.351 1.406a2.53 2.53 0 0 1-.355 1.448 1.148 1.148 0 0 1-1.009.517c-.204 0-.401-.045-.582-.136a1.052 1.052 0 0 1-.48-.457 1.298 1.298 0 0 1-.114-.234h-.045l.004 1.784h-1.059v-4.713h.904l.117.805h.057c.068-.208.177-.401.328-.56a1.129 1.129 0 0 1 .843-.344h.076v-.004Zm7.559.084h.903l.113.805h.053a1.37 1.37 0 0 1 .235-.484.813.813 0 0 1 .313-.242.82.82 0 0 1 .39-.076h.234v1.051h-.401a.662.662 0 0 0-.313.008.623.623 0 0 0-.272.155.663.663 0 0 0-.174.26.683.683 0 0 0-.027.314v1.875h-1.054v-3.666Zm-17.515.003h3.262v.896L3.73 13.104l.034.113h1.973l.042.9H2.4v-.9l1.931-1.754-.045-.117H2.441v-.896Zm11.815 0h1.055v3.659h-1.055V10.45Zm3.443.684.019.016a.69.69 0 0 0-.351.045.756.756 0 0 0-.287.204c-.11.155-.174.336-.189.522h1.545c-.034-.526-.257-.787-.74-.787h.003Zm-5.718.163c-.026 0-.057 0-.083.004a.78.78 0 0 0-.31.053.746.746 0 0 0-.257.189 1.016 1.016 0 0 0-.204.695v.064c-.015.257.057.507.204.711a.634.634 0 0 0 .253.196.638.638 0 0 0 .314.061.644.644 0 0 0 .578-.265c.14-.223.204-.48.189-.74a1.216 1.216 0 0 0-.181-.711.677.677 0 0 0-.503-.257Zm-4.509 1.266a.464.464 0 0 0-.268.102.373.373 0 0 0-.114.276c0 .053.008.106.027.155a.375.375 0 0 0 .087.132.576.576 0 0 0 .397.11v.004a.863.863 0 0 0 .563-.182.573.573 0 0 0 .211-.457v-.14h-.903Z' }
  };
  function brandLogo(name) {
    const b = BRAND[name];
    if (!b) return '';
    return '<svg viewBox="0 0 24 24" role="img" aria-label="' + name + '" fill="' + b.color + '"><path d="' + b.path + '"/></svg>';
  }
  const SOON_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  function tabIntegrations(root) {
    root.appendChild(card(SI.link, 'Integraciones conectadas', 'Estas aplicaciones están conectadas a tu espacio de trabajo.', [
      emptyState(SI.link, 'No hay integraciones conectadas todavía',
        'Muy pronto podrás conectar tus aplicaciones favoritas a tu espacio de trabajo.', null, true)
    ], el('span', { class: 'set-badge off' }, '0 activas'), 'pad'));

    const AVAIL = [
      ['Google Drive', 'Almacena y gestiona archivos en la nube.'],
      ['Dropbox', 'Sincroniza tus archivos automáticamente.'],
      ['OneDrive', 'Gestiona tus archivos de Microsoft.'],
      ['Slack', 'Recibe notificaciones en tu canal.'],
      ['Discord', 'Envía notificaciones a tu servidor.'],
      ['GitHub', 'Vincula tus repositorios y proyectos.'],
      ['Notion', 'Organiza tu contenido y documentos.'],
      ['Zapier', 'Automatiza tus flujos de trabajo.']
    ];
    const grid = el('div', { class: 'set-intg-grid' }, AVAIL.map(function (a) {
      const soon = btn('Próximamente', 'ghost', null, SOON_ICON);
      soon.disabled = true;
      soon.setAttribute('aria-disabled', 'true');
      soon.title = a[0] + ': disponible próximamente';
      return el('div', { class: 'set-intg' }, [
        el('div', { class: 'set-intg-ico', html: brandLogo(a[0]) }),
        el('h4', {}, a[0]),
        el('p', {}, a[1]),
        soon
      ]);
    }));
    root.appendChild(card(SI.box, 'Explorar integraciones', 'Conecta nuevas aplicaciones para mejorar tu productividad.', [grid], null, 'pad'));

    const prefs = el('div', {}, [
      row(SI.bell, 'Recibir notificaciones', 'Alertas cuando una integración se conecte o desconecte.', sToggle('intgNotify', true)),
      row(SI.activity, 'Notificaciones de actividad', 'Actividad de tus integraciones.', sToggle('intgActivity', true))
    ]);
    root.appendChild(card(SI.cog, 'Notificaciones de integraciones', 'Configura cómo quieres recibir notificaciones de las integraciones.', [prefs]));
  }

  /* ───────────── Guardar perfil (servidor) ───────────── */
  async function saveProfile(ctx) {
    const u = ctx.u;
    const payload = {};
    const nm = ctx.nameInp.value.trim();
    if (nm && nm !== u.name) {
      if (nm.length < 2) { toast('El nombre debe tener al menos 2 caracteres'); return; }
      payload.name = nm;
    }
    if (ctx.langSel.value && ctx.langSel.value !== u.language) payload.language = ctx.langSel.value;
    // Preferencias locales (siempre).
    sSet('username', ctx.userInp.value.trim());
    sSet('bio', ctx.bioInp.value);

    if (!Object.keys(payload).length) { toast('Preferencias guardadas'); return; }
    try {
      const d = await apiPatch('/account/profile', payload);
      window.currentUser = d.user;
      refreshSidebar(d.user);
      try {
        if (d.user.language && typeof setLanguage === 'function' && typeof getLang === 'function' && getLang() !== d.user.language) {
          setLanguage(d.user.language);
        }
      } catch (e) {}
      toast('Cambios guardados');
      render();
    } catch (e) { toast(e.message || 'No se pudo guardar'); }
  }

  function refreshSidebar(user) {
    if (typeof refreshUserChrome === 'function') { refreshUserChrome(user); return; }
    const nameEl = document.querySelector('.sidebar-foot .user-name');
    const mailEl = document.querySelector('.sidebar-foot .user-mail');
    const avEl = document.querySelector('.sidebar-foot .avatar');
    if (nameEl) { nameEl.removeAttribute('data-i18n'); nameEl.textContent = user.name || user.email; }
    if (mailEl) { mailEl.removeAttribute('data-i18n'); mailEl.textContent = user.email || ''; }
    if (avEl && typeof paintAvatar === 'function') paintAvatar(avEl, user, initialsOf(user));
  }

  /* ───────────── Cambiar contraseña (servidor) ───────────── */
  function openPasswordModal() {
    const cur = el('input', { type: 'password', placeholder: 'Contraseña actual', autocomplete: 'current-password' });
    const nw = el('input', { type: 'password', placeholder: 'Nueva contraseña (mín. 8)', autocomplete: 'new-password' });
    const rep = el('input', { type: 'password', placeholder: 'Repite la nueva contraseña', autocomplete: 'new-password' });
    const body = el('div', {}, [
      el('div', { class: 'field' }, [ el('label', {}, 'Contraseña actual'), cur ]),
      el('div', { class: 'field' }, [ el('label', {}, 'Nueva contraseña'), nw ]),
      el('div', { class: 'field' }, [ el('label', {}, 'Confirmar'), rep ])
    ]);
    let saving = false;
    modal({
      title: 'Cambiar contraseña', body: body,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Actualizar', kind: 'primary', keepOpen: true, onClick: async function (close) {
          if (saving) return false;
          if (nw.value.length < 8) { toast('La nueva contraseña debe tener al menos 8 caracteres'); return false; }
          if (nw.value !== rep.value) { toast('Las contraseñas no coinciden'); return false; }
          saving = true;
          try { await apiPatch('/account/profile', { current_password: cur.value, new_password: nw.value }); toast('Contraseña actualizada'); close(); }
          catch (e) { toast(e.message || 'No se pudo actualizar'); }
          finally { saving = false; }
          return false;
        } }
      ]
    });
  }

  /* ───────────── Sesiones activas (lista real, desde /account/sessions) ───────────── */
  // Bloque: cabecera + lista de dispositivos donde el usuario ha iniciado sesión.
  function sessionsBlock() {
    const list = el('div', { class: 'set-sessions' });
    const block = el('div', { class: 'set-sessions-wrap' }, [
      el('div', { class: 'set-subhead' }, [
        el('div', { class: 'set-row-ico', html: SI.monitor }),
        el('div', { class: 'set-row-main' }, [ el('div', { class: 'tt' }, 'Sesiones activas'), el('div', { class: 'ds' }, 'Dispositivos donde has iniciado sesión.') ]),
        el('button', { type: 'button', class: 'set-link-btn', onclick: function () { loadSessions(list); } }, 'Actualizar')
      ]),
      list
    ]);
    loadSessions(list);
    return block;
  }

  function sessionsSkeleton() {
    return el('div', {}, [0, 1].map(function () {
      return el('div', { class: 'sess-item sess-skel' }, [
        el('span', { class: 'sess-ico' }),
        el('div', { class: 'sess-main' }, [ el('span', { class: 'sk-line w40' }), el('span', { class: 'sk-line w70' }) ])
      ]);
    }));
  }

  function loadSessions(list) {
    list.textContent = '';
    list.appendChild(sessionsSkeleton());
    apiGet('/account/sessions').then(function (d) {
      list.textContent = '';
      const items = (d && d.items) || [];
      if (!items.length) { list.appendChild(el('div', { class: 'sess-empty' }, 'Aún no hay sesiones registradas.')); return; }
      items.forEach(function (s) { list.appendChild(sessionItem(s)); });
    }).catch(function (err) {
      list.textContent = '';
      list.appendChild(el('div', { class: 'sess-empty' }, (err && err.message) || 'No se pudieron cargar las sesiones.'));
    });
  }

  function sessionItem(s) {
    const isMobile = /Android|iOS/.test(s.detail || '');
    const when = s.current
      ? 'Activa ahora'
      : (s.last_seen ? 'Última vez ' + timeAgo(Date.parse(s.last_seen)) : '');
    return el('div', { class: 'sess-item' + (s.current ? ' is-current' : '') }, [
      el('span', { class: 'sess-ico', html: isMobile ? SI.phone : SI.monitor }),
      el('div', { class: 'sess-main' }, [
        el('div', { class: 'sess-top' }, [
          el('span', { class: 'sess-name' }, s.device),
          s.current ? el('span', { class: 'set-badge ok' }, [ el('span', { class: 'dot' }), 'Este dispositivo' ]) : null
        ].filter(Boolean)),
        el('div', { class: 'sess-detail' }, [
          el('span', {}, s.detail || ''),
          s.ip ? el('span', { class: 'sess-ip' }, ' · ' + s.ip) : null
        ].filter(Boolean)),
        when ? el('div', { class: 'sess-when' }, when) : null
      ].filter(Boolean))
    ]);
  }

  /* ───────────── Descargar datos ───────────── */
  function downloadData(u) {
    try {
      const data = {
        usuario: { nombre: u.name, correo: u.email, idioma: u.language, plan: u.plan_label, creado: u.created_at },
        proyectos: (store.projects || []).map(function (p) { return { nombre: p.name, documentos: (p.documents || []).length }; }),
        notas: (store.notes || []).length, archivos: (store.files || []).length, claves: (store.apiKeys || []).length,
        preferencias: (readPrefs().settings || {})
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'nubiflygo-mis-datos.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('Descarga iniciada');
    } catch (e) { toast('No se pudo generar la descarga'); }
  }

  function confirmDelete() {
    const body = el('div', {}, [
      el('p', { style: { margin: '0 0 12px', color: 'var(--fg-muted)', fontSize: '13.5px', lineHeight: '1.5' } }, 'Esta acción es permanente y eliminará tu cuenta junto con todos tus proyectos, notas y archivos. Escribe ELIMINAR para confirmar.'),
      el('div', { class: 'field' }, [ el('input', { id: 'del-confirm', type: 'text', placeholder: 'ELIMINAR' }) ])
    ]);
    modal({
      title: 'Eliminar cuenta', body: body,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Eliminar definitivamente', kind: 'danger', keepOpen: true, onClick: function () {
          const v = (document.getElementById('del-confirm') || {}).value || '';
          if (v.trim().toUpperCase() !== 'ELIMINAR') { toast('Escribe ELIMINAR para confirmar'); return false; }
          toast('La eliminación de cuenta estará disponible próximamente');
          return false;
        } }
      ]
    });
  }

  /* ───────────── Foto de perfil (servidor) ─────────────
     La imagen se recorta en cuadrado y se reduce a 320 px en el navegador
     (JPEG) antes de subirla: pesa pocos KB y se ve nítida en el avatar. */
  const AVATAR_PX = 320;
  const AVATAR_MAX_MB = 10;   // tamaño máximo del archivo original elegido
  let avatarBusy = false;

  function handleAvatar(file, avaEl) {
    if (!file || avatarBusy) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { toast('Selecciona una imagen JPG, PNG, WEBP o GIF'); return; }
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) { toast('La imagen supera ' + AVATAR_MAX_MB + ' MB'); return; }
    const reader = new FileReader();
    reader.onerror = function () { toast('No se pudo leer la imagen'); };
    reader.onload = function () {
      const img = new Image();
      img.onerror = function () { toast('No se pudo abrir la imagen'); };
      img.onload = function () {
        let dataUrl;
        try {
          const c = document.createElement('canvas'); c.width = AVATAR_PX; c.height = AVATAR_PX;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, AVATAR_PX, AVATAR_PX);   // fondo para PNG transparentes
          const scale = Math.max(AVATAR_PX / img.width, AVATAR_PX / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (AVATAR_PX - w) / 2, (AVATAR_PX - h) / 2, w, h);
          dataUrl = c.toDataURL('image/jpeg', 0.86);
        } catch (e) { toast('No se pudo procesar la imagen'); return; }
        uploadAvatar(dataUrl, avaEl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function uploadAvatar(dataUrl, avaEl) {
    avatarBusy = true;
    if (avaEl) avaEl.classList.add('busy');
    toast('Subiendo foto…');
    try {
      const d = await apiPost('/account/avatar', { image: dataUrl });
      window.currentUser = d.user;
      refreshSidebar(d.user);
      toast('Foto de perfil actualizada');
      render();
    } catch (e) {
      toast(e.message || 'No se pudo subir la foto');
    } finally {
      avatarBusy = false;
      if (avaEl) avaEl.classList.remove('busy');
    }
  }

  async function removeAvatar(avaEl) {
    if (avatarBusy) return;
    avatarBusy = true;
    if (avaEl) avaEl.classList.add('busy');
    try {
      const d = await apiDelete('/account/avatar');
      window.currentUser = d.user;
      refreshSidebar(d.user);
      toast('Foto de perfil eliminada');
      render();
    } catch (e) {
      toast(e.message || 'No se pudo quitar la foto');
    } finally {
      avatarBusy = false;
      if (avaEl) avaEl.classList.remove('busy');
    }
  }

  /* ───────────── Utilidades ───────────── */
  function bindPref(inputEl, key) { inputEl.addEventListener('input', function () { sSet(key, inputEl.value); }); }
  function initialsOf(u) { return initialsFrom(u.name || u.email || 'U'); }
  function initialsFrom(base) {
    base = String(base || 'U').trim();
    const parts = base.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2)).toUpperCase();
  }
  function monthYear(iso) {
    try { return new Date(iso).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); } catch (e) { return ''; }
  }
  function cap(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }
  function brandCloud() {
    return '<svg viewBox="0 0 512 300" width="26" fill="currentColor" aria-hidden="true"><path d="M 505.22 172.06 C 502.62 161.46 496.62 146.51 490.10 137.12 C 483.58 127.74 475.07 121.14 466.12 115.75 C 457.17 110.36 447.52 106.45 436.40 104.80 C 425.28 103.15 408.33 112.53 399.38 105.84 C 390.43 99.15 387.56 74.30 382.70 64.65 C 377.83 55.01 375.83 53.96 370.18 47.97 C 364.53 41.97 358.28 34.85 348.81 28.68 C 339.33 22.51 325.78 14.86 313.35 10.95 C 300.93 7.04 288.59 4.61 274.25 5.21 C 259.91 5.82 242.18 8.69 227.32 14.60 C 212.46 20.51 197.43 29.81 185.09 40.67 C 172.75 51.53 160.93 66.22 153.29 79.77 C 145.64 93.33 140.69 109.40 139.21 122.00 C 137.73 134.60 141.90 147.20 144.42 155.37 C 146.94 163.54 150.25 166.32 154.33 171.01 C 158.41 175.71 160.33 179.27 168.93 183.53 C 177.53 187.79 191.26 194.48 205.95 196.56 C 220.63 198.65 255.30 194.82 257.04 196.04 C 258.78 197.26 228.28 202.38 216.37 203.86 C 204.47 205.34 195.26 205.60 185.61 204.90 C 175.97 204.21 166.84 202.73 158.50 199.69 C 150.16 196.65 141.90 191.78 135.56 186.66 C 129.22 181.53 124.61 176.40 120.44 168.93 C 116.27 161.46 111.75 152.07 110.53 141.82 C 109.32 131.56 110.27 117.40 113.14 107.41 C 116.01 97.41 130.87 86.38 127.74 81.86 C 124.61 77.34 103.67 79.68 94.37 80.29 C 85.07 80.90 80.99 81.51 71.95 85.51 C 62.91 89.50 48.14 98.19 40.15 104.28 C 32.15 110.36 28.33 116.18 23.98 122.00 C 19.64 127.83 16.95 132.52 14.08 139.21 C 11.21 145.90 8.26 154.68 6.78 162.15 C 5.30 169.62 4.26 175.10 5.21 184.05 C 6.17 193.00 8.60 206.21 12.51 215.85 C 16.42 225.50 21.81 234.19 28.68 241.92 C 35.54 249.66 43.27 257.04 53.70 262.26 C 64.13 267.47 78.21 271.82 91.24 273.21 C 104.28 274.60 117.05 273.29 131.91 270.60 C 146.77 267.90 165.28 262.52 180.40 257.04 C 195.52 251.57 204.56 247.48 222.63 237.75 C 240.71 228.02 272.16 207.34 288.85 198.65 C 305.53 189.96 310.40 187.79 322.74 185.61 C 335.08 183.44 353.15 184.40 362.88 185.61 C 372.62 186.83 375.31 189.52 381.13 192.91 C 386.95 196.30 401.55 202.82 397.82 205.95 C 394.08 209.08 376.01 203.51 358.71 211.68 C 341.42 219.85 310.14 244.88 294.06 254.96 C 277.99 265.04 273.90 266.86 262.26 272.16 C 250.61 277.46 235.67 283.29 224.20 286.76 C 212.73 290.24 195.69 291.80 193.43 293.02 C 191.17 294.23 200.47 295.02 210.64 294.06 C 220.81 293.11 241.58 290.85 254.44 287.28 C 267.30 283.72 259.74 275.12 287.80 272.68 C 315.87 270.25 395.12 273.81 422.84 272.68 C 450.56 271.55 445.00 269.38 454.13 265.91 C 463.25 262.43 470.55 258.00 477.59 251.83 C 484.63 245.66 491.67 237.40 496.36 228.89 C 501.05 220.37 504.27 210.21 505.74 200.73 C 507.22 191.26 507.83 182.66 505.22 172.06 Z"/></svg>';
  }

  /* ───────────── Vista principal ───────────── */
  const SETTINGS_TABS = [
    { id: 'general', label: 'Configuración general', icon: SI.cog, render: tabGeneral },
    { id: 'workspace', label: 'Espacio de trabajo', icon: SI.box, render: tabWorkspace },
    { id: 'privacy', label: 'Privacidad y seguridad', icon: SI.shield, render: tabPrivacy },
    { id: 'notifications', label: 'Notificaciones', icon: SI.bell, render: tabNotifications },
    { id: 'team', label: 'Miembros del equipo', icon: SI.team, render: tabTeam },
    { id: 'billing', label: 'Facturación', icon: SI.card, render: tabBilling },
    { id: 'integrations', label: 'Integraciones', icon: SI.link, render: tabIntegrations }
  ];

  function viewSettings() {
    const v = $('#view');
    v.innerHTML = '';
    // Toolbar propia (como el resto de las vistas): flecha para volver + título.
    v.appendChild(pageToolbar({ back: function () { go('dashboard'); }, title: 'Configuración' }));

    const u = window.currentUser;
    if (!state.settingsTab) state.settingsTab = 'general';

    const wrap = el('div', { class: 'set-wrap' });
    wrap.appendChild(el('div', { class: 'set-head' }, [
      el('h1', {}, 'Configuración'),
      el('p', {}, 'Administra tu cuenta, tu espacio de trabajo y tus preferencias.')
    ]));

    // Aún no hay datos del usuario: se cargan del servidor (o se muestra el
    // motivo si falló) en vez de pintar datos de ejemplo.
    if (!u) {
      wrap.appendChild(userPending());
      v.appendChild(wrap);
      return;
    }

    const tabsBar = el('div', { class: 'set-tabs' });
    SETTINGS_TABS.forEach(function (tb) {
      const b = el('button', { class: 'set-tab' + (state.settingsTab === tb.id ? ' active' : ''), type: 'button',
        html: tb.icon + '<span>' + tb.label + '</span>' });
      b.addEventListener('click', function () { state.settingsTab = tb.id; viewSettings(); try { $('#view').scrollTop = 0; } catch (e) {} });
      tabsBar.appendChild(b);
    });
    wrap.appendChild(tabsBar);

    const body = el('div', { class: 'set-body' });
    const tab = SETTINGS_TABS.find(function (t) { return t.id === state.settingsTab; }) || SETTINGS_TABS[0];
    try { tab.render(body, u); } catch (e) { body.appendChild(el('div', { style: { color: 'var(--danger)', padding: '12px' } }, 'Error al cargar esta sección.')); }
    wrap.appendChild(body);
    v.appendChild(wrap);
    // La barra de pestañas se desplaza en horizontal: deja visible la activa
    // (p. ej. Facturación al llegar desde el menú "Plan de pago").
    try {
      const act = tabsBar.querySelector('.set-tab.active');
      if (act) tabsBar.scrollLeft = Math.max(0, act.offsetLeft - tabsBar.offsetLeft - (tabsBar.clientWidth - act.offsetWidth) / 2);
    } catch (e) {}
  }

  function userPending() {
    const err = window.currentUserError;
    if (!err) {
      if (typeof loadCurrentUser === 'function') {
        loadCurrentUser().then(rerenderIfOpen, rerenderIfOpen);
      }
      return skelProfile();
    }
    const noSession = err.status === 401;
    return emptyState(SI.user,
      noSession ? 'Inicia sesión para ver tus ajustes' : 'No se pudo cargar tu información',
      noSession ? 'Tu sesión expiró o no has iniciado sesión.' : 'Revisa tu conexión e inténtalo de nuevo.',
      [
        noSession ? null : btn('Reintentar', 'ghost', function () {
          if (typeof loadCurrentUser !== 'function') return;
          const p = loadCurrentUser(true);   // limpia el error y vuelve a pedir el perfil
          rerenderIfOpen();                  // muestra "Cargando…" mientras tanto
          p.then(function (u) { refreshSidebar(u); rerenderIfOpen(); }, rerenderIfOpen);
        }),
        btn('Iniciar sesión', 'accent', function () { window.location.href = '/login'; })
      ].filter(Boolean));
  }
  function rerenderIfOpen() { if (state.route === 'settings') viewSettings(); }

  window.viewSettings = viewSettings;

})();
