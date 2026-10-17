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

  /* ─── Pestaña API key del proyecto ─── */
  function tabApiKey(p, body) {
    // Carga las claves reales del usuario y filtra las de este proyecto.
    if (!apiKeysLoaded) {
      ensureApiKeys();
      body.appendChild(skelList(2, true));
      return;
    }
    const keys = store.apiKeys.filter(function (k) { return k.project_id === p.id; });
    keys.forEach(ensureUsage);

    body.appendChild(el('p', { style: { color: 'var(--fg-muted)', margin: '0 0 14px', fontSize: '13.5px', lineHeight: '1.5' } },
      'Claves secretas de este proyecto. Úsalas para publicar archivos y documentos (imágenes, video, audio…) en «Publicados». Trátalas como contraseñas — no las compartas.'));

    body.appendChild(el('div', { style: { margin: '0 0 16px' } }, [
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => openProjectKeyModal(p), html: ICON_PLUS_SM + '<span style="margin-left:4px">Generar clave secreta</span>' })
    ]));

    if (keys.length === 0) {
      body.appendChild(emptyBlock('Aún no hay claves secretas', 'Genera la primera clave secreta de este proyecto para empezar a publicar archivos multimedia y documentos.', 'Generar clave secreta', () => openProjectKeyModal(p)));
      return;
    }

    // Análisis de solicitudes (agregado del proyecto)
    body.appendChild(el('div', { class: 'section-h' }, [ el('h3', {}, 'Análisis de solicitudes'), liveBadge() ]));
    startKeysLive();
    body.appendChild(usageTiles(keys));

    body.appendChild(el('div', { class: 'section-h' }, [ el('h3', {}, 'Claves secretas' ) ]));
    const list = el('div', { class: 'key-list' });
    keys.forEach(k => list.appendChild(projectKeyRow(p, k)));
    body.appendChild(list);
  }

  function projectKeyRow(p, k) {
    ensureUsage(k);
    const masked = k.value.slice(0, 7) + '•'.repeat(20) + k.value.slice(-4);

    return el('div', { class: 'key-row' }, [
      el('div', { class: 'key-head' }, [
        el('div', { class: 'key-main' }, [
          el('div', { class: 'key-name' }, [
            document.createTextNode(k.name + ' '),
            el('span', { class: 'key-badge' }, PERM_LABEL[k.permission] || 'Todo')
          ]),
          el('div', { class: 'key-value' }, [ el('code', {}, k.revealed ? k.value : masked) ]),
          el('div', { class: 'key-tags' }, [
            el('span', { class: 'key-tag', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ' + fileTypeLabels(k.fileTypes) })
          ]),
          el('div', { class: 'key-meta' }, 'Creada ' + formatDate(k.createdAt) + (k.lastUsed ? (' · Último uso ' + timeAgo(k.lastUsed)) : ' · Nunca usada'))
        ]),
        el('div', { class: 'key-actions' }, [
          el('button', { class: 'icon-btn', title: k.revealed ? 'Ocultar' : 'Mostrar', onclick: () => { k.revealed = !k.revealed; writeStore(store); render(); }, html: k.revealed
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
          }),
          el('button', { class: 'icon-btn', title: 'Copiar', onclick: () => copyText(k.value), html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' }),
          el('button', { class: 'icon-btn', title: 'Reiniciar uso', onclick: () => resetUsage(k), html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' }),
          el('button', { class: 'icon-btn', title: 'Revocar', onclick: () => projectRevokeKey(p, k), html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>' }),
          // Menú compacto (solo móvil)
          el('button', { class: 'icon-btn key-more', title: 'Opciones', 'aria-label': 'Opciones', onclick: (e) => popup(e, keyMenuItems(k, () => projectRevokeKey(p, k))), html: KEY_ICON.dots })
        ])
      ]),
      usageBlock(k)
    ]);
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
