'use strict';
/* realtime.js — Tiempo real. Se conecta a /api/v1/stream (Server-Sent Events)
   y, cuando el servidor avisa que cambió algo (proyectos, archivos, notas,
   documentos, API keys), recarga SOLO esa parte y redibuja sin parpadeos.
   Funciona entre pestañas y dispositivos: si subes 100 archivos desde el
   teléfono, la computadora los ve aparecer solos. */
(function () {
  let es = null, last = null, retryTimer = null, pending = false;

  // Redibuja salvo que el usuario esté escribiendo; en ese caso, al terminar.
  function safeRender() {
    const a = document.activeElement;
    const typing = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(button|checkbox|radio|file|range|submit)$/i.test(a.type)) || a.isContentEditable);
    if (typing && a.closest && a.closest('#view')) { pending = true; return; }
    pending = false;
    render();
  }
  window.safeRender = safeRender;
  document.addEventListener('focusout', () => { if (pending) setTimeout(() => { if (pending) safeRender(); }, 50); });

  /* ─── Recargas por colección (mantienen la vista; sin "Cargando…") ─── */
  const refreshers = {
    files() {
      return apiGet('/files').then(d => { store.files = (d.items || []).map(mapServerFile); });
    },
    projects() {
      return apiGet('/projects').then(d => {
        const old = new Map((store.projects || []).map(p => [p.id, p]));
        store.projects = (d.items || []).map(row => {
          const n = mapServerProject(row), o = old.get(row.id);
          if (o) { n.documents = o.documents; n._loaded = o._loaded; n.members = o.members; n.visibility = o.visibility; n.apiKeys = o.apiKeys; }
          return n;
        });
      });
    },
    // Documentos y archivos del proyecto abierto.
    projectDetail() {
      const p = (store.projects || []).find(x => x.id === state.projectId);
      if (!p || !p._loaded) return Promise.resolve();
      return fetchProjectAll(p.id).then(all => { if (all) p.documents = all.docs.concat(all.files); });
    },
    notes() {
      return apiGet('/notes').then(d => { store.notes = (d.items || []).map(mapServerNote); });
    },
    apikeys() {
      if (typeof refreshKeysUsage === 'function' && document.querySelector('.key-row')) return refreshKeysUsage();
      return apiGet('/apikeys').then(d => {
        const revealed = new Map((store.apiKeys || []).map(k => [k.id, k.revealed]));
        store.apiKeys = (d.items || []).map(k => mapServerKey(k, revealed.get(k.id)));
      });
    }
  };

  // Qué recargar según lo que cambió en el servidor.
  function apply(sig) {
    if (!last) { last = sig; return; }
    const changed = Object.keys(sig).filter(k => sig[k] !== last[k]);
    last = sig;
    if (!changed.length) return;
    const jobs = new Set();
    changed.forEach(k => {
      if (k === 'files') { jobs.add('files'); jobs.add('projects'); jobs.add('projectDetail'); }
      if (k === 'documents') { jobs.add('projects'); jobs.add('projectDetail'); }
      if (k === 'projects') jobs.add('projects');
      if (k === 'notes') jobs.add('notes');
      if (k === 'apikeys') jobs.add('apikeys');
      if (k === 'notifications' && window.refreshNotifications) window.refreshNotifications();
    });
    // Solo recarga lo que ya se había cargado alguna vez (o lo visible).
    const run = [];
    if (jobs.has('files') && (typeof filesLoaded === 'undefined' || filesLoaded)) run.push(refreshers.files());
    // Primero la lista de proyectos y DESPUÉS el detalle del proyecto abierto
    // (la lista reemplaza los objetos; el detalle debe escribir en los nuevos).
    const wantList = jobs.has('projects') && (typeof projectsLoaded === 'undefined' || projectsLoaded);
    const wantDetail = jobs.has('projectDetail') && state.route === 'projects' && state.projectId;
    if (wantList || wantDetail) {
      run.push((wantList ? refreshers.projects() : Promise.resolve()).catch(() => {}).then(() => (wantDetail ? refreshers.projectDetail() : null)));
    }
    if (jobs.has('notes') && (typeof notesLoaded === 'undefined' || notesLoaded)) run.push(refreshers.notes());
    if (jobs.has('apikeys') && (typeof apiKeysLoaded === 'undefined' || apiKeysLoaded)) run.push(refreshers.apikeys());
    if (!run.length) return;
    Promise.all(run.map(p => Promise.resolve(p).catch(() => {}))).then(safeRender);
  }

  function connect() {
    if (es || document.hidden || !window.EventSource) return;
    es = new EventSource('/api/v1/stream', { withCredentials: true });
    const onData = (e) => { try { apply(JSON.parse(e.data)); } catch (er) {} };
    es.addEventListener('hello', onData);
    es.addEventListener('change', onData);
    es.onerror = () => {
      // El navegador reintenta solo; si la conexión quedó cerrada (p. ej. 401),
      // se vuelve a intentar más tarde.
      if (es && es.readyState === 2) { es = null; clearTimeout(retryTimer); retryTimer = setTimeout(connect, 15000); }
    };
  }
  function disconnect() { if (es) { es.close(); es = null; } }

  // En segundo plano no se mantiene la conexión (ahorra batería y consultas);
  // al volver se reconecta y se aplica lo que cambió mientras tanto.
  document.addEventListener('visibilitychange', () => { if (document.hidden) disconnect(); else connect(); });

  window.startRealtime = connect;
  if (typeof window.loadCurrentUser === 'function') window.loadCurrentUser().then(connect, () => {});
  else connect();
})();
