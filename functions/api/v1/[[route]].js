/* ==========================================================================
   [[route]].js — Respaldo de /api/v1.
   La API ahora vive EN CARPETAS por servicio (account/, projects/, notes/,
   documents/, apikeys/, files/, activity/, admin/, health/). Cloudflare Pages
   envía cada petición a la carpeta que coincide (las rutas con nombre tienen
   prioridad sobre este comodín). Este archivo solo atiende lo que NO coincide
   con ningún servicio: el preflight CORS y un 404 claro en JSON.
   ========================================================================== */
import { json } from '../../_shared/http.js';
import { preflight } from '../../_shared/util.js';

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return preflight(request);
  return json({ error: 'Ruta de API no encontrada.' }, 404);
}
