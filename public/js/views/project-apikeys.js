'use strict';
/* views/project-apikeys.js — Pestaña "API key" del proyecto: análisis de solicitudes
   y claves secretas propias del proyecto (crear vía BottomSheet, revocar, uso). */

  // Tipos de archivo que una clave puede publicar.
  const FILE_TYPES = [
    { val: 'all',      label: 'Todos' },
    { val: 'image',    label: 'Imágenes' },
    { val: 'document', label: 'Documentos' },
    { val: 'video',    label: 'Videos' },
    { val: 'audio',    label: 'Audio' }
  ];
  const PERM_LABEL = { all: 'Todo', read: 'Solo lectura', write: 'Escritura', none: 'Sin lectura' };

  function fileTypeLabels(arr) {
    if (!arr || !arr.length || arr.includes('all')) return 'Todos los archivos';
    return arr.map(t => (FILE_TYPES.find(f => f.val === t) || {}).label || t).join(', ');
  }

  /* ─── Pestaña API key del proyecto ───
     Tarjeta de bienvenida, una tarjeta por clave (estado, clave oculta, permisos,
     solicitudes del mes con su gráfica de 7 días y botón para borrarla), una
     para crear otra y un ejemplo de código listo para copiar. */
  function tabApiKey(p, body) {
    // Carga las claves reales del usuario y filtra las de este proyecto.
    if (!apiKeysLoaded) {
      ensureApiKeys();
      body.appendChild(skelList(2, true));
      return;
    }
    const keys = store.apiKeys.filter(function (k) { return k.project_id === p.id; });
    keys.forEach(ensureUsage);
    if (keys.length) startKeysLive();

    body.appendChild(el('div', { class: 'ak-intro' }, [
      el('span', { class: 'ak-intro-ico', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' }),
      el('div', {}, [
        el('strong', {}, 'Conecta tu sitio o app a «' + p.name + '»'),
        el('p', {}, 'Con una clave secreta tu página o app puede leer y publicar los archivos de este proyecto. Trátala como una contraseña.')
      ])
    ]));

    body.appendChild(libSec('Claves secretas'));
    const grid = el('div', { class: 'ak-keys' });
    keys.forEach(k => grid.appendChild(projectKeyCard(p, k)));
    grid.appendChild(el('button', { type: 'button', class: 'ak-new', onclick: () => openProjectKeyModal(p) }, [
      el('span', { html: LIB_ICN.plus }), 'Crear clave secreta'
    ]));
    body.appendChild(grid);

    if (keys.length) {
      body.appendChild(libSec('Ejemplo rápido'));
      body.appendChild(codeExample(keys[0]));
    }
  }

  function projectKeyCard(p, k) {
    ensureUsage(k);
    const masked = k.value.slice(0, 7) + '•'.repeat(12) + k.value.slice(-4);
    const m = k.usage.month, total = m.ok + m.err;
    const days = k.usage.days.map(d => d.ok + d.err), max = Math.max(1, ...days);
    const types = (!k.fileTypes || !k.fileTypes.length || k.fileTypes.includes('all')) ? ['Todos los archivos'] : k.fileTypes.map(t => (FILE_TYPES.find(f => f.val === t) || {}).label || t);
    const eye = k.revealed
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    return el('div', { class: 'ak-key' }, [
      el('div', { class: 'ak-kh' }, [
        el('span', { class: 'ak-av', style: { background: libGrad(k.id) }, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 7.5-7.5 1.65 1.65 1.5-1.5-3.15-3.15-9 9"/></svg>' }),
        el('div', { class: 'ak-kt' }, [ el('strong', { title: k.name }, k.name), el('span', {}, [ el('span', { class: 'ak-st' }, [ el('i'), 'Activa' ]), ' · Creada ' + formatDate(k.createdAt) ]) ]),
        el('button', { type: 'button', class: 'icon-btn ak-more', 'aria-label': 'Opciones de ' + k.name, title: 'Opciones', html: LIB_ICN.dots, onclick: (e) => popup(e, keyMenuItems(k, () => projectRevokeKey(p, k))) }),
        el('button', { type: 'button', class: 'icon-btn ak-del', 'aria-label': 'Borrar la clave ' + k.name, title: 'Borrar clave', html: LIB_ICN.trash, onclick: () => projectRevokeKey(p, k) })
      ]),
      el('div', { class: 'ak-secret' }, [
        el('code', {}, k.revealed ? k.value : masked),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': k.revealed ? 'Ocultar clave' : 'Mostrar clave', title: k.revealed ? 'Ocultar' : 'Mostrar', html: eye, onclick: () => { k.revealed = !k.revealed; writeStore(store); render(); } }),
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Copiar clave', title: 'Copiar', html: LIB_ICN.copy, onclick: () => copyText(k.value) })
      ]),
      el('div', { class: 'ak-chips' }, [ el('span', {}, PERM_LABEL[k.permission] || 'Todo') ].concat(types.map(t => el('span', {}, t)))),
      el('div', { class: 'ak-use' }, [
        el('div', {}, [
          el('strong', {}, total.toLocaleString('es-MX')),
          el('span', {}, (total === 1 ? 'solicitud este mes' : 'solicitudes este mes') + ' · ' + (k.lastUsed ? 'usada ' + timeAgo(k.lastUsed) : 'nunca usada'))
        ]),
        el('div', { class: 'ak-spark', 'aria-hidden': 'true' }, days.map((n, i) => el('i', { class: i === days.length - 1 ? 'last' : '', style: { height: Math.max(8, Math.round(n / max * 100)) + '%' } })))
      ]),
      m.err ? el('div', { class: 'ak-err' }, m.err + (m.err === 1 ? ' falla este mes' : ' fallas este mes')) : null
    ].filter(Boolean));
  }

  // Ejemplo listo para copiar (JavaScript, cURL o Python) con la clave del proyecto.
  function codeExample(k) {
    const base = location.origin + '/api/v1/files?type=audio';
    const key = k.value.slice(0, 7) + '…' + k.value.slice(-4);
    const SAMPLES = {
      js: "// Lista las canciones de este proyecto\nconst res = await fetch('" + base + "', {\n  headers: { Authorization: 'Bearer " + key + "' }\n});\nconst { items } = await res.json();\nitems.forEach(f => console.log(f.media?.title || f.name, f.media?.artist || ''));",
      curl: "# Lista las canciones de este proyecto\ncurl '" + base + "' \\\n  -H 'Authorization: Bearer " + key + "'",
      py: "# Lista las canciones de este proyecto\nimport requests\nr = requests.get('" + base + "',\n    headers={'Authorization': 'Bearer " + key + "'})\nfor f in r.json()['items']:\n    print(f.get('media', {}).get('title') or f['name'])"
    };
    let lang = 'js';
    const pre = el('pre', {}, SAMPLES.js);
    const tabs = [['js', 'JavaScript'], ['curl', 'cURL'], ['py', 'Python']].map(t => el('button', { type: 'button', class: t[0] === lang ? 'on' : '', onclick: () => {
      lang = t[0]; pre.textContent = SAMPLES[lang];
      tabs.forEach((b, i) => b.classList.toggle('on', ['js', 'curl', 'py'][i] === lang));
    } }, t[1]));
    // Se copia con la clave completa (en pantalla va recortada).
    const copy = el('button', { type: 'button', class: 'ak-copy', html: LIB_ICN.copy + '<span>Copiar</span>', onclick: () => copyText(SAMPLES[lang].split(key).join(k.value)) });
    return el('div', { class: 'ak-code' }, [ el('div', { class: 'ak-code-h' }, tabs.concat([copy])), pre ]);
  }

  async function projectRevokeKey(p, k) {
    const ok = await confirmDialog('¿Revocar esta clave?', `"${k.name}" dejará de funcionar inmediatamente. Esta acción no se puede deshacer.`, 'Revocar');
    if (!ok) return;
    try {
      await apiDelete('/apikeys/' + k.id);
    } catch (e) { if (e.status !== 404) { toast(e.message || 'No se pudo revocar la clave'); return; } }
    store.apiKeys = store.apiKeys.filter(x => x.id !== k.id);
    toast('Clave revocada');
    render();
  }

  /* ─── BottomSheet: crear clave secreta del proyecto ─── */
  function openProjectKeyModal(p) {
    const st = {
      name: '',
      permission: 'all',          // 'all' | 'read' | 'none'
      fileTypes: ['all']
    };

    // Título
    const nameInp = el('input', { type: 'text', placeholder: 'ej. Publicar imágenes, Subir documentos…' });
    nameInp.addEventListener('input', e => st.name = e.target.value);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });

    // Permisos: Todo | Leer | No leer
    const permSeg = segmented(
      [ { val: 'all', label: 'Todo' }, { val: 'read', label: 'Leer' }, { val: 'none', label: 'No leer' } ],
      st.permission,
      v => st.permission = v
    );

    // Tipo de archivo (chips multiselección; "Todos" es exclusivo)
    const chipsWrap = el('div', { class: 'chips' });
    function renderChips() {
      chipsWrap.innerHTML = '';
      FILE_TYPES.forEach(ft => {
        const on = st.fileTypes.includes(ft.val);
        chipsWrap.appendChild(el('button', {
          type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on),
          onclick: () => {
            if (ft.val === 'all') { st.fileTypes = ['all']; }
            else {
              st.fileTypes = st.fileTypes.filter(x => x !== 'all');
              if (st.fileTypes.includes(ft.val)) st.fileTypes = st.fileTypes.filter(x => x !== ft.val);
              else st.fileTypes.push(ft.val);
              if (st.fileTypes.length === 0) st.fileTypes = ['all'];
            }
            renderChips();
          }
        }, ft.label));
      });
    }
    renderChips();

    const body = el('div', {}, [
      el('div', { class: 'field' }, [ el('label', {}, 'Título'), nameInp ]),
      el('div', { class: 'field', style: { marginBottom: '6px' } }, [
        el('label', {}, 'Permisos'),
        permSeg.el
      ]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Tipo de archivo'),
        chipsWrap
      ]),
      el('p', { class: 'field-hint' }, 'Esta clave sirve para publicar archivos y documentos en este proyecto. Se mostrará una sola vez al generarla — guárdala en un lugar seguro.')
    ]);

    let m;
    // El modal usa 'all' | 'read' | 'none'; el servidor usa 'all' | 'read' | 'write'.
    function backendPermission() {
      return st.permission === 'all' ? 'all' : 'read';
    }
    async function create(btn) {
      const n = (st.name || nameInp.value || '').trim() || 'Clave sin título';
      if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
      try {
        const d = await apiPost('/apikeys', { name: n, permission: backendPermission(), project_id: p.id });
        store.apiKeys.unshift(mapServerKey(d.item, true));
        m.close();
        render();
        toast('Clave secreta generada');
      } catch (e) {
        toast(e.message || 'No se pudo generar la clave');
        if (btn) { btn.disabled = false; btn.textContent = 'Generar'; }
      }
    }
    m = openFormSheet({
      title: 'Crear clave secreta',
      body,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Generar', kind: 'primary', onClick: (e) => { create(e && e.target); return false; }, keepOpen: true }
      ]
    });
  }
