'use strict';
/* motion.js — Movimiento de la landing al hacer scroll.
   · Estado del scroll: una sola lectura por cuadro (requestAnimationFrame).
     Marca la sección activa del menú y da al hero una salida suave (sube y
     se desvanece) con su fondo en paralaje.
   · Revelado: cada bloque entra una sola vez con su propio efecto (subir,
     barrido del título, consola en 3D, banda que se expande). Los que entran
     juntos se escalonan en el orden de la página. Al terminar se quitan las
     clases, así el elemento recupera sus transiciones de hover normales.
   · Íconos de Funciones: el trazo se dibuja al aparecer la tarjeta.
   · Tarjetas: un brillo suave sigue al puntero (solo con ratón).
   Con "reducir movimiento" no se anima nada y todo se ve desde el inicio. */
(function () {
  var root = document.documentElement;
  var nav = document.querySelector('header.nav');
  var hero = document.querySelector('.hero');
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
  var sections = links.map(function (link) {
    return { link: link, target: document.getElementById(link.getAttribute('href').slice(1)) };
  }).filter(function (entry) { return entry.target; });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var queued = false;
  var heroH = 0;

  function measure() { heroH = hero ? hero.offsetHeight + hero.offsetTop : 0; }

  function updateScrollState() {
    queued = false;
    var y = window.scrollY || window.pageYOffset || 0;
    if (nav) nav.classList.toggle('is-scrolled', y > 12);
    var current = null;
    var offset = (nav ? nav.getBoundingClientRect().height : 0) + 110;
    sections.forEach(function (entry) {
      if (entry.target.getBoundingClientRect().top <= offset) current = entry;
    });
    sections.forEach(function (entry) {
      if (entry === current) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    });
    if (reduce) return;
    // Salida del hero: solo mientras está en pantalla.
    if (hero && heroH) {
      var p = Math.min(1, Math.max(0, y / heroH));
      if (p < 1 || hero.style.getPropertyValue('--hero-p') !== '1') hero.style.setProperty('--hero-p', p.toFixed(4));
    }
  }
  function queueScrollState() {
    if (!queued) { queued = true; window.requestAnimationFrame(updateScrollState); }
  }
  measure();
  window.addEventListener('scroll', queueScrollState, { passive: true });
  window.addEventListener('resize', function () { measure(); queueScrollState(); }, { passive: true });
  window.addEventListener('load', function () { measure(); queueScrollState(); }, { once: true });
  updateScrollState();

  if (reduce || !('IntersectionObserver' in window)) return;
  root.classList.add('motion-on');

  /* ---------- Revelado al hacer scroll ---------- */
  // [selector, efecto]. up: sube · mask: barrido del título · track: el
  // rótulo se cierra · left/side: entra de lado (la consola, en 3D) ·
  // expand: la banda final crece desde el centro · line: la línea superior se dibuja.
  var GROUPS = [
    ['.sec-head .eyebrow, .api-copy .eyebrow', 'track'],
    ['.sec-head h2, .api-copy h2', 'mask'],
    ['.sec-head .lead, .api-copy .lead, .api-list li, #reviews .rev-desc', 'up'],
    ['#features .card', 'up'],
    ['#api .console', 'side'],
    ['.why-item', 'line'],
    ['#reviews .marquee', 'up'],
    ['#pricing .cur-wrap, #pricing .plan, #pricing .price-note', 'up'],
    ['#faq details', 'up'],
    ['#cta .cta-band', 'expand']
  ];
  var STEP = 90;          // ms entre elementos que entran juntos
  var MAX_STEPS = 5;

  var watchers = new Map();   // nodo observado → elementos que revela
  GROUPS.forEach(function (g) {
    Array.prototype.forEach.call(document.querySelectorAll(g[0]), function (el) {
      // Lo que ya se ve al cargar no se anima (evita parpadeos).
      if (el.getBoundingClientRect().top < window.innerHeight * .92) return;
      el.classList.add('rv', 'rv-' + g[1], 'rv-pending');
      // Un elemento recortado (clip-path) no «entra» nunca para el observador:
      // se vigila a su contenedor, que no se recorta.
      var watch = g[1] === 'mask' ? el.parentElement : el;
      if (!watchers.has(watch)) watchers.set(watch, []);
      watchers.get(watch).push(el);
    });
  });

  function finish(el) {
    if (!el.classList.contains('rv')) return;
    el.classList.remove('rv', 'rv-pending', 'rv-in');
    el.className = el.className.replace(/\brv-[a-z]+\b/g, '').trim();
    el.style.removeProperty('--rv-d');
  }

  // Al saltar de golpe (enlace del menú, tecla Fin) lo que queda arriba sin
  // haber entrado se muestra al instante, sin animación.
  function skipPassed() {
    if (!watchers.size) return;
    var top = (nav ? nav.getBoundingClientRect().bottom : 0);
    watchers.forEach(function (els, watch) {
      if (watch.getBoundingClientRect().bottom > top) return;
      observer.unobserve(watch);
      watchers.delete(watch);
      els.forEach(function (el) { finish(el); clearIcon(el); });
    });
  }
  window.addEventListener('scroll', function () { window.requestAnimationFrame(skipPassed); }, { passive: true });

  var observer = new IntersectionObserver(function (entries) {
    // Los que entran en el mismo cuadro se escalonan en el orden de la página.
    var batch = [];
    entries.forEach(function (e) {
      if (!e.isIntersecting || !watchers.has(e.target)) return;
      observer.unobserve(e.target);
      batch = batch.concat(watchers.get(e.target));
      watchers.delete(e.target);
    });
    batch.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    batch.forEach(function (el, i) {
      var delay = Math.min(i, MAX_STEPS) * STEP;
      el.style.setProperty('--rv-d', delay + 'ms');
      el.classList.remove('rv-pending');
      el.classList.add('rv-in');
      drawIcon(el, delay);
      var done = false;
      var end = function (ev) {
        if (done || (ev && (ev.target !== el || ev.propertyName !== 'opacity'))) return;
        done = true;
        el.removeEventListener('transitionend', end);
        // La línea de «Por qué» termina después del texto.
        setTimeout(function () { finish(el); }, el.classList.contains('rv-line') ? 500 : 0);
      };
      el.addEventListener('transitionend', end);
      setTimeout(end, delay + 1600);   // por si transitionend no llega
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  watchers.forEach(function (els, watch) { observer.observe(watch); });

  /* ---------- Íconos de Funciones: trazo que se dibuja ---------- */
  var SHAPES = 'path, circle, rect, ellipse, line, polyline, polygon';
  Array.prototype.forEach.call(document.querySelectorAll('#features .card.rv .ic-lg svg'), function (svg) {
    Array.prototype.forEach.call(svg.querySelectorAll(SHAPES), function (s) {
      s.setAttribute('pathLength', '1');
      s.classList.add('draw');
    });
  });
  function drawIcon(card, delay) {
    var shapes = card.querySelectorAll('.ic-lg .draw');
    if (!shapes.length) return;
    Array.prototype.forEach.call(shapes, function (s, i) {
      s.style.setProperty('--draw-d', (delay + 180 + i * 90) + 'ms');
      s.classList.add('drawn');
    });
    setTimeout(function () { clearIcon(card); }, delay + 180 + shapes.length * 90 + 1100);
  }
  function clearIcon(card) {
    Array.prototype.forEach.call(card.querySelectorAll('.ic-lg .draw'), function (s) {
      s.removeAttribute('pathLength');
      s.classList.remove('draw', 'drawn');
      s.style.removeProperty('--draw-d');
    });
  }

  /* ---------- Brillo que sigue al puntero (solo con ratón) ---------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    Array.prototype.forEach.call(document.querySelectorAll('#features .card'), function (card) {
      card.classList.add('spot');
      card.addEventListener('pointermove', function (ev) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
        card.style.setProperty('--my', (ev.clientY - r.top) + 'px');
      }, { passive: true });
    });
  }
})();
