'use strict';
/* skeleton.js — Esqueletos de carga con brillo ("shimmer"), al estilo de
   Facebook: mientras llegan los datos se muestra la forma de lo que va a
   aparecer (tarjetas, listas, perfil) en vez de un texto "Cargando…". */

  // Bloque gris con brillo. w/h aceptan cualquier medida CSS.
  function skBox(w, h, extra) {
    return el('div', { class: 'sk' + (extra ? ' ' + extra : ''), style: { width: w || '100%', height: h || '12px' }, 'aria-hidden': 'true' });
  }
  // Contenedor accesible: el lector de pantalla anuncia "Cargando…".
  function skWrap(children, label) {
    return el('div', { class: 'sk-wrap', role: 'status', 'aria-live': 'polite', 'aria-label': label || 'Cargando…' }, children);
  }

  // Cuadrícula de tarjetas con banner (archivos, documentos del proyecto).
  function skelGrid(n, opts) {
    opts = opts || {};
    const grid = el('div', { class: 'doc-grid file-grid' });
    for (let i = 0; i < (n || 8); i++) {
      grid.appendChild(el('div', { class: 'doc-card file-card sk-card' }, [
        opts.banner === false ? null : skBox('100%', 'auto', 'sk-banner'),
        el('div', { class: 'fc-body' }, [ skBox('78%', '13px'), skBox('52%', '10px', 'sk-mt') ])
      ].filter(Boolean)));
    }
    return skWrap([grid], opts.label);
  }

  // Tarjetas de proyecto (color + título + descripción).
  function skelProjects(n) {
    const grid = el('div', { class: 'project-grid' });
    for (let i = 0; i < (n || 6); i++) {
      grid.appendChild(el('div', { class: 'sk-card sk-project' }, [
        el('div', { class: 'sk-row' }, [ skBox('34px', '34px', 'sk-round-md'), skBox('55%', '14px') ]),
        skBox('92%', '10px', 'sk-mt'), skBox('70%', '10px', 'sk-mt'),
        el('div', { class: 'sk-row sk-mt2' }, [ skBox('64px', '20px', 'sk-pill'), skBox('48px', '10px') ])
      ]));
    }
    return skWrap([grid], 'Cargando proyectos…');
  }

  // Lista de filas (notas, claves): avatar/icono + dos líneas.
  function skelList(n, tall) {
    const list = el('div', { class: 'sk-list' });
    for (let i = 0; i < (n || 5); i++) {
      list.appendChild(el('div', { class: 'sk-card sk-item' + (tall ? ' tall' : '') }, [
        el('div', { class: 'sk-row' }, [ skBox('38px', '38px', 'sk-round-md'), el('div', { class: 'sk-col' }, [ skBox('45%', '13px'), skBox('70%', '10px', 'sk-mt') ]) ]),
        tall ? el('div', { class: 'sk-row sk-mt2' }, [ skBox('33%', '54px'), skBox('33%', '54px'), skBox('33%', '54px') ]) : null,
        tall ? skBox('100%', '120px', 'sk-mt2') : null
      ].filter(Boolean)));
    }
    return skWrap([list]);
  }

  // Fila de tarjetas resumen (números).
  function skelTiles(n) {
    const row = el('div', { class: 'tiles tiles-keys sk-tiles' });
    for (let i = 0; i < (n || 4); i++) row.appendChild(el('div', { class: 'tile' }, [ skBox('55%', '11px'), skBox('38%', '26px', 'sk-mt2'), skBox('65%', '10px', 'sk-mt') ]));
    return el('div', { class: 'tiles-keys-wrap' }, [ row ]);
  }

  // Perfil (Configuración): foto redonda, nombre, correo y campos.
  function skelProfile() {
    const fields = el('div', { class: 'sk-fields' });
    for (let i = 0; i < 4; i++) fields.appendChild(el('div', {}, [ skBox('40%', '11px'), skBox('100%', '40px', 'sk-mt sk-round-md') ]));
    return skWrap([ el('div', { class: 'set-card sk-profile' }, [
      el('div', { class: 'sk-row' }, [ skBox('58px', '58px', 'sk-circle'), el('div', { class: 'sk-col' }, [ skBox('40%', '15px'), skBox('55%', '11px', 'sk-mt'), skBox('30%', '10px', 'sk-mt') ]) ]),
      fields
    ]) ], 'Cargando tu información…');
  }

  // Filas sueltas dentro de una tarjeta (Facturación, Moderación): icono + dos líneas.
  function skelRows(n, label) {
    const list = el('div', { class: 'sk-rows' });
    for (let i = 0; i < (n || 3); i++) {
      list.appendChild(el('div', { class: 'sk-row sk-rowline' }, [ skBox('36px', '36px', 'sk-round-md'),
        el('div', { class: 'sk-col' }, [ skBox(i % 2 ? '52%' : '64%', '12px'), skBox(i % 2 ? '76%' : '40%', '10px', 'sk-mt') ]),
        skBox('64px', '26px', 'sk-pill') ]));
    }
    return skWrap([list], label);
  }

  // Fila de pestañas tipo píldora (secciones del proyecto, filtros).
  function skelTabs(n) {
    const row = el('div', { class: 'sk-tabs' });
    for (let i = 0; i < (n || 4); i++) row.appendChild(skBox(i ? '92px' : '118px', '34px', 'sk-pill'));
    return row;
  }

  // Portada de un proyecto mientras llega (entrada directa a /project/<id>).
  function skelHero() {
    return el('section', { class: 'ph sk-hero', 'aria-hidden': 'true' }, [
      el('div', { class: 'sk ph-cover sk-on-dark', 'aria-hidden': 'true' }),
      el('div', { class: 'ph-info' }, [
        skBox('130px', '11px', 'sk-on-dark'), skBox('46%', '30px', 'sk-on-dark sk-mt2 sk-round-md'), skBox('62%', '12px', 'sk-on-dark sk-mt2'),
        el('div', { class: 'sk-row sk-mt2' }, [ skBox('44px', '44px', 'sk-on-dark sk-circle'), skBox('44px', '44px', 'sk-on-dark sk-circle'), skBox('44px', '44px', 'sk-on-dark sk-circle') ])
      ])
    ]);
  }

  // Tarjetas de «Colecciones» (Archivos): mosaico 2×2 + título.
  function skelCollections(n) {
    const grid = el('div', { class: 'sk-colls' });
    for (let i = 0; i < (n || 4); i++) {
      grid.appendChild(el('div', { class: 'sk-card sk-coll' }, [ skBox('100%', 'auto', 'sk-coll-mosaic'),
        el('div', { class: 'sk-row sk-coll-foot' }, [ skBox('34px', '34px', 'sk-round-md'), el('div', { class: 'sk-col' }, [ skBox('55%', '12px'), skBox('70%', '10px', 'sk-mt') ]) ]) ]));
    }
    return skWrap([grid], 'Cargando tus colecciones…');
  }

  /* Portadas e imágenes: mientras la imagen baja, su caja muestra el mismo
     brillo (CSS: :has(> img:not(.is-loaded))). Aquí solo se marca cuándo llegó;
     la imagen nunca se oculta, así que si algo falla se ve igual. */
  document.addEventListener('load', function (e) {
    const t = e.target;
    if (t && t.tagName === 'IMG') t.classList.add('is-loaded');
  }, true);
  document.addEventListener('error', function (e) {
    const t = e.target;
    if (t && t.tagName === 'IMG') t.classList.add('is-loaded');
  }, true);
