'use strict';
/* share.js — Página pública de un archivo compartido (/s/<token>).
   Muestra la vista previa, el nombre, el tamaño, quién lo compartió y el botón
   de descarga. Si el visitante no tiene sesión, ofrece crear una cuenta. */
(function () {
  const $ = (s) => document.querySelector(s);
  const card = $('#sh-card'), nav = $('#sh-nav');
  const token = (location.pathname.match(/^\/s\/([A-Za-z0-9]{22})\/?$/) || [])[1];
  $('#sh-year').textContent = new Date().getFullYear();

  const ICON = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    disk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    broken: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>'
  };

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    [].concat(kids || []).forEach(c => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  }
  function bytes(b) {
    if (!b) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0).replace('.0', '') + ' ' + u[i];
  }
  const ext = (name) => ((String(name).match(/\.([a-z0-9]{1,6})$/i) || [])[1] || 'ARCHIVO').toUpperCase();
  const day = (d) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  function toast(msg) {
    const t = el('div', { class: 'sh-toast', role: 'status' }, msg);
    document.body.append(t); setTimeout(() => t.remove(), 2400);
  }

  function preview(d) {
    const p = d.preview, f = d.file, m = f.media || {};
    const box = el('div', { class: 'sh-preview' });
    if (p && p.kind === 'image') box.append(el('img', { class: 'sh-img', src: p.url, alt: f.name }));
    else if (p && p.kind === 'video') box.append(el('video', { src: p.url, controls: true, playsinline: true, preload: 'metadata' }));
    else if (p && p.kind === 'audio') {
      // Con portada: la imagen ocupa todo el espacio y el reproductor va encima, abajo.
      box.append(el('div', { class: 'sh-audio' + (d.cover_url ? ' has-cover' : '') }, [
        d.cover_url ? el('img', { class: 'sh-cover-full', src: d.cover_url, alt: '' }) : el('div', { class: 'sh-cover', html: ICON.music }),
        el('div', { class: 'sh-audio-bar' }, [ el('audio', { src: p.url, controls: true, preload: 'metadata' }) ])
      ]));
    } else if (p && p.kind === 'text') {
      const pre = el('pre', {}, 'Cargando vista previa…');
      box.append(pre);
      fetch(p.url).then(r => r.text()).then(t => { pre.textContent = t.length > 20000 ? t.slice(0, 20000) + '\n…' : t; }).catch(() => { pre.textContent = 'No se pudo cargar la vista previa.'; });
    } else {
      box.append(el('div', { class: 'sh-icon' }, [
        el('div', { class: 'sh-icon-box', html: ICON.file }, [ el('span', { class: 'sh-ext' }, ext(f.name)) ]),
        el('span', { style: 'margin-top:14px;font-size:13px' }, p && p.kind === 'pdf' ? 'Documento PDF' : 'Vista previa no disponible para este tipo de archivo')
      ]));
    }
    return box;
  }

  function render(d) {
    const f = d.file, m = f.media || {};
    document.title = f.name + ' · NubiFlyGo';
    const title = m.title && /^audio\//.test(f.mime) ? m.title + (m.artist ? ' — ' + m.artist : '') : f.name;
    const initials = String(d.owner.name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    const copy = el('button', { class: 'sh-btn', type: 'button', html: ICON.link + ' Copiar enlace',
      onclick: () => navigator.clipboard.writeText(location.href).then(() => toast('Enlace copiado'), () => toast(location.href)) });
    const row = [copy];
    if (d.preview && d.preview.kind === 'pdf') row.unshift(el('a', { class: 'sh-btn', href: d.preview.url, target: '_blank', rel: 'noopener', html: ICON.eye + ' Ver PDF' }));
    card.innerHTML = '';
    card.append(
      preview(d),
      el('div', { class: 'sh-info' }, [
        el('h1', { class: 'sh-name' }, title),
        el('div', { class: 'sh-meta' }, [
          el('span', { html: ICON.disk + ' ' + bytes(f.size) }),
          el('span', {}, ext(f.name)),
          d.expires_at ? el('span', { html: ICON.clock + ' Disponible hasta el ' + day(d.expires_at) }) : null
        ]),
        el('div', { class: 'sh-owner' }, [
          el('span', { class: 'sh-avatar' }, initials || '?'),
          el('span', {}, [ 'Compartido por ', el('strong', {}, d.owner.name), ' · ' + day(d.shared_at) ])
        ]),
        el('div', { class: 'sh-actions' }, [
          downloadButton(d),
          el('div', { class: 'sh-row' }, row)
        ]),
        el('p', { class: 'sh-note' }, 'Descarga solo archivos de personas en quienes confías.')
      ])
    );
  }

  /* Descarga con progreso: lee el archivo por partes y muestra cuánto va.
     Archivos muy grandes (o navegadores sin streams) usan la descarga normal. */
  const STREAM_MAX = 1024 * 1024 * 1024;   // 1 GB
  function downloadButton(d) {
    const f = d.file, label = ICON.download + ' Descargar (' + bytes(f.size) + ')';
    const fill = el('span', { class: 'sh-dl-fill', 'aria-hidden': 'true' });
    const txt = el('span', { class: 'sh-dl-txt', html: label });
    const a = el('a', { class: 'sh-btn sh-btn-dark sh-btn-lg sh-dl', href: d.download_url, download: f.name }, [ fill, txt ]);
    let busy = false;
    a.addEventListener('click', async (e) => {
      if (!window.ReadableStream || !window.fetch || f.size > STREAM_MAX) return;   // descarga normal
      e.preventDefault();
      if (busy) return;
      busy = true; a.classList.add('is-loading'); a.setAttribute('aria-busy', 'true');
      const paint = (got) => {
        const total = f.size || 0, pct = total ? Math.min(100, Math.round(got / total * 100)) : 0;
        fill.style.width = pct + '%';
        txt.textContent = 'Descargando ' + pct + '% · ' + bytes(got).replace(/ [KMGT]?B$/, '') + ' / ' + bytes(total);
      };
      let saved = false;   // ya se entregó el archivo: no repetir la descarga si algo falla después
      try {
        paint(0);
        const res = await fetch(d.download_url, { credentials: 'omit' });
        if (!res.ok || !res.body) throw new Error('http ' + res.status);
        const reader = res.body.getReader(), parts = [];
        let got = 0, last = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); got += value.length;
          const now = performance.now();
          if (now - last > 80) { paint(got); last = now; }
        }
        paint(got || f.size);
        const url = URL.createObjectURL(new Blob(parts, { type: f.mime || 'application/octet-stream' }));
        const tmp = el('a', { href: url, download: f.name, style: 'display:none' });
        document.body.append(tmp); tmp.click(); tmp.remove(); saved = true;
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        a.classList.add('is-done');
        txt.innerHTML = ICON.check + ' Descarga completa';
        toast('Descarga completa: ' + f.name);
      } catch (er) {
        if (!saved) {
          toast('No se pudo descargar con progreso; iniciando descarga normal…');
          location.href = d.download_url;
        }
        txt.innerHTML = label;
      } finally {
        busy = false; a.classList.remove('is-loading'); a.removeAttribute('aria-busy');
        setTimeout(() => { if (!busy) { a.classList.remove('is-done'); fill.style.width = '0%'; txt.innerHTML = label; } }, 3500);
      }
    });
    return a;
  }

  function fail(title, msg) {
    document.title = 'Enlace no disponible · NubiFlyGo';
    card.innerHTML = '';
    card.append(el('div', { class: 'sh-error' }, [
      el('div', { class: 'sh-error-ico', html: ICON.broken }),
      el('h1', {}, title),
      el('p', {}, msg),
      el('a', { class: 'sh-btn', href: '/', style: 'margin-top:8px' }, 'Ir a NubiFlyGo')
    ]));
  }

  // Cuenta: con sesión → "Ir a mi espacio"; sin sesión → iniciar sesión / crear cuenta.
  fetch('/api/v1/account/profile', { credentials: 'same-origin', headers: { 'X-NubiFly-Client': 'web' } })
    .then(r => (r.ok ? r.json() : null)).catch(() => null)
    .then(d => {
      const u = d && d.user;
      nav.innerHTML = '';
      if (u) nav.append(el('a', { class: 'sh-btn sh-btn-dark', href: '/main' }, 'Ir a mi espacio'));
      else {
        nav.append(el('a', { class: 'sh-btn sh-hide-sm', href: '/login' }, 'Iniciar sesión'), el('a', { class: 'sh-btn sh-btn-dark', href: '/login' }, 'Crear cuenta gratis'));
        $('#sh-promo').hidden = false;
      }
    });

  if (!token) { fail('Enlace no válido', 'Revisa que hayas copiado el enlace completo.'); return; }
  fetch('/api/v1/public/shares/' + token, { credentials: 'omit' })
    .then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => ok ? render(d) : fail('Este enlace ya no está disponible', d.error || 'Puede que el dueño haya dejado de compartir el archivo o que lo haya eliminado.'))
    .catch(() => fail('No se pudo cargar el archivo', 'Revisa tu conexión e inténtalo de nuevo.'));
})();
