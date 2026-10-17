'use strict';
/* console.js — Consola de API: cambio de pestañas (cURL / JS / Python) y
   botón de copiar. Los fragmentos son código (no se traducen); las
   etiquetas "Copiar/Copiado" sí vienen de i18n. */
(function () {
  var code = document.getElementById('conCode');
  if (!code) return;

  var snips = {
    curl: '<span class="c"># Sube un archivo a un proyecto</span>\n' +
      'curl https://api.nubiflygo.app/v1/projects/argumind/files \\\n' +
      '  -H <span class="s">"Authorization: Bearer $NUBIFLYGO_API_KEY"</span> \\\n' +
      '  -F <span class="s">"file=@jurisprudencia_2026.pdf"</span>',
    js: '<span class="k">import</span> { NubiFlyGo } <span class="k">from</span> <span class="s">"nubiflygo"</span>;\n\n' +
      '<span class="k">const</span> ws = <span class="k">new</span> NubiFlyGo({ apiKey: process.env.NUBIFLYGO_API_KEY });\n\n' +
      '<span class="k">await</span> ws.projects(<span class="s">"argumind"</span>).files.upload({\n' +
      '  file: <span class="s">"jurisprudencia_2026.pdf"</span>,\n});',
    py: '<span class="k">from</span> nubiflygo <span class="k">import</span> NubiFlyGo\n\n' +
      'ws = NubiFlyGo(api_key=os.environ[<span class="s">"NUBIFLYGO_API_KEY"</span>])\n\n' +
      'ws.projects(<span class="s">"argumind"</span>).files.upload(\n' +
      '    file=<span class="s">"jurisprudencia_2026.pdf"</span>,\n)'
  };

  var tabs = document.querySelectorAll('.con-tabs button');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      code.innerHTML = snips[b.dataset.lang];
    });
  });

  function legacyCopy(txt) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  var copyBtn = document.getElementById('conCopy');
  var copyLbl = document.getElementById('conCopyLabel');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var txt = code.textContent;
      function ok() {
        if (!copyLbl) return;
        copyLbl.textContent = t('landing.api.copied');
        setTimeout(function () { copyLbl.textContent = t('landing.api.copy'); }, 1400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(ok).catch(function () { legacyCopy(txt); ok(); });
      } else { legacyCopy(txt); ok(); }
    });
  }
})();
