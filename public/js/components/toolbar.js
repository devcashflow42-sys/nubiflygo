'use strict';
/* components/toolbar.js — pageToolbar: barra superior propia de cada vista (flecha, título, acciones). */

  /* Banner de sección: el mismo en Proyectos, Archivos, Notas, API keys y
     Papelera. Recibe el icono, el título, el resumen (texto corto), el detalle
     (se esconde en el teléfono) y, si hay, un botón de acción.
     Va a juego con la portada de un proyecto: mismo degradado, título en serif
     y botón redondeado. */
  function sectionHero(cfg) {
    const info = el('div', { class: 'sec-hero-info' }, [ el('h2', {}, cfg.title) ]);
    const p = el('p');
    p.textContent = cfg.summary || '';
    if (cfg.detail) {
      const extra = el('span', { class: 'sec-hero-extra' });
      extra.textContent = ' ' + cfg.detail;
      p.appendChild(extra);
    }
    info.appendChild(p);
    const hero = el('div', { class: 'sec-hero' + (cfg.variant ? ' is-' + cfg.variant : '') }, [
      el('span', { class: 'sec-hero-ico', html: cfg.icon }),
      info,
      cfg.action ? el('div', { class: 'sec-hero-acts' }, [
        el('button', { class: 'ph-btn', onclick: cfg.action.onClick }, [
          el('span', { html: cfg.action.icon }), el('span', {}, cfg.action.label)
        ])
      ]) : null
    ].filter(Boolean));
    return hero;
  }
  window.sectionHero = sectionHero;

  function pageToolbar(cfg) {
    const bar = el('div', { class: 'project-toolbar' });
    // Back ("up") arrow sits leftmost on every view that has one, so it reads
    // the same on phones and desktop. The hamburger follows it (mobile only).
    if (cfg.back) {
      bar.appendChild(el('button', {
        class: 'icon-btn', title: t('common.back'), 'aria-label': t('common.back'),
        onclick: cfg.back, html: ICON_BACK
      }));
    }
    if (cfg.menu) {
      bar.appendChild(el('button', {
        class: 'icon-btn toggle-mobile', 'aria-label': t('common.openMenu'),
        onclick: cfg.menu, html: ICON_HAMBURGER
      }));
    }
    // Title row
    const title = el('div', { class: 'tb-title' });
    if (cfg.dotColor) title.appendChild(el('span', { class: 'tb-dot', style: { '--c': cfg.dotColor } }));
    if (cfg.crumbs) {
      cfg.crumbs.forEach((c, i) => {
        if (i > 0) title.appendChild(el('span', { class: 'tb-sep' }, '/'));
        title.appendChild(el('span', {
          class: c.here ? 'tb-current' : 'tb-crumb',
          onclick: c.onClick || null
        }, c.label));
      });
    } else if (cfg.title) {
      title.appendChild(el('span', { class: 'tb-current' }, cfg.title));
    }
    bar.appendChild(title);
    // Extras (badges)
    if (cfg.extras) cfg.extras.forEach(e => bar.appendChild(e));
    // Acciones de la derecha. La campana va en todas las secciones menos en
    // Inicio, que pasa notifBell: false: allí es un resumen y el menú lateral ya
    // enseña «Notificaciones» con su contador justo al lado.
    const acts = (cfg.actions || []).slice();
    if (cfg.notifBell !== false && typeof notifBellButton === 'function') acts.push(notifBellButton());
    if (acts.length) {
      bar.appendChild(el('div', { class: 'tb-actions' }, acts));
    }
    return bar;
  }
