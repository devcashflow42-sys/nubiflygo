'use strict';
/* console.js — Consola de API: cambio de pestañas (cURL / JS / Python) y
   botón de copiar. Los fragmentos son código (no se traducen); las
   etiquetas "Copiar/Copiado" sí vienen de i18n. */
(function () {
  var code = document.getElementById('conCode');
  if (!code) return;

  // Ejemplos reales de la API: 1) subir el archivo a un proyecto y 2) publicarlo.
  var C = function (t) { return '<span class="c">' + t + '</span>'; };
  var S = function (t) { return '<span class="s">' + t + '</span>'; };
  var K = function (t) { return '<span class="k">' + t + '</span>'; };
  var snips = {
    curl: C('# 1. Sube el archivo a tu proyecto') + '\n' +
      'curl -X POST https://nubiflygo.com/api/v1/files/upload \\\n' +
      '  -H ' + S('"Authorization: Bearer $NUBIFLYGO_API_KEY"') + ' \\\n' +
      '  -F ' + S('"file=@cancion.mp3"') + ' \\\n' +
      '  -F ' + S('"project_id=ID_DEL_PROYECTO"') + '\n\n' +
      C('# 2. Publícalo (usa el "id" de la respuesta)') + '\n' +
      'curl -X PATCH https://nubiflygo.com/api/v1/files/ID_DEL_ARCHIVO \\\n' +
      '  -H ' + S('"Authorization: Bearer $NUBIFLYGO_API_KEY"') + ' \\\n' +
      '  -H ' + S('"Content-Type: application/json"') + ' \\\n' +
      '  -d ' + S("'{\"published\": true}'"),
    js: K('const') + ' API = ' + S("'https://nubiflygo.com/api/v1'") + ';\n' +
      K('const') + ' headers = { Authorization: ' + S('`Bearer ${process.env.NUBIFLYGO_API_KEY}`') + ' };\n\n' +
      C('// 1. Sube el archivo a tu proyecto') + '\n' +
      K('const') + ' form = ' + K('new') + ' FormData();\n' +
      'form.append(' + S("'file'") + ', archivo);' + C(' // tu archivo') + '\n' +
      'form.append(' + S("'project_id'") + ', ' + S("'ID_DEL_PROYECTO'") + ');\n' +
      K('const') + ' res = ' + K('await') + ' fetch(' + S('`${API}/files/upload`') + ', { method: ' + S("'POST'") + ', headers, body: form });\n' +
      K('const') + ' { data } = ' + K('await') + ' res.json();\n\n' +
      C('// 2. Publícalo') + '\n' +
      K('await') + ' fetch(' + S('`${API}/files/${data.item.id}`') + ', {\n' +
      '  method: ' + S("'PATCH'") + ',\n' +
      '  headers: { ...headers, ' + S("'Content-Type'") + ': ' + S("'application/json'") + ' },\n' +
      '  body: JSON.stringify({ published: ' + K('true') + ' })\n});',
    py: K('import') + ' os, requests\n\n' +
      'API = ' + S('"https://nubiflygo.com/api/v1"') + '\n' +
      'headers = {' + S('"Authorization"') + ': ' + S('f"Bearer {os.environ[\'NUBIFLYGO_API_KEY\']}"') + '}\n\n' +
      C('# 1. Sube el archivo a tu proyecto') + '\n' +
      K('with') + ' open(' + S('"cancion.mp3"') + ', ' + S('"rb"') + ') ' + K('as') + ' f:\n' +
      '    r = requests.post(' + S('f"{API}/files/upload"') + ', headers=headers,\n' +
      '                      files={' + S('"file"') + ': f}, data={' + S('"project_id"') + ': ' + S('"ID_DEL_PROYECTO"') + '})\n' +
      'file_id = r.json()[' + S('"data"') + '][' + S('"item"') + '][' + S('"id"') + ']\n\n' +
      C('# 2. Publícalo') + '\n' +
      'requests.patch(' + S('f"{API}/files/{file_id}"') + ', headers=headers, json={' + S('"published"') + ': ' + K('True') + '})'
  };
  code.innerHTML = snips.curl;

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
