'use strict';
/* widgets/manager.js — Sistema de widgets flotantes (estilo Dynamic Island).
   Contiene tres piezas que comparten todos los widgets:
     · WidgetAnimations      → FLIP y curvas (respeta prefers-reduced-motion)
     · FloatingWidgetManager → contenedor flotante, orden, widget expandido,
                               posición (abajo/arriba) y preferencias en la cuenta
     · WidgetDragController  → arrastrar con mouse o dedo para reordenar
   Los widgets (MusicPlayerWidget) se registran aquí con
   FloatingWidget.create(...) y el manager decide dónde y cómo se muestran.
   El contenedor se puede arrastrar libremente hacia arriba o hacia abajo y
   se queda donde se suelta (con imán en los extremos).
   No usa localStorage: el orden y la altura se guardan en la cuenta
   (PATCH /api/v1/account/profile → ui_prefs.widgets). */
(function () {
  /* ───────────────────────── WidgetAnimations ───────────────────────── */
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const WidgetAnimations = {
    SPRING: 'cubic-bezier(.2, .9, .25, 1.12)',     // ligero rebote natural
    EASE: 'cubic-bezier(.22, .9, .24, 1)',
    DURATION: 300,
    // FLIP: mide, cambia el layout (mutate), invierte y anima hasta su sitio.
    flip(nodes, mutate, opts) {
      opts = opts || {};
      const list = nodes.filter(Boolean);
      const first = new Map(list.map(n => [n, n.getBoundingClientRect()]));
      mutate();
      if (reduced()) return;
      const moved = [];
      list.forEach(n => {
        const a = first.get(n), b = n.getBoundingClientRect();
        // Por centros y con escala: si el nodo venía agrandado (arrastre), vuelve
        // a su tamaño animado, sin salto ni deslizamiento lateral.
        const dx = (a.left + a.width / 2) - (b.left + b.width / 2), dy = (a.top + a.height / 2) - (b.top + b.height / 2);
        const sx = b.width ? a.width / b.width : 1, sy = b.height ? a.height / b.height : 1;
        const scaled = Math.abs(sx - 1) > 0.002 || Math.abs(sy - 1) > 0.002;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !scaled) return;
        n.style.transition = 'none';
        n.style.transform = `translate(${dx}px, ${dy}px)` + (scaled ? ` scale(${sx}, ${sy})` : '');
        moved.push(n);
      });
      // Fuerza el punto de partida y anima hacia la posición nueva.
      document.body.getBoundingClientRect();
      const dur = opts.duration || this.DURATION;
      moved.forEach(n => {
        n.style.transition = `transform ${dur}ms ${opts.easing || this.SPRING}`;
        const v = n.style.transition;          // tal como lo guarda el navegador (normalizado)
        n.style.transform = '';
        // Solo se quita si sigue siendo la suya (un arrastre nuevo pone 'none' y
        // no debe perderla); los transitionend de los hijos no cuentan.
        const clear = (e) => {
          if (e && (e.target !== n || e.propertyName !== 'transform')) return;
          n.removeEventListener('transitionend', clear);
          if (n.style.transition === v) n.style.transition = '';
        };
        n.addEventListener('transitionend', clear);
        setTimeout(clear, dur + 80);
      });
    },
    // Lleva un nodo de su transform actual a ninguno (suelta tras arrastrar).
    settle(node, duration) {
      if (reduced()) { node.style.transition = ''; node.style.transform = ''; return; }
      node.style.transition = `transform ${duration || 280}ms ${this.SPRING}`;
      const v = node.style.transition;         // normalizado por el navegador
      node.style.transform = '';
      setTimeout(() => { if (node.style.transition === v) node.style.transition = ''; }, (duration || 280) + 60);
    },
    reduced
  };

  /* ───────────────────────── FloatingWidget ─────────────────────────
     Estructura común de una cápsula: fila compacta siempre visible y una
     sección extra que se despliega al expandir (animación de alto con grid). */
  const FloatingWidget = {
    create(opts) {
      const compact = el('div', { class: 'fw-compact' });
      const moreIn = el('div', { class: 'fw-more-in' });
      const more = el('div', { class: 'fw-more', 'aria-hidden': 'true' }, [ moreIn ]);
      const root = el('section', {
        class: 'fw fw-' + opts.id, 'data-widget': opts.id, tabindex: '0', role: 'group',
        'aria-roledescription': 'widget flotante', 'aria-label': opts.label,
        'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown Enter Escape'
      }, [ compact, more ]);
      return { id: opts.id, label: opts.label, root, compact, more: moreIn, moreWrap: more, onExpand: opts.onExpand, onCollapse: opts.onCollapse, onResize: opts.onResize };
    }
  };

  /* ───────────────────────── FloatingWidgetManager ───────────────────────── */
  const IDS = ['music'];
  const M = {
    dock: null, live: null,
    widgets: new Map(),          // id → widget registrado
    mounted: new Set(),          // ids visibles
    order: ['music'],
    y: 0,                        // altura del contenedor: 0 = abajo … 1 = arriba (bajo la barra de la sección)
    lift: 0, maxLift: 0,         // esa altura en píxeles (se recalcula con el tamaño de la pantalla)
    base: 0, topLimit: 0,        // límites en pantalla: borde inferior (altura 0) y superior
    probe: null,                 // marca fija abajo: misma referencia que usa el contenedor
    expanded: null,              // id del widget expandido
    prefsLoaded: false, saveTimer: null, ro: null, mo: null,
    leaving: new Map()           // id → temporizador de la animación de salida
  };

  function ensureDock() {
    if (M.dock) return M.dock;
    M.dock = el('div', { class: 'fw-dock', role: 'region', 'aria-label': 'Widgets flotantes' });
    M.live = el('div', { class: 'fw-sr', 'aria-live': 'polite' });
    M.probe = el('div', { class: 'fw-probe', 'aria-hidden': 'true' });
    document.body.append(M.dock, M.live, M.probe);
    window.addEventListener('resize', layout);
    // La barra de direcciones del navegador del teléfono cambia el alto útil.
    if (window.visualViewport) visualViewport.addEventListener('resize', layoutSoon);
    window.addEventListener('scroll', layoutSoon, { passive: true, capture: true });
    const board = document.getElementById('board');
    if (window.ResizeObserver) {
      M.ro = new ResizeObserver(() => { layout(); M.widgets.forEach(w => w.onResize && w.onResize()); });
      if (board) M.ro.observe(board);
      M.ro.observe(M.dock);
    }
    // Al cambiar de sección cambia la barra superior: se recoloca el contenedor.
    const view = document.getElementById('view');
    if (view && window.MutationObserver) { M.mo = new MutationObserver(layoutSoon); M.mo.observe(view, { childList: true }); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutsideDown, true);
    document.addEventListener('pointercancel', onOutsideCancel, true);
    document.addEventListener('click', onOutside, true);
    WidgetDragController.attach(M.dock);
    return M.dock;
  }
  function teardownDock() {
    if (!M.dock) return;
    window.removeEventListener('resize', layout);
    window.removeEventListener('scroll', layoutSoon, { capture: true });
    if (window.visualViewport) visualViewport.removeEventListener('resize', layoutSoon);
    cancelAnimationFrame(layoutRaf);
    if (M.ro) M.ro.disconnect();
    if (M.mo) M.mo.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onOutsideDown, true);
    document.removeEventListener('pointercancel', onOutsideCancel, true);
    document.removeEventListener('click', onOutside, true);
    WidgetDragController.detach();
    M.dock.remove(); M.live.remove(); M.probe.remove();
    M.dock = M.live = M.probe = M.ro = M.mo = null;
    M.lift = 0;
    const b = document.body;
    b.classList.remove('has-dock', 'dock-top', 'dock-bottom');
    b.style.removeProperty('--dock-h');
    b.style.removeProperty('--fw-lift');
  }

  let layoutRaf = 0;
  function layoutSoon() { cancelAnimationFrame(layoutRaf); layoutRaf = requestAnimationFrame(layout); }
  // Ancho y posición: dentro del panel central en escritorio, la pantalla en el teléfono.
  function layout() {
    if (!M.dock) return;
    const vw = document.documentElement.clientWidth;
    const board = document.getElementById('board');
    let left = 16, width = Math.min(420, vw - 32);
    if (board && vw > 900) {
      const r = board.getBoundingClientRect();
      width = Math.min(440, r.width - 48);
      left = r.left + (r.width - width) / 2;
    } else left = (vw - width) / 2;
    M.dock.style.left = Math.round(left) + 'px';
    M.dock.style.width = Math.round(width) + 'px';
    // Recorrido vertical: desde abajo (sobre el área segura) hasta justo debajo
    // de la barra superior de la sección (nunca la tapa). La marca fija da el
    // borde inferior con la MISMA referencia que usa el contenedor.
    const tb = document.querySelector('#view .project-toolbar');
    M.topLimit = tb ? Math.max(8, Math.round(tb.getBoundingClientRect().bottom + 8)) : 12;
    M.base = Math.round(M.probe.getBoundingClientRect().top) - 12;
    // Zona baja donde viven la paginación y los avisos (su posición normal):
    // mientras el contenedor esté ahí, esos flotantes suben por encima de él.
    // En escritorio la lista termina antes del borde (margen del panel).
    const inset = (board && vw > 900) ? Math.max(0, M.base + 12 - Math.round(board.getBoundingClientRect().bottom)) : 0;
    M.zone = inset + 72;
    const h = M.dock.offsetHeight;
    M.maxLift = Math.max(0, M.base - M.topLimit - h);
    applyLift(M.y * M.maxLift);
    document.body.style.setProperty('--dock-h', h + 'px');
    if (D.dragging) applyDrag();
  }
  // Aplica la altura en píxeles (la usan también la paginación, los avisos y el panel de subida).
  function applyLift(px) {
    px = Math.max(0, Math.min(M.maxLift, Math.round(px)));
    const b = document.body;
    if (px !== M.lift || !b.style.getPropertyValue('--fw-lift')) { M.lift = px; b.style.setProperty('--fw-lift', px + 'px'); }
    setBodyClasses();
  }
  function setBodyClasses() {
    const b = document.body, on = M.mounted.size > 0;
    b.classList.toggle('has-dock', on);
    // Abajo (o casi): la paginación y los avisos suben por encima de los widgets.
    b.classList.toggle('dock-bottom', on && M.lift < (M.zone || 72));
    // Arriba del todo: el contenido deja libre el espacio bajo la barra.
    b.classList.toggle('dock-top', on && M.maxLift > 0 && M.y >= 0.999);
    // Sin espacio arriba de los widgets: la paginación pasa a acompañarlos por debajo.
    const room = on && M.dock ? (M.base - M.lift - M.dock.offsetHeight) - M.topLimit : 999;
    b.classList.toggle('dock-high', on && room < 90);
  }
  const posName = () => M.y >= 0.999 ? 'top' : M.y <= 0.001 ? 'bottom' : 'free';
  function describePos() {
    return M.y >= 0.999 ? 'arriba' : M.y <= 0.001 ? 'abajo' : 'al ' + Math.round(M.y * 100) + '% de la altura';
  }

  // Coloca los widgets montados según el orden actual (sin animar).
  function arrange() {
    if (!M.dock) return;
    M.order.forEach(id => { if (M.mounted.has(id)) M.dock.appendChild(M.widgets.get(id).root); });
  }
  function nodesOf() { return [...M.dock.children].filter(n => n.classList.contains('fw')); }

  function show(id) {
    const w = M.widgets.get(id);
    if (!w) return;
    loadPrefs();
    ensureDock();
    // Si se estaba cerrando (animación de salida), se cancela y vuelve a quedar visible.
    if (M.leaving.has(id)) { clearTimeout(M.leaving.get(id)); M.leaving.delete(id); w.root.classList.remove('fw-leave'); }
    if (M.mounted.has(id)) return;     // nunca se duplica
    const existing = nodesOf();
    // La altura del contenedor se recalcula dentro del FLIP: así la posición
    // final ya la incluye y el otro widget no salta (contenedor elevado).
    WidgetAnimations.flip(existing, () => {
      M.mounted.add(id);
      w.root.classList.add('fw-enter');
      arrange();
      setBodyClasses(); layout();
    });
    requestAnimationFrame(() => requestAnimationFrame(() => w.root.classList.remove('fw-enter')));
  }
  function hide(id) {
    const w = M.widgets.get(id);
    if (!w || !M.mounted.has(id) || M.leaving.has(id)) return;
    if (M.expanded === id) { M.expanded = null; setExpandedAttrs(); }
    const node = w.root;
    node.classList.add('fw-leave');
    M.leaving.set(id, setTimeout(() => {
      M.leaving.delete(id);
      const others = nodesOf().filter(n => n !== node);
      WidgetAnimations.flip(others, () => {
        node.remove(); node.classList.remove('fw-leave');
        M.mounted.delete(id);
        setExpandedAttrs();
        if (M.mounted.size) { setBodyClasses(); layout(); }
      });
      if (!M.mounted.size) teardownDock();
    }, reduced() ? 0 : 180));
  }

  /* Expandir / contraer (solo uno a la vez) */
  function setExpandedAttrs() {
    M.widgets.forEach((w, id) => {
      const open = M.expanded === id;
      w.root.classList.toggle('is-expanded', open);
      w.moreWrap.setAttribute('aria-hidden', open ? 'false' : 'true');
      w.moreWrap.inert = !open;
      w.root.setAttribute('aria-description', open ? 'Expandido. Escape para contraer.' : 'Pulsa Enter para ver más opciones.');
      if (w.expandBtn) {
        w.expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        w.expandBtn.setAttribute('aria-label', (open ? 'Contraer ' : 'Expandir ') + w.label.toLowerCase());
      }
    });
  }
  function expand(id) {
    if (!M.mounted.has(id)) return;
    const prev = M.expanded;
    WidgetAnimations.flip(nodesOf().filter(n => n.dataset.widget !== id), () => { M.expanded = id; setExpandedAttrs(); });
    const w = M.widgets.get(id);
    if (w.onExpand) w.onExpand();
    if (prev && prev !== id) { const p = M.widgets.get(prev); if (p && p.onCollapse) p.onCollapse(); }
    setTimeout(layout, 340);
  }
  function collapse() {
    if (!M.expanded) return;
    const w = M.widgets.get(M.expanded);
    WidgetAnimations.flip(nodesOf().filter(n => n !== w.root), () => { M.expanded = null; setExpandedAttrs(); });
    if (w.onCollapse) w.onCollapse();
    setTimeout(layout, 340);
  }
  function toggle(id) { if (M.expanded === id) collapse(); else expand(id); }

  /* Orden */
  function announce(msg) { if (M.live) { M.live.textContent = ''; setTimeout(() => { if (M.live) M.live.textContent = msg; }, 30); } }
  function visibleOrder() { return M.order.filter(id => M.mounted.has(id)); }
  function move(id, delta) {
    const vis = visibleOrder(), i = vis.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const other = vis[j];
    WidgetAnimations.flip(nodesOf(), () => {
      const a = M.order.indexOf(id), b = M.order.indexOf(other);
      M.order[a] = other; M.order[b] = id;
      arrange();
    });
    announce(M.widgets.get(id).label + ' en la posición ' + (j + 1) + ' de ' + vis.length);
    savePrefs();
  }
  // Fija el orden a partir del DOM (lo usa el arrastre).
  function syncOrderFromDom() {
    const domIds = nodesOf().map(n => n.dataset.widget);
    const hidden = M.order.filter(id => !domIds.includes(id));
    M.order = domIds.concat(hidden);
    savePrefs();
  }
  // Altura del contenedor (0 = abajo, 1 = arriba), con animación.
  function setY(y) {
    y = Math.max(0, Math.min(1, Number(y) || 0));
    if (!M.dock) { M.y = y; savePrefs(); return; }
    if (y === M.y) return;
    WidgetAnimations.flip(nodesOf(), () => { M.y = y; applyLift(y * M.maxLift); }, { duration: 340 });
    announce('Widgets movidos ' + describePos());
    savePrefs();
  }
  function setPos(pos) { setY(pos === 'top' ? 1 : 0); }
  // Con teclado: sube/baja el contenedor un cuarto del recorrido.
  function stepY(dir) {
    let y = Math.round((M.y + dir * 0.25) * 4) / 4;
    setY(Math.max(0, Math.min(1, y)));
  }

  /* Teclado: Alt+↑/↓ reordena, Enter/Espacio expande, Escape contrae */
  function onKey(e) {
    const w = e.target.closest && e.target.closest('.fw');
    // Escape contrae solo si el foco está en los widgets o en ningún otro sitio
    // (no interfiere con diálogos, menús ni campos de texto).
    const ae = document.activeElement;
    if (e.key === 'Escape' && M.expanded && (!ae || ae === document.body || (M.dock && M.dock.contains(ae)))) {
      const exp = M.widgets.get(M.expanded);
      collapse();
      if (exp && M.dock.contains(ae)) exp.root.focus();
      return;
    }
    if (!w || !M.dock || !M.dock.contains(w)) return;
    const id = w.dataset.widget;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      // Primero cambia el orden; si ya está en el extremo, mueve el contenedor.
      const vis = visibleOrder(), i = vis.indexOf(id), up = e.key === 'ArrowUp';
      if (up ? i > 0 : i < vis.length - 1) move(id, up ? -1 : 1);
      else stepY(up ? 1 : -1);
      setTimeout(() => w.focus(), 10);
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === w) {
      e.preventDefault(); toggle(id);
    }
  }
  // Tocar fuera contrae el widget expandido. Se hace en el «click» y no al
  // apoyar el dedo: contraer cambia el alto y movería el contenido bajo el
  // dedo antes de que el toque llegue a su destino. Si el toque se convierte
  // en desplazamiento (pointercancel), también se contrae.
  let outsidePointer = null;
  function onOutsideDown(e) { outsidePointer = (M.expanded && M.dock && !M.dock.contains(e.target)) ? e.pointerId : null; }
  function onOutsideCancel(e) { if (outsidePointer !== null && e.pointerId === outsidePointer) { outsidePointer = null; collapse(); } }
  function onOutside(e) {
    outsidePointer = null;
    if (!M.expanded || !M.dock) return;
    if (M.dock.contains(e.target)) return;
    collapse();
  }

  /* Preferencias en la cuenta (no en el navegador) */
  function loadPrefs() {
    if (M.prefsLoaded) return;
    const u = window.currentUser;
    if (!u) return;
    M.prefsLoaded = true;
    const w = (u.ui_prefs && u.ui_prefs.widgets) || null;
    if (w) {
      const order = (w.order || []).filter(id => IDS.includes(id));
      IDS.forEach(id => { if (!order.includes(id)) order.push(id); });
      M.order = order;
      M.y = (typeof w.y === 'number' && isFinite(w.y)) ? Math.max(0, Math.min(1, w.y)) : (w.dock === 'top' ? 1 : 0);
    }
  }
  function savePrefs() {
    clearTimeout(M.saveTimer);
    M.saveTimer = setTimeout(() => {
      const u = window.currentUser;
      if (!u || typeof apiPatch !== 'function') return;
      const widgets = { order: M.order.slice(), dock: M.y >= 0.5 ? 'top' : 'bottom', y: Math.round(M.y * 1000) / 1000 };
      apiPatch('/account/profile', { ui_prefs: { widgets } })
        .then(d => { if (d && d.user && window.currentUser) window.currentUser.ui_prefs = d.user.ui_prefs; })
        .catch(() => { /* sin conexión: se mantiene en esta sesión */ });
    }, 700);
  }

  /* ───────────────────────── WidgetDragController ─────────────────────────
     Arrastre vertical con Pointer Events (mouse y dedo):
       · el widget sigue al dedo hacia arriba o hacia abajo; al soltarlo, el
         contenedor se queda a esa altura (el otro widget lo acompaña);
       · cerca de los extremos se pega (abajo o bajo la barra de la sección)
         y un lanzamiento rápido lo lleva directo al extremo;
       · al pasar el centro del otro widget, intercambian lugar (FLIP);
       · fuera del recorrido permitido ofrece resistencia elástica;
       · un toque sin arrastrar expande/contrae;
       · botones, barras y enlaces dentro del widget no inician arrastre. */
  const INTERACTIVE = 'button, a, input, select, textarea, [role="slider"], [data-no-drag]';
  const D = { node: null, id: null, pointer: null, startY: 0, lastY: 0, lastT: 0, vel: 0, dragging: false, swapped: false, top0: 0, center0: 0, lo: 0, hi: 0, dock: null };
  const WidgetDragController = {
    attach(dock) { D.dock = dock; dock.addEventListener('pointerdown', down); },
    detach() { if (D.node) abort(); if (D.dock) D.dock.removeEventListener('pointerdown', down); D.dock = null; },
    isDragging: () => D.dragging
  };
  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary) return;                        // un segundo dedo no toma el control
    if (D.node) {                                    // ya hay un arrastre en curso
      if (performance.now() - D.lastT < 4000) return;
      abort();                                       // (o quedó huérfano: se limpia)
    }
    const node = e.target.closest('.fw');
    if (!node || e.target.closest(INTERACTIVE)) return;
    D.node = node; D.id = node.dataset.widget; D.pointer = e.pointerId;
    D.downInMore = !!e.target.closest('.fw-more');
    D.startY = D.lastY = e.clientY; D.lastT = performance.now(); D.vel = 0; D.dragging = false; D.swapped = false;
    // Quita transiciones en línea (de un FLIP o rebote anterior) para seguir al dedo sin retraso.
    node.style.transition = 'none';
    layout();
    // Referencia fija: el lugar del widget al empezar. Todo el arrastre se mide
    // desde aquí, así no se separa del dedo aunque el layout cambie (el otro
    // widget se contrae, se intercambian o el contenedor se recoloca).
    D.top0 = layoutTop(node);
    const h = node.offsetHeight;
    D.center0 = D.top0 + h / 2;
    // Recorrido permitido (desplazamiento desde esa referencia).
    D.lo = Math.min(0, M.topLimit - D.top0); D.hi = Math.max(0, M.base - (D.top0 + h));
    window.addEventListener('pointermove', moveH, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }
  function moveH(e) {
    if (e.pointerId !== D.pointer || !D.node) return;
    const now = performance.now();
    D.vel = (e.clientY - D.lastY) / Math.max(1, now - D.lastT);
    D.lastY = e.clientY; D.lastT = now;
    const dy = e.clientY - D.startY;
    if (!D.dragging) {
      if (Math.abs(dy) < 7) return;            // umbral: evita arrastres accidentales
      D.dragging = true;
      try { D.node.setPointerCapture(D.pointer); } catch (er) {}
      D.node.classList.add('is-dragging');
      D.dock.classList.add('is-dragging');
      if (M.expanded && M.expanded !== D.id) collapse();
    }
    e.preventDefault();
    applyDrag();
    reorderWhileDragging(D.center0 + rubber(dy));
  }
  // Coloca el widget bajo el dedo: desplazamiento visual menos lo que su lugar
  // en el layout se haya movido desde que empezó el arrastre.
  function applyDrag() {
    if (!D.node) return;
    const vis = rubber(D.lastY - D.startY);
    const shift = layoutTop(D.node) - D.top0;
    D.node.style.transform = `translateY(${vis - shift}px) scale(1.03)`;
  }
  // Fuera del recorrido permitido el widget se mueve con resistencia.
  function rubber(dy) {
    if (dy < D.lo) return D.lo + (dy - D.lo) * 0.3;
    if (dy > D.hi) return D.hi + (dy - D.hi) * 0.3;
    return dy;
  }
  // Intercambia con el vecino cuando el centro arrastrado cruza su centro.
  function reorderWhileDragging(center) {
    const nodes = nodesOf(), i = nodes.indexOf(D.node);
    const prev = nodes[i - 1], next = nodes[i + 1];
    const mid = n => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; };
    let target = null, before = true;
    if (prev && center < mid(prev)) { target = prev; before = true; }
    else if (next && center > mid(next)) { target = next; before = false; }
    if (!target) return;
    WidgetAnimations.flip([target], () => {
      if (before) M.dock.insertBefore(D.node, target); else M.dock.insertBefore(D.node, target.nextSibling);
    }, { duration: 260, easing: WidgetAnimations.EASE });
    // Cambió su lugar en el layout: se recoloca para seguir exactamente bajo el dedo.
    D.swapped = true;
    applyDrag();
    syncOrderFromDom();
    announce(M.widgets.get(D.id).label + ' en la posición ' + (nodesOf().indexOf(D.node) + 1));
  }
  function layoutTop(n) { const t = n.style.transform; n.style.transform = 'none'; const top = n.getBoundingClientRect().top; n.style.transform = t; return top; }
  function finish() {
    window.removeEventListener('pointermove', moveH);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  }
  function up(e) {
    if (e.pointerId !== D.pointer || !D.node) return;
    finish();
    const node = D.node, id = D.id, wasDrag = D.dragging, swapped = D.swapped;
    node.classList.remove('is-dragging');
    if (D.dock) D.dock.classList.remove('is-dragging');
    // Velocidad "fresca": si se quedó quieto antes de soltar, no cuenta.
    const vel = performance.now() - D.lastT < 90 ? D.vel : 0;
    D.node = null; D.dragging = false;
    if (!wasDrag) {                                                   // toque → expandir/contraer
      node.style.transition = ''; node.style.transform = '';
      // Dentro de la parte expandida (textos, márgenes) un toque no la cierra.
      if (!(M.expanded === id && D.downInMore)) toggle(id);
      return;
    }
    // Dónde quedó el widget respecto a su lugar (+ = más abajo). Tras un
    // intercambio, un pequeño sobrante no mueve el contenedor.
    let delta = Math.round(node.getBoundingClientRect().top - layoutTop(node));
    if (Math.abs(delta) < (swapped ? 28 : 10)) delta = 0;
    let target = M.lift - delta;
    // Lanzamiento rápido: al extremo (no si el gesto fue para intercambiar).
    if (!swapped) { if (vel < -1.2) target = M.maxLift; else if (vel > 1.2) target = 0; }
    target = Math.max(0, Math.min(M.maxLift, target));
    if (target < 28) target = 0; else if (target > M.maxLift - 28) target = M.maxLift;   // imán
    if (target === M.lift) { WidgetAnimations.settle(node); return; }
    WidgetAnimations.flip(nodesOf(), () => {
      node.style.transition = 'none'; node.style.transform = '';
      M.y = M.maxLift ? target / M.maxLift : 0;
      applyLift(target);
    }, { duration: 320 });
    // Si el FLIP no tuvo que moverlo (ya estaba en su sitio), se le devuelven sus transiciones.
    if (node.style.transition === 'none' && !node.style.transform) node.style.transition = '';
    announce('Widgets movidos ' + describePos());
    savePrefs();
  }
  function cancel(e) {
    if (e.pointerId !== D.pointer || !D.node) return;
    abort();
  }
  // Termina el arrastre sin mover nada: el widget vuelve a su sitio.
  function abort() {
    finish();
    if (D.node) {
      D.node.classList.remove('is-dragging');
      WidgetAnimations.settle(D.node);
    }
    if (D.dock) D.dock.classList.remove('is-dragging');
    D.node = null; D.dragging = false;
  }

  /* ───────────────────────── API pública ───────────────────────── */
  window.WidgetAnimations = WidgetAnimations;
  window.FloatingWidget = FloatingWidget;
  window.WidgetDragController = WidgetDragController;
  window.FloatingWidgetManager = {
    register(w) { M.widgets.set(w.id, w); setExpandedAttrs(); },
    show, hide, expand, collapse, toggle, move, setPos, setY, layout, announce,
    isMounted: (id) => M.mounted.has(id),
    isExpanded: (id) => M.expanded === id,
    state: () => ({ order: visibleOrder(), allOrder: M.order.slice(), pos: posName(), y: M.y, lift: M.lift, maxLift: M.maxLift, expanded: M.expanded, mounted: [...M.mounted] })
  };
})();
