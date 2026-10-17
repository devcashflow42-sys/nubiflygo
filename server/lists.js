/* ==========================================================================
   lists.js — Listas completas y borrado masivo para el servidor Express
   (misma API y mismas respuestas que las Functions de Cloudflare).
   · Filtros de archivos en SQL con parámetros ($n).
   · Item de archivo con la estructura profesional de la API.
   · Borrado: primero el almacenamiento (por lotes) y después las filas.
     En Node no hay límite de llamadas: se borra todo en una petición
     ("remaining" siempre es 0).
   ========================================================================== */

import { query } from './db.js';
import { deleteObjects } from './storage.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_IDS = 1000;

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

/* ─── Tipos de archivo ─── */
export const FILE_TYPE_SQL = `CASE
  WHEN mime LIKE 'image/%' THEN 'image'
  WHEN mime LIKE 'video/%' THEN 'video'
  WHEN mime LIKE 'audio/%' THEN 'audio'
  WHEN mime = 'application/pdf' OR mime LIKE 'text/%' THEN 'document'
  WHEN mime ~ '(zip|rar|7z|tar|gzip|compressed)' THEN 'archive'
  ELSE 'other' END`;
export const FILE_TYPES = ['image', 'video', 'audio', 'document', 'archive', 'other'];
function categoryOf(mime) {
  mime = mime || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'document';
  if (/(zip|rar|7z|tar|gzip|compressed)/.test(mime)) return 'archive';
  return 'other';
}
const extOf = (name) => { const m = String(name || '').match(/\.([a-z0-9]{1,8})$/i); return m ? m[1].toLowerCase() : null; };
const iconFor = (type, mime) => mime === 'application/pdf' ? 'pdf' : ({ image: 'image', video: 'video', audio: 'audio', document: 'document', archive: 'archive' })[type] || 'file';

export const FILE_SORTS = {
  newest: 'created_at DESC, id', oldest: 'created_at ASC, id',
  name: 'lower(name) ASC, id', size: 'size DESC, id'
};
export const FILE_COLS = 'id, user_id, project_id, name, original_name, size, mime, storage_key, meta, published, published_at, created_at, updated_at';
export const DOC_COLS = 'id, project_id, title, left(content, 240) AS excerpt, published, published_at, created_at, updated_at';

const truthy = (v) => v === true || v === 'true' || v === '1';
const falsy = (v) => v === false || v === 'false' || v === '0';
const likeEsc = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

// En un borrado los filtros son estrictos: presente pero vacío, inválido o
// desconocido → error (nunca se ignora: sería "borrar todo").
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

// Filtros: { type, project_id, q, published }. `next` = primer $n libre.
export function fileFilters(src, next) {
  let sql = '';
  const params = [];
  const ph = () => '$' + (next + params.length);
  const type = src.type ? String(src.type) : '';
  if (type) {
    if (!FILE_TYPES.includes(type)) return { error: 'Tipo no válido (usa: ' + FILE_TYPES.join(', ') + ').' };
    sql += ` AND (${FILE_TYPE_SQL}) = ${ph()}`; params.push(type);
  }
  const pid = src.project_id != null ? String(src.project_id) : '';
  if (pid) {
    if (pid === 'none' || pid === 'null') sql += ' AND project_id IS NULL';
    else if (UUID_RE.test(pid)) { sql += ` AND project_id = ${ph()}`; params.push(pid); }
    else return { error: 'project_id no válido.' };
  }
  const q = src.q != null ? String(src.q).trim().slice(0, 120) : '';
  if (q) {
    const p = ph(); params.push('%' + likeEsc(q) + '%');
    sql += ` AND (name ILIKE ${p} OR meta->'media'->>'title' ILIKE ${p} OR meta->'media'->>'artist' ILIKE ${p} OR meta->'media'->>'album' ILIKE ${p})`;
  }
  if (truthy(src.published)) sql += ' AND published';
  else if (falsy(src.published)) sql += ' AND NOT published';
  return { sql, params };
}

// ?page=&limit= (máx. 100). paged=false → lista completa.
export function pageOf(q) {
  const paged = q.page != null || (q.limit != null && q.limit !== 'all');
  let limit = parseInt(q.limit, 10); if (!Number.isFinite(limit) || limit <= 0) limit = 20; if (limit > 100) limit = 100;
  let page = parseInt(q.page, 10); if (!Number.isFinite(page) || page < 1) page = 1;
  return { paged, limit, page, offset: (page - 1) * limit };
}
export const wantsAll = (q) => truthy(q.all) || q.limit === 'all';

// Selección de un borrado masivo: { all: true } o { ids: [...] }.
export function readSelection(b, q) {
  b = b || {};
  const all = truthy(b.all) || truthy(q.all);
  let ids = Array.isArray(b.ids) ? b.ids : (q.ids ? String(q.ids).split(',') : null);
  if (ids) {
    ids = [...new Set(ids.map(x => String(x).trim()).filter(Boolean))];
    if (!ids.length) return { error: 'La lista de ids está vacía.' };
    if (ids.length > MAX_IDS) return { error: 'Máximo ' + MAX_IDS + ' ids por petición.' };
    if (ids.some(x => !UUID_RE.test(x))) return { error: 'Hay ids no válidos.' };
  }
  if (!all && !ids) return { error: 'Indica qué borrar: {"all": true} para todo o {"ids": [...]} para elegir.' };
  return { all, ids };
}

/* ─── Items ─── */
export function fileItem(row) {
  const meta = row.meta || {};
  const mime = row.mime || 'application/octet-stream';
  const type = meta.type || categoryOf(mime);
  const isImage = mime.startsWith('image/');
  const downloadUrl = '/api/v1/files/' + row.id + '/download';
  const thumbUrl = meta.thumb_key ? '/api/v1/files/' + row.id + '/thumb' : null;
  return {
    id: row.id,
    owner_id: row.user_id,
    published: !!row.published,
    published_at: toISO(row.published_at),
    name: row.name,
    original_name: row.original_name || row.name,
    extension: meta.extension || extOf(row.name),
    mime_type: mime,
    mime,
    type,
    icon: iconFor(type, mime),
    banner: { enabled: !!thumbUrl, url: thumbUrl, width: null, height: null, fit: 'cover' },
    thumbnail: { available: !!thumbUrl, url: thumbUrl, width: null, height: null },
    thumb_url: thumbUrl,
    preview: { available: isImage, url: isImage ? downloadUrl : null },
    media: meta.media || null,
    size: { bytes: Number(row.size) || 0, formatted: fmtBytes(row.size) },
    storage: { provider: meta.provider || process.env.STORAGE_PROVIDER || 'local', visibility: meta.visibility || 'private' },
    metadata: { category: meta.category || type, width: meta.width ?? null, height: meta.height ?? null, checksum_sha256: meta.checksum_sha256 || null },
    project_id: row.project_id || null,
    status: meta.status || 'ready',
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at || row.created_at)
  };
}
export function docItem(r) {
  return {
    id: r.id, kind: 'document', project_id: r.project_id, name: r.title, title: r.title, description: '',
    icon: 'file-text', type: 'document', content: null, excerpt: r.excerpt || '',
    published: !!r.published, published_at: toISO(r.published_at),
    visibility: r.published ? 'public' : 'private', status: 'active',
    created_at: toISO(r.created_at), updated_at: toISO(r.updated_at)
  };
}

/* ─── Borrado ─── */
// Borra los archivos del usuario que cumplan `where` (" AND …" con $2, $3…).
export async function deleteFilesWhere(userId, where, params) {
  const { rows } = await query(
    `SELECT id, size, storage_key, meta->>'thumb_key' AS thumb_key FROM files WHERE user_id = $1${where} ORDER BY created_at, id`,
    [userId, ...params]);
  if (rows.length) {
    try { await deleteObjects(rows.flatMap(r => [r.storage_key, r.thumb_key]).filter(Boolean)); } catch { /* como el borrado individual: las filas se borran igual */ }
    await query('DELETE FROM files WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, rows.map(r => r.id)]);
  }
  const bytes = rows.reduce((s, r) => s + (Number(r.size) || 0), 0);
  return { deleted: rows.length, bytes, remaining: 0, ids: rows.map(r => r.id) };
}

export async function logActivity(userId, kind, text) {
  try { await query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [userId, kind, text]); } catch {}
}

export function bulkResponse(message, deleted, remaining, bytes) {
  return {
    success: true, status: 200,
    message: remaining ? message + ' Quedan ' + remaining + ': repite la petición para terminar.' : message,
    deleted, remaining, done: remaining === 0,
    freed: { bytes, formatted: fmtBytes(bytes) },
    error: null
  };
}