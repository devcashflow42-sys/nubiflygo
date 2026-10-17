'use strict';
/* views/project-form.js — Formulario de proyecto a pantalla completa (openProjectModal, viewProjectForm). */

  /* ───────────── Modals: project / doc ───────────── */
  function openProjectModal(existing) {
    // Full-screen form view instead of dialog
    state.editingProject = existing ? existing.id : null;
    go('project-form');
  }

  function viewProjectForm() {
    const existing = state.editingProject ? store.projects.find(p => p.id === state.editingProject) : null;
    let name = existing?.name || '';
    let description = existing?.description || '';
    let color = existing?.color || PROJECT_COLORS[0];
    let visibility = existing?.visibility || 'private';
    if (visibility === 'team') visibility = 'private';

    const v = $('#view');
    v.innerHTML = '';

    // Project-form toolbar — same helper, guaranteed back arrow
    v.appendChild(pageToolbar({
      back: () => { state.editingProject = null; existing ? go('projects', { projectId: existing.id }) : go('projects'); },
      crumbs: [
        { label: 'Proyectos', onClick: () => { state.editingProject = null; go('projects'); } },
        { label: existing ? 'Editar' : 'Nuevo proyecto', here: true }
      ]
    }));

    const form = el('div', { class: 'form-view' });
    form.appendChild(el('div', { class: 'form-view-head' }, [
      el('h2', {}, existing ? 'Editar proyecto' : 'Nuevo proyecto'),
      el('p', { class: 'form-sub' }, existing ? 'Actualiza los detalles de tu proyecto.' : 'Da nombre a tu proyecto y decide quién puede verlo.')
    ]));

    // Title
    const titleSec = el('div', { class: 'form-section' });
    titleSec.appendChild(el('label', { class: 'form-section-label', for: 'pf-title' }, 'Título'));
    const titleInp = el('input', { id: 'pf-title', class: 'form-title-input', type: 'text', placeholder: 'Nombre del proyecto…', value: name, autofocus: '' });
    titleInp.addEventListener('input', e => name = e.target.value);
    titleSec.appendChild(titleInp);
    form.appendChild(titleSec);

    // Description
    const descSec = el('div', { class: 'form-section' });
    descSec.appendChild(el('label', { class: 'form-section-label', for: 'pf-desc' }, 'Descripción'));
    descSec.appendChild(el('span', { class: 'form-section-hint' }, 'Opcional. Explica brevemente de qué trata este proyecto.'));
    const descInp = el('textarea', { id: 'pf-desc', class: 'form-area', rows: '4', placeholder: 'ej. Documentos de investigación para el lanzamiento de la nueva plataforma…' }, description);
    descInp.addEventListener('input', e => description = e.target.value);
    descSec.appendChild(descInp);
    form.appendChild(descSec);

    // Color
    const colorSec = el('div', { class: 'form-section' });
    colorSec.appendChild(el('label', { class: 'form-section-label' }, 'Color'));
    const picker = el('div', { class: 'color-picker' });
    function renderPicker() {
      picker.innerHTML = '';
      PROJECT_COLORS.forEach(c => {
        picker.appendChild(el('button', {
          type: 'button', class: 'color-swatch',
          'aria-pressed': String(c === color),
          style: { background: c },
          onclick: () => { color = c; renderPicker(); }
        }));
      });
    }
    renderPicker();
    colorSec.appendChild(picker);
    form.appendChild(colorSec);

    // Visibility
    const visSec = el('div', { class: 'form-section' });
    visSec.appendChild(el('label', { class: 'form-section-label' }, 'Visibilidad'));
    visSec.appendChild(el('span', { class: 'form-section-hint' }, 'Decide quién puede ver este proyecto.'));
    const visWrap = el('div', { class: 'vis-choice' });
    function renderVis() {
      visWrap.innerHTML = '';
      visWrap.appendChild(visOpt('private', 'Privado', 'Solo tú puedes ver y editar este proyecto.',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'));
      visWrap.appendChild(visOpt('public', 'Público', 'Cualquiera con el enlace puede ver tus documentos publicados.',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'));
    }
    function visOpt(key, title, desc, iconHtml) {
      return el('button', {
        type: 'button', class: 'vis-opt',
        'aria-checked': String(visibility === key),
        onclick: () => { visibility = key; renderVis(); }
      }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
          el('span', { class: 'vo-head', html: iconHtml + ' ' + title }),
          el('span', { class: 'vo-radio' })
        ]),
        el('p', { class: 'vo-desc' }, desc)
      ]);
    }
    renderVis();
    visSec.appendChild(visWrap);
    form.appendChild(visSec);

    // Footer actions
    form.appendChild(el('div', { class: 'form-foot' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => cancel() }, 'Cancelar'),
      el('button', { class: 'btn btn-primary', onclick: () => submit() }, existing ? 'Guardar cambios' : 'Crear proyecto')
    ]));

    v.appendChild(form);

    function cancel() {
      state.editingProject = null;
      if (existing) go('projects', { projectId: existing.id });
      else go('projects');
    }
    async function submit() {
      const t = (titleInp.value || '').trim();
      if (!t) { titleInp.focus(); toast('Añade un título'); return; }
      if (existing) {
        try {
          await apiPatch('/projects/' + existing.id, { name: t, description, color });
        } catch (e) { toast(e.message || 'No se pudo guardar'); return; }
        existing.name = t;
        existing.description = description;
        existing.color = color;
        existing.visibility = visibility;
        existing.updatedAt = Date.now();
        toast('Proyecto actualizado');
        state.editingProject = null;
        go('projects', { projectId: existing.id });
      } else {
        let item;
        try {
          const d = await apiPost('/projects', { name: t, description, color });
          item = d.item;
        } catch (e) { toast(e.message || 'No se pudo crear el proyecto'); return; }
        const p = {
          id: item.id, name: item.name, description: item.description || '', color: item.color || color,
          visibility, members: [], documents: [],
          createdAt: item.created_at ? Date.parse(item.created_at) : Date.now(),
          updatedAt: item.updated_at ? Date.parse(item.updated_at) : Date.now()
        };
        store.projects.unshift(p);
        toast('Proyecto creado');
        state.editingProject = null;
        go('projects', { projectId: p.id });
      }
    }
    titleInp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); descInp.focus(); } });
  }
