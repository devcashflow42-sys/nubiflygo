'use strict';
/* billing.js — Suscripción con Mercado Pago en la app.
   · renderBillingSection(root, u): plan actual (con corona si pagó), planes
     para contratar, cancelar / reactivar y el historial real de pagos.
   · Al volver de Mercado Pago (/settings?pay=…&payment_id=…) confirma el pago
     con el servidor, que lo verifica directamente con Mercado Pago.
   · /settings?upgrade=pro abre el pago de ese plan (enlaces de la página de Precios). */
(function () {
  const CROWN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18h18l1.2-10.2-5.7 4.1L12 4.5l-4.5 7.4-5.7-4.1L3 18zm0 1.5h18V21H3z"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const MP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
  window.ICN_CROWN = CROWN;

  let billing = null, loading = null;
  const money = (n, cur) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: n % 1 ? 2 : 0 }) + ' ' + (cur || 'MXN');
  const day = (d) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  window.fmtPlanDay = day;

  function load(force) {
    if (billing && !force) return Promise.resolve(billing);
    if (loading && !force) return loading;
    loading = apiGet('/billing').then(d => { billing = d; loading = null; return d; }, e => { loading = null; throw e; });
    return loading;
  }
  // Tras un cambio: recarga perfil + facturación y repinta.
  function refreshAll(newBilling) {
    if (newBilling) billing = newBilling;
    return loadCurrentUser(true).then(u => { try { refreshUserChrome(u); } catch (e) {} }, () => {})
      .then(() => { if (state.route === 'settings') render(); });
  }

  // Devuelve los botones de pago a su estado normal (al fallar, al cancelar o al
  // regresar desde Mercado Pago con el botón «atrás», que restaura la página tal cual).
  function resetPayButtons() {
    document.querySelectorAll('.bill-pay').forEach(b => {
      if (b.dataset.label) { b.textContent = b.dataset.label; delete b.dataset.label; }
      if (!b.dataset.off) b.disabled = false;
      b.classList.remove('is-busy');
    });
  }
  window.addEventListener('pageshow', resetPayButtons);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resetPayButtons(); });

  function startCheckout(planId, btnEl) {
    // Solo el botón tocado dice «Conectando…»; los demás quedan bloqueados mientras tanto.
    document.querySelectorAll('.bill-pay').forEach(b => { b.disabled = true; });
    if (btnEl) { btnEl.dataset.label = btnEl.textContent; btnEl.textContent = 'Conectando con Mercado Pago…'; btnEl.classList.add('is-busy'); }
    // Si por algo no se abre Mercado Pago, en 20 s los botones vuelven a la normalidad.
    const guard = setTimeout(resetPayButtons, 20000);
    return apiPost('/billing/checkout', { plan: planId }).then(d => {
      // Si el usuario regresa con «atrás» sin pagar, vuelve a la pestaña Facturación.
      try { sessionStorage.setItem('nf:billing-return', '1'); } catch (e) {}
      window.location.href = d.init_point;
    }).catch(err => {
      clearTimeout(guard);
      toast(err.message || 'No se pudo iniciar el pago.');
      resetPayButtons();
    });
  }

  function askCancel() {
    const c = billing.current;
    confirmDialog('¿Cancelar tu suscripción?',
      'Tu plan ' + c.plan_name + ' seguirá activo hasta el ' + day(c.expires_at) + '. No se te volverá a cobrar y después pasarás al plan Gratis, sin perder tus archivos. Puedes reactivarla cuando quieras antes de esa fecha.',
      'Sí, cancelar').then(ok => {
      if (!ok) return;
      apiPost('/billing/cancel').then(d => { toast('Renovación cancelada. Tu plan sigue activo hasta el ' + day(c.expires_at) + '.'); refreshAll(d.billing); })
        .catch(err => toast(err.message));
    });
  }
  function resume() {
    apiPost('/billing/resume').then(d => { toast('¡Listo! Tu suscripción sigue activa.'); refreshAll(d.billing); })
      .catch(err => toast(err.message));
  }

  function planCards(current) {
    const grid = el('div', { class: 'bill-plans' }, billing.plans.map(p => {
      const isCur = current.paid && current.plan === p.id;
      const b = el('button', { type: 'button', class: 'btn bill-pay' }, isCur ? 'Renovar 1 mes · ' + money(p.price) : 'Pagar ' + money(p.price));
      b.addEventListener('click', (e) => { e.stopPropagation(); selectPlan(card, true); startCheckout(p.id, b); });
      if (!billing.configured) { b.disabled = true; b.dataset.off = '1'; b.title = 'Los pagos aún no están configurados'; }
      const card = el('div', { class: 'bill-plan' + (p.id === 'pro' ? ' pop' : '') + (isCur ? ' cur' : ''), tabindex: '0', role: 'option', 'aria-selected': 'false' }, [
        isCur ? el('span', { class: 'bill-pop cur' }, 'Tu plan') : (p.id === 'pro' ? el('span', { class: 'bill-pop' }, 'Más popular') : null),
        el('h4', {}, p.name),
        el('div', { class: 'bill-price' }, [ el('strong', {}, '$' + p.price), el('span', {}, ' MXN / mes') ]),
        el('ul', {}, p.feats.map(f => el('li', {}, [ el('span', { html: CHECK }), f ]))),
        b
      ].filter(Boolean));
      // Tocar la tarjeta la selecciona; tocarla otra vez (o tocar fuera) la deja como estaba.
      card.addEventListener('click', () => selectPlan(card));
      card.addEventListener('keydown', (e) => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectPlan(card); } });
      return card;
    }));
    // Celular: puntitos debajo del carrusel (cuál plan se ve); tocar uno lleva a ese plan.
    const dots = el('div', { class: 'bill-dots', 'aria-hidden': 'true' }, billing.plans.map((p, i) =>
      el('button', { type: 'button', tabindex: '-1', class: 'bill-dot' + (i === 0 ? ' on' : ''), onclick: () => { const c = grid.children[i]; if (c) grid.scrollTo({ left: c.offsetLeft - grid.offsetLeft - 18, behavior: 'smooth' }); } })));
    grid.addEventListener('scroll', () => {
      const w = grid.children[0] ? grid.children[0].offsetWidth + 12 : 1;
      const i = Math.min(billing.plans.length - 1, Math.round(grid.scrollLeft / w));
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    }, { passive: true });
    return el('div', { class: 'bill-plans-wrap' }, [ grid, dots ]);
  }
  function clearPlans(except) {
    document.querySelectorAll('.bill-plan.selected').forEach(c => { if (c !== except) { c.classList.remove('selected'); c.setAttribute('aria-selected', 'false'); } });
  }
  function selectPlan(card, keep) {
    const on = keep || !card.classList.contains('selected');
    clearPlans(card);
    card.classList.toggle('selected', on);
    card.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.bill-plan')) clearPlans(null); });

  function currentBlock(u) {
    const c = billing.current;
    if (!c.paid) return null;
    const badge = c.cancel_at_period_end
      ? el('span', { class: 'set-badge warn' }, [ el('span', { class: 'dot' }), 'Se cancela el ' + day(c.expires_at) ])
      : el('span', { class: 'set-badge ok' }, [ el('span', { class: 'dot' }), 'Activo' ]);
    const plan = billing.plans.find(p => p.id === c.plan) || { price: 0, feats: [] };
    return el('div', { class: 'bill-current' }, [
      el('div', { class: 'bill-crown', html: CROWN }),
      el('div', { class: 'bill-cur-main' }, [
        el('div', { class: 'bill-cur-top' }, [ el('h3', {}, 'Plan ' + c.plan_name), badge ]),
        el('p', {}, c.cancel_at_period_end
          ? 'Cancelaste la renovación. Conservas todas las funciones hasta el ' + day(c.expires_at) + '; después pasarás al plan Gratis.'
          : money(plan.price) + ' al mes · Activo hasta el ' + day(c.expires_at) + '. Te avisaremos 3 días antes para renovarlo.'),
        el('div', { class: 'set-plan-feats' }, plan.feats.map(f => el('span', { class: 'ft' }, [ el('span', { html: CHECK }), f ])))
      ]),
      el('div', { class: 'bill-cur-actions' }, c.cancel_at_period_end
        ? [ el('button', { type: 'button', class: 'btn btn-primary', onclick: resume }, 'Reactivar suscripción') ]
        : [ el('button', { type: 'button', class: 'btn btn-danger', onclick: askCancel }, 'Cancelar suscripción') ])
    ]);
  }

  const STATUS = { approved: ['Pagado', 'ok'], pending: ['Pendiente', 'warn'], in_process: ['En revisión', 'warn'], rejected: ['Rechazado', 'err'], cancelled: ['Cancelado', 'err'], refunded: ['Reembolsado', 'err'], invalid_amount: ['Importe no válido', 'err'] };
  function historyList() {
    if (!billing.payments.length) return el('div', { class: 'set-empty compact' }, [
      el('div', { class: 'set-empty-ico', html: MP_ICON }), el('h3', {}, 'Aún no tienes pagos'),
      el('p', {}, 'Cuando pagues un plan con Mercado Pago, tus pagos aparecerán aquí.')
    ]);
    return el('div', { class: 'bill-history' }, billing.payments.map(p => {
      const st = STATUS[p.status] || [p.status, 'warn'];
      return el('div', { class: 'bill-row' }, [
        el('div', { class: 'bill-row-main' }, [
          el('strong', {}, 'NubiFlyGo ' + p.plan_name + ' · 1 mes'),
          el('span', {}, day(p.created_at) + (p.method ? ' · ' + p.method : '') + ' · Folio MP ' + p.mp_payment_id)
        ]),
        el('span', { class: 'bill-amt' }, money(p.amount, p.currency)),
        el('span', { class: 'set-badge ' + st[1] }, [ el('span', { class: 'dot' }), st[0] ])
      ]);
    }));
  }

  // Tarjetas de la pestaña Facturación (plan + historial).
  window.renderBillingSection = function (root, u, card) {
    const planWrap = el('div', {}, [ skelRows(1, 'Cargando tu suscripción…') ]);
    const histWrap = el('div', {}, [ skelRows(3, 'Cargando pagos…') ]);
    root.appendChild(card(CROWN, 'Plan actual', 'Gestiona tu plan, pagos con Mercado Pago y renovación.', [planWrap], null, 'pad'));
    const histCard = card(MP_ICON, 'Historial de pagos', 'Pagos realizados con Mercado Pago.', [histWrap]);
    load().then(() => {
      planWrap.innerHTML = '';
      const c = billing.current;
      if (u.is_admin) {
        planWrap.appendChild(el('div', { class: 'bill-current' }, [ el('div', { class: 'bill-crown', html: CROWN }),
          el('div', { class: 'bill-cur-main' }, [ el('div', { class: 'bill-cur-top' }, [ el('h3', {}, 'Plan Sin límites'), el('span', { class: 'set-badge ok' }, [ el('span', { class: 'dot' }), 'Activo' ]) ]),
            el('p', {}, 'Cuenta de administrador: todas las funciones están disponibles sin límites.') ]) ]));
      } else if (u.is_guest) {
        planWrap.appendChild(el('div', { class: 'set-empty' }, [ el('div', { class: 'set-empty-ico', html: CROWN }), el('h3', {}, 'Estás usando una cuenta de invitado'),
          el('p', {}, 'Crea una cuenta gratis para conservar tus datos y poder contratar un plan.'),
          el('div', { class: 'set-foot' }, [ el('button', { type: 'button', class: 'btn btn-accent', onclick: () => { location.href = '/login'; } }, 'Crear cuenta gratis') ]) ]));
      } else {
        const cur = currentBlock(u);
        if (cur) planWrap.appendChild(cur);
        else planWrap.appendChild(el('div', { class: 'bill-free' }, [
          el('h3', {}, c.expired_plan ? 'Tu plan venció' : 'Estás en el plan Gratis'),
          el('p', {}, c.expired_plan
            ? 'Tu suscripción terminó y volviste al plan Gratis. Renueva cuando quieras: tus archivos siguen aquí.'
            : 'Elige un plan y paga de forma segura con Mercado Pago (tarjeta, OXXO, transferencia o saldo). Cada pago te da 30 días; no hay cobros automáticos.')
        ]));
        planWrap.appendChild(el('h4', { class: 'bill-sub' }, c.paid ? 'Renovar o cambiar de plan' : 'Elige tu plan'));
        planWrap.appendChild(planCards(c));
        if (!billing.configured) planWrap.appendChild(el('p', { class: 'bill-note' }, 'Los pagos aún no están configurados en el servidor (falta MP_ACCESS_TOKEN).'));
        planWrap.appendChild(el('p', { class: 'bill-note' }, 'Pagos procesados por Mercado Pago. Al cambiar de plan, el nuevo empieza el día del pago. Cancelar detiene la renovación y no genera reembolsos de días ya pagados.'));
      }
      histWrap.innerHTML = '';
      histWrap.appendChild(historyList());
    }).catch(err => {
      planWrap.innerHTML = ''; histWrap.innerHTML = '';
      planWrap.appendChild(el('p', { class: 'bill-note' }, 'No se pudo cargar la facturación: ' + (err.message || 'error')));
    });
    return histCard;
  };

  /* ─── Vuelta desde Mercado Pago y enlaces ?upgrade= ─── */
  function handleUrl() {
    try {
      if (sessionStorage.getItem('nf:billing-return')) {
        sessionStorage.removeItem('nf:billing-return');
        if (state.route === 'settings' || /^\/settings/.test(location.pathname)) state.settingsTab = 'billing';
      }
    } catch (e) {}
    const q = new URLSearchParams(location.search);
    const pay = q.get('pay'), pid = q.get('payment_id') || q.get('collection_id'), up = q.get('upgrade');
    if (!pay && !up) return;
    try { history.replaceState(history.state, '', location.pathname); } catch (e) {}
    state.settingsTab = 'billing';
    if (pay === 'failure') { setTimeout(() => toast('El pago no se completó. No se hizo ningún cargo.'), 400); return; }
    if (pay && pid && pid !== 'null') {
      apiPost('/billing/confirm', { payment_id: pid }).then(d => {
        if (d.status === 'approved') toast(d.already ? 'Este pago ya estaba aplicado. ¡Tu plan está activo!' : '¡Pago aprobado! Tu plan ya está activo 👑');
        else if (d.status === 'pending' || d.status === 'in_process') toast('Tu pago está pendiente. Activaremos tu plan en cuanto Mercado Pago lo confirme.');
        else toast('Mercado Pago no aprobó el pago (' + d.status + ').');
        return refreshAll(d.billing);
      }).catch(err => toast(err.message));
    } else if (pay === 'pending') {
      setTimeout(() => toast('Tu pago está pendiente. Activaremos tu plan en cuanto Mercado Pago lo confirme.'), 400);
    }
    if (up) {
      load().then(b => {
        const p = b.plans.find(x => x.id === up);
        if (!p) return;
        confirmDialog('Contratar plan ' + p.name, 'Pagarás $' + p.price + ' MXN por 30 días de ' + p.name + ' con Mercado Pago. Sin cobros automáticos.', 'Ir a pagar')
          .then(ok => { if (ok) startCheckout(p.id); });
      }).catch(() => {});
    }
  }
  handleUrl();
})();
