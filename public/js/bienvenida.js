'use strict';
/* bienvenida.js — Los tres pasos que ve una cuenta nueva la primera vez:
     1. qué va a guardar (los mismos 5 tipos con los que la app ordena los archivos),
     2. su cumpleaños,
     3. su perfil (foto y nombre; el correo se muestra pero no se cambia).
   Todo se guarda al final en UNA sola petición (PATCH /account/profile con
   onboarded: true), así no quedan cuentas a medio completar. La foto sí se
   sube en el momento, porque va por su propia ruta.
   La sesión viaja en la cookie httpOnly: aquí no se guarda ningún token. */
(function () {
  var API = '/api/v1';
  var $ = function (s) { return document.querySelector(s); };
  var stepsEl = $('#ob-steps'), countEl = $('#ob-count'), hostEl = $('#ob-step');
  var backBtn = $('#ob-back'), nextBtn = $('#ob-next');
  var TOTAL = 3;

  // Mismos tipos, nombres e iconos que usa la app para clasificar archivos
  // (ver mediaKind en js/media.js y la tarjeta de almacenamiento en js/session.js).
  var KINDS = [
    { id: 'audio', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' },
    { id: 'image', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' },
    { id: 'video', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="15" height="14" rx="2"/><polygon points="22 7 17 11 17 13 22 17 22 7"/></svg>' },
    { id: 'doc',   ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>' },
    { id: 'other', ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' }
  ];
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  var user = null;
  var data = { interests: [], birthday: '', name: '' };
  var step = 1;
  var saving = false;

  /* ---------------- Utilidades ---------------- */
  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'class') n.className = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else if (k.slice(0, 2) === 'on' && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
      else if (props[k] !== null && props[k] !== undefined && props[k] !== false) n.setAttribute(k, props[k]);
    });
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  var toastEl = $('#toast'), toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
  function api(method, path, bodyObj) {
    return fetch(API + path, {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-NubiFly-Client': 'web' },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) { var e = new Error(b.error || t('onboarding.toastError')); e.status = r.status; throw e; }
        return b;
      });
    });
  }
  function initials(name, email) {
    var base = String(name || email || '').trim();
    var parts = base.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (base.slice(0, 2) || '?').toUpperCase();
  }

  /* ---------------- Paso 1 · Gustos ---------------- */
  function stepKinds() {
    var grid = el('div', { class: 'ob-kinds', role: 'group', 'aria-label': t('onboarding.s1Title') });
    KINDS.forEach(function (k, idx) {
      var on = data.interests.indexOf(k.id) > -1;
      var card = el('button', {
        type: 'button', class: 'ob-kind', 'aria-pressed': on ? 'true' : 'false',
        'data-kind': k.id, style: '--k:' + idx,
        onclick: function () { toggleKind(k.id, card); }
      }, [
        el('span', { class: 'tick', html: TICK, 'aria-hidden': 'true' }),
        el('span', { class: 'ic', html: k.ic, 'aria-hidden': 'true' }),
        el('span', { class: 'nm' }, t('onboarding.kinds.' + k.id)),
        el('span', { class: 'ds' }, t('onboarding.kindsHint.' + k.id))
      ]);
      grid.appendChild(card);
    });
    return [
      el('h1', {}, t('onboarding.s1Title')),
      el('p', { class: 'lead' }, t('onboarding.s1Lead')),
      grid,
      el('p', { class: 'err', id: 'ob-err', role: 'alert' }, t('onboarding.s1Hint'))
    ];
  }
  function toggleKind(id, card) {
    var i = data.interests.indexOf(id);
    if (i > -1) data.interests.splice(i, 1); else data.interests.push(id);
    card.setAttribute('aria-pressed', i > -1 ? 'false' : 'true');
    if (data.interests.length) hideError();
  }

  /* ---------------- Paso 2 · Cumpleaños ---------------- */
  function stepBirthday() {
    // Sin fechas futuras ni menores de 13 (el servidor lo vuelve a comprobar).
    var hoy = new Date();
    var max = new Date(Date.UTC(hoy.getUTCFullYear() - 13, hoy.getUTCMonth(), hoy.getUTCDate()));
    var inp = el('input', {
      type: 'date', id: 'ob-bday', value: data.birthday || '',
      min: '1900-01-01', max: max.toISOString().slice(0, 10),
      'aria-describedby': 'ob-err'
    });
    inp.addEventListener('input', function () { data.birthday = inp.value; hideError(); });
    return [
      el('h1', {}, t('onboarding.s2Title')),
      el('p', { class: 'lead' }, t('onboarding.s2Lead')),
      el('div', { class: 'field', style: 'margin-top:22px' }, [
        el('label', { for: 'ob-bday' }, t('onboarding.s2Label')),
        inp,
        el('div', { class: 'err', id: 'ob-err', role: 'alert' }, t('onboarding.s2Error'))
      ])
    ];
  }

  /* ---------------- Paso 3 · Perfil ---------------- */
  function stepProfile() {
    var ava = el('div', { class: 'ob-ava', id: 'ob-ava' });
    paintAvatar(ava);
    var file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: 'hidden', id: 'ob-file' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      file.value = '';
      if (f) pickPhoto(f, ava);
    });
    var acts = el('div', { class: 'ob-photo-acts' }, [
      el('button', { type: 'button', onclick: function () { file.click(); } },
        user && user.avatar_url ? t('onboarding.s3Photo') : t('onboarding.s3PhotoAdd')),
      user && user.avatar_url ? el('button', { type: 'button', class: 'rm', onclick: function () { dropPhoto(ava); } }, t('onboarding.s3PhotoRemove')) : null
    ]);

    var name = el('input', {
      type: 'text', id: 'ob-name', value: data.name || '', maxlength: '80',
      autocomplete: 'name', placeholder: t('onboarding.s3NamePlaceholder')
    });
    name.addEventListener('input', function () { data.name = name.value; hideError(); });

    return [
      el('h1', {}, t('onboarding.s3Title')),
      el('p', { class: 'lead' }, t('onboarding.s3Lead')),
      el('div', { class: 'ob-photo' }, [ava, file, acts]),
      el('div', { class: 'field' }, [
        el('label', { for: 'ob-name' }, t('onboarding.s3Name')),
        name,
        el('div', { class: 'err', id: 'ob-err', role: 'alert' }, t('onboarding.s3NameError'))
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'ob-mail' }, t('onboarding.s3Email')),
        el('input', { type: 'email', id: 'ob-mail', value: (user && user.email) || '', readonly: 'readonly', tabindex: '-1' }),
        el('p', { class: 'hint' }, t('onboarding.s3EmailHint'))
      ])
    ];
  }
  function paintAvatar(ava) {
    ava.textContent = '';
    if (user && user.avatar_url) {
      var img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';       // fotos de Google: sin referer
      img.onerror = function () { ava.textContent = initials(data.name, user && user.email); };
      img.src = user.avatar_url;
      ava.appendChild(img);
    } else {
      ava.textContent = initials(data.name, user && user.email);
    }
  }
  // Mismo recorte que Configuración: cuadrado centrado de 320 px en JPEG.
  var AVATAR_PX = 320, avatarBusy = false;
  function pickPhoto(f, ava) {
    if (avatarBusy) return;
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(f.type)) return toast(t('onboarding.toastPhotoError'));
    if (f.size > 10 * 1024 * 1024) return toast(t('onboarding.toastPhotoError'));
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = c.height = AVATAR_PX;
        var x = c.getContext('2d');
        x.fillStyle = '#fff';                                   // PNG con transparencia
        x.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
        var s = Math.max(AVATAR_PX / img.width, AVATAR_PX / img.height);
        var w = img.width * s, h = img.height * s;
        x.drawImage(img, (AVATAR_PX - w) / 2, (AVATAR_PX - h) / 2, w, h);
        sendPhoto(c.toDataURL('image/jpeg', 0.86), ava);
      };
      img.onerror = function () { toast(t('onboarding.toastPhotoError')); };
      img.src = fr.result;
    };
    fr.onerror = function () { toast(t('onboarding.toastPhotoError')); };
    fr.readAsDataURL(f);
  }
  function sendPhoto(dataUrl, ava) {
    avatarBusy = true; ava.classList.add('busy');
    api('POST', '/account/avatar', { image: dataUrl })
      .then(function (d) {
        if (d && d.user) user = d.user;
        paintAvatar(ava);
        toast(t('onboarding.toastPhoto'));
        render();                                   // el botón pasa a «Cambiar foto»
      })
      .catch(function (e) { toast(e.message || t('onboarding.toastPhotoError')); })
      .then(function () { avatarBusy = false; ava.classList.remove('busy'); });
  }
  function dropPhoto(ava) {
    if (avatarBusy) return;
    avatarBusy = true; ava.classList.add('busy');
    fetch(API + '/account/avatar', { method: 'DELETE', credentials: 'same-origin', headers: { 'X-NubiFly-Client': 'web' } })
      .then(function (r) {
        // Solo se quita de la pantalla si el servidor la quitó de verdad.
        if (!r.ok) throw new Error('avatar');
        if (user) user.avatar_url = null; paintAvatar(ava); render();
      })
      .catch(function () { toast(t('onboarding.toastPhotoError')); })
      .then(function () { avatarBusy = false; ava.classList.remove('busy'); });
  }

  /* ---------------- Pasos, avance y validación ---------------- */
  function showError(msg) {
    var e = $('#ob-err');
    if (!e) return;
    if (msg) e.textContent = msg;
    e.style.display = 'block';
    var f = e.closest('.field');
    if (f) { f.classList.add('has-error', 'shake'); setTimeout(function () { f.classList.remove('shake'); }, 500); }
  }
  function hideError() {
    var e = $('#ob-err');
    if (!e) return;
    e.style.display = '';
    var f = e.closest('.field');
    if (f) f.classList.remove('has-error');
  }
  function valid() {
    if (step === 1) return data.interests.length > 0;
    if (step === 2) {
      var v = (data.birthday || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      var d = new Date(v + 'T00:00:00Z');
      if (!isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
      if (Number(v.slice(0, 4)) < 1900) return false;
      var ms = Date.now() - d.getTime();
      return ms >= 0 && ms / (365.2425 * 24 * 3600 * 1000) >= 13;
    }
    return String(data.name || '').trim().length >= 2;
  }
  function render() {
    hostEl.textContent = '';
    (step === 1 ? stepKinds() : step === 2 ? stepBirthday() : stepProfile())
      .forEach(function (n) { hostEl.appendChild(n); });
    hideError();
    Array.prototype.forEach.call(stepsEl.children, function (s, i) { s.classList.toggle('on', i < step); });
    stepsEl.setAttribute('aria-valuenow', String(step));
    countEl.textContent = t('onboarding.stepOf', { n: step, total: TOTAL });
    backBtn.hidden = step === 1;
    nextBtn.textContent = step === TOTAL ? t('onboarding.finish') : t('onboarding.next');
    // El foco va al título del paso: quien usa teclado o lector de pantalla
    // sabe dónde está sin tener que buscarlo.
    var h = hostEl.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  function go(n) { step = Math.min(TOTAL, Math.max(1, n)); render(); }

  function next() {
    if (saving) return;
    if (!valid()) return showError();
    if (step < TOTAL) return go(step + 1);
    finish();
  }
  function finish() {
    saving = true;
    nextBtn.disabled = true;
    backBtn.disabled = true;
    api('PATCH', '/account/profile', {
      name: String(data.name || '').trim(),
      interests: data.interests,
      birthday: data.birthday,
      onboarded: true
    })
      .then(function () { location.replace('/main'); })
      .catch(function (e) {
        saving = false;
        nextBtn.disabled = false;
        backBtn.disabled = false;
        toast(e.message || t('onboarding.toastError'));
      });
  }

  var outBtn = $('#ob-logout');
  if (outBtn) outBtn.addEventListener('click', function () {
    outBtn.disabled = true;
    api('POST', '/account/logout')
      .catch(function () {})
      .then(function () { location.replace('/login'); });
  });

  nextBtn.addEventListener('click', next);
  backBtn.addEventListener('click', function () { if (!saving) go(step - 1); });
  // Enter avanza (en los campos de texto y fecha, no en las tarjetas de gustos:
  // ahí la barra espaciadora y Enter sirven para marcarlas).
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || ev.defaultPrevented) return;
    var tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT') { ev.preventDefault(); next(); }
  });

  /* ---------------- Arranque ---------------- */
  // Quién entra aquí: solo una cuenta de verdad a la que le falta completarla.
  // Sin sesión → al acceso. Invitado o ya completada → a la app. Son casos
  // excluyentes del rebote que hace la app, así que no hay bucle.
  fetch(API + '/account/profile', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-NubiFly-Client': 'web' } })
    .then(function (r) {
      if (r.status === 401) { location.replace('/login'); throw new Error('sin sesión'); }
      if (!r.ok) throw new Error('perfil');
      return r.json();
    })
    .then(function (d) {
      user = (d && d.user) || null;
      if (!user) throw new Error('perfil');
      // Lo contrario que la app: si ya está completa (o el campo no llega, con
      // un servidor antiguo) se entra a la app. Nunca los dos a la vez.
      if (user.is_guest || user.onboarded_at !== null) { location.replace('/main'); return; }
      data.name = user.name || '';
      data.birthday = user.birthday || '';
      data.interests = Array.isArray(user.interests) ? user.interests.slice() : [];
      if (typeof applyStaticStrings === 'function') applyStaticStrings();
      if (user.language && typeof setLanguage === 'function' && typeof getLang === 'function' && getLang() !== user.language) {
        setLanguage(user.language);
      }
      document.title = t('onboarding.docTitle');
      render();
    })
    .catch(function (e) {
      if (/sesión/.test(e.message)) return;      // ya se fue al acceso
      toast(t('onboarding.toastError'));
    });
})();
