'use strict';
/* views/apikeys.js — API keys: lista, uso, keyRow, openKeyModal (BottomSheet), revocar, copiar. */

  /* ───────────── API keys (conectadas al servidor) ───────────── */
  let apiKeysLoaded = false;   // ya se cargaron del servidor
  let apiKeysLoading = false;  // carga en curso

  // Uso vacío (clave nueva o sin datos del servidor).
  function emptyUsage() {
    return { month: { ok: 0, err: 0 }, today: { ok: 0, err: 0 }, days: lastDays(null).map(d => ({ date: d, ok: 0, err: 0 })) };
  }
  // Las 7 fechas (YYYY-MM-DD, UTC) que terminan en `today`.
  function lastDays(today) {
    const base = Date.parse((today || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
    return Array.from({ length: 7 }, (_, i) => new Date(base - (6 - i) * 86400000).toISOString().slice(0, 10));
  }

  // Convierte una clave del servidor al formato que usa la vista. El uso viene
  // del servidor (peticiones reales hechas con la clave).
  function mapServerKey(k, revealed) {
    const u = k.usage && Array.isArray(k.usage.days) && k.usage.days.length === 7 ? k.usage : emptyUsage();
    return {
      id: k.id, name: k.name, value: k.value,
      project_id: k.project_id || null,
      createdAt: k.created_at ? Date.parse(k.created_at) : Date.now(),
      lastUsed: k.last_used ? Date.parse(k.last_used) : null,
      revealed: !!revealed,
      usage: u,
      fileTypes: ['all'],
      permission: k.permission || 'all',
      permissions: { mode: (!k.permission || k.permission === 'all') ? 'all' : 'restricted' }
    };
  }

  // Carga todas las claves del usuario una sola vez (compartido con la vista
  // global y con las pestañas de clave por proyecto).
  function ensureApiKeys() {
    if (apiKeysLoaded || apiKeysLoading) return;
    apiKeysLoading = true;
    apiGet('/apikeys')
      .then(function (d) { store.apiKeys = (d.items || []).map(function (k) { return mapServerKey(k, false); }); apiKeysLoaded = true; })
      .catch(function (e) { apiKeysLoaded = true; if (e.status !== 401) toast(e.message || 'No se pudieron cargar las claves'); })
      .then(function () { apiKeysLoading = false; render(); startKeysLive(); });
  }
  function loadApiKeys() { ensureApiKeys(); }

  /* ─── Tiempo real ───
     Mientras haya claves en pantalla (vista API keys o pestaña del proyecto) y
     la pestaña del navegador esté visible, se consulta el uso cada 8 s. Solo se
     redibuja si algo cambió, para no interrumpir al usuario. */
  const KEYS_LIVE_MS = 8000;
  let keysLiveTimer = null, keysLiveBusy = false, keysLiveAt = 0;
  function usageSig(list) {
    return JSON.stringify((list || []).map(k => [k.id, k.lastUsed, k.usage && k.usage.month, k.usage && k.usage.days]));
  }
  function refreshKeysUsage() {
    if (keysLiveBusy || document.hidden || !apiKeysLoaded) return Promise.resolve();
    if (!document.querySelector('.key-row')) return Promise.resolve();
    keysLiveBusy = true;
    return apiGet('/apikeys').then(function (d) {
      const revealed = new Map(store.apiKeys.map(k => [k.id, k.revealed]));
      const next = (d.items || []).map(k => mapServerKey(k, revealed.get(k.id)));
      keysLiveAt = Date.now();
      if (usageSig(next) !== usageSig(store.apiKeys) || next.length !== store.apiKeys.length) {
        store.apiKeys = next;
        render();
      } else {
        paintLiveStamp();
      }
    }).catch(function () { /* sin red: se reintenta en el siguiente ciclo */ })
      .then(function () { keysLiveBusy = false; });
  }
  function startKeysLive() {
    if (keysLiveTimer) return;
    keysLiveAt = Date.now();
    keysLiveTimer = setInterval(refreshKeysUsage, KEYS_LIVE_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshKeysUsage(); });
  }
  // Indicador "En vivo · actualizado hace X s".
  function liveBadge() {
    return el('span', { class: 'live-badge', title: 'Los datos se actualizan automáticamente' }, [
      el('span', { class: 'live-dot' }), el('span', { class: 'live-txt' }, liveText())
    ]);
  }
  function liveText() {
    const s = Math.max(0, Math.round((Date.now() - (keysLiveAt || Date.now())) / 1000));
    return 'En vivo · ' + (s < 5 ? 'actualizado ahora' : 'hace ' + s + ' s');
  }
  function paintLiveStamp() {
    document.querySelectorAll('.live-badge .live-txt').forEach(n => { n.textContent = liveText(); });
  }

  function viewApiKeys() {
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(pageToolbar({
      back: () => go('dashboard'),
      title: 'API keys',
      actions: [
        el('button', { class: 'btn btn-primary btn-sm', onclick: () => openKeyModal(), html: ICON_PLUS_SM + '<span style="margin-left:4px">Generar clave</span>' })
      ]
    }));
    v.appendChild(el('div', { class: 'board-head' }, [
      el('h2', {}, 'API keys')
    ]));
    v.appendChild(el('p', { class: 'subtitle', style: { padding: '0 20px 10px', margin: '-6px 0 0', color: 'var(--fg-muted)', fontSize: '13.5px' } }, 'Usa estas claves para autenticar peticiones a tu API. Trátalas como contraseñas — no las compartas.'));

    // Primera vez: trae las claves del servidor y muestra "cargando".
    if (!apiKeysLoaded) {
      if (!apiKeysLoading) loadApiKeys();
      v.appendChild(el('div', { class: 'board-body' }, [ skelTiles(4), skelList(1, true) ]));
      return;
    }

    const body = el('div', { class: 'board-body' });
    if (store.apiKeys.length === 0) {
      body.appendChild(emptyBlock('Aún no hay claves', 'Genera tu primera API key para empezar a conectar servicios externos a tu espacio de trabajo.', 'Generar primera key', () => openKeyModal()));
    } else {
      // Tarjetas resumen (todas las claves, datos reales del mes)
      body.appendChild(usageTiles(store.apiKeys));
      body.appendChild(el('div', { class: 'section-h' }, [ el('h3', {}, 'Tus claves'), liveBadge() ]));

      const list = el('div', { class: 'key-list' });
      store.apiKeys.forEach(k => list.appendChild(keyRow(k)));
      body.appendChild(list);
    }
    v.appendChild(body);
  }

  function ensureUsage(k) {
    if (!k.usage || !k.usage.month || !Array.isArray(k.usage.days) || k.usage.days.length !== 7) k.usage = emptyUsage();
    return k;
  }

  // Reinicia el contador en el servidor (borra el historial de uso de la clave).
  async function resetUsage(k) {
    const ok = await confirmDialog('¿Reiniciar el uso?', `Se borrará el historial de peticiones de "${k.name}". La clave seguirá funcionando.`, 'Reiniciar');
    if (!ok) return;
    try {
      await apiDelete('/apikeys/' + k.id + '/usage');
      k.usage = emptyUsage();
      render();
      toast('Uso reiniciado');
    } catch (e) { toast(e.message || 'No se pudo reiniciar el uso'); }
  }

  // Paso del eje Y en números enteros (1, 2, 5, 10, 20, 50…) para 4 líneas.
  function niceStep(v) {
    const target = Math.max(1, v) / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const n = target / pow;
    const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return Math.max(1, Math.round(s * pow));
  }

  const DAY_SHORT = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  const DAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function dayInfo(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    return { short: DAY_SHORT[d.getUTCDay()], full: DAY_FULL[d.getUTCDay()], num: d.getUTCDate(), mon: MONTHS[d.getUTCMonth()] };
  }

  // Gráfica de barras apiladas (éxitos/fallas) de los últimos 7 días.
  function usageChart(k) {
    const days = k.usage.days;
    const totals = days.map(d => d.ok + d.err);
    const max = Math.max(0, ...totals);

    const step = niceStep(max);
    const top = Math.max(step * 4, step * Math.ceil(max / step));
    const grid = [];
    for (let val = top; val >= 0; val -= step) grid.push(val);

    const tip = el('div', { class: 'chart-tip', hidden: '' });
    const hideTip = () => { tip.hidden = true; };
    function showTip(i, colEl) {
      const d = days[i], info = dayInfo(d.date), total = totals[i];
      const okP = total ? (d.ok / total * 100) : 0, errP = total ? (d.err / total * 100) : 0;
      tip.innerHTML = '';
      tip.appendChild(el('div', { class: 'ct-title' }, (i === 6 ? 'Hoy · ' : '') + info.full + ' ' + info.num + ' ' + info.mon));
      tip.appendChild(el('div', { class: 'ct-row' }, [
        el('span', { class: 'ct-k ok' }, 'Éxitos'), el('span', { class: 'ct-v' }, d.ok.toLocaleString('es-MX')), el('span', { class: 'ct-p' }, okP.toFixed(1) + '%')
      ]));
      tip.appendChild(el('div', { class: 'ct-row' }, [
        el('span', { class: 'ct-k err' }, 'Fallas'), el('span', { class: 'ct-v' }, d.err.toLocaleString('es-MX')), el('span', { class: 'ct-p' }, errP.toFixed(1) + '%')
      ]));
      tip.appendChild(el('div', { class: 'ct-total' }, [ el('span', {}, 'Total'), el('span', {}, total.toLocaleString('es-MX')) ]));
      tip.hidden = false;
      const plot = colEl.closest('.chart-plot');
      const pw = plot.clientWidth, tw = 168;
      let left = colEl.offsetLeft + colEl.offsetWidth / 2 - tw / 2;
      tip.style.left = Math.max(0, Math.min(left, pw - tw)) + 'px';
      tip.style.top = '0px';
    }

    const cols = days.map((d, i) => {
      const v = totals[i];
      const col = el('div', { class: 'cbar-col' + (i === 6 ? ' today' : ''), tabindex: '0', 'aria-label': dayInfo(d.date).full + ': ' + d.ok + ' éxitos, ' + d.err + ' fallas' }, [
        el('div', { class: 'cbar-val' }, v ? v.toLocaleString('es-MX') : ''),
        v ? el('div', { class: 'cbar', style: { height: (v / top * 100) + '%' } }, [
          el('div', { class: 'cseg err', style: { height: (d.err / v * 100) + '%' } }),
          el('div', { class: 'cseg ok', style: { height: (d.ok / v * 100) + '%' } })
        ]) : el('div', { class: 'cbar is-zero' })
      ]);
      col.addEventListener('mouseenter', () => showTip(i, col));
      col.addEventListener('mouseleave', hideTip);
      col.addEventListener('focus', () => showTip(i, col));
      col.addEventListener('blur', hideTip);
      col.addEventListener('click', () => showTip(i, col));
      return col;
    });

    return el('div', { class: 'chart' }, [
      el('div', { class: 'chart-head' }, [
        el('div', {}, [
          el('div', { class: 'chart-title' }, 'Peticiones · últimos 7 días'),
          el('div', { class: 'chart-sub' }, totals.reduce((a, b) => a + b, 0).toLocaleString('es-MX') + ' en total')
        ]),
        el('div', { class: 'chart-legend' }, [ el('span', { class: 'lg ok' }, 'Éxitos'), el('span', { class: 'lg err' }, 'Fallas') ])
      ]),
      el('div', { class: 'chart-plot' }, [
        ...grid.map(val => el('div', { class: 'cgrid' + (val === 0 ? ' base' : ''), style: { bottom: (val / top * 100) + '%' } }, [
          el('span', { class: 'cgrid-lbl' }, compactNum(val))
        ])),
        el('div', { class: 'chart-bars' }, cols),
        max === 0 ? el('div', { class: 'chart-empty' }, 'Sin peticiones en los últimos 7 días') : null,
        tip
      ].filter(Boolean)),
      el('div', { class: 'chart-xlabels' }, days.map((d, i) => {
        const info = dayInfo(d.date);
        return el('span', { class: i === 6 ? 'today' : '' }, [
          el('b', {}, i === 6 ? 'Hoy' : info.short), el('small', {}, String(info.num))
        ]);
      }))
    ]);
  }

  // Bloque de uso compartido. Lo usan keyRow (global) y projectKeyRow (proyecto).
  function usageBlock(k) {
    ensureUsage(k);
    const m = k.usage.month, t = k.usage.today;
    const total = m.ok + m.err, todayTotal = t.ok + t.err;
    const okRate = total ? (m.ok / total * 100) : 0;
    const errRate = total ? (m.err / total * 100) : 0;

    const stat = (lbl, val, sub) => el('div', { class: 'usage-stat' }, [
      el('div', { class: 'lbl' }, lbl),
      el('div', { class: 'val' }, val),
      sub ? el('div', { class: 'sub' }, sub) : null
    ].filter(Boolean));
    const sfItem = (kind, label, value, rate, iconHtml) => el('div', { class: 'sf-item' }, [
      el('div', { class: 'sf-head' }, [
        el('span', { class: 'sf-icon ' + kind, html: iconHtml }),
        el('span', { class: 'sf-label' }, label),
        el('span', { class: 'sf-val' }, value.toLocaleString('es-MX')),
        el('span', { class: 'sf-pct' }, rate.toFixed(1) + '%')
      ]),
      el('div', { class: 'progress' }, [ el('span', { class: kind, style: { width: rate + '%' } }) ])
    ]);
    const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    return el('div', { class: 'usage' }, [
      el('div', { class: 'usage-stats' }, [
        stat('Este mes', total.toLocaleString('es-MX'), total === 1 ? 'petición' : 'peticiones'),
        stat('Hoy', todayTotal.toLocaleString('es-MX'), t.err ? (t.err + (t.err === 1 ? ' falla' : ' fallas')) : 'sin fallas'),
        stat('Tasa de éxito', total ? okRate.toFixed(1) + '%' : '—', total ? 'del mes' : 'sin datos')
      ]),
      el('div', { class: 'success-fail' }, [
        sfItem('ok', 'Éxitos', m.ok, okRate, ICON_CHECK),
        sfItem('err', 'Fallas', m.err, errRate, ICON_X)
      ]),
      usageChart(k)
    ]);
  }

  function compactNum(n) {
    if (n < 1000) return String(n);
    if (n < 1_000_000) return (n/1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return (n/1_000_000).toFixed(n < 10_000_000 ? 2 : 1).replace(/\.0+$/, '') + 'M';
  }

  // Bloque de 4 tarjetas resumen (datos reales del mes, todas las claves).
  function usageTiles(list) {
    list.forEach(ensureUsage);
    const ok = list.reduce((n, k) => n + k.usage.month.ok, 0);
    const err = list.reduce((n, k) => n + k.usage.month.err, 0);
    const total = ok + err;
    const today = list.reduce((n, k) => n + k.usage.today.ok + k.usage.today.err, 0);
    const A = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';
    const OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    const ER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    const K = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 7.5-7.5 1.65 1.65 1.5-1.5-3.15-3.15-9 9"/></svg>';
    // El contenedor permite elegir 4 columnas o 2×2 según el ancho disponible.
    return el('div', { class: 'tiles-keys-wrap' }, [ el('div', { class: 'tiles tiles-keys' }, [
      tile('Peticiones del mes', compactNum(total), today + ' hoy', A),
      tile('Éxitos', compactNum(ok), total ? (ok / total * 100).toFixed(1) + '% del total' : 'Sin peticiones aún', OK),
      tile('Fallas', compactNum(err), total ? (err / total * 100).toFixed(1) + '% del total' : 'Sin peticiones aún', ER),
      tile('Claves activas', String(list.length), 'Generadas', K)
    ]) ]);
  }

  // SVGs de acciones (compartidos por los iconos y el menú popup).
  const KEY_ICON = {
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    eyeOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    dots: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>'
  };

  // Opciones con nombre para el menú popup "⋮" (móvil). onRevoke difiere entre
  // la clave global y la de proyecto.
  function keyMenuItems(k, onRevoke) {
    return [
      { label: k.revealed ? 'Ocultar clave' : 'Mostrar clave', icon: k.revealed ? KEY_ICON.eyeOn : KEY_ICON.eyeOff, onClick: () => { k.revealed = !k.revealed; writeStore(store); render(); } },
      { label: 'Copiar clave', icon: KEY_ICON.copy, onClick: () => copyText(k.value) },
      { label: 'Reiniciar uso', icon: KEY_ICON.reset, onClick: () => resetUsage(k) },
      '-',
      { label: 'Revocar clave', icon: KEY_ICON.trash, danger: true, onClick: onRevoke }
    ];
  }

  function keyRow(k) {
    ensureUsage(k);
    const masked = k.value.slice(0, 7) + '•'.repeat(20) + k.value.slice(-4);
    const badgeClass = '';
    const badgeLabel = 'Activa';

    return el('div', { class: 'key-row' }, [
      // Head: name, value, actions
      el('div', { class: 'key-head' }, [
        el('div', { class: 'key-main' }, [
          el('div', { class: 'key-name' }, [
            document.createTextNode(k.name + ' '),
            el('span', { class: 'key-badge ' + badgeClass }, badgeLabel)
          ]),
          el('div', { class: 'key-value' }, [ el('code', {}, k.revealed ? k.value : masked) ]),
          el('div', { class: 'key-meta' }, 'Creada ' + formatDate(k.createdAt) + (k.lastUsed ? (' · Último uso ' + timeAgo(k.lastUsed)) : ' · Nunca usada'))
        ]),
        el('div', { class: 'key-actions' }, [
          el('button', { class: 'icon-btn', title: k.revealed ? 'Ocultar' : 'Mostrar', onclick: () => { k.revealed = !k.revealed; writeStore(store); render(); }, html: k.revealed
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
          }),
          el('button', { class: 'icon-btn', title: 'Copiar', onclick: () => copyText(k.value), html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' }),
          el('button', { class: 'icon-btn', title: 'Reiniciar uso', onclick: () => resetUsage(k), html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' }),
          el('button', { class: 'icon-btn', title: 'Revocar', onclick: () => revokeKey(k), html: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>' }),
          // Menú compacto (solo móvil): reemplaza los iconos de arriba
          el('button', { class: 'icon-btn key-more', title: 'Opciones', 'aria-label': 'Opciones', onclick: (e) => popup(e, keyMenuItems(k, () => revokeKey(k))), html: KEY_ICON.dots })
        ])
      ]),
      usageBlock(k)
    ]);
  }

  function openKeyModal() {
    // Estado del formulario
    const st = {
      name: '',
      expiry: '',                 // '' = sin vencimiento; si no, días
      permMode: 'all',            // 'all' | 'restricted'
      resources: { files: 'read', docs: 'read' } // solo aplica en 'restricted'
    };

    // 1 · Título
    const nameInp = el('input', { type: 'text', placeholder: 'ej. Publicar en recientes, Subir multimedia…' });
    nameInp.addEventListener('input', e => st.name = e.target.value);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });

    // 2 · Vencimiento — selector propio (chips), con "Sin vencimiento" al final
    st.expiry = '30'; // predeterminado profesional: 30 días
    const expChips = radioChips([
      { val: '7',   label: '7 días' },
      { val: '30',  label: '30 días' },
      { val: '60',  label: '60 días' },
      { val: '90',  label: '90 días' },
      { val: '180', label: '180 días' },
      { val: '365', label: '1 año' },
      { val: '730', label: '2 años' },
      { val: '',    label: 'Sin vencimiento' }
    ], st.expiry, v => st.expiry = v);

    // 4 · Permisos — Todo | Restringido
    const permRows = el('div', { class: 'perm-rows', style: { display: 'none' } });

    function resourceRow(key, name, sub, iconHtml) {
      const seg = segmented(
        [ { val: 'none', label: 'Ninguno' }, { val: 'read', label: 'Lectura' }, { val: 'write', label: 'Escritura' } ],
        st.resources[key],
        v => st.resources[key] = v,
        'seg-sm'
      );
      return el('div', { class: 'perm-row' }, [
        el('div', { class: 'pr-head' }, [
          el('span', { html: iconHtml, style: { display: 'inline-flex' } }),
          el('div', {}, [
            el('div', { class: 'pr-name' }, name),
            el('div', { class: 'pr-sub' }, sub)
          ])
        ]),
        seg.el
      ]);
    }
    permRows.appendChild(resourceRow('files', 'Archivos', 'Acceso a los archivos subidos a tus proyectos.',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>'));
    permRows.appendChild(resourceRow('docs', 'Documentos', 'Lectura y escritura de documentos.',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'));

    const permSeg = segmented(
      [ { val: 'all', label: 'Todo' }, { val: 'restricted', label: 'Restringido' } ],
      st.permMode,
      v => { st.permMode = v; permRows.style.display = (v === 'restricted') ? 'flex' : 'none'; }
    );

    const body = el('div', {}, [
      el('div', { class: 'field' }, [ el('label', {}, 'Título'), nameInp ]),
      el('div', { class: 'field' }, [ el('label', {}, 'Vencimiento'), expChips.el ]),
      el('div', { class: 'field', style: { marginBottom: '6px' } }, [
        el('label', {}, 'Permisos'),
        permSeg.el,
        permRows
      ]),
      el('p', { class: 'field-hint' }, 'Esta es tu clave secreta para publicar tus archivos y documentos en recientes. Se mostrará una sola vez al generarla — guárdala en un lugar seguro.')
    ]);

    let m;
    // Deriva el permiso del backend: 'all', o 'write'/'read' en modo restringido.
    function permissionOf() {
      if (st.permMode !== 'restricted') return 'all';
      return Object.values(st.resources).includes('write') ? 'write' : 'read';
    }
    async function create(btn) {
      const n = (st.name || nameInp.value || '').trim() || 'Clave sin título';
      if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
      try {
        const d = await apiPost('/apikeys', { name: n, permission: permissionOf(), expires_in_days: st.expiry ? Number(st.expiry) : null });
        store.apiKeys.unshift(mapServerKey(d.item, true)); // se muestra una vez
        apiKeysLoaded = true;
        m.close();
        render();
        toast('API key generada');
      } catch (e) {
        toast(e.message || 'No se pudo generar la clave');
        if (btn) { btn.disabled = false; btn.textContent = 'Generar'; }
      }
    }
    m = openFormSheet({
      title: 'Crear API key',
      body,
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Generar', kind: 'primary', onClick: (e) => { create(e && e.target); return false; }, keepOpen: true }
      ]
    });
  }

  async function revokeKey(k) {
    const ok = await confirmDialog('¿Revocar esta clave?', `"${k.name}" dejará de funcionar inmediatamente. Esta acción no se puede deshacer.`, 'Revocar');
    if (!ok) return;
    try {
      await apiDelete('/apikeys/' + k.id);
    } catch (e) {
      if (e.status !== 404) { toast(e.message || 'No se pudo revocar la clave'); return; }
    }
    store.apiKeys = store.apiKeys.filter(x => x.id !== k.id);
    toast('Clave revocada');
    render();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('Copiado al portapapeles'),
        () => fallbackCopy(text)
      );
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = el('textarea', { style: { position: 'absolute', left: '-9999px' } }, text);
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copiado'); } catch { toast('No se pudo copiar'); }
    ta.remove();
  }
