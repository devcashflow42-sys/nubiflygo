'use strict';
/* main.js — Arranque de la landing (main.html).
   Los módulos (typed, console, pricing, reviews, newsletter) se autoinician
   al cargarse en orden; aquí queda lo global que no depende del idioma:
   la duplicación de la marquesina de logos para el bucle continuo. */
(function () {
  var track = document.querySelector('.logo-track');
  if (track) track.innerHTML += track.innerHTML;
})();
