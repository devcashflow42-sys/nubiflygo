'use strict';
/* i18n-landing.js — Arranque del idioma en la landing.
   - Aplica los textos estáticos (data-i18n*) del idioma guardado.
   - Monta el selector de idioma en #lang-switch.
   - Resuelve los textos con parámetros (año del pie) y los re-aplica al
     cambiar de idioma.
   Debe cargarse DESPUÉS de languages.js y ANTES del resto de módulos. */
(function () {
  // Textos con parámetros que applyStaticStrings no puede resolver solo.
  function applyParams() {
    var rights = document.getElementById('foot-rights');
    if (rights) rights.textContent = t('landing.footer.rights', { year: new Date().getFullYear() });
  }

  // Idioma inicial: fija <html lang>, rellena data-i18n y título del documento.
  document.documentElement.lang = getLang();
  if (typeof applyStaticStrings === 'function') applyStaticStrings(document);
  applyParams();

  // Sin selector de idioma: el idioma se detecta automáticamente del navegador
  // (y se guarda con la cuenta). Quitamos el contenedor del selector.
  var ls = document.getElementById('lang-switch');
  if (ls) ls.remove();

  // Al cambiar de idioma, applyStaticStrings ya corre dentro de setLanguage;
  // aquí solo hace falta rehacer los textos con parámetros.
  document.addEventListener('languagechange', applyParams);
})();
