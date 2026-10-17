'use strict';
/* components/pager.js — Paginación de listas largas (archivos, documentos del
   proyecto). Barra flotante ‹ 1 2 … 24 25 26 › fija abajo de la pantalla.
   La página se recuerda por lista (y se reinicia al buscar). */

  const PAGE_SIZE = 24;   // 2, 3 o 4 columnas: siempre filas completas

  // items: lista completa · key: nombre de la lista (p. ej. 'files').
  // Devuelve { items: los de la página actual, el: barra de paginación | null }.
  function paginate(items, key, size) {
    size = size || PAGE_SIZE;
    state.pages = state.pages || {};
    const k = key + '|' + (state.search || '');
    const pages = Math.max(1, Math.ceil(items.length / size));
    let page = Math.min(Math.max(1, state.pages[k] || 1), pages);
    state.pages[k] = page;
    const from = (page - 1) * size;
    return {
      items: items.slice(from, from + size),
      el: pages > 1 ? pagerBar(page, pages, items.length, from, size, n => { state.pages[k] = n; goToPage(); }) : null
    };
  }

  // Al cambiar de página: redibuja y vuelve arriba de la lista.
  function goToPage() {
    render();
    try {
      const b = document.getElementById('board'); if (b) b.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  }

  // Números visibles: todos si son pocos; si no, 1 2 … actual … últimas.
  function pageNumbers(page, pages) {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const set = new Set([1, 2, pages - 2, pages - 1, pages, page - 1, page, page + 1]);
    const nums = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    const out = [];
    nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push('…'); out.push(n); });
    return out;
  }

  const ICN_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  const ICN_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  // Barra flotante (diseño malva, igual que el reproductor):
  //  · flechas ‹ › en círculos translúcidos y números de página;
  //  · la página actual lleva una píldora clara que se desliza desde la
  //    página anterior hasta la nueva;
  //  · deslizar el dedo a la izquierda/derecha sobre la barra cambia de página.
  let lastPage = null;
  function pagerBar(page, pages, total, from, size, onGo) {
    const prevPage = lastPage; lastPage = page;
    const go = (n) => { if (n >= 1 && n <= pages && n !== page) onGo(n); };
    const ind = el('span', { class: 'pg-ind', 'aria-hidden': 'true' });
    const nums = el('div', { class: 'pg-nums' }, [ind].concat(pageNumbers(page, pages).map(n => n === '…'
      ? el('span', { class: 'pg-dots', 'aria-hidden': 'true' }, '⋯')
      : el('button', { type: 'button', class: 'pg-num' + (n === page ? ' on' : ''), 'data-n': String(n), 'aria-label': 'Página ' + n + ' de ' + pages, 'aria-current': n === page ? 'page' : null, onclick: () => go(n) }, String(n)))));
    const box = el('div', { class: 'pg-box' }, [
      el('button', { type: 'button', class: 'pg-arrow', title: 'Anterior', 'aria-label': 'Página anterior', disabled: page <= 1 ? '' : null, onclick: () => go(page - 1), html: ICN_PREV }),
      nums,
      el('button', { type: 'button', class: 'pg-arrow', title: 'Siguiente', 'aria-label': 'Página siguiente', disabled: page >= pages ? '' : null, onclick: () => go(page + 1), html: ICN_NEXT })
    ]);
    const nav = el('nav', { class: 'pager', 'aria-label': 'Paginación · página ' + page + ' de ' + pages }, [ box ]);

    // Píldora: aparece en la página actual; si veníamos de otra visible, se desliza.
    const place = (btn, animate) => {
      if (!btn) { ind.style.opacity = '0'; return; }
      ind.style.transition = animate ? '' : 'none';
      ind.style.width = btn.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
      ind.style.opacity = '1';
    };
    requestAnimationFrame(() => {
      if (!nav.isConnected) return;
      const cur = nums.querySelector('.pg-num.on');
      const old = prevPage && prevPage !== page ? nums.querySelector('.pg-num[data-n="' + prevPage + '"]') : null;
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (old && !reduce) { place(old, false); nums.getBoundingClientRect(); requestAnimationFrame(() => place(cur, true)); }
      else place(cur, false);
      nav.classList.add('is-ready');
      // Si la barra cambia de tamaño (se muda al reproductor, gira la pantalla,
      // cargan las fuentes), la píldora se recoloca sobre la página actual.
      // (Solo si el ancho cambió: el primer aviso no debe cortar el deslizamiento.)
      if (window.ResizeObserver) {
        let lastW = nums.offsetWidth;
        const ro = new ResizeObserver(() => {
          if (!nums.isConnected) { ro.disconnect(); return; }
          const w = nums.offsetWidth;
          if (w === lastW) return;
          lastW = w;
          place(nums.querySelector('.pg-num.on'), false);
        });
        ro.observe(nums);
      }
    });

    // Deslizar horizontalmente para cambiar de página.
    let sw = null, swallow = false;
    box.addEventListener('pointerdown', (e) => { sw = { id: e.pointerId, x: e.clientX, y: e.clientY }; swallow = false; });
    box.addEventListener('pointerup', (e) => {
      if (!sw || sw.id !== e.pointerId) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.5) { swallow = true; setTimeout(() => { swallow = false; }, 400); go(dx < 0 ? page + 1 : page - 1); }
    });
    box.addEventListener('pointercancel', () => { sw = null; });
    box.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
    // Teclado: ← → con el foco en la barra.
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(page - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(page + 1); }
    });
    return nav;
  }
