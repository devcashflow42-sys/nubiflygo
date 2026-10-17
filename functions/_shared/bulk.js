/* ==========================================================================
   bulk.js — Listas completas y borrado masivo (archivos, documentos,
   proyectos). Lo comparten /files y /projects.
   · Filtros de archivos (tipo, proyecto, búsqueda, publicados) en SQL con
     parámetros ($n): nada del cliente se concatena en la consulta.
   · Borrado por tandas: el binario y la portada se borran del almacenamiento
     con el borrado por lotes de S3; si el proveedor no lo admite, se borra lo
     que cabe en el límite de llamadas de Cloudflare y la respuesta dice
     cuántos quedan (`remaining`) para repetir la petición.
   ========================================================================== */

import { deleteObjects } from './storage.js';
import { UUID_RE, fmtBytes, toISO } from './util.js';

// Llamadas al almacenamiento por petición (Cloudflare gratuito: 50 en total;
// se deja margen para la base de datos).
export const STORAGE_BUDGET = 40;
// Filas por tanda (el borrado por lotes de S3 admite 1000 objetos por llamada).
export const BULK_MAX_ROWS = 500;
// Máximo de ids por petición.
export const MAX_IDS = 1000;

// Tipo de archivo en SQL (igual que categoryOf() de files-util.js).
export const FILE_TYPE_SQL = `CASE
  WHEN mime LIKE 'image/%' THEN 'image'
  WHEN mime LIKE 'video/%' THEN 'video'
  WHEN mime LIKE 'audio/%' THEN 'audio'
  WHEN mime = 'application/pdf' OR mime LIKE 'text/%' THEN 'document'
  WHEN mime ~ '(zip|rar|7z|tar|gzip|compressed)' THEN 'archive'
  ELSE 'other' END`;
export const FILE_TYPES = ['image', 'video', 'audio', 'document', 'archive', 'other'];

const likeEsc = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);
const truthy = (v) => v === true || v === 'true' || v === '1';
const falsy = (v) => v === false || v === 'false' || v === '0';

// Filtros de archivos. `src` = { type, project_id, q, published } (de la URL o
// del cuerpo). `next` = número del primer parámetro libre. Devuelve el SQL
// (empieza con " AND …") y sus valores, o { error } si algo no es válido.
// strict (borrados): un filtro presente pero vacío, inválido o desconocido es
// un error — nunca se ignora (ignorarlo convertiría "borrar lo filtrado" en
// "borrar todo").
export const FILTER_KEYS = ['type', 'project_id', 'q', 'published'];
export function strictFilterError(src, onlyKnown) {
  for (const k of Object.keys(src || {})) {
    if (!FILTER_KEYS.includes(k)) { if (onlyKnown) continue; return 'Filtro desconocido: "' + k + '" (usa: ' + FILTER_KEYS.join(', ') + ').'; }
    const v = src[k];
    if (v === null || v === undefined || String(v).trim() === '') return 'El filtro "' + k + '" está vacío.';
    if (k === 'published' && !truthy(v) && !falsy(v)) return 'published debe ser true o false.';
    if (k === 'type' && !FILE_TYPES.includes(String(v))) return 'Tipo no válido (usa: ' + FILE_TYPES.join(', ') + ').';
    if (k === 'project_id' && !['none', 'null'].includes(String(v)) && !UUID_RE.test(String(v))) return 'project_id no válido.';
  }
  return null;
}
export function fileFilters(src, next) {
  let sql = '';
  const params = [];
  const add = (frag, val) => { params.push(val); sql += ' AND ' + frag.replace('?', '$' + (next + params.length - 1)); };
  const type = src.type ? String(src.type) : '';
  if (type) {
    if (!FILE_TYPES.includes(type)) return { error: 'Tipo no válido (usa: ' + FILE_TYPES.join(', ') + ').' };
    add(`(${FILE_TYPE_SQL}) = ?`, type);
  }
  const pid = src.project_id != null ? String(src.project_id) : '';
  if (pid) {
    if (pid === 'none' || pid === 'null') sql += ' AND project_id IS NULL';
    else if (UUID_RE.test(pid)) add('project_id = ?', pid);
    else return { error: 'project_id no válido.' };
  }
  const q = src.q != null ? String(src.q).trim().slice(0, 120) : '';
  if (q) {
    const p = '$' + (next + params.length);
    params.push('%' + likeEsc(q) + '%');
    sql += ` AND (name ILIKE ${p} OR meta->'media'->>'title' ILIKE ${p} OR meta->'media'->>'artist' ILIKE ${p} OR meta->'media'->>'album' ILIKE ${p})`;
  }
  if (truthy(src.published)) sql += ' AND published';
  else if (falsy(src.published)) sql += ' AND NOT published';
  return { sql, params };
}

// Orden de las listas.
export const FILE_SORTS = {
  newest: 'created_at DESC, id', oldest: 'created_at ASC, id',
  name: 'lower(name) ASC, id', size: 'size DESC, id'
};

// ¿Se pidió la lista completa? (?all=1 o ?limit=all)
export function wantsAll(qs) {
  return truthy(qs.get('all')) || qs.get('limit') === 'all';
}

// Lee la selección de un borrado masivo: { all: true } o { ids: [...] }
// (del cuerpo JSON o de la URL: ?all=1 / ?ids=a,b). Devuelve { all, ids } o { error }.
export function readSelection(b, qs) {
  const all = truthy(b.all) || truthy(qs.get('all'));
  let ids = Array.isArray(b.ids) ? b.ids : (qs.get('ids') ? qs.get('ids').split(',') : null);
  if (ids) {
    ids = [...new Set(ids.map(x => String(x).trim()).filter(Boolean))];
    if (!ids.length) return { error: 'La lista de ids está vacía.' };
    if (ids.length > MAX_IDS) return { error: 'Máximo ' + MAX_IDS + ' ids por petición.' };
    if (ids.some(x => !UUID_RE.test(x))) return { error: 'Hay ids no válidos.' };
  }
  if (!all && !ids) return { error: 'Indica qué borrar: {"all": true} para todo o {"ids": [...]} para elegir.' };
  return { all, ids };
}

/* Borra archivos del usuario que cumplan `where` (SQL que empieza con " AND …"
   y usa $2, $3… para `params`): primero sus objetos del almacenamiento (binario
   y portada) y después las filas. Una tanda por llamada.
   Devuelve { deleted, bytes, remaining, ids }. */
export async function deleteFilesWhere(db, env, userId, where, params) {
  const { rows } = await db.query(
    `SELECT id, size, storage_key, meta->>'thumb_key' AS thumb_key FROM files
     WHERE user_id = $1${where} ORDER BY created_at, id LIMIT ${BULK_MAX_ROWS + 1}`,
    [userId, ...params]);
  const more = rows.length > BULK_MAX_ROWS;
  const batch = rows.slice(0, BULK_MAX_ROWS);
  const keysOf = (r) => [r.storage_key, r.thumb_key].filter(Boolean);
  let n = batch.length;
  if (batch.length) {
    let res;
    try { res = await deleteObjects(env, batch.flatMap(keysOf), { budget: STORAGE_BUDGET }); }
    catch { res = { processed: Infinity, all: true }; }      // almacenamiento caído: se borran las filas igual (como el borrado individual)
    if (!res.all) {
      // Solo las filas cuyos objetos ya se trataron (en orden).
      let used = 0; n = 0;
      for (const r of batch) { const k = keysOf(r).length; if (used + k > res.processed) break; used += k; n++; }
    }
  }
  const done = batch.slice(0, n);
  if (done.length) await db.query('DELETE FROM files WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, done.map(r => r.id)]);
  let remaining = 0;
  if (more || n < batch.length) {
    const { rows: c } = await db.query(`SELECT count(*)::int AS n FROM files WHERE user_id = $1${where}`, [userId, ...params]);
    remaining = (c[0] && c[0].n) || 0;
  }
  const bytes = done.reduce((s, r) => s + (Number(r.size) || 0), 0);
  return { deleted: done.length, bytes, remaining, ids: done.map(r => r.id) };
}

// Registra la acción en la actividad (sin romper la respuesta si falla).
export async function logActivity(db, userId, kind, text) {
  try { await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [userId, kind, text]); } catch {}
}

// Resumen de un borrado para la respuesta.
export function bulkResponse(message, deleted, remaining, bytes) {
  return {
    success: true, status: 200,
    message: remaining ? message + ' Quedan ' + remaining + ': repite la petición para terminar.' : message,
    deleted, remaining, done: remaining === 0,
    freed: { bytes, formatted: fmtBytes(bytes) },
    error: null
  };
}

// Documento para listas (sin el contenido completo).
export function docItem(r) {
  return {
    id: r.id, kind: 'document', project_id: r.project_id, name: r.title, title: r.title, description: '',
    icon: 'file-text', type: 'document', content: null, excerpt: r.excerpt || '',
    published: !!r.published, published_at: toISO(r.published_at),
    visibility: r.published ? 'public' : 'private', status: 'active',
    created_at: toISO(r.created_at), updated_at: toISO(r.updated_at)
  };
}