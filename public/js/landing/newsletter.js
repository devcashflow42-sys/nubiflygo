'use strict';
/* newsletter.js — Formulario del boletín (sin backend: responde en la propia
   página). El mensaje de confirmación viene de i18n con el correo. */
(function () {
  var form = document.getElementById('newsForm');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = (document.getElementById('newsEmail').value || '').trim();
    var msg = document.getElementById('newsMsg');
    if (email && msg) { msg.textContent = t('landing.footer.newsMsg', { email: email }); form.reset(); }
  });
})();
