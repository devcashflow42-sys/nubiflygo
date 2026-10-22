/* ==========================================================================
   routes/files.js — /api/v1/files
   list · upload · download · delete. El binario va al almacenamiento (S3/local)
   y los metadatos a la base de datos.
     GET /files                        → lista completa (todos los datos de cada
                                         archivo + totales). Filtros: type,
                                         project_id, q, published, sort; page/limit
     DELETE /files · POST /files/delete → borrado masivo {"all": true} o {"ids": [...]}
   ========================================================================== */

import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { putObject, getObject, deleteObject } from '../storage.js';
import { fileHeaders, safeKeyName, ownsProject, isAdminEmail } from '../security.js';
import { storageLeft } from '../billing.js';

const db = { query };
import { fileFilters, strictFilterError, FILE_SORTS, FILE_TYPE_SQL, FILE_TYPES, FILE_COLS, pageOf, readSelection, fileItem, logActivity, bulkResponse, fmtBytes } from '../lists.js';
import { trashOne, trashFilesWhere, purgeExpired } from '../trash.js';

export const files = Router();
files.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxFileBytes } });
const UUID_RE = /^[0-9a-f-]{36}$/i;
const THUMB_MAX = 400 * 1024;   // la portada la genera el navegador (≈ 20–60 KB)
// El navegador manda el archivo y, si la tiene, su portada ("thumb").
const uploadFields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]);

// Copia de functions/_shared/files-util.js → cleanMedia (misma lógica).
function cleanMedia(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 4000) return null;
  let o; try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const txt = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) : '') || null;
  const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 10) / 10 : null);
  const m = { title: txt(o.title), artist: txt(o.artist), album: txt(o.album), duration: num(o.duration), width: num(o.width), height: num(o.height) };
  return Object.values(m).some(v => v != null) ? m : null;
}

// GET /files — lista completa con todos los datos de cada archivo y totales.
files.get('/', async (req, res, next) => {
  try {
    const f = fileFilters(req.query, 2);
    if (f.error) return res.status(400).json({ error: f.error });
    const order = Object.hasOwn(FILE_SORTS, String(req.query.sort || '')) ? FILE_SORTS[req.query.sort] : FILE_SORTS.newest;
    const pg = pageOf(req.query);
    const params = [req.user.id, ...f.params];
    let limitSql = '';
    if (pg.paged) { params.push(pg.limit, pg.offset); limitSql = ` LIMIT $${params.length - 1} OFFSET $${params.length}`; }
    const { rows } = await query(`SELECT ${FILE_COLS} FROM files WHERE user_id = $1 AND deleted_at IS NULL${f.sql} ORDER BY ${order}${limitSql}`, params);
    const { rows: st } = await query(
      `SELECT count(*)::int AS n, coalesce(sum(size), 0)::bigint AS bytes, (${FILE_TYPE_SQL}) AS type
       FROM files WHERE user_id = $1 AND deleted_at IS NULL${f.sql} GROUP BY 3`, [req.user.id, ...f.params]);
    const byType = Object.fromEntries(FILE_TYPES.map(t => [t, 0]));
    let total = 0, bytes = 0;
    st.forEach(r => { byType[r.type] = r.n; total += r.n; bytes += Number(r.bytes) || 0; });
    const items = rows.map(fileItem);
    res.json({
      success: true, status: 200, items, total,
      page: pg.paged ? pg.page : 1, limit: pg.paged ? pg.limit : total,
      has_more: pg.paged ? pg.offset + items.length < total : false,
      stats: { count: total, bytes, size_formatted: fmtBytes(bytes), by_type: byType },
      error: null
    });
  } catch (e) { next(e); }
});

// DELETE /files · POST /files/delete — borrado masivo (todo, filtrado o por ids).
async function bulkDelete(req, res, next) {
  try {
    const sel = readSelection(req.body, req.query);
    if (sel.error) return res.status(400).json({ error: sel.error });
    const bf = req.body && req.body.filters;
    if (bf !== undefined && (bf === null || typeof bf !== 'object' || Array.isArray(bf))) return res.status(400).json({ error: 'filters debe ser un objeto.' });
    const strictErr = strictFilterError(bf || {}, false) || strictFilterError(req.query, true);
    if (strictErr) return res.status(400).json({ error: strictErr });
    const f = fileFilters(Object.assign({}, req.query, bf || {}), sel.ids ? 3 : 2);
    if (f.error) return res.status(400).json({ error: f.error });
    const where = (sel.ids ? ' AND id = ANY($2::uuid[])' : '') + f.sql;
    const r = { deleted: await trashFilesWhere(req.user.id, where, (sel.ids ? [sel.ids] : []).concat(f.params)), bytes: 0, remaining: 0, ids: [] };
    if (r.deleted) await logActivity(req.user.id, 'file', r.deleted === 1 ? 'Archivo eliminado' : r.deleted + ' archivos eliminados');
    res.json(Object.assign(bulkResponse(r.deleted === 1 ? 'Se eliminó 1 archivo.' : 'Se eliminaron ' + r.deleted + ' archivos.', r.deleted, 0, r.bytes), { ids: r.ids }));
  } catch (e) { next(e); }
}
files.delete('/', bulkDelete);
files.post('/delete', bulkDelete);

// POST /files/upload — sube un archivo (campo "file", opcional "project_id")
files.post('/upload', uploadFields, async (req, res, next) => {
  try {
    req.file = req.files && req.files.file && req.files.file[0];
    const thumb = req.files && req.files.thumb && req.files.thumb[0];
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo (campo "file").' });
    const projectId = req.body.project_id && UUID_RE.test(req.body.project_id) ? req.body.project_id : null;
    // El proyecto debe ser tuyo; el nombre del archivo nunca forma rutas.
    if (projectId && !(await ownsProject(req.user.id, projectId))) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    // Espacio del plan: no se puede subir más de lo que cubre.
    const { rows: me } = await query('SELECT email, is_admin FROM users WHERE id = $1', [req.user.id]);
    const isAdmin = !!me[0] && (me[0].is_admin || isAdminEmail(me[0].email));
    try { await purgeExpired(req.user.id); } catch {}
    if (req.file.size > await storageLeft(db, req.user.id, isAdmin)) {
      return res.status(413).json({ error: 'No tienes espacio suficiente en tu plan para este archivo. Libera espacio o mejora tu plan.', code: 'storage_full' });
    }
    const name = String(req.file.originalname || 'archivo').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'archivo';
    // Subida idempotente (igual que en functions/): la misma upload_id no se duplica.
    const uploadId = String(req.body.upload_id || '').slice(0, 64);
    if (/^[a-z0-9]{8,64}$/i.test(uploadId)) {
      const { rows: dup } = await query(`SELECT ${FILE_COLS} FROM files WHERE user_id = $1 AND deleted_at IS NULL AND meta->>'upload_id' = $2 LIMIT 1`, [req.user.id, uploadId]);
      if (dup[0]) return res.status(200).json({ item: fileItem(dup[0]) });
    }
    const key = `users/${req.user.id}/${crypto.randomUUID()}-${safeKeyName(name)}`;
    await putObject(key, req.file.buffer, req.file.mimetype);
    const meta = {};
    // Portada (banner): miniatura de imagen/video o carátula de la canción.
    if (thumb && /^image\/(jpeg|png|webp)$/.test(thumb.mimetype) && thumb.size > 0 && thumb.size <= THUMB_MAX) {
      try {
        await putObject(key + '.thumb', thumb.buffer, thumb.mimetype);
        meta.thumb_key = key + '.thumb'; meta.thumb_mime = thumb.mimetype;
      } catch { /* sin portada */ }
    }
    if (/^[a-z0-9]{8,64}$/i.test(uploadId)) meta.upload_id = uploadId;
    const media = cleanMedia(req.body.media);
    if (media) meta.media = media;
    const { rows } = await query(
      `INSERT INTO files (user_id, project_id, name, size, mime, storage_key, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING ${FILE_COLS}`,
      [req.user.id, projectId, name, req.file.size, req.file.mimetype, key, JSON.stringify(meta)]);
    await query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)',
      [req.user.id, 'file', 'Archivo subido: ' + name]);
    res.status(201).json({ item: fileItem(rows[0]) });
  } catch (e) { next(e); }
});

// GET /files/:id/download — descarga el binario
files.get('/:id/download', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    const { rows } = await query(
      'SELECT name, mime, storage_key FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
    const f = rows[0];
    if (!f) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const obj = await getObject(f.storage_key);
    // Capa 4: HTML, SVG… nunca se muestran en la página (siempre descarga).
    res.set(fileHeaders(f.name, f.mime || obj.contentType, req.query.inline === '1'));
    res.set('Cache-Control', 'private, no-store');
    obj.stream.pipe(res);
  } catch (e) { next(e); }
});

// PATCH /files/:id — publicar/despublicar (igual que en functions/)
files.patch('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    const b = req.body || {};
    if (typeof b.published !== 'boolean') return res.status(400).json({ error: 'Nada que actualizar.' });
    const { rows } = await query(
      `UPDATE files SET published = $3, published_at = CASE WHEN $3 THEN now() ELSE NULL END, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, req.user.id, b.published]);
    if (!rows[0]) return res.status(404).json({ error: 'Archivo no encontrado.' });
    res.json({ ok: true, published: b.published });
  } catch (e) { next(e); }
});

// GET /files/:id/thumb — portada del archivo (igual que en functions/)
files.get('/:id/thumb', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    const { rows } = await query(`SELECT meta->>'thumb_key' AS k, meta->>'thumb_mime' AS m FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.params.id, req.user.id]);
    if (!rows[0] || !rows[0].k) return res.status(404).json({ error: 'Sin portada.' });
    const obj = await getObject(rows[0].k);
    res.set({ 'Content-Type': /^image\/(jpeg|png|webp)$/.test(rows[0].m || '') ? rows[0].m : 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400' });
    obj.stream.pipe(res);
  } catch (e) { next(e); }
});

// DELETE /files/:id — a la papelera (el binario se suelta al borrarlo de verdad)
files.delete('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    if (!(await trashOne('files', req.user.id, req.params.id))) return res.status(404).json({ error: 'Archivo no encontrado.' });
    res.json({ ok: true, trashed: true });
  } catch (e) { next(e); }
});
