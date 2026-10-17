'use strict';
/* reviews.js — Construye el muro de opiniones desde reviews-data.js.
   Reparte las personas en dos filas y duplica cada fila para un
   desplazamiento infinito sin cortes. Se redibuja al cambiar de idioma. */
(function () {
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function card(person, txt) {
    return '<div class="review"><p>' + esc(txt.q) + '</p>' +
      '<div class="reviewer"><div class="avatar">' + esc(person.avatar) + '</div>' +
      '<div><b>' + esc(person.name) + '</b><span>' + esc(txt.role) + '</span></div></div></div>';
  }
  function render() {
    var rowL = document.querySelector('.m-row.left');
    var rowR = document.querySelector('.m-row.right');
    if (!rowL || !rowR || typeof REVIEW_PEOPLE === 'undefined') return;

    var txt = (typeof REVIEW_TEXT !== 'undefined' && REVIEW_TEXT[getLang()]) || REVIEW_TEXT[DEFAULT_LANG];
    var base = REVIEW_TEXT[DEFAULT_LANG];
    var half = Math.ceil(REVIEW_PEOPLE.length / 2);

    function build(start, end) {
      var html = '';
      for (var i = start; i < end; i++) html += card(REVIEW_PEOPLE[i], (txt && txt[i]) || base[i]);
      return html;
    }
    var left = build(0, half);
    var right = build(half, REVIEW_PEOPLE.length);
    rowL.innerHTML = left + left;   // duplicado = bucle continuo
    rowR.innerHTML = right + right;
  }

  render();
  document.addEventListener('languagechange', render);
})();
