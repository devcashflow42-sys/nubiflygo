'use strict';
/* typed.js — Titular con revelado palabra por palabra (gris → sólido, en
   cascada). Las frases vienen del idioma activo (landing.typed). Respeta
   "reducir movimiento" y se reinicia al cambiar de idioma. */
(function () {
  var host = document.getElementById('typed');
  if (!host) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var timers = [], gen = 0;

  function phrases() {
    var p = t('landing.typed');
    return (Array.isArray(p) && p.length) ? p : ['Tu espacio de trabajo, en un lugar.'];
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // Pinta la frase como palabras sueltas (cada una se ilumina por separado).
  function renderWords(text) {
    host.innerHTML = '';
    var words = String(text).split(' ');
    var spans = [];
    words.forEach(function (w, idx) {
      var s = document.createElement('span');
      s.className = 'word';
      s.textContent = w;
      host.appendChild(s);
      spans.push(s);
      if (idx < words.length - 1) host.appendChild(document.createTextNode(' '));
    });
    return spans;
  }

  function start() {
    gen++;
    var my = gen;
    clearTimers();
    var list = phrases();
    var i = 0;

    function show() {
      if (my !== gen) return;
      var spans = renderWords(list[i]);
      if (reduce) { spans.forEach(function (s) { s.classList.add('lit'); }); return; }

      // Revela palabra por palabra (cascada).
      spans.forEach(function (s, k) {
        timers.push(setTimeout(function () { if (my === gen) s.classList.add('lit'); }, 150 * k + 120));
      });
      var allLit = 150 * spans.length + 2000;    // tiempo hasta que todo quede sólido y se sostenga
      // Atenúa de nuevo antes de pasar a la siguiente frase.
      timers.push(setTimeout(function () {
        if (my !== gen) return;
        spans.forEach(function (s) { s.classList.remove('lit'); });
      }, allLit));
      // Siguiente frase.
      timers.push(setTimeout(function () {
        if (my !== gen) return;
        i = (i + 1) % list.length;
        show();
      }, allLit + 700));
    }
    show();
  }

  start();
  document.addEventListener('languagechange', start);
})();
