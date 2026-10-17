'use strict';
/* widgets/music.js — MusicPlayerWidget: reproductor flotante (diseño
   «Floating Music Player»).
   · Cápsula con la canción: portada con aro, título, artista, barra de
     tiempo (adelantar/atrasar) y anterior / reproducir-pausar / siguiente.
   · Dos hojas en UNA sola cápsula (cuando la lista tiene páginas):
       hoja 1 = la canción · hoja 2 = la paginación de la lista.
     Se cambia deslizando la cápsula hacia arriba o abajo (o ↑/↓ con el
     teclado); la hoja de atrás asoma por arriba. Mientras el reproductor está
     abierto, la paginación NO flota aparte: se muda a la hoja 2 y al cerrar
     el reproductor vuelve a su sitio.
   · Sin páginas: una sola hoja; arrastrar la cápsula mueve los widgets.
     Con páginas: la rayita de arriba es la que mueve los widgets.
   · El color dinámico de la portada tiñe las dos hojas.
   · Es el ÚNICO reproductor: un solo <audio>, una sola cola. Al terminar una
     canción sigue la siguiente de la lista abierta. Controles del sistema
     (pantalla de bloqueo, auriculares) con Media Session.
   · La tarjeta que suena se actualiza directamente en el DOM (no redibuja la
     vista, así no se pierde lo que estés escribiendo en un formulario). */
(function () {
  const ICN = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 12 20 6v12zM4 12l9-6v12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 12 4 18V6zM20 12l-9 6V6z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    note: '<span aria-hidden="true">♫</span>',
    filePlay: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"/></svg>'
  };
  const fmt = (s) => {
    s = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };
  const reduceMotion = () => window.WidgetAnimations ? WidgetAnimations.reduced() : false;
  const trackTitle = (f) => (f.media && f.media.title) || f.title || 'Canción';
  const trackArtist = (f) => (f.media && f.media.artist) || 'Artista desconocido';

  const P = {
    w: null, audio: null, track: null, queue: [], index: -1,
    seeking: false, raf: 0, errors: 0,
    active: 'music', busy: false, adopted: null
  };

  // Anillo de progreso del botón reproducir (radio y circunferencia, en px del viewBox 56×56).
  const RING_R = 25, RING_C = 2 * Math.PI * RING_R;
  // Pequeñas animaciones de clase (se reinician aunque ya estén puestas).
  function flash(node, cls, ms) {
    if (!node || reduceMotion()) return;
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    clearTimeout(node['_t_' + cls]);
    node['_t_' + cls] = setTimeout(() => node.classList.remove(cls), ms);
  }

  /* ─── Construcción (una sola vez; nunca se duplica) ─── */
  function build() {
    if (P.w) return P.w;
    const w = FloatingWidget.create({
      id: 'music', label: 'Reproductor de música',
      onResize: () => marquee(),
      // Este widget no tiene vista expandida: todo está a la vista en la cápsula.
      onExpand: () => { FloatingWidgetManager.collapse(); },
      onCollapse: () => {}
    });

    /* Panel 1 · Música */
    const cover = el('div', { class: 'mw-cover', 'aria-hidden': 'true', html: ICN.note });
    const titleIn = el('span', { class: 'mw-title-in' });
    const title = el('div', { class: 'mw-title' }, [ titleIn ]);
    const eq = el('span', { class: 'mw-eq', 'aria-hidden': 'true' }, [ el('i'), el('i'), el('i'), el('i') ]);
    const sub = el('div', { class: 'mw-sub' });
    const fill = el('div', { class: 'mw-fill' }), buf = el('div', { class: 'mw-buf' }), knob = el('div', { class: 'mw-knob' });
    const bar = el('div', { class: 'mw-bar', role: 'slider', tabindex: '0', 'aria-label': 'Posición de la canción', 'aria-valuemin': '0', 'aria-valuemax': '0', 'aria-valuenow': '0', 'aria-valuetext': '0:00' }, [
      el('div', { class: 'mw-track' }, [ buf, fill, knob ])
    ]);
    const tCur = el('span', { class: 'mw-t' }, '0:00'), tDur = el('span', { class: 'mw-t mw-t-dur' }, '0:00');
    const prev = el('button', { type: 'button', class: 'mw-ib', 'aria-label': 'Canción anterior', title: 'Anterior', html: ICN.prev });
    const play = el('button', { type: 'button', class: 'mw-ib mw-play', 'aria-label': 'Pausar', title: 'Pausar', html: ICN.pause });
    const next = el('button', { type: 'button', class: 'mw-ib', 'aria-label': 'Canción siguiente', title: 'Siguiente', html: ICN.next });
    const xBtn = el('button', { type: 'button', class: 'mw-ib mw-x', 'aria-label': 'Cerrar reproductor', title: 'Cerrar', html: ICN.close });
    // Anillo de progreso alrededor de reproducir/pausar (avanza con la canción).
    const playWrap = el('span', { class: 'mw-playwrap', html:
      '<svg class="mw-ring" viewBox="0 0 56 56" aria-hidden="true"><circle class="mw-ring-bg" cx="28" cy="28" r="' + RING_R + '"/>' +
      '<circle class="mw-ring-fg" cx="28" cy="28" r="' + RING_R + '" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + RING_C.toFixed(2) + '"/></svg>' }, [ play ]);
    const sMusic = el('div', { class: 'mw-sheet is-front', role: 'group', 'aria-label': 'Reproductor' }, [
      el('span', { class: 'mw-dot', 'aria-hidden': 'true' }),
      cover,
      el('div', { class: 'mw-meta' }, [
        el('div', { class: 'mw-titlerow' }, [ title, eq ]),
        sub,
        el('div', { class: 'mw-seekrow' }, [ tCur, bar, tDur ])
      ]),
      el('div', { class: 'mw-ctrls' }, [ prev, playWrap, next, xBtn ])
    ]);

    // Hoja 2: la paginación de la lista abierta (solo si la lista tiene páginas).
    const pages = el('div', { class: 'mw-pages' });
    const sPages = el('div', { class: 'mw-sheet mw-sheet-pages is-back', role: 'group', 'aria-label': 'Paginación' }, [ pages ]);
    sPages.inert = true;

    // Sin páginas: arrastrar la cápsula (fuera de botones y de la barra de
    // tiempo) o la rayita mueve el contenedor de widgets. Con páginas, la
    // cápsula cambia de hoja al deslizar y la rayita mueve los widgets.
    const stack = el('div', { class: 'mw-stack' }, [ sPages, sMusic ]);
    const grip = el('span', { class: 'mw-grip', title: 'Arrastra para mover', 'aria-hidden': 'true' });
    w.compact.append(stack, grip);

    w.expandBtn = null;
    Object.assign(P, { w, cover, title, titleIn, sub, play, playWrap, ringFg: playWrap.querySelector('.mw-ring-fg'), prevBtn: prev, nextBtn: next, fill, buf, knob, bar, tCur, tDur, sMusic, sPages, pages, stack });

    prev.addEventListener('click', (e) => { e.stopPropagation(); prevTrack(); });
    play.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    next.addEventListener('click', (e) => { e.stopPropagation(); nextTrack(false); });
    xBtn.addEventListener('click', (e) => { e.stopPropagation(); destroy(); });
    bindSeek();
    bindSwipe();
    watchPager();

    FloatingWidgetManager.register(w);
    P.w = w;
    return w;
  }

  /* ─── Hoja 2: paginación dentro del reproductor ─── */
  function watchPager() {
    const view = document.getElementById('view');
    if (!view || !window.MutationObserver) return;
    new MutationObserver(syncPager).observe(view, { childList: true, subtree: true });
  }
  function syncPager() {
    if (!P.w) return;
    const open = FloatingWidgetManager.isMounted('music') && !!P.track;
    const nav = open ? document.querySelector('#view .pager:not(.is-adopted)') : null;
    if (nav) {
      if (P.adopted && P.adopted !== nav) releasePager();
      const box = nav.querySelector('.pg-box');
      if (box) { P.pages.replaceChildren(box); nav.classList.add('is-adopted'); P.adopted = nav; }
    } else if (P.adopted && (!P.adopted.isConnected || !open)) {
      releasePager();
    }
    setHasPages(!!P.adopted);
  }
  // Devuelve la cápsula de páginas a su barra flotante (si sigue en pantalla).
  function releasePager() {
    const nav = P.adopted; P.adopted = null;
    const box = P.pages.querySelector('.pg-box');
    if (nav && box && nav.isConnected) nav.appendChild(box);
    if (nav) nav.classList.remove('is-adopted');
    P.pages.replaceChildren();
  }
  function setHasPages(has) {
    P.stack.classList.toggle('has-pages', has);
    // Con dos hojas, la cápsula desliza entre hojas (la rayita mueve los widgets).
    if (has) P.stack.setAttribute('data-no-drag', ''); else P.stack.removeAttribute('data-no-drag');
    if (!has && P.active !== 'music') resetSheets();
  }
  function resetSheets() {
    P.active = 'music'; P.busy = false;
    P.stack.classList.remove('is-pages');
    P.sMusic.className = 'mw-sheet is-front'; P.sMusic.inert = false; P.sMusic.style.transform = ''; P.sMusic.style.opacity = '';
    P.sPages.className = 'mw-sheet mw-sheet-pages is-back'; P.sPages.inert = true; P.sPages.style.transform = ''; P.sPages.style.opacity = '';
  }

  /* ─── Cambiar de hoja: canción ⇄ páginas ─── */
  function swap(dir) {
    if (P.busy || !P.w || !P.adopted) return;
    P.busy = true;
    const out = P.active === 'music' ? P.sMusic : P.sPages;
    const inc = P.active === 'music' ? P.sPages : P.sMusic;
    out.classList.remove('is-front', 'is-drag');
    out.style.transform = ''; out.style.opacity = '';
    out.classList.add(dir > 0 ? 'is-up' : 'is-down');
    inc.classList.remove('is-back'); inc.classList.add('is-front');
    out.inert = true; inc.inert = false;
    P.active = P.active === 'music' ? 'pages' : 'music';
    P.stack.classList.toggle('is-pages', P.active === 'pages');
    FloatingWidgetManager.announce(P.active === 'pages' ? 'Paginación' : 'Reproductor');
    setTimeout(() => {
      out.classList.remove('is-up', 'is-down'); out.classList.add('is-back');
      P.busy = false;
      if (P.active === 'music') marquee();
    }, reduceMotion() ? 0 : 600);
  }
  function bindSwipe() {
    const stack = P.stack;
    let d = null, swallow = false;
    // Se puede deslizar empezando sobre un botón: cuenta como deslizamiento al
    // moverse más de 8px (y entonces ese toque no hace clic).
    stack.addEventListener('pointerdown', (e) => {
      if (!P.adopted || P.busy || e.target.closest('[role="slider"]')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = P.active === 'music' ? P.sMusic : P.sPages;
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, t, moving: false };
      swallow = false;
    });
    stack.addEventListener('click', (e) => {
      if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
    stack.addEventListener('pointermove', (e) => {
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.y, dx = e.clientX - d.x;
      if (!d.moving) {
        if (Math.abs(dy) < 8 || Math.abs(dx) > Math.abs(dy)) return;   // horizontal: lo usa la paginación
        d.moving = true;
        d.t.classList.add('is-drag');
        try { stack.setPointerCapture(e.pointerId); } catch (er) {}
      }
      const o = Math.max(-120, Math.min(120, dy));
      d.t.style.transform = 'translate3d(0,' + o + 'px,30px) scale(' + (1 - Math.abs(o) / 1300) + ')';
      d.t.style.opacity = String(1 - Math.abs(o) / 210);
    });
    const end = (e) => {
      if (!d || d.id !== e.pointerId) return;
      const x = d; d = null;
      if (!x.moving) return;
      swallow = true; setTimeout(() => { swallow = false; }, 400);
      const dy = e.clientY - x.y;
      x.t.classList.remove('is-drag'); x.t.style.transform = ''; x.t.style.opacity = '';
      if (e.type === 'pointerup' && Math.abs(dy) > 46 && Math.abs(dy) > Math.abs(e.clientX - x.x) * 0.7) swap(dy < 0 ? 1 : -1);
    };
    stack.addEventListener('pointerup', end);
    stack.addEventListener('pointercancel', end);
    // Teclado: con el foco en la cápsula, ↑/↓ cambia de hoja.
    P.w.root.addEventListener('keydown', (e) => {
      if (!P.adopted || e.altKey || e.target.closest('[role="slider"]')) return;
      if (e.key === 'ArrowUp' && P.active === 'music') { e.preventDefault(); swap(1); }
      else if (e.key === 'ArrowDown' && P.active === 'pages') { e.preventDefault(); swap(-1); }
    });
  }

  // «Agregar»: abre Archivos y el selector para subir audios.
  function addSongs() {
    if (typeof go === 'function') go('files');
    if (typeof window.uploadFiles === 'function') window.uploadFiles();
    else if (typeof window.pickAndUpload === 'function') window.pickAndUpload({});
  }

  function ensureAudio() {
    if (P.audio) return P.audio;
    const a = P.audio = new Audio();
    a.preload = 'metadata';
    a.addEventListener('play', syncPlaying);
    a.addEventListener('pause', syncPlaying);
    a.addEventListener('playing', () => { P.errors = 0; });
    a.addEventListener('loadedmetadata', () => {
      P.bar.setAttribute('aria-valuemax', String(Math.floor(a.duration || 0)));
      P.tDur.textContent = fmt(a.duration); paintProgress();
    });
    a.addEventListener('progress', paintBuffer);
    a.addEventListener('timeupdate', () => { if (!P.seeking) paintProgress(); });
    a.addEventListener('ended', () => {
      if (P.ringFg) P.ringFg.style.strokeDashoffset = '0';
      flash(P.playWrap, 'is-done', 900);
      if (!nextTrack(true)) { syncPlaying(); paintProgress(); }
    });
    a.addEventListener('error', onAudioError);
    bindMediaSession();
    return a;
  }

  // Si una canción no se puede reproducir: aviso, estado en pausa y se salta
  // a la siguiente (sin quedarse en bucle si fallan todas).
  function onAudioError() {
    if (!P.track || !P.audio || !P.audio.getAttribute('src')) return;
    toast('No se pudo reproducir «' + trackTitle(P.track) + '»');
    P.errors++;
    if (P.errors < Math.min(P.queue.length, 4) && P.index + 1 < P.queue.length) { load(P.index + 1, true); return; }
    try { P.audio.pause(); } catch (e) {}
    syncPlaying();
  }

  /* ─── Reproducción ─── */
  function subText(f, i) {
    const m = f.media || {};
    const parts = [trackArtist(f)];
    if (m.album) parts.push(m.album);
    if (P.queue.length > 1) parts.push((i + 1) + ' de ' + P.queue.length);
    return parts.join(' · ');
  }
  function load(i, autoplay) {
    const f = P.queue[i];
    if (!f) return false;
    const a = ensureAudio();
    P.index = i; P.track = f;
    window.nowPlayingId = f.id;
    paintCover(f);
    themeFor(f);
    const t = trackTitle(f), ar = trackArtist(f), m = f.media || {};
    P.titleIn.textContent = t;
    P.title.setAttribute('title', t);
    P.sub.textContent = subText(f, i);
    P.w.root.setAttribute('aria-label', 'Reproductor de música: ' + t + ', ' + ar);
    P.tCur.textContent = '0:00';
    P.tDur.textContent = m.duration ? fmt(m.duration) : '0:00';
    P.fill.style.width = '0%'; P.knob.style.left = '0%'; P.buf.style.width = '0%';
    flash(P.playWrap, 'is-reset', 600);
    if (P.ringFg) P.ringFg.style.strokeDashoffset = RING_C.toFixed(2);
    flash(P.sMusic, 'is-switching', 650);
    a.src = f.downloadUrl + '?inline=1';
    if (autoplay) {
      // Mantiene la notificación como «sonando» al pasar de canción en segundo plano.
      if (HAS_MS) { try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {} }
      a.play().catch(() => syncPlaying());
    }
    setTimeout(marquee, 60);
    updateSession();
    paintNowPlaying();
    return true;
  }
  function toggle() {
    if (!P.audio || !P.track) { addSongs(); return; }
    // Tras un error, «reproducir» vuelve a cargar la canción (reintento).
    if (P.audio.error) { P.errors = 0; load(P.index, true); return; }
    if (P.audio.paused) P.audio.play().catch(() => syncPlaying()); else P.audio.pause();
  }
  function nextTrack(auto) {
    if (!P.audio) return false;
    if (P.index + 1 < P.queue.length) return load(P.index + 1, true);
    if (auto) return false;
    P.audio.currentTime = 0; paintProgress();
    return true;
  }
  function prevTrack() {
    if (!P.audio) return;
    if (P.audio.currentTime > 3 || P.index <= 0) {
      if (P.audio.error) { P.errors = 0; load(P.index, true); return; }   // reintento
      P.audio.currentTime = 0; paintProgress(); return;
    }
    load(P.index - 1, true);
  }
  // Una canción con error no cuenta como «sonando» (Chrome deja paused=false).
  function isPlaying() { return !!(P.audio && !P.audio.error && !P.audio.paused && !P.audio.ended); }
  function syncPlaying() {
    if (!P.w) return;
    const playing = isPlaying();
    P.w.root.classList.toggle('is-playing', playing);
    document.body.classList.toggle('mp-paused', !playing);
    P.play.innerHTML = playing ? ICN.pause : ICN.play;
    P.play.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    P.play.setAttribute('title', playing ? 'Pausar' : 'Reproducir');
    if (HAS_MS) { try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {} }
    cancelAnimationFrame(P.raf); P.raf = 0;
    if (playing) {
      const loop = () => { if (!P.audio) return; if (!P.seeking) paintProgress(); P.raf = requestAnimationFrame(loop); };
      P.raf = requestAnimationFrame(loop);
    }
  }
  function destroy() {
    if (!P.w) return;
    cancelAnimationFrame(P.raf); P.raf = 0;
    if (P.audio) { try { P.audio.pause(); P.audio.removeAttribute('src'); P.audio.load(); } catch (e) {} }
    P.track = null; P.queue = []; P.index = -1; P.errors = 0;
    window.nowPlayingId = null; window.nowPlayingCtx = null;
    document.body.classList.remove('mp-paused');
    P.w.root.classList.remove('is-playing');
    FloatingWidgetManager.hide('music');
    releasePager(); setHasPages(false); resetSheets();
    if (HAS_MS) { try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.setPositionState(); } catch (e) {} }
    paintNowPlaying();
  }

  /* ─── Portada ─── */
  function paintCover(f) {
    const box = P.cover, tid = f.id;
    box.innerHTML = '';
    if (!f.thumbUrl) { box.innerHTML = ICN.note; return; }
    const img = el('img', { src: f.thumbUrl, alt: '', decoding: 'async' });
    img.addEventListener('error', () => { if (P.track && P.track.id === tid && img.parentNode === box) box.innerHTML = ICN.note; });
    box.appendChild(img);
  }

  /* ─── Color dinámico de la portada (Dynamic Album Color Theme) ───
     · Analiza la portada UNA vez por canción (Canvas, 48×48) y guarda la
       paleta en memoria (Map, sin localStorage).
     · Saca 3–5 colores representativos → principal, secundario y acento, y
       arma una paleta armoniosa: fondo oscuro (texto blanco con contraste
       ≥ 4.5:1) y acento pastel claro para barra, ecualizador, punto y aro.
     · Pasa del color anterior al nuevo en ~750 ms (rAF); si cambias rápido de
       canción, la transición vieja se cancela. Con «reducir movimiento» el
       cambio es inmediato.
     · Portadas de otro dominio sin CORS: no se pueden leer → color de NubiflyGo. */
  const THEME_KEYS = ['top', 'mid', 'bot', 'ring', 'edge', 'seek', 'dotc', 'sub', 'play', 'glow', 'halo'];
  const hex = (h, a) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a == null ? 1 : a];
  const DEFAULT_THEME = {          // malva original de NubiflyGo (sin portada)
    top: hex('#7b6e76'), mid: hex('#64555f'), bot: hex('#554650'), ring: hex('#93848e'),
    edge: [182, 167, 175, .4], seek: hex('#f0d3e5'), dotc: hex('#f2e4ee'), sub: hex('#e4d6df'),
    play: [255, 255, 255, .15], glow: [0, 0, 0, .38], halo: [255, 255, 255, .2]
  };
  const T = { cache: new Map(), cur: null, raf: 0, token: 0 };

  // RGB ⇄ HSL (0–1)
  function toHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function toRgb(h, s, l) {
    if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
  }
  const lum = (c) => { const v = c.slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  // Ajusta la luminosidad hasta una luminancia objetivo (texto blanco legible).
  function atLum(h, s, target) {
    let lo = 0, hi = 1, c = toRgb(h, s, .5);
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; c = toRgb(h, s, m); if (lum(c) > target) hi = m; else lo = m; }
    return c;
  }

  // 3–5 colores representativos (cuantización por cubos + mezcla de vecinos).
  function extractColors(img) {
    const N = 48, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;      // lanza error si la imagen está «contaminada» (CORS)
    const bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; bins.set(k, b);
    }
    let list = [...bins.values()].map(b => {
      const rgb = [b.r / b.n, b.g / b.n, b.b / b.n], hsl = toHsl(rgb[0], rgb[1], rgb[2]);
      // Puntaje: frecuencia, con preferencia por colores con saturación y sin extremos de luz.
      const score = b.n * (.35 + hsl[1]) * (hsl[2] < .08 || hsl[2] > .94 ? .25 : 1);
      return { rgb, hsl, n: b.n, score };
    }).sort((a, b) => b.score - a.score);
    const out = [];
    for (const it of list) {
      const near = out.find(o => Math.hypot(o.rgb[0] - it.rgb[0], o.rgb[1] - it.rgb[1], o.rgb[2] - it.rgb[2]) < 48);
      if (near) { near.score += it.score; continue; }
      out.push(Object.assign({}, it));
      if (out.length >= 5) break;
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // Paleta del reproductor a partir de los colores de la portada.
  function buildTheme(colors) {
    if (!colors.length) return DEFAULT_THEME;
    const pri = colors[0];
    const hueDist = (a, b) => { const x = Math.abs(a - b); return Math.min(x, 1 - x); };
    const sec = colors.slice(1).find(c => hueDist(c.hsl[0], pri.hsl[0]) > .06 || Math.abs(c.hsl[2] - pri.hsl[2]) > .2) || pri;
    // Acento: el más vivo (saturación × luz media) entre los representativos.
    const acc = colors.slice().sort((a, b) => (b.hsl[1] * (1 - Math.abs(b.hsl[2] - .55))) - (a.hsl[1] * (1 - Math.abs(a.hsl[2] - .55))))[0];
    // Saturación contenida: elegante, no chillona; grises se quedan grises.
    const sat = (c, mx) => c.hsl[1] < .08 ? c.hsl[1] : Math.min(mx, .18 + c.hsl[1] * .6);
    const top = atLum(pri.hsl[0], sat(pri, .5), .145);          // ≥ 5:1 con blanco
    const mid = atLum((pri.hsl[0] + sec.hsl[0]) / 2 + (hueDist(pri.hsl[0], sec.hsl[0]) > .5 ? .5 : 0), sat(sec, .48), .095);
    const bot = atLum(sec.hsl[0], sat(sec, .45), .06);
    const aH = acc.hsl[0], aS = acc.hsl[1] < .08 ? .08 : Math.min(.75, .35 + acc.hsl[1] * .5);
    const seek = toRgb(aH, aS, .84), dotc = toRgb(aH, aS * .7, .92);
    const ring = toRgb(pri.hsl[0], Math.min(.35, sat(pri, .35)), .55);
    const sub = toRgb(aH, Math.min(.3, aS), .9);
    return {
      top: top.concat(1), mid: mid.concat(1), bot: bot.concat(1), ring: ring.concat(1),
      edge: seek.concat(.32), seek: seek.concat(1), dotc: dotc.concat(1), sub: sub.concat(1),
      play: seek.concat(.2), glow: atLum(sec.hsl[0], sat(sec, .6), .03).concat(.55), halo: seek.concat(.22)
    };
  }

  const css = (c) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (+c[3].toFixed(3)) + ')';
  function setTheme(th) {
    const st = P.w.root.style;
    THEME_KEYS.forEach(k => st.setProperty('--mw-' + k, css(th[k])));
    T.cur = th;
  }
  // Transición suave del color actual al nuevo (cancela la anterior).
  function fadeTheme(to) {
    cancelAnimationFrame(T.raf);
    const from = T.cur || DEFAULT_THEME;
    if (reduceMotion() || from === to) { setTheme(to); return; }
    const t0 = performance.now(), DUR = 750;
    const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now) => {
      const k = ease(Math.min(1, (now - t0) / DUR)), mix = {};
      THEME_KEYS.forEach(key => { mix[key] = from[key].map((v, i) => v + (to[key][i] - v) * k); });
      setTheme(mix);
      if (k < 1) T.raf = requestAnimationFrame(step); else T.cur = to;
    };
    T.raf = requestAnimationFrame(step);
  }
  // Tema para la canción f: de la memoria o analizando su portada una sola vez.
  function themeFor(f) {
    const token = ++T.token;
    const url = f && f.thumbUrl;
    if (!url) { fadeTheme(DEFAULT_THEME); return; }
    if (T.cache.has(url)) { fadeTheme(T.cache.get(url)); return; }
    const img = new Image();
    try { if (new URL(url, location.href).origin !== location.origin) img.crossOrigin = 'anonymous'; } catch (e) {}
    img.decoding = 'async';
    const done = (th) => {
      if (T.cache.size > 80) T.cache.delete(T.cache.keys().next().value);
      T.cache.set(url, th);
      if (token === T.token) fadeTheme(th);              // ¿sigue siendo la canción actual?
    };
    img.onload = () => { let th = DEFAULT_THEME; try { th = buildTheme(extractColors(img)); } catch (e) { /* CORS: color por defecto */ } done(th); };
    img.onerror = () => done(DEFAULT_THEME);
    img.src = url;
  }

  /* ─── Progreso y búsqueda ─── */
  function paintProgress() {
    if (!P.audio || !P.w) return;
    const d = P.audio.duration, t = P.audio.currentTime;
    const ratio = d ? Math.min(1, t / d) : 0;
    P.fill.style.width = ratio * 100 + '%'; P.knob.style.left = ratio * 100 + '%';
    if (P.ringFg) P.ringFg.style.strokeDashoffset = (RING_C * (1 - ratio)).toFixed(2);
    P.tCur.textContent = fmt(t);
    P.bar.setAttribute('aria-valuenow', String(Math.floor(t)));
    P.bar.setAttribute('aria-valuetext', fmt(t) + ' de ' + fmt(d));
  }
  function paintBuffer() {
    const a = P.audio;
    if (!a || !a.duration || !a.buffered.length) return;
    P.buf.style.width = Math.min(100, (a.buffered.end(a.buffered.length - 1) / a.duration) * 100) + '%';
  }
  function bindSeek() {
    const bar = P.bar;
    let pid = null;
    const at = (x) => { const r = bar.querySelector('.mw-track').getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
    const preview = (ratio) => { const d = (P.audio && P.audio.duration) || 0; P.fill.style.width = ratio * 100 + '%'; P.knob.style.left = ratio * 100 + '%'; P.tCur.textContent = fmt(ratio * d); };
    const stop = () => { P.seeking = false; pid = null; bar.classList.remove('is-seeking'); paintProgress(); };
    bar.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!P.audio || !P.audio.duration) return;
      e.preventDefault();
      P.seeking = true; pid = e.pointerId; bar.classList.add('is-seeking');
      try { bar.setPointerCapture(pid); } catch (er) {}
      preview(at(e.clientX));
    });
    bar.addEventListener('pointermove', (e) => { if (P.seeking && e.pointerId === pid) preview(at(e.clientX)); });
    bar.addEventListener('pointerup', (e) => {
      if (!P.seeking || e.pointerId !== pid) return;
      if (P.audio) P.audio.currentTime = at(e.clientX) * (P.audio.duration || 0);
      stop();
    });
    bar.addEventListener('pointercancel', stop);
    bar.addEventListener('lostpointercapture', () => { if (P.seeking) stop(); });
    bar.addEventListener('keydown', (e) => {
      const a = P.audio; if (!a) return;
      const d = a.duration || 0;
      const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 30, PageDown: -30 }[e.key];
      if (step && !e.altKey) a.currentTime = Math.min(d, Math.max(0, a.currentTime + step));
      else if (e.key === 'Home') a.currentTime = 0;
      else if (e.key === 'End') a.currentTime = Math.max(0, d - 1);
      else return;
      e.preventDefault(); e.stopPropagation(); paintProgress();
    });
  }

  // Títulos largos se desplazan suavemente para leerse completos.
  function marquee() {
    if (!P.w || !P.track) return;
    const box = P.title, inner = P.titleIn;
    box.classList.remove('is-marquee');
    box.style.removeProperty('--mq');
    const over = inner.scrollWidth - box.clientWidth;
    if (over > 4 && !reduceMotion()) {
      box.style.setProperty('--mq', -(over + 18) + 'px');
      box.style.setProperty('--mq-t', Math.max(6, over / 18) + 's');
      box.classList.add('is-marquee');
    }
  }

  /* ─── Tarjeta que suena (actualización directa, sin redibujar la vista) ─── */
  function paintNowPlaying() {
    document.querySelectorAll('.fb-art[data-fid]').forEach(art => {
      const on = window.isNowPlaying ? window.isNowPlaying(art.dataset.fid) : (!!window.nowPlayingId && art.dataset.fid === String(window.nowPlayingId));
      if (on === art.classList.contains('is-now-playing')) return;
      art.classList.toggle('is-now-playing', on);
      const old = art.querySelector('.fb-now, .fb-play');
      if (old) old.remove();
      art.appendChild(on
        ? el('span', { class: 'fb-now', 'aria-label': 'Reproduciendo' }, [ el('i'), el('i'), el('i'), el('i') ])
        : el('span', { class: 'fb-play', html: ICN.filePlay, 'aria-hidden': 'true' }));
    });
  }

  /* ─── Controles del sistema (notificación, pantalla de bloqueo, auriculares) ───
     · Notificación con portada, título, artista, barra de tiempo y
       anterior / reproducir-pausar / siguiente mientras suena en segundo plano.
     · Sin portada: icono PNG de NubiflyGo (Android no muestra SVG ahí).
     · En iPhone/iPad no se registran «±10 s»: Safari los pondría en lugar de
       anterior/siguiente en la pantalla de bloqueo. */
  const HAS_MS = 'mediaSession' in navigator;
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return u; } };
  const FALLBACK_ART = [
    { src: abs('/assets/music-cover-192.png'), sizes: '192x192', type: 'image/png' },
    { src: abs('/assets/music-cover-512.png'), sizes: '512x512', type: 'image/png' }
  ];
  function bindMediaSession() {
    if (!HAS_MS) return;
    const ms = navigator.mediaSession;
    const set = (k, fn) => { try { ms.setActionHandler(k, fn); } catch (e) {} };
    set('play', () => { if (P.audio && P.track && (P.audio.paused || P.audio.error)) toggle(); });
    set('pause', () => P.audio && P.audio.pause());
    set('stop', () => destroy());
    set('previoustrack', () => P.track && prevTrack());
    set('nexttrack', () => P.track && nextTrack(false));
    if (!IS_IOS) {
      set('seekbackward', (d) => { if (P.audio) { P.audio.currentTime = Math.max(0, P.audio.currentTime - ((d && d.seekOffset) || 10)); updatePosition(); } });
      set('seekforward', (d) => { if (P.audio) { P.audio.currentTime = Math.min(P.audio.duration || 0, P.audio.currentTime + ((d && d.seekOffset) || 10)); updatePosition(); } });
    }
    set('seekto', (d) => {
      if (!P.audio || !d || d.seekTime == null) return;
      if (d.fastSeek && typeof P.audio.fastSeek === 'function') P.audio.fastSeek(d.seekTime); else P.audio.currentTime = d.seekTime;
      updatePosition();
    });
    // La barra de tiempo de la notificación se recalcula sola a partir de la
    // posición y la velocidad: basta avisar en cada cambio (no en cada cuadro).
    const a = P.audio;
    ['loadedmetadata', 'durationchange', 'play', 'pause', 'seeked', 'ratechange'].forEach(ev => a.addEventListener(ev, updatePosition));
  }
  function updateSession() {
    if (!HAS_MS || !P.track) return;
    const f = P.track, m = f.media || {};
    const art = f.thumbUrl ? [{ src: abs(f.thumbUrl), sizes: '512x512' }].concat(FALLBACK_ART.slice(0, 1)) : FALLBACK_ART;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: trackTitle(f), artist: trackArtist(f), album: m.album || 'NubiflyGo', artwork: art });
    } catch (e) {}
  }
  function updatePosition() {
    if (!HAS_MS || !P.audio || typeof navigator.mediaSession.setPositionState !== 'function') return;
    const a = P.audio, d = a.duration;
    try {
      if (!d || !isFinite(d)) { navigator.mediaSession.setPositionState(); return; }
      navigator.mediaSession.setPositionState({ duration: d, playbackRate: a.playbackRate || 1, position: Math.min(d, Math.max(0, a.currentTime || 0)) });
    } catch (e) {}
  }

  /* ─── API pública (la usan las tarjetas de Archivos y Proyectos) ─── */
  // f: archivo de audio; list: lista en el orden en que se ve.
  window.playAudio = function (f, list) {
    build();
    ensureAudio();
    const audioList = (Array.isArray(list) ? list : [f]).filter(x => x && typeof mediaKind === 'function' && mediaKind(x.mime, x.title) === 'audio');
    let i = audioList.findIndex(x => x.id === f.id);
    if (i < 0) { audioList.unshift(f); i = 0; }
    FloatingWidgetManager.show('music');
    setTimeout(syncPager, 0);
    // Sección donde se empezó (un proyecto o Archivos): solo ahí se marca como sonando.
    const ctx = window.playCtx ? window.playCtx() : '';
    // Tocar la canción que ya suena en esta misma sección: pausa/reanuda en vez de reiniciar.
    if (P.track && P.track.id === f.id && P.audio.getAttribute('src') && window.nowPlayingCtx === ctx) {
      P.queue = audioList; P.index = i;
      P.sub.textContent = subText(f, i);
      toggle(); return;
    }
    P.queue = audioList; P.errors = 0;
    window.nowPlayingCtx = ctx;
    load(i, true);
  };
  window.closePlayer = destroy;
  window.playerState = () => ({
    open: FloatingWidgetManager.isMounted('music'), id: P.track && P.track.id, playing: isPlaying(),
    index: P.index, queue: P.queue.length, panel: P.active, pages: !!P.adopted
  });
  window.MusicPlayerWidget = {
    play: window.playAudio, toggle, next: () => nextTrack(false), prev: prevTrack, close: destroy,
    pages: () => { if (P.active === 'music') swap(1); }, music: () => { if (P.active !== 'music') swap(-1); },
    state: window.playerState
  };
})();
