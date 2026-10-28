'use strict';
/* views/files.js — Sección Archivos: el usuario sube y publica sus archivos.
   Conectada al servidor: subir, listar, abrir/descargar y borrar vía /api/v1/files.
   En la web usa la cookie de sesión; una app móvil usa la misma API con su API key. */

  let filesLoaded = false, filesLoading = false;

  // Convierte un archivo del servidor al formato de la vista. GET /files trae
  // el item completo (size = { bytes, formatted }); se aceptan ambos formatos.
  function mapServerFile(f) {
    const mime = f.mime || f.mime_type || '';
    return {
      id: f.id, kind: 'file',
      title: f.name,
      size: Number(f.size && typeof f.size === 'object' ? f.size.bytes : f.size) || 0,
      type: mime,
      mime,
      project_id: f.project_id || null,
      published: !!f.published,
      thumbUrl: f.thumb_url || (f.thumbnail && f.thumbnail.url) || null,
      media: f.media || null,
      transcode: f.transcode || null,
      checksum: (f.metadata && f.metadata.checksum_sha256) || null,
      updatedAt: f.created_at ? Date.parse(f.created_at) : Date.now(),
      downloadUrl: '/api/v1/files/' + f.id + '/download'
    };
  }
  // Convierte el item enriquecido de /files/upload al formato de la vista.
  function mapUploadedFile(it) {
    return {
      id: it.id, kind: 'file',
      title: it.name,
      size: Number(it.size && it.size.bytes) || 0,
      type: it.mime_type || '', mime: it.mime_type || '',
      project_id: it.project_id || null,
      published: !!it.published,
      thumbUrl: (it.thumbnail && it.thumbnail.url) || null,
      media: it.media || null,
      transcode: it.transcode || null,
      updatedAt: it.created_at ? Date.parse(it.created_at) : Date.now(),
      downloadUrl: '/api/v1/files/' + it.id + '/download'
    };
  }
  // Archivos muestra solo los suyos (subidos sin proyecto). Los de cada
  // proyecto viven en su proyecto. store.files guarda todos (almacenamiento,
  // categorías de los proyectos), por eso se filtra aquí.
  const ownFiles = () => (Array.isArray(store.files) ? store.files : []).filter(f => !f.project_id);
  window.ownFiles = ownFiles;

  function loadFiles() {
    if (filesLoaded || filesLoading) return;
    filesLoading = true;
    apiGet('/files')
      .then(function (d) { store.files = (d.items || []).map(mapServerFile); filesLoaded = true; })
      // Ante un error se marca como cargado para no reintentar en bucle
      // (el tiempo real volverá a cargar cuando haya conexión/sesión).
      .catch(function (e) { filesLoaded = true; if (e.status !== 401) toast(e.message || 'No se pudieron cargar los archivos'); })
      .then(function () {
        filesLoading = false;
        // El Inicio también usa store.files (tarjeta «Archivos»).
        if (state.route === 'files' || state.route === 'dashboard' || (state.route === 'projects' && !state.projectId)) render();
        // El almacenamiento del menú se calcula con store.files: se repinta en
        // cualquier sección (p. ej. entrada directa a /project/<id>).
        else {
          if (window.paintPlanCard) { try { window.paintPlanCard(); } catch (e) {} }
          // El contador del menú deja su esqueleto aunque no se redibuje la sección.
          if (typeof renderNav === 'function') { try { renderNav(); } catch (e) {} }
        }
      });
  }

  function viewFiles() {
    const v = $('#view');
    v.innerHTML = '';
    if (!Array.isArray(store.files)) store.files = [];
    const mine = ownFiles();

    v.appendChild(pageToolbar({
      back: () => go('dashboard'),
      title: 'Archivos',
      actions: [
        el('button', {
          class: 'btn btn-primary btn-sm', onclick: () => uploadFiles(),
          html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span style="margin-left:5px">Subir</span>'
        })
      ]
    }));
    v.appendChild(el('div', { class: 'board-head' }, [
      el('h2', {}, 'Archivos'),
      el('p', { class: 'subtitle' }, 'Sube y publica imágenes, videos, música, PDF y más. Se actualiza en tiempo real.')
    ]));

    // Primera vez: trae los archivos del servidor.
    if (!filesLoaded) {
      loadFiles();
      // El esqueleto tiene la forma de lo que va a aparecer: Colecciones o la cuadrícula.
      const t0 = state.filesTab || 'collections';
      v.appendChild(el('div', { class: 'board-body' }, [ t0 === 'collections' ? skelCollections(4) : skelGrid(8, { label: 'Cargando tus archivos…' }) ]));
      return;
    }

    const body = el('div', { class: 'board-body' });

    if (mine.length === 0) {
      body.appendChild(emptyBlock(
        'Aún no hay archivos',
        'Sube tus archivos y documentos para publicarlos y tenerlos siempre a la mano.',
        'Subir archivos',
        () => uploadFiles()
      ));
      v.appendChild(body);
      return;
    }

    // Colecciones inteligentes: Música, Fotos, Videos, Documentos y Limpieza.
    const tab = state.filesTab || 'collections';
    v.insertBefore(filesTabs(mine, tab), null);
    const col = FILE_COLS.find(c => c.id === tab);
    if (tab === 'collections') { body.appendChild(collectionsOverview(mine)); v.appendChild(body); return; }
    if (tab === 'cleanup') { body.appendChild(cleanupView(mine, deleteFilesNow)); v.appendChild(body); return; }
    if (col && (col.id === 'music' || col.id === 'photos')) {
      const ctx = { key: 'files:' + col.id, onMenu: (f, e) => popup(e, fileMenuItems(f)) };
      const fs = filesOfCol(mine, col);
      body.appendChild(col.id === 'music' ? musicLibrary(fs, ctx) : photoLibrary(fs, ctx));
      v.appendChild(body); return;
    }

    body.appendChild(el('div', { class: 'board-tools', style: { paddingTop: '0', paddingBottom: '12px' } }, [
      searchInput('Buscar archivos…')
    ]));

    const q = state.search.toLowerCase();
    const base = col ? filesOfCol(mine, col) : mine;
    const files = base.filter(f => !q || [f.title, f.media && f.media.title, f.media && f.media.artist, f.media && f.media.album]
      .some(t => (t || '').toLowerCase().includes(q)));
    const totalSize = mine.reduce((n, f) => n + (Number(f.size) || 0), 0);
    body.appendChild(el('div', { class: 'files-meta' }, [
      el('span', {}, mine.length + (mine.length === 1 ? ' archivo' : ' archivos') + ' · ' + formatBytes(totalSize)),
      col ? el('span') : el('button', { type: 'button', class: 'btn btn-danger btn-sm files-clear', onclick: () => deleteAllFiles(), html: ICON_DELETE + '<span>Borrar todo</span>' })
    ]));

    if (files.length === 0) {
      body.appendChild(emptyBlock('Sin resultados', 'Ningún archivo coincide con tu búsqueda.', null));
    } else {
      // De 24 en 24 con paginación (ver components/pager.js).
      const pg = paginate(files, 'files:' + tab);
      const grid = el('div', { class: 'doc-grid file-grid' });
      pg.items.forEach(f => grid.appendChild(fileCard(f, files)));
      body.appendChild(grid);
      if (pg.el) body.appendChild(pg.el);
    }
    v.appendChild(body);
  }

  function fileCard(f, list) {
    const isImg = mediaKind(f.mime, f.title) === 'image';
    const tx = fileTexts(f);
    return el('div', { class: 'doc-card file-card', onclick: () => (isImg ? openImageViewer(f) : openMedia(f, openFile, list)) }, [
      // Iconos de acción directa (igual que las tarjetas de proyecto): abrir y borrar.
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'card-action', title: 'Abrir', 'aria-label': 'Abrir',
          onclick: (e) => { e.stopPropagation(); openFile(f); },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
        }),
        el('button', {
          class: 'card-action', title: 'Compartir enlace', 'aria-label': 'Compartir enlace',
          onclick: (e) => { e.stopPropagation(); openShareDialog(f); },
          html: ICON_SHARE
        }),
        el('button', {
          class: 'card-action danger', title: 'Eliminar', 'aria-label': 'Eliminar',
          onclick: (e) => { e.stopPropagation(); deleteFile(f); },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
        })
      ]),
      fileBanner(f),
      el('div', { class: 'fc-body' }, [
        el('div', { class: 'doc-title', title: tx.title }, tx.title),
        el('div', { class: 'doc-meta' }, tx.sub)
      ])
    ]);
  }

  // Opciones de un archivo (lista de canciones de la colección Música).
  function fileMenuItems(f) {
    return [
      { label: 'Abrir', icon: ICON_OPEN, onClick: () => openFile(f) },
      { label: 'Compartir enlace', icon: ICON_SHARE, onClick: () => openShareDialog(f) },
      '-',
      { label: 'Eliminar', icon: ICON_DELETE, danger: true, onClick: () => deleteFile(f) }
    ];
  }
  // Limpieza: borra uno o varios archivos (copias repetidas o grandes) con una confirmación.
  async function deleteFilesNow(list) {
    if (!list.length) return;
    const one = list.length === 1;
    const size = formatBytes(list.reduce((n, f) => n + (Number(f.size) || 0), 0));
    const ok = await confirmDialog(one ? '¿Eliminar archivo?' : '¿Eliminar ' + list.length + ' archivos?',
      (one ? '"' + list[0].title + '"' : 'Las copias') + ' se irán a la papelera y liberarás ' + size + '. Tienes 30 días para recuperarlas.', 'Eliminar');
    if (!ok) return;
    if (window.nowPlayingId && list.some(f => f.id === window.nowPlayingId) && typeof window.closePlayer === 'function') window.closePlayer();
    const ids = list.map(f => f.id);
    try { await apiBulk('POST', '/files/delete', { ids }); }
    catch (e) { toast(e.message || 'No se pudo eliminar'); return; }
    store.files = (store.files || []).filter(f => !ids.includes(f.id));
    (store.projects || []).forEach(p => { if (p.documents) p.documents = p.documents.filter(d => !ids.includes(d.id)); });
    if (typeof loadTrash === 'function') loadTrash();
    toast(one ? 'Archivo eliminado' : list.length + ' archivos eliminados');
    render();
  }

  // Abre/descarga el archivo desde el servidor (lleva la cookie de sesión).
  function openFile(f) {
    const viewable = /^(image|video|audio|text)\//.test(f.mime || '') || f.mime === 'application/pdf';
    window.open(f.downloadUrl + (viewable ? '?inline=1' : ''), '_blank', 'noopener');
  }

  // Elimina un archivo del servidor (con confirmación) y lo quita de la lista.
  async function deleteFile(f) {
    const ok = await confirmDialog('¿Eliminar archivo?', `"${f.title}" se irá a la papelera. Tienes 30 días para recuperarlo.`, 'Eliminar');
    if (!ok) return;
    try {
      await apiDelete('/files/' + f.id);
    } catch (e) { if (e.status !== 404) { toast(e.message || 'No se pudo eliminar'); return; } }
    store.files = (store.files || []).filter(x => x.id !== f.id);
    if (typeof loadTrash === 'function') loadTrash();
    toast('Archivo eliminado'); render();
  }

  // Borra todos los archivos de Archivos (los que no están en un proyecto; los
  // de los proyectos no se tocan). El servidor borra por tandas; apiBulk repite.
  async function deleteAllFiles() {
    const mine = ownFiles(), n = mine.length;
    if (!n) return;
    const size = formatBytes(mine.reduce((s, f) => s + (Number(f.size) || 0), 0));
    const ok = await confirmDialog('¿Borrar todos los archivos?',
      `${n === 1 ? 'El archivo' : 'Los ' + n + ' archivos'} (${size}) de Archivos se irán a la papelera; tienes 30 días para recuperarlos. Los archivos de tus proyectos no se tocan.`, 'Borrar todo');
    if (!ok) return;
    // Si suena una canción de Archivos, se cierra el reproductor (su archivo ya no existirá).
    if (window.nowPlayingId && mine.some(f => f.id === window.nowPlayingId) && typeof window.closePlayer === 'function') window.closePlayer();
    toast('Borrando ' + n + (n === 1 ? ' archivo…' : ' archivos…'));
    try {
      const r = await apiBulk('POST', '/files/delete', { all: true, filters: { project_id: 'none' } });
      toast(r.total === 1 ? 'Se eliminó 1 archivo' : 'Se eliminaron ' + r.total + ' archivos');
    } catch (e) {
      toast(e.message || 'No se pudieron borrar todos los archivos');
    }
    // Recarga la lista real y los proyectos (sus archivos también se borraron).
    filesLoaded = false;
    (store.projects || []).forEach(p => { if (p.documents && p.documents.some(d => d.kind === 'file')) p._loaded = false; });
    loadFiles();
    render();
  }

  // Visor de imagen: se VE la imagen (inline, no descarga). Solo descarga si
  // el usuario pulsa «Descargar».
  function openImageViewer(f) {
    const ov = el('div', { class: 'img-viewer', style: {
      position: 'fixed', inset: '0', zIndex: '9999', background: 'rgba(0,0,0,.88)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', gap: '14px'
    }, onclick: (e) => { if (e.target === ov) ov.remove(); } });
    const img = el('img', { src: f.downloadUrl + '?inline=1', alt: f.title, style: {
      maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '10px', background: '#fff'
    } });
    const bar = el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' } }, [
      el('a', { class: 'btn btn-primary btn-sm', href: f.downloadUrl, download: f.title }, 'Descargar'),
      el('button', { class: 'btn btn-ghost btn-sm', style: { background: 'rgba(255,255,255,.15)', color: '#fff' }, onclick: () => ov.remove() }, 'Cerrar')
    ]);
    ov.append(img, bar);
    document.body.appendChild(ov);
  }

  function openFileMenu(f) {
    sheet(f.title, [
      { label: 'Abrir', icon: ICON_OPEN, onClick: () => openFile(f) },
      { label: 'Compartir enlace', icon: ICON_SHARE, onClick: () => openShareDialog(f) },
      { label: 'Eliminar', icon: ICON_DELETE, danger: true, onClick: () => deleteFile(f) }
    ]);
  }

  // Sube uno o muchos archivos (cola en paralelo con progreso; ver media.js).
  function uploadFiles() {
    pickAndUpload({
      onItem: function (it) {
        if (!Array.isArray(store.files)) store.files = [];
        if (!store.files.some(x => x.id === it.id)) store.files.unshift(mapUploadedFile(it));
        filesLoaded = true;
      }
    });
  }
