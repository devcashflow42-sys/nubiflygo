'use strict';
/* apiclient.js — Cliente de la API de NubiFlyGo (/api/v1).
   Usa la cookie de sesión (mismo origen); no maneja tokens. Cada petición
   lleva la cabecera X-NubiFly-Client para que el servidor sepa que viene de
   la app.
   Lanza Error con el mensaje del servidor cuando la respuesta no es OK. */

// Cabecera que identifica las peticiones de la propia app: el servidor no
// entrega datos a una pestaña que abra /api/... directamente ni a otra web.
const API_CLIENT_HEADERS = { 'X-NubiFly-Client': 'web' };

async function apiFetch(path, options) {
  let res;
  try {
    const opts = Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {});
    opts.headers = Object.assign({}, API_CLIENT_HEADERS, opts.headers || {});
    res = await fetch('/api/v1' + path, opts);
  } catch (e) {
    throw new Error('Sin conexión con el servidor.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* respuesta sin JSON */ }
  if (res.status === 401) {
    // Sesión caducada o sin sesión. No vaciamos el diseño ni redirigimos de
    // golpe: mostramos un aviso (con botón para iniciar sesión) y dejamos que la
    // vista siga visible con su estado vacío.
    if (typeof showServerBanner === 'function') showServerBanner('Tu sesión expiró o no has iniciado sesión (error 401).');
    const err = new Error('Sesión caducada.');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('Error ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function apiGet(path) { return apiFetch(path); }
function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}
function apiPatch(path, body) {
  return apiFetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}
function apiDelete(path) { return apiFetch(path, { method: 'DELETE' }); }
// Borrado masivo: el servidor borra por tandas y avisa si faltan ("remaining" o
// "pending"); se repite la misma petición hasta terminar. Devuelve cuántos se
// borraron en total y la última respuesta. onStep(borrados, quedan) informa el avance.
async function apiBulk(method, path, body, onStep) {
  let total = 0, last = null;
  for (let i = 0; i < 200; i++) {
    last = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = last && last.deleted;
    total += typeof d === 'number' ? d : (d ? (d.total != null ? d.total : (d.projects || 0) + (d.documents || 0) + (d.files || 0)) : 0);
    const left = (last && (last.remaining || 0)) || 0;
    if (onStep) onStep(total, left);
    if (!last || !(left > 0 || last.pending)) break;
  }
  return { total, last };
}
// Subida de archivos (multipart). No fija Content-Type: lo pone el navegador.
function apiUpload(path, formData) { return apiFetch(path, { method: 'POST', body: formData }); }
