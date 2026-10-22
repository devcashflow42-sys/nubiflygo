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
    renderNav();
    if (state.route === 'trash') render();
  }
  window.loadTrash = loadTrash;

  function viewTrash() {
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(pageToolbar({ back: () => go('dashboard'), menu: () => openMobile(), title: 'Papelera' }));

    // La papelera se pide la primera vez que se entra (como las demás listas).
    if (!trashLoaded && !trashLoading) loadTrash();
    const cargando = !trashLoaded;
    const items = Array.isArray(store.trash) ? store.trash : [];
    const q = (state.search || '').trim().toLowerCase();
    const shown = q ? items.filter(x => (x.title || '').toLowerCase().includes(q)) : items;

    // Banner de la sección: dice el plazo y lo que ocupa, y deja vaciarla.
    if (items.length) v.appendChild(el('div', { class: 'board-tools', style: { paddingTop: '14px' } }, [ searchInput('Buscar en la papelera...') ]));
    const banner = el('div', { class: 'sec-hero is-trash' }, [
      el('span', { class: 'sec-hero-ico', html: TR_ICN.trash }),
      el('div', { class: 'sec-hero-info' }, [
        el('h2', {}, 'Papelera'),
        (function () {
          const p = el('p');
          const ocupa = Number(store.trashBytes) || 0;
          p.innerHTML = 'Lo que borras se guarda <b>' + (store.trashDays || 30) + ' días</b> y luego se elimina solo'
            + (ocupa ? '; ocupa <b>' + fmtSize(ocupa) + '</b> de tu plan' : '') + '.'
            + '<span class="sec-hero-extra"> Mientras tanto puedes devolverlo a su sitio; '
            + 'vacíala para liberar el espacio.</span>';
          return p;
        })()
      ]),
      items.length ? el('div', { class: 'sec-hero-acts' }, [
        el('button', { class: 'ph-btn', onclick: emptyTrash }, [
          el('span', { html: TR_ICN.trash }), el('span', {}, 'Vaciar papelera')
        ])
      ]) : null
    ].filter(Boolean));
    v.insertBefore(banner, v.querySelector('.board-tools'));

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
      body.appendChild(el('div', { class: 'lib-sec' }, [
        el('h3', {}, shown.length + (shown.length === 1 ? ' elemento' : ' elementos')),
        el('span', { class: 'lib-note', style: { margin: '0' } }, 'Más recientes primero')
      ]));
      const list = el('div', { class: 'tr-list' });
      shown.forEach(it => list.appendChild(trashRow(it)));
      body.appendChild(list);
    }
    v.appendChild(body);
  }

  function trashRow(it) {
    const look = trashLook(it);
    const ico = el('span', { class: 'tr-ico', html: look.icon });
    ico.style.setProperty('--k', look.color);
    const left = it.days_left;
    return el('div', { class: 'tr-row' }, [
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
      el('div', { class: 'tr-acts' }, [
        el('button', { class: 'tr-btn is-restore', onclick: () => restoreItem(it) }, [
          el('span', { html: TR_ICN.undo }), el('span', {}, 'Restaurar')
        ]),
        el('button', { class: 'tr-btn is-del', onclick: () => deleteForever(it) }, [
          el('span', { html: TR_ICN.trash }), el('span', {}, 'Eliminar')
        ])
      ])
    ]);
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

  async function emptyTrash() {
    const n = (store.trash || []).length;
    const ok = await confirmDialog('¿Vaciar la papelera?',
      (n === 1 ? 'Se borrará 1 elemento' : 'Se borrarán ' + n + ' elementos') +
      ' definitivamente. Esto no se puede deshacer.', 'Vaciar');
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
