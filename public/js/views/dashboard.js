'use strict';
/* views/dashboard.js — Vista Inicio + tile + emptyBlock. */

  /* ───────────── Dashboard view ───────────── */
  function viewDashboard() {
    const v = $('#view');
    // Documentos: todo lo que hay dentro de los proyectos, contado igual que en
    // la tarjeta de cada proyecto (antes daba 0 si el proyecto no se había abierto).
    const totalDocs = store.projects.reduce((n, p) => n + projectItemCount(p), 0);
    // Archivos: los sueltos (fuera de proyectos), igual que el menú y la sección
    // Archivos; los de cada proyecto ya cuentan en Documentos.
    const looseFiles = (store.files || []).filter(f => !f.project_id).length;

    v.innerHTML = '';
    v.appendChild(pageToolbar({
      menu: () => openMobile(),
      title: t('nav.dashboard'),
      notifBell: false
    }));
    v.appendChild(el('div', { class: 'board-head' }, [
      // Saludo con el nombre real de la cuenta (esqueleto mientras llega el perfil).
      (function () {
        const u = window.currentUser;
        if (!u) return window.currentUserError ? el('h2', {}, 'Hola') : el('h2', {}, [ skBox('220px', '30px', 'sk-round-md') ]);
        const first = String(u.name || u.email || '').trim().split(/\s+/)[0] || '';
        return el('h2', {}, first ? 'Hola, ' + first : 'Hola');
      })(),
      el('p', { class: 'subtitle' }, t('dashboard.subtitle'))
    ]));
    const body = el('div', { class: 'board-body' });

    const tiles = el('div', { class: 'tiles' }, [
      tile(t('dashboard.tiles.projects'), store.projects.length, t('dashboard.tiles.activeGroups'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>'),
      tile(t('dashboard.tiles.documents'), totalDocs, t('dashboard.tiles.allProjects'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'),
      tile(t('dashboard.tiles.files'), looseFiles, t('dashboard.tiles.uploaded'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="5" rx="1.5"/><path d="M4 9v9a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18V9"/><line x1="9.5" y1="13" x2="14.5" y2="13"/></svg>'),
      tile(t('dashboard.tiles.notes'), store.notes.length, t('dashboard.tiles.saved'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>'),
      tile(t('dashboard.tiles.apiKeys'), store.apiKeys.length, t('dashboard.tiles.active'), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 7.5-7.5 1.65 1.65 1.5-1.5-3.15-3.15-9 9"/></svg>')
    ]);
    body.appendChild(tiles);

    // Recent projects
    body.appendChild(el('div', { class: 'section-h' }, [
      el('h3', {}, t('dashboard.recentProjects')),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => go('projects') }, t('common.viewAll'))
    ]));
    const recentProj = [...store.projects].sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 4);
    if (recentProj.length === 0) {
      body.appendChild(emptyBlock(t('dashboard.emptyProjectsTitle'), t('dashboard.emptyProjectsText'), t('dashboard.createProject'), () => openProjectModal()));
    } else {
      const grid = el('div', { class: 'project-grid' });
      recentProj.forEach(p => grid.appendChild(projectCard(p)));
      grid.appendChild(el('button', { class: 'add-project', onclick: () => openProjectModal() }, [
        el('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' }),
        t('dashboard.newProject')
      ]));
      body.appendChild(grid);
    }

    // Recent notes
    body.appendChild(el('div', { class: 'section-h' }, [
      el('h3', {}, t('dashboard.recentNotes')),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => go('notes') }, t('common.viewAllFeminine'))
    ]));
    const recentNotes = [...store.notes].sort((a,b) => b.updatedAt - a.updatedAt).slice(0, 4);
    if (recentNotes.length === 0) {
      body.appendChild(emptyBlock(t('dashboard.emptyNotesTitle'), t('dashboard.emptyNotesText'), t('dashboard.createNote'), () => createNote()));
    } else {
      const grid = el('div', { class: 'project-grid' });
      recentNotes.forEach(n => grid.appendChild(noteCard(n)));
      body.appendChild(grid);
    }

    v.appendChild(body);
  }

  function tile(label, value, hint, iconSvg) {
    return el('div', { class: 'tile' }, [
      el('div', { class: 'tile-label', html: iconSvg + ' ' + label }),
      el('div', { class: 'tile-value' }, String(value)),
      el('div', { class: 'tile-hint' }, hint)
    ]);
  }

  function emptyBlock(title, text, action, onClick) {
    const d = el('div', { class: 'empty' }, [
      el('div', { class: 'empty-art', 'aria-hidden': 'true' }, [
        el('div', { class: 'empty-folder f1' }),
        el('div', { class: 'empty-folder f3' }),
        el('div', { class: 'empty-folder f2' })
      ]),
      el('h3', {}, title),
      el('p', {}, text)
    ]);
    if (action) {
      d.appendChild(el('div', { class: 'empty-actions' }, [
        el('button', { class: 'btn btn-primary', onclick: onClick }, [
          el('span', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' }),
          action
        ])
      ]));
    }
    return d;
  }
