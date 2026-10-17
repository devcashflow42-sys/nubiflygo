'use strict';
/* views/reports.js — Vista Informes. */

  /* ───────────── Reports ───────────── */
  function viewReports() {
    const v = $('#view');
    v.innerHTML = '';
    v.appendChild(pageToolbar({
      back: () => go('dashboard'),
      title: 'Informes'
    }));
    v.appendChild(el('div', { class: 'board-head' }, [
      el('h2', {}, 'Informes'),
      el('p', { class: 'subtitle' }, 'Un vistazo a tu actividad en el espacio de trabajo.')
    ]));

    const totalDocs = store.projects.reduce((n, p) => n + (p.documents?.length || 0), 0);
    const totalWords = store.notes.reduce((n, note) => n + (note.content || '').split(/\s+/).filter(Boolean).length, 0);
    const totalBytes = store.projects.reduce((n, p) => n + (p.documents?.reduce((m, d) => m + (d.size || 0), 0) || 0), 0);
    const byProject = store.projects.map(p => ({ name: p.name, color: p.color, count: p.documents?.length || 0 }));
    const maxCount = Math.max(1, ...byProject.map(p => p.count));

    const body = el('div', { class: 'board-body' });
    body.appendChild(el('div', { class: 'tiles' }, [
      tile('Proyectos', store.projects.length, 'Totales', ''),
      tile('Documentos', totalDocs, 'Totales', ''),
      tile('Palabras escritas', totalWords.toLocaleString('es-MX'), 'En notas', ''),
      tile('Almacenamiento', formatBytes(totalBytes), 'Usado', '')
    ]));

    body.appendChild(el('div', { class: 'section-h' }, [ el('h3', {}, 'Documentos por proyecto') ]));
    if (byProject.length === 0) {
      body.appendChild(el('p', { style: { color: 'var(--fg-muted)', margin: '0' } }, 'Sin proyectos todavía — crea uno para empezar a medir.'));
    } else {
      const chart = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' } });
      byProject.forEach(p => {
        chart.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: '12px', alignItems: 'center' } }, [
          el('span', { style: { fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, p.name),
          el('div', { style: { height: '8px', background: 'var(--surface-sunken)', borderRadius: '999px', overflow: 'hidden' } }, [
            el('span', { style: { display: 'block', height: '100%', width: ((p.count / maxCount) * 100) + '%', background: p.color, borderRadius: '999px' } })
          ]),
          el('span', { style: { fontVariantNumeric: 'tabular-nums', fontSize: '13px', fontWeight: '600', minWidth: '28px', textAlign: 'right' } }, String(p.count))
        ]));
      });
      body.appendChild(chart);
    }
    v.appendChild(body);
  }
