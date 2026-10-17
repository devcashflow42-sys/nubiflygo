'use strict';
/* widgets/timer.js — TimerWidget: temporizador como cápsula flotante.
   · Compacto: reloj de arena con anillo de progreso, tiempo restante grande
     y botón pausar / reanudar (o iniciar / repetir).
   · Expandido: barra de progreso, hora en que termina, tiempos rápidos
     (1, 5, 10, 15, 25, 45 min), −1 / +1 minuto, reiniciar, contraer y cerrar.
   · Cuenta con el reloj real: sigue exacto aunque cambies de sección, el
     navegador ralentice la pestaña o el teléfono se bloquee.
   · Al terminar: pulso visual, sonido corto, vibración y aviso.
   Se abre desde el menú de la cuenta (fila «Temporizador»). */
(function () {
  const ICN = {
    glass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1.3"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3"/></svg>',
    again: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>'
  };
  const MIN = 60000, MAX = 24 * 3600000, DEFAULT = 5 * MIN;
  const PRESETS = [1, 5, 10, 15, 25, 45];
  const RING_R = 18, RING_C = 2 * Math.PI * RING_R;
  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };
  const spoken = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return [h && h + ' h', m && m + ' min', (x || (!h && !m)) && x + ' s'].filter(Boolean).join(' ');
  };

  // status: idle (sin iniciar) · running · paused · done
  const T = { w: null, status: 'idle', duration: DEFAULT, remaining: DEFAULT, span: 0, wall0: 0, perf0: 0, tick: 0, endTimer: 0, actx: null, beepNodes: [], beepAt: 0 };

  function build() {
    if (T.w) return T.w;
    const w = FloatingWidget.create({ id: 'timer', label: 'Temporizador', onExpand: paint, onCollapse: () => {} });

    // Compacto
    const icon = el('div', { class: 'tw-icon', 'aria-hidden': 'true', html:
      '<svg class="tw-ring" viewBox="0 0 40 40"><circle class="tw-ring-bg" cx="20" cy="20" r="' + RING_R + '"/>' +
      '<circle class="tw-ring-fg" cx="20" cy="20" r="' + RING_R + '" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="0"/></svg>' + ICN.glass });
    const time = el('div', { class: 'tw-time', role: 'timer', 'aria-atomic': 'true' }, fmt(DEFAULT));
    const label = el('div', { class: 'tw-label' }, 'Temporizador');
    const main = el('button', { type: 'button', class: 'fw-btn fw-btn-main tw-main', html: ICN.play });
    w.compact.append(icon, el('div', { class: 'tw-meta' }, [ time, label ]), el('div', { class: 'tw-ctrls' }, [ main ]));

    // Expandido
    const fill = el('div', { class: 'tw-fill' });
    const bar = el('div', { class: 'tw-bar', role: 'progressbar', 'aria-label': 'Progreso del temporizador', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, [ fill ]);
    const ends = el('div', { class: 'tw-ends' });
    const presets = el('div', { class: 'tw-presets', role: 'group', 'aria-label': 'Tiempos rápidos' }, PRESETS.map(m =>
      el('button', { type: 'button', class: 'fw-chip tw-preset', 'data-min': String(m), 'aria-label': 'Iniciar ' + m + (m === 1 ? ' minuto' : ' minutos') }, m + ' min')));
    const minus = el('button', { type: 'button', class: 'fw-chip', 'aria-label': 'Quitar un minuto' }, '−1 min');
    const plus = el('button', { type: 'button', class: 'fw-chip', 'aria-label': 'Añadir un minuto' }, '+1 min');
    const reset = el('button', { type: 'button', class: 'fw-chip', html: ICN.again + '<span>Reiniciar</span>' });
    const collapseBtn = el('button', { type: 'button', class: 'fw-chip fw-chip-icon', title: 'Contraer', 'aria-label': 'Contraer temporizador', html: ICN.collapse });
    const closeBtn = el('button', { type: 'button', class: 'fw-chip fw-chip-icon', title: 'Cerrar', 'aria-label': 'Cerrar temporizador', html: ICN.close });
    w.more.append(
      el('div', { class: 'tw-progress' }, [ bar, ends ]),
      presets,
      el('div', { class: 'fw-row' }, [ minus, plus, reset, el('span', { class: 'fw-grow' }), collapseBtn, closeBtn ])
    );
    Object.assign(T, { w, icon, time, label, main, fill, bar, ends, minus, plus, reset });
    T.ringFg = icon.querySelector('.tw-ring-fg');

    main.addEventListener('click', (e) => { e.stopPropagation(); primary(); });
    presets.addEventListener('click', (e) => {
      const b = e.target.closest('.tw-preset'); if (!b) return;
      e.stopPropagation(); start(Number(b.dataset.min) * MIN);
    });
    minus.addEventListener('click', (e) => { e.stopPropagation(); adjust(-MIN); });
    plus.addEventListener('click', (e) => { e.stopPropagation(); adjust(MIN); });
    reset.addEventListener('click', (e) => { e.stopPropagation(); restart(); });
    collapseBtn.addEventListener('click', (e) => { e.stopPropagation(); FloatingWidgetManager.collapse(); setTimeout(() => w.root.focus(), 10); });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    document.addEventListener('visibilitychange', onVisible);

    FloatingWidgetManager.register(w);
    T.w = w;
    paint();
    return w;
  }

  /* ─── Lógica ───
     En marcha: quedan = span − transcurrido. «Transcurrido» se mide con el
     reloj real (Date.now: sigue avanzando con el teléfono bloqueado o en
     reposo) y con el monotónico (performance.now: no cambia si alguien ajusta
     la hora); se toma el mayor, así un cambio de hora hacia atrás no alarga
     el temporizador. */
  const elapsed = () => Math.max(Date.now() - T.wall0, performance.now() - T.perf0);
  function left() { return T.status === 'running' ? Math.max(0, T.span - elapsed()) : T.remaining; }
  function mark(ms) { T.span = ms; T.wall0 = Date.now(); T.perf0 = performance.now(); }
  function run() {
    clearInterval(T.tick);
    T.tick = setInterval(onTick, 250);
    armEnd();
  }
  // Aviso exacto al final: un setTimeout único no sufre el retraso de hasta
  // 1 minuto que el navegador aplica a los intervalos en pestañas en segundo
  // plano, y el sonido se agenda en el reloj de audio (tampoco se retrasa).
  function armEnd() {
    clearTimeout(T.endTimer);
    const rem = left();
    T.endTimer = setTimeout(onTick, rem + 30);
    scheduleBeep(rem);
  }
  function stopTick() { clearInterval(T.tick); T.tick = 0; clearTimeout(T.endTimer); T.endTimer = 0; }
  function onTick() {
    if (T.status !== 'running') { stopTick(); return; }
    const rem = left();
    if (rem <= 0) { finish(); return; }
    paint();
    // Si el aviso único se adelantó unos milisegundos, se vuelve a programar.
    if (rem < 1500) { clearTimeout(T.endTimer); T.endTimer = setTimeout(onTick, rem + 30); }
    resyncBeep(rem);
  }
  // El reloj de audio puede quedarse atrás (reposo, bloqueo, cambio de hora):
  // si el sonido agendado ya no coincide con el final, se vuelve a agendar.
  function resyncBeep(rem) {
    const ctx = T.actx;
    if (!ctx || ctx.state !== 'running') { if (T.beepNodes.length) cancelBeep(); return; }
    if (!T.beepNodes.length || Math.abs((T.beepAt - ctx.currentTime) - rem / 1000) > 0.5) scheduleBeep(rem);
  }
  function onVisible() { if (!document.hidden && T.status === 'running') onTick(); }

  function start(ms) {
    unlockSound();
    T.duration = Math.min(MAX, Math.max(1000, ms));
    T.remaining = T.duration;
    mark(T.duration);
    T.status = 'running';
    T.w.root.classList.remove('is-done');
    run(); paint();
    FloatingWidgetManager.announce && FloatingWidgetManager.announce('Temporizador iniciado: ' + spoken(T.duration));
  }
  function pause() {
    if (T.status !== 'running') return;
    T.remaining = left();
    T.status = 'paused'; stopTick(); cancelBeep(); paint();
  }
  function resume() {
    if (T.status !== 'paused') return;
    unlockSound();
    mark(T.remaining);
    T.status = 'running'; run(); paint();
  }
  function restart() { start(T.duration); }
  // Botón principal: iniciar · pausar · reanudar · repetir.
  function primary() {
    if (T.status === 'running') pause();
    else if (T.status === 'paused') resume();
    else if (T.status === 'done') restart();
    else start(T.remaining || T.duration);
  }
  function adjust(delta) {
    if (T.status === 'running') {
      const rem = left();
      if (rem + delta < 1000) return;
      T.span += delta;
      T.duration = Math.min(MAX, Math.max(rem + delta, T.duration + delta));
      armEnd();
    } else if (T.status === 'paused') {
      if (T.remaining + delta < 1000) return;
      T.remaining += delta;
      T.duration = Math.min(MAX, Math.max(T.remaining, T.duration + delta));
    } else {
      const base = T.status === 'done' ? T.duration : T.remaining;
      const v = Math.min(MAX, Math.max(MIN, base + delta));
      T.duration = T.remaining = v;
      T.status = 'idle'; T.w.root.classList.remove('is-done');
    }
    paint();
  }
  function finish() {
    stopTick();
    T.status = 'done'; T.remaining = 0;
    paint();
    T.w.root.classList.add('is-done');
    // Si el sonido agendado ya sonó (o está sonando), no se repite. Si aún no
    // le tocaba (el reloj de audio se quedó atrás), se cancela y suena ahora:
    // nunca queda un sonido pendiente para más tarde.
    const ctx = T.actx;
    const sono = T.beepNodes.length && ctx && ctx.state === 'running' && ctx.currentTime >= T.beepAt - 0.15;
    if (sono) T.beepNodes = [];
    else { cancelBeep(); if (ctx && ctx.state === 'running') beep(); }
    try { if (navigator.vibrate) navigator.vibrate([220, 120, 220, 120, 320]); } catch (e) {}
    if (typeof toast === 'function') toast('El temporizador de ' + spoken(T.duration) + ' terminó');
    FloatingWidgetManager.announce && FloatingWidgetManager.announce('El temporizador terminó');
  }
  function close() {
    stopTick(); cancelBeep();
    T.status = 'idle'; T.remaining = T.duration;
    if (T.w) T.w.root.classList.remove('is-done');
    FloatingWidgetManager.hide('timer');
    paint();
  }

  /* ─── Sonido (Web Audio; se habilita con el toque del usuario) ─── */
  function unlockSound() {
    try {
      if (!T.actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) T.actx = new C(); }
      if (T.actx && T.actx.state === 'suspended') T.actx.resume();
    } catch (e) {}
  }
  // Tres tonos cortos a partir de t0 (segundos del reloj de audio).
  function tones(ctx, t0) {
    const out = [];
    [0, 0.32, 0.64].forEach((off, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.26);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + off); o.stop(t0 + off + 0.3);
      out.push(o);
    });
    return out;
  }
  function beep() { try { if (T.actx) tones(T.actx, T.actx.currentTime + 0.02); } catch (e) {} }
  // Solo con el audio activo: en un contexto suspendido el sonido quedaría en
  // cola y saldría tarde al reanudarse.
  function scheduleBeep(remMs) {
    cancelBeep();
    try {
      if (T.actx && T.actx.state === 'running') {
        T.beepAt = T.actx.currentTime + Math.max(0.02, remMs / 1000);
        T.beepNodes = tones(T.actx, T.beepAt);
      }
    } catch (e) {}
  }
  function cancelBeep() {
    T.beepNodes.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
    T.beepNodes = [];
  }

  /* ─── Pintado ─── */
  let lastText = '';
  function paint() {
    if (!T.w) return;
    const rem = left(), s = T.status;
    const text = s === 'done' ? '0:00' : fmt(rem);
    if (text !== lastText) { T.time.textContent = text; lastText = text; }
    const ratio = T.duration ? Math.min(1, Math.max(0, rem / T.duration)) : 0;
    // Anillo: lo que queda (se vacía) · barra: lo que ya pasó (se llena).
    T.ringFg.style.strokeDashoffset = (RING_C * (1 - ratio)).toFixed(2);
    const done = Math.round((1 - ratio) * 100);
    T.fill.style.width = (1 - ratio) * 100 + '%';
    T.bar.setAttribute('aria-valuenow', String(done));
    T.label.textContent = { idle: 'Temporizador', running: 'En marcha', paused: 'En pausa', done: '¡Tiempo!' }[s];
    T.w.root.classList.toggle('is-running', s === 'running');
    T.w.root.classList.toggle('is-paused', s === 'paused');
    const m = {
      idle: [ICN.play, 'Iniciar temporizador'], running: [ICN.pause, 'Pausar temporizador'],
      paused: [ICN.play, 'Reanudar temporizador'], done: [ICN.again, 'Repetir temporizador']
    }[s];
    if (T.main.dataset.state !== s) { T.main.innerHTML = m[0]; T.main.dataset.state = s; }
    T.main.setAttribute('aria-label', m[1]); T.main.setAttribute('title', m[1]);
    if (s === 'running') {
      const end = new Date(Date.now() + rem);
      T.ends.textContent = 'Termina a las ' + end.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } else T.ends.textContent = s === 'paused' ? 'En pausa · quedan ' + fmt(rem) : s === 'done' ? 'Terminó' : 'Elige un tiempo o pulsa iniciar';
    T.minus.disabled = s === 'running' ? rem <= MIN : s === 'paused' ? T.remaining <= MIN : T.remaining <= MIN && s !== 'done';
    T.w.root.setAttribute('aria-label', 'Temporizador: ' + (s === 'done' ? 'terminado' : spoken(rem) + (s === 'running' ? ' restantes' : s === 'paused' ? ', en pausa' : '')));
  }

  /* ─── API pública ─── */
  // Abre el temporizador (si ya existe no se duplica: solo se muestra y expande).
  window.openTimer = function () {
    build();
    const wasMounted = FloatingWidgetManager.isMounted('timer');
    FloatingWidgetManager.show('timer');
    paint();
    if (!wasMounted || T.status === 'idle') setTimeout(() => FloatingWidgetManager.expand('timer'), wasMounted ? 0 : 60);
  };
  window.TimerWidget = {
    open: window.openTimer, start: (min) => { build(); FloatingWidgetManager.show('timer'); start((Number(min) || 5) * MIN); },
    pause, resume, close,
    state: () => ({ status: T.status, remaining: Math.round(left()), duration: T.duration, open: FloatingWidgetManager.isMounted('timer') })
  };
})();
