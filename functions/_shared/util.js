/* ==========================================================================
   util.js — Utilidades genéricas compartidas por todos los servicios de la API.
   Constantes (idiomas, límites, validaciones), paginación, lectura del cuerpo,
   troceo de la ruta, preflight CORS y los "envoltorios" de ruta que cada
   servicio reutiliza. Sin lógica de negocio: solo piezas comunes.
   ========================================================================== */

import { CORS } from './http.js';

// Validaciones y constantes.
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Idiomas soportados por la interfaz (el idioma se detecta del navegador).
export const LANGS = ['es', 'en', 'pt', 'fr', 'de', 'it', 'zh', 'ja'];
export function normLang(v) { const c = String(v || '').slice(0, 2).toLowerCase(); return LANGS.includes(c) ? c : 'es'; }

// Columnas editables por el CRUD genérico (projects/notes/documents).
export const CRUD = {
  projects:  ['name', 'description', 'color'],
  notes:     ['title', 'body', 'project_id'],
  documents: ['title', 'content', 'project_id', 'published']
};

// Largo máximo de cada texto del CRUD (caracteres).
export const CRUD_MAX = {
  projects:  { name: 120, description: 2000, color: 32 },
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
