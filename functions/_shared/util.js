/* ==========================================================================
   util.js — Utilidades genéricas compartidas por todos los servicios de la API.
   Constantes (idiomas, límites, validaciones), paginación, lectura del cuerpo,
   troceo de la ruta, preflight CORS y los "envoltorios" de ruta que cada
   servicio reutiliza. Sin lógica de negocio: solo piezas comunes.
   ========================================================================== */

import { CORS } from './http.js';

// Validaciones y constantes.
// Lineal (sin retroceso cuadrático): cada etiqueta del dominio excluye el punto,
// así un correo largo lleno de puntos no dispara un ReDoS. Equivale al anterior
// para correos válidos (exige al menos un punto en el dominio).
export const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Idiomas soportados por la interfaz (el idioma se detecta del navegador).
export const LANGS = ['es', 'en', 'pt', 'fr', 'de', 'it', 'zh', 'ja'];
export function normLang(v) { const c = String(v || '').slice(0, 2).toLowerCase(); return LANGS.includes(c) ? c : 'es'; }

/* ---------------- Bienvenida: gustos y cumpleaños ----------------
   Los gustos son los MISMOS cinco tipos con los que la app clasifica los
   archivos (ver mediaKind en public/js/media.js), así que lo que elige en la
   bienvenida encaja con lo que luego ve en su espacio. */
export const INTEREST_IDS = ['image', 'video', 'audio', 'doc', 'other'];
// Devuelve la lista limpia (solo ids conocidos, sin repetidos y en orden fijo)
// o null si lo enviado no es una lista. Una lista vacía SÍ es válida: significa
// "ninguno". Las claves desconocidas se descartan en silencio, igual que en
// cleanUiPrefs.
export function cleanInterests(v) {
  if (!Array.isArray(v) || v.length > 20) return null;   // acotado: nada de listas enormes
  const seen = v.filter(x => INTEREST_IDS.includes(x));
  return INTEREST_IDS.filter(id => seen.includes(id));
}

// Fecha de nacimiento. Devuelve 'AAAA-MM-DD', '' para borrarla, o false si no
// vale. Se rechaza lo que no es una fecha real, el futuro, antes de 1900 y a
// los menores de 13 años (edad mínima habitual para tener cuenta propia).
export const MIN_AGE = 13;
export function cleanBirthday(v) {
  if (v === null || v === '') return '';
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  // Fecha real: descarta 31 de febrero y compañía (Date la daría por inválida
  // o la correría de mes).
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  if (Number(s.slice(0, 4)) < 1900) return false;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return false;                                   // en el futuro
  if (ms / (365.2425 * 24 * 3600 * 1000) < MIN_AGE) return false;
  return s;
}

// ¿Hoy es su cumpleaños? Compara mes y día con la fecha del servidor (UTC).
export function isBirthdayToday(birthday, today) {
  const bd = String(birthday || '').slice(0, 10);
  const hoy = String(today || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return false;
  if (bd.slice(5) === hoy.slice(5)) return true;
  // Nacida un 29 de febrero: en los años que no lo tienen, se felicita el 28.
  const y = Number(hoy.slice(0, 4));
  const bisiesto = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return bd.slice(5) === '02-29' && hoy.slice(5) === '02-28' && !bisiesto;
}

// Columnas editables por el CRUD genérico (projects/notes/documents).
export const CRUD = {
  projects:  ['name', 'description', 'color', 'icon'],
  notes:     ['title', 'body', 'project_id'],
  documents: ['title', 'content', 'project_id', 'published']
};

/* Icono y color de un proyecto. Los ids son los mismos 18 que ofrece el
   formulario (PROJECT_ICONS en public/js/icons.js); null o '' = «Auto», el
   icono se pone solo según el contenido. El color solo en hexadecimal: va
   dentro de degradados y variables CSS en la página. */
export const PROJECT_ICON_IDS = ['folder', 'music', 'photo', 'video', 'doc', 'code', 'design', 'work', 'study',
  'travel', 'home', 'money', 'star', 'heart', 'rocket', 'idea', 'chart', 'shop'];
export const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// Largo máximo de cada texto del CRUD (caracteres).
export const CRUD_MAX = {
  projects:  { name: 120, description: 2000, color: 7, icon: 16 },
  notes:     { title: 300, body: 200000, project_id: 36 },
  documents: { title: 300, content: 500000, project_id: 36 }
};

// Límites de las cuentas de invitado (prueba). Las API keys NO están
// disponibles para invitados (requieren cuenta).
export const GUEST_LIMITS = { projects: 3, notes: 10, files: 10 };

// Segmentos de la ruta después de /api/v1/  →  ['projects', '<id>', 'documents']
export function segmentsOf(request) {
  return new URL(request.url).pathname
    .replace(/^\/api\/v1\/?/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);
}

// Lee el cuerpo JSON de forma segura (si no hay o es inválido → {}).
export async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

// Parámetros de paginación de la URL (?page=&limit=), con límites sensatos.
export function pageParams(request) {
  const qs = new URL(request.url).searchParams;
  let limit = parseInt(qs.get('limit'), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > 100) limit = 100;
  let page = parseInt(qs.get('page'), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  return { limit, page, offset: (page - 1) * limit };
}

export function fmtBytes(n) {
  n = Number(n) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(1) : n) + ' ' + u[i];
}

export function toISO(v) {
  if (!v) return null;
  try { return new Date(v).toISOString(); } catch { return null; }
}

// Respuesta a la petición previa de CORS (preflight). Devuelve las cabeceras que
// el navegador pida (nunca hay desajuste).
export function preflight(request) {
  const reqHeaders = request.headers.get('Access-Control-Request-Headers');
  const headers = { ...CORS };
  if (reqHeaders) headers['Access-Control-Allow-Headers'] = reqHeaders;
  return new Response(null, { status: 204, headers });
}
