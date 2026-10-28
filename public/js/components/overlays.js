'use strict';
/* components/overlays.js — Capas: toast, modal, popup, BottomSheet (sheet/openFormSheet), segmented, confirmDialog. */

  /* ───────────── Toast ───────────── */
  function toast(msg) {
    const t = el('div', { class: 'toast' }, msg);
    $('#toast-root').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, 2200);
    setTimeout(() => t.remove(), 2600);
  }

  /* ───────────── Modal ───────────── */
  let modalSeq = 0;
  function modal(opts) {
    const root = $('#modal-root');
    root.innerHTML = '';
    const foot = el('div', { class: 'modal-foot' });
    // El vaciado diferido solo borra ESTA ventana: si al cerrarla se abre otra
    // (p. ej. derechos de autor → compartir), la nueva no desaparece.
    const seq = ++modalSeq;
    // opts.onClose: se llama al cerrar de cualquier forma (botón, ✕ o clic fuera).
    const close = () => {
      if (seq !== modalSeq) return;
      root.classList.remove('show');
      setTimeout(() => { if (seq === modalSeq) root.innerHTML = ''; }, 150);
      if (opts.onClose) { const f = opts.onClose; opts.onClose = null; f(); }
    };

    (opts.actions || [{ label: t('common.close'), kind: 'ghost', onClick: close }]).forEach(a => {
      const b = el('button', {
        class: 'btn btn-' + (a.kind || 'ghost'),
        type: 'button',
        onclick: async () => {
          if (a.onClick) { const r = a.onClick(close); if (r === false) return; }
          if (!a.keepOpen) close();
        }
      }, a.label);
      foot.appendChild(b);
    });

    const m = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'modal-head' }, [
        el('h3', {}, opts.title),
        el('button', { class: 'icon-btn', onclick: close, 'aria-label': t('common.close'), html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' })
      ]),
      el('div', { class: 'modal-body' }, opts.body),
      foot
    ]);
    root.appendChild(m);
    root.classList.add('show');

    root.onclick = (e) => { if (e.target === root) close(); };
    setTimeout(() => {
      const first = m.querySelector('input, textarea, select');
      if (first) first.focus();
    }, 20);
    return { close, el: m };
  }
  /* ───────────── Popup menu (dropdown) ───────────── */
  let _popupClose = null;
  function popup(evt, items) {
    evt.stopPropagation();
    if (_popupClose) _popupClose();
    const anchor = evt.currentTarget;
    const r = anchor.getBoundingClientRect();
    const p = el('div', { class: 'popup', id: 'popup' });
    items.forEach(it => {
      if (it === '-') { p.appendChild(el('div', { class: 'popup-sep' })); return; }
      p.appendChild(el('button', {
        type: 'button',
        class: 'popup-item' + (it.danger ? ' danger' : ''),
        onclick: () => { close(); setTimeout(() => it.onClick && it.onClick(), 10); }
      }, [
        el('span', { html: it.icon || '', style: { display: 'inline-flex' } }),
        it.label
      ]));
    });
    document.body.appendChild(p);

    // Position: below anchor, right-aligned, kept inside the viewport
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    let top = r.bottom + 6;
    let left = Math.min(r.right - pw, window.innerWidth - pw - 12);
    if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 6);
    left = Math.max(12, left);
    p.style.top = top + 'px';
    p.style.left = left + 'px';

    const close = () => {
      if (p.parentNode) p.remove();
      document.removeEventListener('click', onOutside, true);
      window.removeEventListener('resize', close);
      _popupClose = null;
    };
    const onOutside = (e) => { if (!p.contains(e.target)) close(); };
    _popupClose = close;
    setTimeout(() => {
      document.addEventListener('click', onOutside, true);
      window.addEventListener('resize', close);
    }, 10);
  }

  /* ───────────── BottomSheet ───────────── */
  function sheet(title, items) {
    const root = $('#sheet-root');
    root.innerHTML = '';
    const close = () => {
      root.classList.remove('show');
      setTimeout(() => root.innerHTML = '', 180);
    };
    const content = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'sheet-handle' }),
      title ? el('div', { class: 'sheet-title' }, title) : null,
      ...items.filter(Boolean).map(it => el('button', {
        type: 'button',
        class: 'sheet-item' + (it.danger ? ' danger' : ''),
        onclick: () => { close(); setTimeout(() => it.onClick && it.onClick(), 160); }
      }, [
        el('span', { html: it.icon || '', style: { display: 'inline-flex' } }),
        it.label
      ])),
      el('button', { type: 'button', class: 'sheet-cancel', onclick: close }, t('common.cancel'))
    ].filter(Boolean));
    root.appendChild(content);
    root.classList.add('show');
    root.onclick = (e) => { if (e.target === root) close(); };
    return { close };
  }

  /* BottomSheet con formulario (p. ej. crear API key) */
  function openFormSheet(opts) {
    const root = $('#sheet-root');
    root.innerHTML = '';
    const close = () => { root.classList.remove('show'); setTimeout(() => root.innerHTML = '', 180); };

    const foot = el('div', { class: 'sheet-form-foot' });
    (opts.actions || []).forEach(a => {
      foot.appendChild(el('button', {
        class: 'btn btn-' + (a.kind || 'ghost'), type: 'button',
        onclick: async () => {
          if (a.onClick) { const r = a.onClick(close); if (r === false) return; }
          if (!a.keepOpen) close();
        }
      }, a.label));
    });

    const content = el('div', { class: 'sheet sheet--form', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'sheet-handle' }),
      el('div', { class: 'sheet-form-head' }, [
        el('h3', {}, opts.title),
        el('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close, html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' })
      ]),
      el('div', { class: 'sheet-form-body' }, opts.body),
      foot
    ]);
    root.appendChild(content);
    root.classList.add('show');
    root.onclick = (e) => { if (e.target === root) close(); };
    setTimeout(() => { const f = content.querySelector('input, select, textarea'); if (f) f.focus(); }, 30);
    return { close, el: content };
  }

  /* Control segmentado reutilizable (Todo | Restringido, niveles…) */
  function segmented(options, value, onChange, extraClass) {
    const wrap = el('div', { class: 'seg' + (extraClass ? ' ' + extraClass : '') });
    function paint() {
      wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === value)));
    }
    options.forEach(o => {
      wrap.appendChild(el('button', {
        type: 'button', 'data-val': o.val,
        onclick: () => { value = o.val; paint(); onChange(value); }
      }, o.label));
    });
    paint();
    return { el: wrap, get: () => value };
  }

  /* Grupo de chips de selección ÚNICA (radio) — para opciones con estilo propio
     en vez del desplegable nativo (p. ej. vencimiento de una clave). */
  function radioChips(options, value, onChange) {
    const wrap = el('div', { class: 'chips' });
    function paint() {
      wrap.querySelectorAll('button').forEach(b => {
        const on = b.dataset.val === value;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    options.forEach(o => {
      wrap.appendChild(el('button', {
        type: 'button', class: 'chip', 'data-val': o.val,
        onclick: () => { value = o.val; paint(); onChange && onChange(value); }
      }, o.label));
    });
    paint();
    return { el: wrap, get: () => value };
  }

  function confirmDialog(title, text, danger) {
    return new Promise(resolve => {
      modal({
        title,
        body: el('p', { style: { margin: '0', color: 'var(--fg-muted)', lineHeight: '1.5' } }, text),
        actions: [
          { label: t('common.cancel'), kind: 'ghost', onClick: () => resolve(false) },
          { label: danger || t('common.confirm'), kind: danger ? 'danger' : 'primary', onClick: () => resolve(true) }
        ]
      });
    });
  }

  /* ───────────── Bloqueo del scroll de fondo ─────────────
     Mientras haya un diálogo, BottomSheet o visor abierto, lo de atrás no se
     desplaza (ni la ventana en móvil ni el panel central en escritorio). Se
     detecta solo, observando las capas, así vale para todos los diálogos. */
  (function () {
    let locked = false, savedY = 0;
    function anyOverlay() {
      const m = document.getElementById('modal-root'), s = document.getElementById('sheet-root');
      return (m && m.classList.contains('show')) || (s && s.classList.contains('show')) ||
        !!document.querySelector('.mviewer, .img-viewer');
    }
    function setLock(on) {
      if (on === locked) return;
      locked = on;
      const html = document.documentElement, body = document.body;
      if (on) {
        savedY = window.scrollY || 0;
        body.style.top = -savedY + 'px';
        html.classList.add('scroll-lock');
      } else {
        html.classList.remove('scroll-lock');
        body.style.top = '';
        window.scrollTo(0, savedY);
      }
    }
    function check() { setLock(anyOverlay()); }
    function start() {
      const mo = new MutationObserver(check);
      ['modal-root', 'sheet-root'].forEach(id => { const n = document.getElementById(id); if (n) mo.observe(n, { attributes: true, attributeFilter: ['class'] }); });
      mo.observe(document.body, { childList: true });
      check();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  })();
