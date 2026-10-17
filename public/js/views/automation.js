'use strict';
/* views/automation.js — Vista Automatización (próximamente). */

  /* ───────────── Automation (stub) ───────────── */
  function viewAutomation() {
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(pageToolbar({
      back: () => go('dashboard'),
      title: t('automation.title')
    }));
    v.appendChild(el('div', { class: 'board-head' }, [
      el('h2', {}, t('automation.title')),
      el('p', { class: 'subtitle' }, t('automation.subtitle'))
    ]));
    const body = el('div', { class: 'board-body' });
    body.appendChild(emptyBlock(t('automation.soonTitle'), t('automation.soonText'), null));
    v.appendChild(body);
  }
