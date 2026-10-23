'use strict';
/* views/trash.js — Papelera: lo que borraste, para devolverlo a su sitio o
   borrarlo de verdad. Lo borrado se guarda 30 días y después se va solo. */

  const TR_ICN = {
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-5.4L3 10"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12l-4 4H4z"/><path d="M20 16h-4v4"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3M16 6l3 3M14 8l3 3"/></svg>'
  };

  // Qué era cada cosa: icono, color y cómo se llama en español.
  function trashLook(it) {
    if (it.kind === 'project') return { icon: TR_ICN.folder, color: '#6b6a63', label: 'Proyecto' };
    if (it.kind === 'note') return { icon: TR_ICN.note, color: '#e0a21b', label: 'Nota' };
    if (it.kind === 'apikey') return { icon: TR_ICN.key, color: '#d9484d', label: 'API key' };
    if (it.kind === 'document') return { icon: KIND_ICON_LIB('doc'), color: '#e0a21b', label: 'Documento' };
    const k = window.mediaKind ? window.mediaKind(it.mime || '', it.title) : 'other';
    const C = { image: '#2f7de1', video: '#8b5cf6', audio: '#35b98f', pdf: '#e0a21b', doc: '#e0a21b' };
    const L = { image: 'Imagen', video: 'Video', audio: 'Canción', pdf: 'PDF', doc: 'Documento' };
    return { icon: KIND_ICON_LIB(k === 'pdf' ? 'doc' : k), color: C[k] || '#6b6a63', label: L[k] || 'Archivo' };
  }

  // Segunda línea: qué era, cuánto ocupa y, en un proyecto, qué lleva dentro.
  function trashSub(it) {
    const look = trashLook(it);
    const bits = [look.label];
    if (it.kind === 'project') {
      bits.push(it.items + (it.items === 1 ? ' elemento' : ' elementos'));
      if (it.size) bits.push(fmtSize(it.size));
    } else if (it.size != null) bits.push(fmtSize(it.size));
    if (it.kind === 'apikey') bits.push('desactivada mientras esté aquí');
    return bits.join(' · ');
  }
  // «hace 2 días», «hace 5 min»… timeAgo abrevia y devuelve «ahora» o una
  // fecha suelta, que con «hace» delante no se leen bien.
  function cuando(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'Lo borraste hace un momento';
    if (s < 3600) { const m = Math.floor(s / 60); return 'Lo borraste hace ' + m + (m === 1 ? ' minuto' : ' minutos'); }
    if (s < 86400) { const h = Math.floor(s / 3600); return 'Lo borraste hace ' + h + (h === 1 ? ' hora' : ' horas'); }
    const d = Math.floor(s / 86400);
    if (d < 7) return 'Lo borraste hace ' + d + (d === 1 ? ' día' : ' días');
    const sem = Math.floor(d / 7);
    return 'Lo borraste hace ' + sem + (sem === 1 ? ' semana' : ' semanas');
  }
  function fmtSize(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, v = Number(n);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
  }

  let trashLoaded = false, trashLoading = false;
  // Lo que el usuario tiene elegido, por «tipo:id» (los ids no se repiten
  // entre tipos, pero así el conjunto se lee solo).
  let elegidos = new Set();
  const keyOf = (it) => it.kind + ':' + it.id;
  async function loadTrash() {
    trashLoading = true;
    try {
      const r = await apiGet('/trash');
      store.trash = Array.isArray(r.items) ? r.items : [];
      store.trashBytes = Number(r.bytes) || 0;
      store.trashDays = Number(r.days) || 30;
    } catch (e) {
      store.trash = []; store.trashBytes = 0;
      if (e && e.status !== 401) toast(e.message || 'No se pudo abrir la papelera');
    }
    trashLoaded = true; trashLoading = false;
    elegidos = new Set();
    renderNav();
    if (state.route === 'trash') render();
  }
  window.loadTrash = loadTrash;

  function viewTrash() {
    const v = $('#view');
    v.innerHTML = '';
    const hayAlgo = Array.isArray(store.trash) && store.trash.length > 0;
    v.appendChild(pageToolbar({
      back: () => go('dashboard'), menu: () => openMobile(), title: 'Papelera',
      actions: hayAlgo ? [
        el('button', { class: 'btn btn-sm', onclick: emptyTrash, html: TR_ICN.trash + '<span style="margin-left:5px">Vaciar</span>' })
      ] : []
    }));

    // La papelera se pide la primera vez que se entra (como las demás listas).
    if (!trashLoaded && !trashLoading) loadTrash();
    const cargando = !trashLoaded;
    const items = Array.isArray(store.trash) ? store.trash : [];
    const q = (state.search || '').trim().toLowerCase();
    const shown = q ? items.filter(x => (x.title || '').toLowerCase().includes(q)) : items;

    // Título y, debajo, el plazo y lo que ocupa: igual que Archivos o API keys.
    v.appendChild(el('div', { class: 'board-head' }, [ el('h2', {}, 'Papelera') ]));
    const aviso = el('p', { class: 'subtitle', style: { padding: '0 20px 10px', margin: '-6px 0 0', color: 'var(--fg-muted)', fontSize: '13.5px' } });
    const ocupa = Number(store.trashBytes) || 0;
    aviso.textContent = 'Lo que borras se guarda ' + (store.trashDays || 30) + ' días y luego se elimina solo'
      + (ocupa ? '; ocupa ' + fmtSize(ocupa) + ' de tu plan' : '')
      + '. Mientras tanto puedes devolverlo a su sitio.';
    v.appendChild(aviso);
    if (items.length) v.appendChild(el('div', { class: 'board-tools', style: { paddingTop: '14px' } }, [ searchInput('Buscar en la papelera...') ]));

    const body = el('div', { class: 'board-body' });
    if (cargando) {
      // Mientras llega: filas de hueco. Decir «está vacía» sería mentira.
      const sk = el('div', { class: 'tr-list' });
      for (let i = 0; i < 3; i++) sk.appendChild(el('div', { class: 'tr-row is-sk' }, [
        el('span', { class: 'tr-ico' }), el('div', { class: 'tr-main' }, [ el('div', { class: 'sk-line w60' }), el('div', { class: 'sk-line w35' }) ])
      ]));
      body.appendChild(sk);
    } else if (!items.length) {
      body.appendChild(emptyBlock('La papelera está vacía',
        'Lo que borres aparecerá aquí durante ' + (store.trashDays || 30) + ' días, por si cambias de idea.', null));
    } else if (!shown.length) {
      body.appendChild(emptyBlock('Sin resultados', 'Nada en la papelera coincide con tu búsqueda.', null));
    } else {
      // Solo se pueden elegir los que se ven (si hay búsqueda, los filtrados).
      const visibles = shown.map(keyOf);
      elegidos = new Set([...elegidos].filter(k => visibles.includes(k)));
      const todos = elegidos.size > 0 && elegidos.size === shown.length;
      const marcarTodo = el('label', { class: 'tr-all' }, [
        el('input', {
          type: 'checkbox', checked: todos ? '' : null,
          'aria-label': todos ? 'Quitar la selección' : 'Elegir los ' + shown.length,
          onchange: (e) => {
            elegidos = e.target.checked ? new Set(visibles) : new Set();
            render();
          }
        }),
        el('span', {}, elegidos.size
          ? elegidos.size + (elegidos.size === 1 ? ' elegido' : ' elegidos')
          : shown.length + (shown.length === 1 ? ' elemento' : ' elementos'))
      ]);
      const cab = el('div', { class: 'tr-head' + (elegidos.size ? ' is-sel' : '') }, [
        marcarTodo,
        elegidos.size
          ? el('div', { class: 'tr-head-acts' }, [
              el('button', { class: 'tr-btn is-restore', onclick: () => restoreMany() }, [
                el('span', { html: TR_ICN.undo }), el('span', {}, 'Restaurar')
              ]),
              el('button', { class: 'tr-btn is-del', onclick: () => deleteMany() }, [
                el('span', { html: TR_ICN.trash }), el('span', {}, 'Eliminar')
              ])
            ])
          : el('span', { class: 'lib-note', style: { margin: '0' } }, 'Más recientes primero')
      ]);
      body.appendChild(cab);
      const list = el('div', { class: 'tr-list' });
      shown.forEach(it => list.appendChild(trashRow(it)));
      body.appendChild(list);
    }
    v.appendChild(body);
  }

  // Miniatura de un archivo en la papelera (?trashed=1 solo sirve al dueño):
  // la imagen para una foto, la carátula para una canción. Si no hay, el icono.
  function trashThumb(it) {
    if (it.kind !== 'file') return null;
    const m = it.mime || '';
    if (/^image\//.test(m) && !/svg|heic|heif/.test(m)) return '/api/v1/files/' + it.id + '/download?inline=1&trashed=1';
    // Carátula solo si el archivo la tiene (lo dice el servidor): así no se
    // pide una portada que no existe y la consola queda limpia.
    return it.has_thumb ? '/api/v1/files/' + it.id + '/thumb?trashed=1' : null;
  }
  function trashRow(it) {
    const look = trashLook(it);
    const ico = el('span', { class: 'tr-ico' });
    const thumb = trashThumb(it);
    if (thumb) {
      const img = el('img', { src: thumb, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => { ico.classList.remove('is-img'); ico.innerHTML = look.icon; });
      ico.classList.add('is-img');
      ico.appendChild(img);
    } else {
      ico.innerHTML = look.icon;
    }
    ico.style.setProperty('--k', look.color);
    const left = it.days_left;
    const k = keyOf(it);
    const marca = elegidos.has(k);
    return el('div', { class: 'tr-row' + (marca ? ' is-on' : '') + (elegidos.size ? ' is-picking' : '') }, [
      el('label', { class: 'tr-pick' }, [
        el('input', {
          type: 'checkbox', checked: marca ? '' : null,
          'aria-label': 'Elegir ' + (it.title || 'este elemento'),
          onchange: (e) => { if (e.target.checked) elegidos.add(k); else elegidos.delete(k); render(); }
        })
      ]),
      ico,
      el('div', { class: 'tr-main' }, [
        el('div', { class: 'tr-nm', title: it.title }, it.title || '(sin nombre)'),
        el('div', { class: 'tr-sub' }, trashSub(it))
      ]),
      el('div', { class: 'tr-from' }, [
        el('span', {}, [ 'Estaba en ', el('b', {}, it.parent || (it.kind === 'project' ? 'Proyectos' : it.kind === 'note' ? 'Notas' : it.kind === 'apikey' ? 'API keys' : 'Archivos')) ]),
        el('span', {}, cuando(it.deleted_at))
      ]),
      el('div', { class: 'tr-left' + (left <= 7 ? ' soon' : '') },
        left <= 0 ? 'Se va hoy' : left === 1 ? 'Queda 1 día' : 'Quedan ' + left + ' días'),
      elegidos.size ? null : el('div', { class: 'tr-acts' }, [
        el('button', { class: 'tr-btn is-restore', onclick: () => restoreItem(it) }, [
          el('span', { html: TR_ICN.undo }), el('span', {}, 'Restaurar')
        ]),
        el('button', { class: 'tr-btn is-del', onclick: () => deleteForever(it) }, [
          el('span', { html: TR_ICN.trash }), el('span', {}, 'Eliminar')
        ])
      ])
    ].filter(Boolean));
  }

  async function restoreItem(it) {
    try {
      await apiPost('/trash/restore', { kind: it.kind, id: it.id });
    } catch (e) {
      toast(e.message || 'No se pudo restaurar');
      return;
    }
    toast((it.title || 'El elemento') + ' volvió a su sitio');
    await refreshAfterTrash();
  }

  async function deleteForever(it) {
    const ok = await confirmDialog('¿Eliminar para siempre?',
      '"' + (it.title || 'Este elemento') + '"' +
      (it.kind === 'project' ? ' y todo lo que guarda' : '') +
      ' se borrará definitivamente. Esto no se puede deshacer.', 'Eliminar');
    if (!ok) return;
    try {
      await apiBulk('DELETE', '/trash/' + it.kind + '/' + it.id);
    } catch (e) {
      toast(e.message || 'No se pudo eliminar');
      return;
    }
    toast('Eliminado para siempre');
    await refreshAfterTrash();
  }

  // Lista corta y legible de lo elegido, para el diálogo.
  function resumen(lista) {
    const n = lista.length;
    if (n === 1) return '"' + (lista[0].title || 'Este elemento') + '"';
    const nombres = lista.slice(0, 3).map(x => '"' + (x.title || 'sin nombre') + '"').join(', ');
    return n <= 3 ? nombres : nombres + ' y ' + (n - 3) + (n - 3 === 1 ? ' más' : ' más');
  }
  const elegidosList = () => (store.trash || []).filter(x => elegidos.has(keyOf(x)));

  async function restoreMany() {
    const lista = elegidosList();
    if (!lista.length) return;
    let bien = 0, padre = 0, mal = 0;
    for (const it of lista) {
      try { await apiPost('/trash/restore', { kind: it.kind, id: it.id }); bien++; }
      catch (e) { if (e.status === 409) padre++; else mal++; }
    }
    await refreshAfterTrash();
    if (bien) toast(bien === 1 ? 'Volvió a su sitio' : bien + ' elementos volvieron a su sitio');
    if (padre) toast(padre === 1
      ? 'Uno no volvió: su proyecto sigue en la papelera. Restaura antes el proyecto.'
      : padre + ' no volvieron: su proyecto sigue en la papelera. Restaura antes el proyecto.');
    else if (mal) toast('No se pudieron restaurar ' + mal);
  }

  async function deleteMany() {
    const lista = elegidosList();
    if (!lista.length) return;
    const n = lista.length;
    const hayProyecto = lista.some(x => x.kind === 'project');
    const ok = await confirmDialog(
      n === 1 ? '¿Eliminar para siempre?' : '¿Eliminar ' + n + ' elementos para siempre?',
      'Se borrará ' + resumen(lista) + (hayProyecto ? ', con todo lo que guarda ese proyecto' : '') +
      '. Esto no se puede deshacer y no podrás recuperarlo.',
      n === 1 ? 'Eliminar' : 'Eliminar ' + n);
    if (!ok) return;
    let bien = 0, mal = 0;
    for (const it of lista) {
      try { await apiBulk('DELETE', '/trash/' + it.kind + '/' + it.id); bien++; }
      catch (e) { mal++; }
    }
    await refreshAfterTrash();
    toast(mal ? 'Se eliminaron ' + bien + '; ' + mal + ' no se pudieron'
      : bien === 1 ? 'Eliminado para siempre' : bien + ' elementos eliminados para siempre');
  }

  async function emptyTrash() {
    const items = store.trash || [];
    const n = items.length;
    const porTipo = [];
    [['project', 'proyecto', 'proyectos'], ['file', 'archivo', 'archivos'],
     ['document', 'documento', 'documentos'], ['note', 'nota', 'notas'],
     ['apikey', 'API key', 'API keys']].forEach(([k, uno, varios]) => {
      const c = items.filter(x => x.kind === k).length;
      if (c) porTipo.push(c + ' ' + (c === 1 ? uno : varios));
    });
    const ocupa = Number(store.trashBytes) || 0;
    const detalle = porTipo.length > 1
      ? porTipo.slice(0, -1).join(', ') + ' y ' + porTipo[porTipo.length - 1]
      : (porTipo[0] || (n + ' elementos'));
    const ok = await confirmDialog('¿Vaciar la papelera?',
      'Se borrarán para siempre ' + detalle +
      (items.some(x => x.kind === 'project') ? ', con todo lo que guardan los proyectos' : '') + '.' +
      (ocupa ? ' Liberarás ' + fmtSize(ocupa) + ' de tu plan.' : '') +
      ' Esto no se puede deshacer.',
      'Vaciar papelera');
    if (!ok) return;
    try {
      await apiBulk('DELETE', '/trash');
    } catch (e) {
      toast(e.message || 'No se pudo vaciar la papelera');
      return;
    }
    toast('Papelera vaciada');
    await refreshAfterTrash();
  }

  /* Restaurar o borrar cambia también proyectos, archivos, notas y claves. Se
     piden de nuevo aquí mismo: loadFiles() y compañía solo cargan la primera
     vez (llevan su propio «ya cargado»), así que no servirían. */
  async function refreshAfterTrash() {
    trashLoaded = false;
    await loadTrash();
    await Promise.allSettled([
      apiGet('/projects').then(d => {
        const old = new Map((store.projects || []).map(p => [p.id, p]));
        store.projects = (d.items || []).map(row => {
          const n = mapServerProject(row), o = old.get(row.id);
          if (o) { n.documents = o.documents; n._loaded = o._loaded; n.members = o.members; n.visibility = o.visibility; n.apiKeys = o.apiKeys; }
          return n;
        });
      }),
      apiGet('/files').then(d => { store.files = (d.items || []).map(mapServerFile); }),
      apiGet('/notes').then(d => { store.notes = (d.items || []).map(mapServerNote); }),
      apiGet('/apikeys').then(d => {
        const vistas = new Map((store.apiKeys || []).map(k => [k.id, k.revealed]));
        store.apiKeys = (d.items || []).map(k => mapServerKey(k, vistas.get(k.id)));
      })
    ]);
    if (typeof paintPlanCard === 'function' && window.currentUser) paintPlanCard(window.currentUser);
    render();
  }

  window.viewTrash = viewTrash;
