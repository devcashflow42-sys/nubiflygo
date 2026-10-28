'use strict';
/* sharing.js — Compartir un archivo con un enlace (/s/<token>), como MEGA.
   openShareDialog(file): crea (o recupera) el enlace, permite copiarlo, abrirlo
   y dejar de compartir. Quien abra el enlace solo ve ESE archivo. */
(function () {
  const ICN_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  window.ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

  /* Declaración de derechos de autor (videos y música) antes de compartir o
     publicar. El servidor la pide (code: rights_required) solo la primera vez
     por archivo y la guarda sin borrarla nunca. Devuelve una promesa → true/false. */
  window.askRights = function (name, verb) {
    return new Promise(resolve => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const chk = el('input', { type: 'checkbox', id: 'rights-ok' });
      const body = el('div', { class: 'rights-box' }, [
        el('p', {}, 'Antes de ' + verb + ' «' + name + '», confirma que el contenido es tuyo o que tienes permiso:'),
        el('label', { class: 'mvu-card mvu-rights', for: 'rights-ok' }, [ chk, el('div', {}, [
          el('strong', {}, 'Tengo los derechos de autor'),
          el('p', {}, 'Declaro que soy el titular de los derechos de autor de este contenido o que tengo la autorización de su titular para publicarlo y compartirlo. Soy el único responsable de este contenido y de cualquier reclamo de terceros.'),
          el('p', { class: 'mvu-fine' }, 'La declaración queda registrada con tu cuenta, la fecha y tu conexión, y no se borra. Quien vea el enlace puede reportarlo; si el contenido no es tuyo, podemos darlo de baja.')
        ]) ])
      ]);
      const m = modal({
        title: 'Derechos de autor', body, onClose: () => finish(false),
        actions: [
          { label: 'Cancelar', kind: 'ghost', onClick: () => finish(false) },
          { label: 'Aceptar y continuar', kind: 'primary', onClick: () => { if (!chk.checked) return false; finish(true); } }
        ]
      });
      const btn = m && m.el.querySelector('.modal-foot .btn-primary');
      if (btn) { btn.disabled = true; chk.addEventListener('change', () => { btn.disabled = !chk.checked; }); }
    });
  };

  window.openShareDialog = function (f, accepted) {
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
    apiPost('/shares', accepted ? { file_id: f.id, accept_rights: true } : { file_id: f.id }).then(d => {
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
    }).catch(e => {
      // Video o canción: primero la declaración de derechos, luego el enlace.
      if (e.code === 'rights_required' && !accepted) {
        window.askRights(name, 'compartir').then(ok => { if (ok) window.openShareDialog(f, true); });
        return;
      }
      body.innerHTML = ''; body.append(el('p', { class: 'share-muted' }, e.message || 'No se pudo crear el enlace.'));
    });
  };
})();
