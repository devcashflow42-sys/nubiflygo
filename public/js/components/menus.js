'use strict';
/* components/menus.js — Menús de acción y documentos: proyecto, nota, color de nota, documento, visor, subir archivo. */

  function openProjectMenu(p) {
    sheet(p.name, [
      { label: 'Abrir', icon: ICON_OPEN, onClick: () => go('projects', { projectId: p.id }) },
      { label: 'Renombrar', icon: ICON_RENAME, onClick: () => openProjectModal(p) },
      { label: 'Eliminar proyecto', icon: ICON_DELETE, danger: true, onClick: () => confirmDeleteProject(p) }
    ]);
  }

  function openNoteMenu(n) {
    sheet(n.title || 'Sin título', [
      { label: 'Abrir', icon: ICON_OPEN, onClick: () => go('notes', { noteId: n.id }) },
      { label: 'Cambiar color', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.4-.7 1.4-1.5 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.5 1.5-1.5h1.8c3 0 5.3-2.5 5.3-5.5C21 6.1 16.9 2 12 2z"/></svg>', onClick: () => openNoteColorSheet(n) },
      { label: 'Duplicar', icon: ICON_DUP, onClick: () => {
          const copy = Object.assign({}, n, { id: uid(), title: (n.title || 'Sin título') + ' (copia)', createdAt: Date.now(), updatedAt: Date.now() });
          store.notes.unshift(copy);
          writeStore(store);
          logActivity('note', 'Nota duplicada');
          toast('Nota duplicada'); render();
      }},
      { label: 'Eliminar nota', icon: ICON_DELETE, danger: true, onClick: () => deleteNote(n) }
    ]);
  }

  function openNoteColorSheet(n) {
    const items = PROJECT_COLORS.map(c => ({
      label: colorName(c),
      icon: '<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:' + c + '"></span>',
      onClick: () => {
        n.color = c; n.updatedAt = Date.now();
        writeStore(store); toast('Color actualizado'); render();
      }
    }));
    sheet('Color de la nota', items);
  }

  function colorName(c) {
    const map = {
      '#2b5fff': 'Azul', '#8b5cf6': 'Violeta', '#ef4444': 'Rojo', '#f59e0b': 'Ámbar',
      '#10b981': 'Esmeralda', '#06b6d4': 'Cian', '#ec4899': 'Rosa', '#f97316': 'Naranja'
    };
    return map[c] || c;
  }

  function openDocMenu(project, d) {
    sheet(d.title, [
      { label: 'Abrir', icon: ICON_OPEN, onClick: () => openDocViewer(project, d) },
      { label: d.published ? 'Despublicar' : 'Publicar',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        onClick: () => togglePublish(project, d) },
      d.kind === 'file' && d._server ? { label: 'Compartir enlace', icon: ICON_SHARE, onClick: () => openShareDialog(d) } : null,
      { label: d.kind === 'file' ? 'Eliminar archivo' : 'Eliminar documento', icon: ICON_DELETE, danger: true, onClick: () => deleteProjectDoc(project, d) }
    ]);
  }

  // Elimina un documento o archivo del proyecto (en el servidor y de la vista).
  async function deleteProjectDoc(project, d) {
    const isFile = d.kind === 'file';
    const ok = await confirmDialog(isFile ? '¿Eliminar archivo?' : '¿Eliminar documento?', `"${d.title}" se irá a la papelera. Tienes 30 días para recuperarlo.`, 'Eliminar');
    if (!ok) return;
    if (d._server) {
      try {
        await apiDelete((isFile ? '/files/' : '/documents/') + d.id);
      } catch (e) { if (e.status !== 404) { toast(e.message || 'No se pudo eliminar'); return; } }
    }
    project.documents = (project.documents || []).filter(x => x.id !== d.id);
    project.updatedAt = Date.now();
    if (typeof loadTrash === 'function') loadTrash();
    logActivity('doc', (isFile ? 'Archivo' : 'Documento') + ' eliminado');
    toast(isFile ? 'Archivo eliminado' : 'Documento eliminado'); render();
  }

  function openDocModal(project) {
    let title = '', content = '';
    const tInp = el('input', { type: 'text', placeholder: 'Título del documento', autofocus: '' });
    const cInp = el('textarea', { placeholder: 'Escribe el contenido…', rows: '6' });
    tInp.addEventListener('input', e => title = e.target.value);
    cInp.addEventListener('input', e => content = e.target.value);

    let m;
    // Guarda el documento en el servidor (base de datos), vinculado al proyecto.
    async function submit(btn) {
      const t = tInp.value.trim();
      if (!t) { tInp.focus(); return; }
      if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
      try {
        const d = await apiPost('/documents', { title: t, content: cInp.value, project_id: project.id });
        const it = d.item || {};
        project.documents = project.documents || [];
        project.documents.unshift({
          id: it.id, kind: 'doc', title: it.title || t, content: it.content != null ? it.content : cInp.value, _server: true,
          createdAt: it.created_at ? Date.parse(it.created_at) : Date.now(),
          updatedAt: it.updated_at ? Date.parse(it.updated_at) : Date.now()
        });
        project.updatedAt = Date.now();
        logActivity('doc', 'Documento "' + t + '" en ' + project.name);
        m.close(); render(); toast('Documento creado');
      } catch (e) {
        toast(e.message || 'No se pudo crear el documento');
        if (btn) { btn.disabled = false; btn.textContent = 'Crear'; }
      }
    }
    m = modal({
      title: 'Nuevo documento',
      body: el('div', {}, [
        el('div', { class: 'field' }, [ el('label', {}, 'Título'), tInp ]),
        el('div', { class: 'field' }, [ el('label', {}, 'Contenido'), cInp ])
      ]),
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Crear', kind: 'primary', onClick: (e) => { submit(e && e.target); return false; }, keepOpen: true }
      ]
    });
  }

  async function openDocViewer(project, d) {
    // Archivos subidos al proyecto: imagen → visor; otro tipo → abrir/descargar.
    if (d.kind === 'file') {
      const url = d.downloadUrl || d.dataUrl;
      if ((d.mime || d.type || '').startsWith('image/') || (d.dataUrl || '').startsWith('data:image')) {
        const src = d.downloadUrl ? (d.downloadUrl + '?inline=1') : d.dataUrl;
        modal({
          title: d.title,
          body: el('div', {}, [
            el('div', { style: { fontSize: '12px', color: 'var(--fg-muted)', marginBottom: '10px' } }, formatBytes(d.size) + ' · Actualizado ' + timeAgo(d.updatedAt)),
            el('img', { src, style: { maxWidth: '100%', borderRadius: '8px' } })
          ]),
          actions: [ { label: 'Cerrar', kind: 'ghost' } ]
        });
      } else if (url) {
        window.open(url, '_blank', 'noopener');
      }
      return;
    }
    // Documentos de texto: si vienen del servidor sin contenido, se pide al abrir.
    let content = d.content;
    if (content == null && d._server) {
      try { const r = await apiGet('/documents/' + d.id); content = (r.item && r.item.content) || ''; d.content = content; }
      catch (e) { content = ''; }
    }
    modal({
      title: d.title,
      body: el('div', {}, [
        el('div', { style: { fontSize: '12px', color: 'var(--fg-muted)', marginBottom: '10px' } }, 'Actualizado ' + timeAgo(d.updatedAt)),
        el('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13.5px', lineHeight: '1.6', margin: '0', color: 'var(--fg)' } }, content || 'Vacío')
      ]),
      actions: [ { label: 'Cerrar', kind: 'ghost' } ]
    });
  }

  function fileInput(project) {
    // Se suben al servidor vinculados al proyecto (project_id), varios a la vez.
    pickAndUpload({
      projectId: project.id,
      onItem: function (it) {
        project.documents = project.documents || [];
        if (!project.documents.some(x => x.id === it.id)) project.documents.unshift(mapDetailFile(it));
        project.updatedAt = Date.now();
      }
    });
  }
