'use strict';
/* views/notes.js — Vistas de Notas: lista, editor, crear/eliminar. */

  /* ───────────── Notes (conectadas al servidor) ───────────── */
  let notesLoaded = false, notesLoading = false;

  function mapServerNote(n) {
    return {
      id: n.id, title: n.title || '', content: n.body || '',
      project_id: n.project_id || null, tags: [],
      createdAt: n.created_at ? Date.parse(n.created_at) : Date.now(),
      updatedAt: n.updated_at ? Date.parse(n.updated_at) : Date.now()
    };
  }
  function loadNotes() {
    if (notesLoaded || notesLoading) return;
    notesLoading = true;
    apiGet('/notes')
      .then(function (d) { store.notes = (d.items || []).map(mapServerNote); notesLoaded = true; })
      .catch(function (e) { notesLoaded = true; if (e.status !== 401) toast(e.message || 'No se pudieron cargar las notas'); })
      .then(function () { notesLoading = false; if (state.route === 'notes' || state.route === 'dashboard') render(); });
  }

  /* ───────────── Notes views ───────────── */
  function viewNotes() {
    if (state.noteId) return viewNoteEditor();
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(pageToolbar({
      back: () => go('dashboard'),
      title: 'Notas',
      actions: [
        el('button', { class: 'btn btn-primary btn-sm', onclick: () => createNote(), html: ICON_PLUS_SM + '<span style="margin-left:4px">Nueva</span>' })
      ]
    }));
    if (!notesLoaded) {
      loadNotes();
      v.appendChild(el('div', { class: 'board-body' }, [ skelList(5) ]));
      return;
    }
    v.appendChild(el('div', { class: 'board-tools', style: { paddingTop: '14px' } }, [ searchInput('Buscar notas…') ]));

    const body = el('div', { class: 'board-body' });
    const q = state.search.toLowerCase();
    const notes = [...store.notes]
      .filter(n => !q || n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q))
      .sort((a,b) => b.updatedAt - a.updatedAt);
    if (store.notes.length === 0) {
      body.appendChild(emptyBlock('Captura lo que piensas', 'Crea notas, resúmenes o ideas. Después puedes analizarlas: conteo de palabras, tiempo de lectura y temas principales.', 'Crear primera nota', () => createNote()));
    } else if (notes.length === 0) {
      body.appendChild(emptyBlock('Sin resultados', 'Ninguna nota coincide con tu búsqueda.', null));
    } else {
      const grid = el('div', { class: 'project-grid' });
      notes.forEach(n => grid.appendChild(noteCard(n)));
      grid.appendChild(el('button', { class: 'add-project', onclick: () => createNote() }, [
        el('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' }),
        'Nueva nota'
      ]));
      body.appendChild(grid);
    }
    v.appendChild(body);
  }

  function noteColor(n) {
    if (n.color) return n.color;
    let hash = 0;
    for (let i = 0; i < n.id.length; i++) hash = (hash * 31 + n.id.charCodeAt(i)) >>> 0;
    return PROJECT_COLORS[hash % PROJECT_COLORS.length];
  }

  function noteCard(n) {
    const words = (n.content || '').trim().split(/\s+/).filter(Boolean).length;
    const wordsLabel = words === 0 ? 'Vacía' : (words === 1 ? '1 palabra' : words.toLocaleString('es-MX') + ' palabras');
    return el('div', {
      class: 'project-card',
      style: { '--c': noteColor(n) },
      onclick: () => go('notes', { noteId: n.id })
    }, [
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'card-action danger',
          title: 'Eliminar', 'aria-label': 'Eliminar nota',
          onclick: (e) => { e.stopPropagation(); deleteNote(n); },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
        })
      ]),
      el('div', { class: 'project-name' }, n.title || 'Sin título'),
      el('div', { class: 'project-meta' }, [
        el('span', {}, wordsLabel),
        el('span', {}, '· ' + timeAgo(n.updatedAt))
      ])
    ]);
  }

  function viewNoteEditor() {
    const n = store.notes.find(x => x.id === state.noteId);
    if (!n) { state.noteId = null; return viewNotes(); }
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(pageToolbar({
      back: () => go('notes', { noteId: null }),
      dotColor: noteColor(n),
      crumbs: [
        { label: 'Notas', onClick: () => go('notes', { noteId: null }) },
        { label: n.title || 'Sin título', here: true }
      ],
      actions: [
        el('button', {
          class: 'icon-btn', title: 'Opciones', 'aria-label': 'Opciones',
          onclick: (e) => popup(e, [
            { label: 'Cambiar color', icon: ICON_RENAME, onClick: () => openNoteColorSheet(n) },
            { label: 'Duplicar', icon: ICON_DUP, onClick: async () => {
                try {
                  const d = await apiPost('/notes', { title: (n.title || 'Sin título') + ' (copia)', body: n.content || '' });
                  store.notes.unshift(mapServerNote(d.item)); toast('Nota duplicada'); render();
                } catch (e) { toast(e.message || 'No se pudo duplicar'); }
            }},
            '-',
            { label: 'Eliminar nota', icon: ICON_DELETE, danger: true, onClick: () => deleteNote(n) }
          ]),
          html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'
        })
      ]
    }));
    const body = el('div', { class: 'board-body' });
    const editor = el('div', { class: 'editor' });

    const titleInp = el('input', { class: 'editor-title', value: n.title, placeholder: 'Título de la nota…' });
    const bodyInp = el('textarea', { class: 'editor-body', placeholder: 'Empieza a escribir aquí… Puedes capturar ideas, resúmenes o apuntes y después analizarlos.' }, n.content || '');
    const tagsWrap = el('div', { class: 'editor-tags' });
    const tagInput = el('input', { placeholder: 'Añadir etiqueta…' });
    const analyzePane = el('div', { class: 'analyze-pane' });

    function renderTags() {
      tagsWrap.innerHTML = '';
      (n.tags || []).forEach(t => {
        const chip = el('span', { class: 'chip' }, [
          document.createTextNode(t),
          el('button', { onclick: () => { n.tags = n.tags.filter(x => x !== t); save(); renderTags(); }, title: 'Quitar' }, '×')
        ]);
        tagsWrap.appendChild(chip);
      });
      tagsWrap.appendChild(tagInput);
    }
    tagInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && tagInput.value.trim()) {
        e.preventDefault();
        const t = tagInput.value.trim().slice(0, 24);
        n.tags = Array.from(new Set([...(n.tags || []), t]));
        tagInput.value = ''; save(); renderTags();
      }
    });

    function analyze(text) {
      const trimmed = (text || '').trim();
      const chars = trimmed.length;
      const charsNoSpaces = trimmed.replace(/\s/g, '').length;
      const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
      const sentences = trimmed ? trimmed.split(/[.!?]+/).map(s => s.trim()).filter(Boolean) : [];
      const paragraphs = trimmed ? trimmed.split(/\n{2,}/).filter(p => p.trim()).length : 0;
      const minutes = Math.max(1, Math.round(words.length / 200));
      const avgWord = words.length ? (charsNoSpaces / words.length).toFixed(1) : '0';
      const avgSent = sentences.length ? (words.length / sentences.length).toFixed(1) : '0';

      // Top words (excluding Spanish/English stopwords)
      const stop = new Set(('el la los las un una unos unas y o pero porque que como de del al a en con por para es son fue era ser estar estaba este esta ese esa eso aquí allí ahí si no sí lo le les me te se nos su sus su mi tu ya muy más menos también pero sin entre sobre bajo hasta desde cuando donde quién qué cuál cuáles cómo the and or but because that is are was were be been to in on for of with as it its by from this these those he she him her you your our we they them their').split(' '));
      const freq = {};
      words.forEach(w => {
        const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (k.length < 4 || stop.has(k)) return;
        freq[k] = (freq[k] || 0) + 1;
      });
      const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 6);

      analyzePane.innerHTML = '';
      analyzePane.appendChild(el('h4', {}, 'Análisis'));
      const rows = el('dl', {});
      const row = (k, v) => { rows.appendChild(el('div', { class: 'analyze-row' }, [ el('dt', {}, k), el('dd', {}, v) ])); };
      row('Palabras', String(words.length));
      row('Caracteres', String(chars));
      row('Sin espacios', String(charsNoSpaces));
      row('Oraciones', String(sentences.length));
      row('Párrafos', String(paragraphs));
      row('Tiempo de lectura', minutes + ' min');
      row('Palabra promedio', avgWord + ' letras');
      row('Palabras por oración', avgSent);
      analyzePane.appendChild(rows);

      if (top.length) {
        const tw = el('div', { class: 'top-words' }, [ el('h5', {}, 'Palabras clave') ]);
        const max = top[0][1];
        top.forEach(([word, c]) => {
          tw.appendChild(el('div', { class: 'word-bar' }, [
            el('span', { class: 'wname' }, word),
            el('span', { class: 'wval' }, String(c))
          ]));
          const bar = el('div', { style: { height: '3px', background: 'var(--surface-sunken)', borderRadius: '999px', overflow: 'hidden', marginBottom: '4px' } }, [
            el('span', { style: { display: 'block', height: '100%', background: 'var(--accent)', width: ((c/max)*100) + '%' } })
          ]);
          tw.appendChild(bar);
        });
        analyzePane.appendChild(tw);
      }
    }

    let timer;
    function save() {
      n.title = titleInp.value.trim();
      n.content = bodyInp.value;
      n.updatedAt = Date.now();
      // Guarda en el servidor (base de datos), no en caché del navegador.
      apiPatch('/notes/' + n.id, { title: n.title, body: n.content }).catch(function () {});
      analyze(bodyInp.value);
    }
    titleInp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 300); });
    bodyInp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 300); });

    const main = el('div', { class: 'editor-main' }, [ titleInp, bodyInp, tagsWrap ]);
    editor.appendChild(main);
    editor.appendChild(analyzePane);
    body.appendChild(editor);
    v.appendChild(body);

    renderTags();
    analyze(n.content || '');
  }

  async function createNote() {
    let item;
    try {
      const d = await apiPost('/notes', { title: 'Sin título', body: '' });
      item = d.item;
    } catch (e) { toast(e.message || 'No se pudo crear la nota'); return; }
    store.notes.unshift(mapServerNote(item));
    notesLoaded = true;
    go('notes', { noteId: item.id });
  }

  async function deleteNote(n) {
    const ok = await confirmDialog('¿Eliminar nota?', `"${n.title || 'Sin título'}" se irá a la papelera. Tienes 30 días para recuperarla.`, 'Eliminar');
    if (!ok) return;
    try {
      await apiDelete('/notes/' + n.id);
    } catch (e) {
      // 404 = ya no existe en el servidor → se trata como ya eliminada.
      if (e.status !== 404) { toast(e.message || 'No se pudo eliminar la nota'); return; }
    }
    store.notes = store.notes.filter(x => x.id !== n.id);
    if (typeof loadTrash === 'function') loadTrash();
    toast('Nota eliminada');
    if (state.noteId === n.id) state.noteId = null;
    render();
  }
