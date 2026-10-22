'use strict';
/* dom.js — Helpers de DOM y formato: $, el, esc, timeAgo, formatDate, formatBytes. */

  /* ───────────── Helpers ───────────── */
  const $ = s => document.querySelector(s);
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
      else if (k === 'style' && typeof props[k] === 'object') {
        // Las variables CSS (--c, …) solo se aplican con setProperty: asignadas
        // como propiedad normal se ignoran sin avisar (por eso el color del
        // proyecto no se veía en su tarjeta ni en los puntos del menú).
        for (const s in props[k]) {
          if (s.startsWith('--')) n.style.setProperty(s, props[k][s]);
          else n.style[s] = props[k][s];
        }
      }
      else if (props[k] !== null && props[k] !== undefined) n.setAttribute(k, props[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function timeAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return 'ahora';
    if (d < 3600) return Math.floor(d/60) + ' min';
    if (d < 86400) return Math.floor(d/3600) + ' h';
    if (d < 2592000) return Math.floor(d/86400) + ' d';
    return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  }
  function formatDate(ts) {
    return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function formatBytes(b) {
    if (!b) return '0 B';
    const u = ['B','KB','MB','GB']; const i = Math.min(Math.floor(Math.log(b)/Math.log(1024)), u.length-1);
    return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }
