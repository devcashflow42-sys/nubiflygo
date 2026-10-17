'use strict';
/* pricing.js — Selector de moneda (MXN / USD) y selección de plan.
   Los importes viven en atributos data-mxn / data-usd del HTML; aquí solo
   se alterna cuál se muestra y se resalta la tarjeta elegida. */
(function () {
  /* Un segundo toque o un toque fuera devuelve la tarjeta a su estado inicial. */
  (function () {
    var plans = document.querySelectorAll('.price-grid .plan');
    if (!plans.length) return;
    function clearAll() { plans.forEach(function (x) { x.classList.remove('selected'); x.setAttribute('aria-selected', 'false'); }); }
    plans.forEach(function (p) {
      p.setAttribute('tabindex', '0');
      p.setAttribute('role', 'option');
      p.setAttribute('aria-selected', 'false');
      p.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var wasSelected = p.classList.contains('selected');
        clearAll();
        if (!wasSelected) { p.classList.add('selected'); p.setAttribute('aria-selected', 'true'); }
      });
      p.addEventListener('keydown', function (e) {
        if (e.target !== p || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault(); p.click();
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.price-grid .plan')) clearAll();
    });
  })();

  /* Selector de moneda. */
  (function () {
    var btns = document.querySelectorAll('.cur-toggle button');
    if (!btns.length) return;
    var amounts = document.querySelectorAll('.price .amount');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var cur = b.dataset.cur;
        btns.forEach(function (x) { x.classList.toggle('active', x === b); });
        amounts.forEach(function (a) {
          var v = a.getAttribute('data-' + cur);
          if (v !== null) a.textContent = v;
        });
      });
    });
  })();
})();
