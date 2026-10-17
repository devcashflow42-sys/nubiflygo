'use strict';
/* sharing.js — Compartir un archivo con un enlace (/s/<token>), como MEGA.
   openShareDialog(file): crea (o recupera) el enlace, permite copiarlo, abrirlo
   y dejar de compartir. Quien abra el enlace solo ve ESE archivo. */
(function () {
  const ICN_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  window.ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

  window.openShareDialog = function (f) {
    const name = f.title || f.name || 'archivo';
    const body = el('div', { class: 'share-box' }, [ el('p', { class: 'share-muted' }, 'Creando enlace…') ]);
    let share = null;
    modal({
      title: 'Compartir archivo',
      body,
      actions: [
        { label: 'Dejar de compartir', kind: 'danger', keepOpen: true, onClick: (close) => {
          if (!share) return false;
          apiDelete('/shares/' + share.token).then(() => { toast('Enlace desactivado: ya nadie puede abrirlo'); close(); })
            .catch(e => toast(e.message));
          return false;
        } },
        { label: 'Listo', kind: 'primary' }
      ]
    });
    apiPost('/shares', { file_id: f.id }).then(d => {
      share = d.share;
      const inp = el('input', { class: 'share-url', type: 'text', readonly: '', value: share.url, 'aria-label': 'Enlace para compartir' });
      inp.addEventListener('focus', () => inp.select());
      const copy = () => (navigator.clipboard ? navigator.clipboard.writeText(share.url) : Promise.reject())
        .then(() => toast('Enlace copiado'), () => { inp.focus(); inp.select(); toast('Selecciona y copia el enlace'); });
      body.innerHTML = '';
      body.append(
        el('div', { class: 'share-file' }, [ el('span', { class: 'share-ico', html: ICN_LINK }), el('div', {}, [
          el('strong', {}, name), el('span', { class: 'share-muted' }, formatBytes(Number(share.file.size) || 0) + (d.created ? ' · Enlace nuevo' : ' · Enlace activo desde ' + formatDate(Date.parse(share.created_at))))
        ]) ]),
        el('div', { class: 'share-row' }, [ inp, el('button', { class: 'btn btn-primary', type: 'button', onclick: copy }, 'Copiar') ]),
        el('div', { class: 'share-stats' }, [
          el('span', {}, share.views + (share.views === 1 ? ' visita' : ' visitas')),
          el('span', {}, share.downloads + (share.downloads === 1 ? ' descarga' : ' descargas')),
          el('a', { href: share.url, target: '_blank', rel: 'noopener' }, 'Abrir enlace ↗')
        ]),
        el('p', { class: 'share-muted' }, 'Cualquiera con el enlace puede ver y descargar este archivo, aunque no tenga cuenta. No verá tu proyecto ni tus otros archivos.')
      );
      if (d.created) copy();
    }).catch(e => { body.innerHTML = ''; body.append(el('p', { class: 'share-muted' }, e.message || 'No se pudo crear el enlace.')); });
  };
})();
