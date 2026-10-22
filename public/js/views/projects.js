'use strict';
/* views/projects.js — Vistas de Proyectos: lista, detalle, tabs, tarjetas de documento. */

  /* ───────────── Projects (conectados al servidor) ───────────── */
  let projectsLoaded = false, projectsLoading = false;

  // Convierte un proyecto del servidor al formato de la vista.
  function mapServerProject(p) {
    return {
      id: p.id, name: p.name, description: p.description || '', color: safeColor(p.color),
      // Icono elegido (null = «Auto»: se pone solo según el contenido).
      icon: p.icon || null,
      visibility: 'private', members: [], documents: [], _loaded: false,
      contentCount: (Number(p.doc_count) || 0) + (Number(p.file_count) || 0),
      createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(),
      updatedAt: p.updated_at ? Date.parse(p.updated_at) : Date.now()
    };
  }

  // Carga completa del proyecto desde el servidor: documentos + archivos reales
  // (GET /api/v1/projects/:id). Se vinculan por project_id en la base de datos.
  const projectDetailLoading = {};
  // Trae el proyecto con TODOS sus documentos y archivos en una sola petición
  // (?all=1). Si un servidor antiguo aún pagina, se piden las páginas que falten.
  async function fetchProjectAll(id) {
    const d = await apiGet('/projects/' + id + '?all=1&limit=100');
    const it = (d && d.data && d.data.item) || null;
    if (!it) return null;
    const docs = ((it.documents && it.documents.items) || []).slice();
    const files = ((it.files && it.files.items) || []).slice();
    async function rest(kind, list, first) {
      let more = first && first.has_more, page = 2;
      while (more && page <= 200) {
        const pg = await apiGet('/projects/' + id + '/' + kind + '?limit=100&page=' + page);
        (pg.items || []).forEach(x => list.push(x));
        more = !!pg.has_more && (pg.items || []).length > 0;
        page++;
      }
    }
    await Promise.all([rest('documents', docs, it.documents), rest('files', files, it.files)]);
    return { it, docs: docs.map(mapDetailDoc), files: files.map(mapDetailFile) };
  }
  function loadProjectDetail(id) {
    const p = store.projects.find(x => x.id === id);
    if (!p || p._loaded || projectDetailLoading[id]) return;
    projectDetailLoading[id] = true;
    fetchProjectAll(id)
      .then(function (all) {
        if (!all) return;
        const it = all.it;
        p.description = it.description || '';
        if (it.color) p.color = safeColor(it.color);
        p.icon = it.icon || null;
        p.visibility = it.visibility || 'private';
        if (it.created_at) p.createdAt = Date.parse(it.created_at);
        if (it.updated_at) p.updatedAt = Date.parse(it.updated_at);
        p.documents = all.docs.concat(all.files);
        p._loaded = true;
      })
      .catch(function (e) { p._loaded = true; if (e.status !== 401) toast(e.message || 'No se pudo cargar el proyecto'); })
      .then(function () { projectDetailLoading[id] = false; if (state.route === 'projects' && state.projectId === id) render(); });
  }
  function mapDetailDoc(d) {
    return {
      id: d.id, kind: 'doc', title: d.title || d.name || 'Sin título', content: d.content, excerpt: d.excerpt || '', _server: true,
      published: !!d.published, publishedAt: d.published_at ? Date.parse(d.published_at) : null,
      createdAt: d.created_at ? Date.parse(d.created_at) : Date.now(),
      updatedAt: d.updated_at ? Date.parse(d.updated_at) : Date.now()
    };
  }
  function mapDetailFile(f) {
    return {
      id: f.id, kind: 'file', title: f.name, size: (f.size && f.size.bytes) || 0,
      mime: f.mime_type || '', type: f.mime_type || '', _server: true,
      published: !!f.published, publishedAt: f.published_at ? Date.parse(f.published_at) : null,
      thumbUrl: (f.thumbnail && f.thumbnail.url) || null,
      media: f.media || null,
      downloadUrl: '/api/v1/files/' + f.id + '/download',
      createdAt: f.created_at ? Date.parse(f.created_at) : Date.now(),
      updatedAt: f.updated_at ? Date.parse(f.updated_at) : Date.now()
    };
  }
  function loadProjects() {
    if (projectsLoaded || projectsLoading) return;
    projectsLoading = true;
    apiGet('/projects')
      .then(function (d) { store.projects = (d.items || []).map(mapServerProject); projectsLoaded = true; })
      .catch(function (e) { projectsLoaded = true; if (e.status !== 401) toast(e.message || 'No se pudieron cargar los proyectos'); })
      .then(function () { projectsLoading = false; render(); });
  }

  /* ───────────── Projects views ───────────── */
  function viewProjects() {
    if (state.projectId) return viewProjectDetail();
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(pageToolbar({
      back: () => go('dashboard'),
      title: 'Proyectos',
      actions: [
        el('button', { class: 'btn btn-primary btn-sm', onclick: () => openProjectModal(), html: ICON_PLUS_SM + '<span style="margin-left:4px">Nuevo</span>' })
      ]
    }));

    if (!projectsLoaded) {
      loadProjects();
      v.appendChild(el('div', { class: 'board-body' }, [
        skelProjects(6)
      ]));
      return;
    }
    v.appendChild(el('div', { class: 'board-tools', style: { paddingTop: '14px' } }, [
      searchInput('Buscar proyectos…')
    ]));

    const body = el('div', { class: 'board-body' });
    const q = state.search.toLowerCase();
    const filtered = store.projects.filter(p => !q || p.name.toLowerCase().includes(q));
    if (store.projects.length === 0) {
      body.appendChild(emptyBlock('Aquí vivirán tus proyectos', 'Crea un proyecto para empezar a organizar documentos, archivos e informes.', 'Crear primer proyecto', () => openProjectModal()));
    } else if (filtered.length === 0) {
      body.appendChild(emptyBlock('Sin resultados', 'Ningún proyecto coincide con tu búsqueda.', null));
    } else {
      // Agrupados por categoría automática (según lo que tiene cada proyecto).
      if (typeof loadFiles === 'function') loadFiles();
      const groups = new Map();
      ['music', 'photos', 'videos', 'docs', 'mixed', null].forEach(c => groups.set(c, []));
      filtered.forEach(p => groups.get(projectCategory(projectItems(p))).push(p));
      const add = el('button', { class: 'add-project', onclick: () => openProjectModal() }, [
        el('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' }),
        'Nuevo proyecto'
      ]);
      const shown = [...groups.entries()].filter(([, ps]) => ps.length);
      shown.forEach(([c, ps], i) => {
        const meta = c ? CAT[c] : null;
        body.appendChild(el('div', { class: 'pg-head' }, [
          el('span', { class: 'pg-ico', style: { background: meta ? meta.color : 'var(--fg-faint)' }, html: meta ? meta.icon : KIND_ICON_LIB('mixed') }),
          el('strong', {}, meta ? meta.label : 'Sin archivos todavía'),
          el('span', {}, '· ' + ps.length)
        ]));
        const grid = el('div', { class: 'project-grid' });
        ps.forEach(p => grid.appendChild(projectCard(p)));
        if (i === shown.length - 1) grid.appendChild(add);
        body.appendChild(grid);
      });
    }
    v.appendChild(body);
  }

  // Conteo real del contenido (documentos + archivos). Si el proyecto ya se
  // abrió, usa lo cargado; si no, el total que devolvió la lista del servidor.
  // Lo usan la tarjeta del proyecto y el Inicio, para que digan lo mismo.
  function projectItemCount(p) {
    return p._loaded ? (p.documents?.length || 0) : (p.contentCount != null ? p.contentCount : (p.documents?.length || 0));
  }

  function projectCard(p) {
    const docCount = projectItemCount(p);
    const memCount = p.members?.length || 0;
    const metaBits = [ docCount + (docCount === 1 ? ' doc' : ' docs') ];
    if (memCount) metaBits.push(memCount + (memCount === 1 ? ' miembro' : ' miembros'));
    metaBits.push(timeAgo(p.updatedAt));

    return el('div', {
      class: 'project-card',
      style: { '--c': safeColor(p.color) },
      onclick: () => go('projects', { projectId: p.id })
    }, [
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'card-action',
          title: 'Renombrar',
          'aria-label': 'Renombrar',
          onclick: (e) => { e.stopPropagation(); openProjectModal(p); },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        }),
        el('button', {
          class: 'card-action danger',
          title: 'Eliminar',
          'aria-label': 'Eliminar',
          onclick: (e) => { e.stopPropagation(); confirmDeleteProject(p); },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
        })
      ]),
      el('div', { class: 'pc-row' }, [
        projectThumb(p),
        el('div', { class: 'pc-txt' }, [
          el('div', { class: 'project-name' }, p.name),
          el('div', { class: 'project-meta' }, metaBits.map((t, i) => el('span', {}, (i > 0 ? '· ' : '') + t)))
        ])
      ])
    ]);
  }

  async function confirmDeleteProject(p) {
    const ok = await confirmDialog('¿Eliminar proyecto?', `"${p.name}" y todos sus documentos se eliminarán para siempre.`, 'Eliminar');
    if (!ok) return;
    stopPlayerIfIn(p);
    try {
      // Un proyecto grande se borra por tandas (el servidor responde «pendiente»).
      await apiBulk('DELETE', '/projects/' + p.id);
    } catch (e) {
      // 404 = ya no existe en el servidor → se trata como ya eliminado.
      if (e.status !== 404) { toast(e.message || 'No se pudo eliminar el proyecto'); return; }
    }
    forgetProjectFiles(p);
    store.projects = store.projects.filter(x => x.id !== p.id);
    toast('Proyecto eliminado');
    if (state.projectId === p.id) state.projectId = null;
    render();
  }

  // Vacía el proyecto: borra todos sus documentos y archivos (el proyecto queda).
  async function emptyProject(p) {
    const n = (p.documents || []).length;
    const ok = await confirmDialog('¿Vaciar el proyecto?',
      `Se eliminarán para siempre ${n === 1 ? 'su único elemento' : 'sus ' + n + ' documentos y archivos'} de "${p.name}". El proyecto se conserva.`, 'Vaciar');
    if (!ok) return;
    stopPlayerIfIn(p);
    toast('Vaciando «' + p.name + '»…');
    try {
      const r = await apiBulk('POST', '/projects/' + p.id + '/items/delete', { all: true });
      toast(r.total === 1 ? 'Se eliminó 1 elemento' : 'Se eliminaron ' + r.total + ' elementos');
    } catch (e) {
      toast(e.message || 'No se pudo vaciar el proyecto');
      p._loaded = false; render(); return;
    }
    forgetProjectFiles(p);
    p.documents = []; p.contentCount = 0; p.updatedAt = Date.now();
    render();
  }
  // Si suena una canción de este proyecto, se cierra el reproductor.
  function stopPlayerIfIn(p) {
    const id = window.nowPlayingId;
    if (id && (p.documents || []).some(d => d.id === id) && typeof window.closePlayer === 'function') window.closePlayer();
  }
  // Quita de la lista de Archivos los que pertenecían al proyecto.
  function forgetProjectFiles(p) {
    if (Array.isArray(store.files)) store.files = store.files.filter(f => f.project_id !== p.id);
  }

  function viewProjectDetail() {
    const p = store.projects.find(x => x.id === state.projectId);
    if (!p) {
      // Enlace directo a /project/<id>: los proyectos aún no están en memoria.
      if (!projectsLoaded) { loadProjects(); return renderDetailLoading(); }
      state.projectId = null; return viewProjects();
    }
    if (!p.visibility) p.visibility = 'private';
    if (p.visibility === 'team') p.visibility = 'private';
    if (!p._loaded) loadProjectDetail(p.id);
    ensureProjectKeys(p);

    const v = $('#view');
    v.innerHTML = '';

    const pubCount = (p.documents || []).filter(d => d.published).length;
    const docCount = (p.documents || []).length;
    // Las claves reales del proyecto son las de store.apiKeys con este project_id.
    const keyCount = (store.apiKeys || []).filter(k => k.project_id === p.id).length;

    v.appendChild(pageToolbar({
      back: () => go('projects', { projectId: null }),
      dotColor: safeColor(p.color),
      crumbs: [
        { label: 'Proyectos', onClick: () => go('projects', { projectId: null }) },
        { label: p.name, here: true }
      ],
      extras: [ visBadge(p.visibility) ]
    }));

    // Portada grande: mosaico de portadas, categoría automática y acciones.
    const items = p.documents || [];
    const cat = p._loaded ? projectCategory(items) : null;
    const menuBtn = el('button', { type: 'button', class: 'ph-btn is-icon', 'aria-label': 'Opciones del proyecto', title: 'Opciones del proyecto', html: LIB_ICN.dots,
      onclick: (e) => popup(e, projectMenuItems(p, docCount)) });
    // Sin «Reproducir todo» ni aleatorio: el encabezado es el mismo para todos
    // los proyectos. Las canciones se reproducen tocándolas en la lista.
    v.appendChild(projectHero(p, p._loaded ? items : [], [
      heroBtn('Subir', LIB_ICN.upload, () => fileInput(p)),
      cat !== 'music' && cat !== 'photos' ? heroBtn('Nuevo documento', LIB_ICN.plus, () => openDocModal(p)) : null,
      heroBtn('Publicar', LIB_ICN.globe, () => { state.projectTab = 'pub'; render(); }),
      menuBtn
    ]));

    const tab = state.projectTab || 'docs';
    v.appendChild(el('div', { class: 'lib-tabs ph-tabs', role: 'tablist', 'aria-label': 'Secciones del proyecto' }, [
      tabBtn('docs', KIND_ICON_LIB('mixed'), 'Contenido', docCount, tab),
      tabBtn('pub', LIB_ICN.globe, 'Publicados', pubCount, tab),
      tabBtn('apikey', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 7.5-7.5 1.65 1.65 1.5-1.5-3.15-3.15-9 9"/></svg>', 'API key', keyCount, tab),
      tabBtn('settings', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', 'Ajustes', null, tab)
    ]));

    const body = el('div', { class: 'board-body' });
    if (!p._loaded && (tab === 'docs' || tab === 'pub')) {
      body.appendChild(skelGrid(8, { label: 'Cargando el proyecto…' }));
    } else if (tab === 'docs') tabContent(p, body, cat);
    else if (tab === 'pub') tabPublished(p, body);
    else if (tab === 'apikey') tabApiKey(p, body);
    else if (tab === 'settings') tabSettings(p, body);
    else tabDocuments(p, body);
    v.appendChild(body);
  }

  // Opciones del proyecto (botón ⋯ de la portada).
  function projectMenuItems(p, docCount) {
    return [
      { label: 'Editar proyecto', icon: ICON_RENAME, onClick: () => openProjectModal(p) },
      { label: 'Copiar ID del proyecto', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', onClick: () => copyText(p.id) },
      '-',
      docCount ? { label: 'Vaciar proyecto', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11l4 4M14 11l-4 4"/></svg>', danger: true, onClick: () => emptyProject(p) } : null,
      { label: 'Eliminar proyecto', icon: ICON_DELETE, danger: true, onClick: () => confirmDeleteProject(p) }
    ].filter(Boolean);
  }

  // Contenido: biblioteca de música, galería de fotos o la cuadrícula de siempre.
  function tabContent(p, body, cat) {
    const items = p.documents || [];
    const ctx = { key: 'project:' + p.id, onMenu: (d) => openDocMenu(p, d), grid: () => { const b = el('div'); tabDocuments(p, b); return b; } };
    if (cat === 'music') return body.appendChild(musicLibrary(items, ctx));
    if (cat === 'photos') return body.appendChild(photoLibrary(items, ctx));
    // Proyecto con varios tipos: pestañas Todo · Música · Fotos · Videos, cada
    // una con su diseño (biblioteca de música, galería). Empieza en el tipo
    // que más tiene; «Todo» es la cuadrícula de siempre.
    const kindOf = (d) => d.kind === 'file' ? mediaKind(d.mime, d.title) : 'doc';
    const groups = [
      ['music', 'Música', items.filter(d => kindOf(d) === 'audio')],
      ['photos', 'Fotos', items.filter(d => kindOf(d) === 'image')],
      ['videos', 'Videos', items.filter(d => kindOf(d) === 'video')]
    ].filter(g => g[2].length);
    if (!groups.length) return tabDocuments(p, body);
    state.projectKind = state.projectKind || {};
    let cur = state.projectKind[p.id];
    if (!cur || (cur !== 'all' && !groups.some(g => g[0] === cur))) cur = groups.slice().sort((a, b) => b[2].length - a[2].length)[0][0];
    const pick = (k) => { state.projectKind[p.id] = k; render(); };
    body.appendChild(el('div', { class: 'lib-tabs pk-tabs', role: 'tablist', 'aria-label': 'Tipo de contenido' },
      [['all', 'Todo', items.length]].concat(groups.map(g => [g[0], g[1], g[2].length])).map(t => el('button', {
        type: 'button', role: 'tab', class: 'lib-tab' + (t[0] === cur ? ' on' : ''), 'aria-selected': t[0] === cur ? 'true' : 'false', onclick: () => pick(t[0])
      }, [ t[1], el('b', {}, String(t[2])) ]))));
    if (cur === 'all') return tabDocuments(p, body);
    const g = groups.find(x => x[0] === cur);
    const sub = Object.assign({}, ctx, { key: ctx.key + ':' + cur, grid: null });
    body.appendChild(cur === 'music' ? musicLibrary(g[2], sub) : photoLibrary(g[2], sub));
  }

  // Marcador mientras llega la lista de proyectos (entrada directa a un enlace).
  function renderDetailLoading() {
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(el('div', { class: 'board-body' }, [
      skelGrid(8, { label: 'Cargando el proyecto…' })
    ]));
  }

  function tabBtn(key, iconHtml, label, count, active) {
    const on = active === key;
    const b = el('button', {
      type: 'button', role: 'tab', class: 'lib-tab' + (on ? ' on' : ''), 'aria-selected': on ? 'true' : 'false',
      onclick: () => { state.projectTab = key; state.search = ''; render(); }
    }, [
      el('span', { class: 'lib-tab-ico', html: iconHtml }),
      label,
      count != null ? el('b', {}, String(count)) : null
    ].filter(Boolean));
    return b;
  }

  function visBadge(v) {
    const map = {
      private: { label: 'Privado', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
      team:    { label: 'Equipo',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' },
      public:  { label: 'Público',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' }
    };
    const d = map[v] || map.private;
    return el('span', { class: 'vis-badge', html: d.icon + ' ' + d.label });
  }

  function tabDocuments(p, body) {
    const headerTools = el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '10px 0 14px' } }, [
      searchInput('Buscar en este proyecto…'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => fileInput(p) }, [
        el('span', { html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' }),
        'Subir'
      ]),
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => openDocModal(p) }, [
        el('span', { html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' }),
        'Nuevo documento'
      ])
    ]);
    body.appendChild(headerTools);

    const q = state.search.toLowerCase();
    const docs = (p.documents || []).filter(d => !q || d.title.toLowerCase().includes(q));
    if (!p.documents || p.documents.length === 0) {
      body.appendChild(emptyBlock('Aquí vivirá tu trabajo', 'Este proyecto todavía está vacío. Crea tu primer documento o sube archivos para empezar.', 'Crear primer documento', () => openDocModal(p)));
    } else if (docs.length === 0) {
      body.appendChild(emptyBlock('Sin resultados', 'Ningún documento coincide con tu búsqueda.', null));
    } else {
      // Misma cuadrícula que Archivos: 2 columnas en el teléfono, con banner.
      const pg = paginate(docs, 'project:' + p.id);
      const grid = el('div', { class: 'doc-grid file-grid' });
      pg.items.forEach(d => grid.appendChild(docCard(p, d, docs)));
      body.appendChild(grid);
      if (pg.el) body.appendChild(pg.el);
    }
  }

  // Publicados: portadas con «Público», ▶ para música y video, y en cada una
  // compartir, dejar de publicar y eliminar. Abajo, lo que aún no se publica.
  function tabPublished(p, body) {
    const all = p.documents || [];
    const pub = all.filter(d => d.published);
    if (!all.length) {
      body.appendChild(emptyBlock('Nada publicado todavía', 'Sube archivos o crea un documento y publícalo para que aparezca aquí.', 'Subir archivos', () => fileInput(p)));
      return;
    }
    body.appendChild(libSec('Publicados'));
    if (!pub.length) {
      body.appendChild(el('p', { class: 'lib-empty' }, 'Aún no publicas nada de este proyecto. Activa el interruptor de un archivo abajo para publicarlo.'));
    } else {
      body.appendChild(el('div', { class: 'lib-albums pub-grid' }, pub.map(d => pubCard(p, d, pub))));
    }
    const rest = all.filter(d => !d.published);
    if (rest.length) {
      body.appendChild(libSec('Publicar más'));
      const list = el('div', { class: 'list' });
      rest.forEach(d => list.appendChild(pubToggleRow(p, d)));
      body.appendChild(list);
    }
  }

  function pubCard(p, d, list) {
    const isFile = d.kind === 'file';
    const k = isFile ? mediaKind(d.mime, d.title) : 'doc';
    const playable = isFile && /^(audio|video)$/.test(k);
    const title = isFile ? fileTexts(d).title : d.title;
    const sub = k === 'audio' ? ((d.media && d.media.artist) || 'Canción') : (isFile ? formatBytes(d.size || 0) : 'Documento') + ' · ' + timeAgo(d.publishedAt || d.updatedAt);
    const open = () => (playable ? (k === 'audio' ? playAudio(d, list.filter(x => x.kind === 'file' && mediaKind(x.mime, x.title) === 'audio')) : openMedia(d, null, list)) : (isFile && k === 'image' ? openImageViewer(d) : openDocViewer(p, d)));
    const url = libThumb(d);
    const cover = el('div', { class: 'lib-cv', style: { background: libGrad(d.id) } }, [ el('span', { class: 'lib-ini pub-ico', html: KIND_ICON_LIB(k === 'audio' ? 'audio' : k === 'video' ? 'video' : k === 'image' ? 'image' : 'doc') }) ]);
    if (url) { const im = el('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' }); im.addEventListener('error', () => im.remove()); cover.appendChild(im); }
    return el('div', { class: 'lib-album pub-card' }, [
      el('button', { type: 'button', class: 'lib-album-open', 'aria-label': 'Abrir ' + title, onclick: open }, [ cover ]),
      el('span', { class: 'pub-badge', html: LIB_ICN.globe + ' Público' }),
      playable ? el('button', { type: 'button', class: 'lib-cv-play', 'aria-label': 'Reproducir ' + title, title: 'Reproducir', html: LIB_ICN.play, onclick: open }) : null,
      el('div', { class: 'pub-acts' }, [
        isFile ? el('button', { type: 'button', class: 'pub-act', 'aria-label': 'Compartir enlace de ' + title, title: 'Compartir enlace', html: ICON_SHARE, onclick: () => openShareDialog(d) }) : null,
        el('button', { type: 'button', class: 'pub-act', 'aria-label': 'Dejar de publicar ' + title, title: 'Dejar de publicar', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>', onclick: () => togglePublish(p, d) }),
        el('button', { type: 'button', class: 'pub-act danger', 'aria-label': 'Eliminar ' + title, title: 'Eliminar', html: LIB_ICN.trash, onclick: () => deleteProjectDoc(p, d) })
      ].filter(Boolean)),
      el('strong', { title }, title),
      el('span', {}, sub)
    ].filter(Boolean));
  }

  function pubToggleRow(p, d) {
    return el('div', { class: 'list-row', style: { gridTemplateColumns: 'auto 1fr auto' } }, [
      fileThumb(d),
      el('div', { class: 'lr-main' }, [
        el('div', { class: 'lr-title', style: { fontSize: '13px' } }, d.kind === 'file' ? fileTexts(d).title : d.title),
        el('div', { class: 'lr-sub' }, d.published ? ('Publicado · ' + timeAgo(d.publishedAt || d.updatedAt)) : 'Privado')
      ]),
      el('button', {
        class: 'switch' + (d.published ? ' on' : ''),
        title: d.published ? 'Despublicar' : 'Publicar',
        onclick: () => togglePublish(p, d)
      })
    ]);
  }

  async function togglePublish(p, d) {
    const next = !d.published;
    // Se guarda en el servidor (archivos en /files, documentos en /documents)
    // para que el estado "Publicado" NO se pierda al recargar.
    try {
      if (d._server) {
        if (d.kind === 'file') await apiPatch('/files/' + d.id, { published: next });
        else await apiPatch('/documents/' + d.id, { published: next });
      }
    } catch (e) { toast(e.message || 'No se pudo cambiar la publicación'); return; }
    d.published = next;
    if (next) {
      d.publishedAt = Date.now();
      logActivity('doc', '"' + d.title + '" publicado');
      toast(d.kind === 'file' ? 'Archivo publicado' : 'Documento publicado');
    } else {
      d.publishedAt = null;
      logActivity('doc', '"' + d.title + '" despublicado');
      toast('Despublicado');
    }
    p.updatedAt = Date.now();
    render();
  }

  function tabMembers(p, body) {
    body.appendChild(el('p', { style: { color: 'var(--fg-muted)', margin: '0 0 14px', fontSize: '13.5px' } }, 'Las personas con acceso a este proyecto. Los roles controlan lo que pueden hacer.'));

    // Add member row
    const emailInp = el('input', { type: 'email', placeholder: 'correo@ejemplo.com' });
    const roleSel = el('select', {}, [
      el('option', { value: 'viewer' }, 'Visor'),
      el('option', { value: 'editor' }, 'Editor'),
      el('option', { value: 'admin' }, 'Admin')
    ]);
    const addBtn = el('button', { class: 'btn btn-primary btn-sm' }, 'Añadir miembro');
    const doAdd = () => {
      const em = emailInp.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { emailInp.focus(); toast('Correo no válido'); return; }
      if (p.members.some(m => m.email.toLowerCase() === em.toLowerCase())) { toast('Ese miembro ya está'); return; }
      p.members.push({ id: uid(), email: em, name: em.split('@')[0], role: roleSel.value });
      p.updatedAt = Date.now();
      writeStore(store);
      logActivity('project', 'Miembro añadido a ' + p.name);
      render();
    };
    addBtn.addEventListener('click', doAdd);
    emailInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    body.appendChild(el('div', { class: 'add-member-row' }, [ emailInp, roleSel, addBtn ]));

    // Owner row
    const list = el('div', { class: 'list' });
    list.appendChild(el('div', { class: 'list-row' }, [
      el('div', { class: 'avatar-sm' }, 'S'),
      el('div', { class: 'lr-main' }, [
        el('div', { class: 'lr-title' }, 'Sophia Lane (tú)'),
        el('div', { class: 'lr-sub' }, 'sophia@nubiflygo.app')
      ]),
      el('span', { class: 'role-pill admin' }, 'Propietario'),
      el('span', { style: { width: '26px' } })
    ]));

    if (p.members.length === 0) {
      list.appendChild(el('div', { style: { padding: '18px', textAlign: 'center', color: 'var(--fg-muted)', background: 'var(--surface-2)', border: '1px dashed var(--border-strong)', borderRadius: '12px' } }, 'Añade miembros para colaborar en este proyecto.'));
    } else {
      p.members.forEach(m => list.appendChild(memberRow(p, m)));
    }
    body.appendChild(list);
  }

  function memberRow(p, m) {
    const roleSel = el('select', { style: { padding: '4px 24px 4px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', color: 'var(--fg)', appearance: 'none', fontWeight: '600' } }, [
      el('option', { value: 'viewer' }, 'Visor'),
      el('option', { value: 'editor' }, 'Editor'),
      el('option', { value: 'admin' }, 'Admin')
    ]);
    roleSel.value = m.role;
    roleSel.addEventListener('change', e => { m.role = e.target.value; writeStore(store); toast('Rol actualizado'); });

    return el('div', { class: 'list-row' }, [
      el('div', { class: 'avatar-sm' }, (m.name[0] || 'U').toUpperCase()),
      el('div', { class: 'lr-main' }, [
        el('div', { class: 'lr-title' }, m.name),
        el('div', { class: 'lr-sub' }, m.email)
      ]),
      roleSel,
      el('button', {
        class: 'icon-btn',
        title: 'Quitar miembro',
        onclick: async () => {
          const ok = await confirmDialog('¿Quitar a este miembro?', `${m.email} dejará de tener acceso al proyecto.`, 'Quitar');
          if (!ok) return;
          p.members = p.members.filter(x => x.id !== m.id);
          writeStore(store); toast('Miembro quitado'); render();
        },
        html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      })
    ]);
  }

  function tabSettings(p, body) {
    body.appendChild(el('p', { style: { color: 'var(--fg-muted)', margin: '0 0 16px', fontSize: '13.5px' } }, 'Configuración y visibilidad del proyecto.'));

    const kv = el('div', { style: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' } });
    const row = (label, value, action) => {
      const r = el('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' } }, [
        el('div', { style: { color: 'var(--fg-muted)', fontSize: '13px' } }, label),
        el('div', { style: { fontSize: '13.5px', fontWeight: '500' } }, value),
        action || el('span', {})
      ]);
      kv.appendChild(r);
    };
    row('Nombre', p.name, el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openProjectModal(p) }, 'Editar'));
    if (p.description) row('Descripción', p.description.length > 60 ? p.description.slice(0, 60) + '…' : p.description, null);
    const visLabels = { private: 'Privado', public: 'Público' };
    row('Visibilidad', visLabels[p.visibility] || 'Privado', el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openProjectModal(p) }, 'Cambiar'));
    row('Creado', formatDate(p.createdAt), null);
    row('Última modificación', timeAgo(p.updatedAt), null);
    row('Documentos', String((p.documents || []).length), null);
    row('Publicados', String((p.documents || []).filter(d => d.published).length), null);
    row('Claves secretas', String((store.apiKeys || []).filter(k => k.project_id === p.id).length), el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { state.projectTab = 'apikey'; render(); } }, 'Ver'));
    // ID del proyecto
    const idRow = el('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: '12px', alignItems: 'center', padding: '10px 0' } }, [
      el('div', { style: { color: 'var(--fg-muted)', fontSize: '13px' } }, 'ID del proyecto'),
      el('code', { class: 'apikey-id' }, p.id),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => copyText(p.id) }, 'Copiar')
    ]);
    kv.appendChild(idRow);
    // quita el borde inferior de la última fila
    const rows = kv.children; if (rows.length) rows[rows.length - 2]?.style && (rows[rows.length - 2].style.borderBottom = '1px solid var(--border)');
    idRow.style.borderBottom = 'none';
    body.appendChild(kv);

    body.appendChild(el('div', { class: 'danger-zone' }, [
      el('h4', {}, 'Zona de peligro'),
      el('p', {}, 'Al eliminar este proyecto se perderán todos sus documentos y miembros. Esta acción no se puede deshacer.'),
      el('button', { class: 'btn btn-danger', onclick: () => confirmDeleteProject(p) }, [
        el('span', { html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-2px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>Eliminar proyecto'
        })
      ])
    ]));
  }

  function docCard(project, d, list) {
    const isFile = d.kind === 'file';
    const isMedia = isFile && /^(audio|video)$/.test(mediaKind(d.mime, d.title));
    const tx = isFile ? fileTexts(d) : null;
    const card = el('div', { class: 'doc-card file-card', onclick: () => (isMedia ? openMedia(d, null, list || project.documents) : openDocViewer(project, d)) }, [
      // Iconos de acción directa: más opciones (publicar, abrir…) y eliminar.
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'card-action', title: 'Opciones', 'aria-label': 'Opciones',
          onclick: (e) => { e.stopPropagation(); openDocMenu(project, d); },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'
        }),
        el('button', {
          class: 'card-action danger', title: 'Eliminar', 'aria-label': 'Eliminar',
          onclick: (e) => { e.stopPropagation(); deleteProjectDoc(project, d); },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
        })
      ]),
      // Documento de texto: banner con el inicio del contenido (mismo alto que los archivos).
      isFile ? fileBanner(d) : el('div', { class: 'fb-art fb-text' }, [
        (d.content || d.excerpt) ? el('p', { class: 'fb-text-preview' }, (d.content || d.excerpt).slice(0, 220))
          : el('span', { class: 'fb-icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>' }),
        el('span', { class: 'fb-badge' }, d.published ? 'Documento · Publicado' : 'Documento')
      ]),
      el('div', { class: 'fc-body' }, [
        el('div', { class: 'doc-title', title: isFile ? tx.title : d.title }, isFile ? tx.title : d.title),
        el('div', { class: 'doc-meta' }, isFile ? tx.sub : timeAgo(d.updatedAt))
      ])
    ].filter(Boolean));
    return card;
  }
