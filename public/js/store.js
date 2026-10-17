'use strict';
/* store.js — Estado y persistencia: store/prefs en localStorage, uid, logActivity, state. */

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  }
  // Genera una clave secreta tipo "prefix_xxxx...". Prefijo 'sk' para claves
  // sueltas y 'pk' para la clave propia de cada proyecto.
  function genSecret(prefix = 'sk') {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
    return prefix + '_' + hex;
  }
  // Asegura que un proyecto tenga su arreglo de claves secretas (p.apiKeys).
  // Migra la clave única antigua (p.apiKey string) a una entrada del arreglo.
  function ensureProjectKeys(p) {
    if (!Array.isArray(p.apiKeys)) p.apiKeys = [];
    if (p.apiKey && !p.apiKeys.some(k => k.value === p.apiKey)) {
      p.apiKeys.unshift({
        id: uid(), name: 'Clave principal', value: p.apiKey,
        permission: 'all', fileTypes: ['all'],
        createdAt: p.createdAt || Date.now(), lastUsed: null, revealed: false,
        quota: 10000, usage: { requests: 0, tokens: 0, cost: 0, daily: [0,0,0,0,0,0,0] }
      });
      delete p.apiKey;
      writeStore(store);
    }
    return p.apiKeys;
  }
  // Los datos (proyectos, notas, archivos, claves) viven en el SERVIDOR / base
  // de datos, NO en el navegador. No se usa caché local para los datos: cada
  // vista los carga del servidor. readStore siempre empieza vacío y writeStore
  // no guarda nada en localStorage (solo las preferencias usan localStorage).
  function readStore() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}  // purga caché vieja
    return defaultStore();
  }
  function writeStore() { /* sin caché: los datos se guardan en el servidor */ }
  function defaultStore() {
    return { projects: [], notes: [], apiKeys: [], files: [], activity: [] };
  }
  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
  }
  function writePrefs(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
  }
  function logActivity(kind, text) {
    store.activity.unshift({ id: uid(), kind, text, at: Date.now() });
    store.activity = store.activity.slice(0, 40);
    writeStore(store);
  }

  let store = readStore();
  let state = {
    route: 'dashboard',
    projectId: null,
    noteId: null,
    search: ''
  };
