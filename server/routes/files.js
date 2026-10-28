/* ==========================================================================
   routes/files.js — /api/v1/files
   list · upload · download · delete. El binario va al almacenamiento (S3/local)
   y los metadatos a la base de datos.
     GET /files                        → lista completa (todos los datos de cada
                                         archivo + totales). Filtros: type,
                                         project_id, q, published, sort; page/limit
     DELETE /files · POST /files/delete → borrado masivo {"all": true} o {"ids": [...]}
     /files/multipart…                  → películas por partes (igual que en functions/)
   ========================================================================== */

import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { putObject, getObject, deleteObject, createMultipart, uploadPart, completeMultipart, abortMultipart, headObject } from '../storage.js';
import { clientIp, rateLimit, tooMany } from '../security.js';
import {
  ensureMovieTables, smallMaxBytes, movieMaxBytes, partsFor, partLength, isVideo, needsRights, movieAccess, PLAN_REQUIRED,
  RIGHTS_ERROR, TAKEDOWN_ERROR, recordRights, hasRights, createUploadRow, getUploadRow, savePart, deleteUploadRow, doneParts,
  completeList, staleUploads, reservedBytes, enqueueVideoJob, claimComplete, releaseComplete
} from '../../functions/_shared/movies.js';
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

/* ─── Películas: subida por partes (igual que en functions/files/_logic.js) ─── */
const MAX_OPEN_UPLOADS = 3;
const THUMB_DATA_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const env = process.env;
const uploadView = (row) => ({
  id: row.id, name: row.name, size: Number(row.size), mime: row.mime, project_id: row.project_id || null,
  part_size: row.part_size, parts_total: partsFor(row.size), parts_done: doneParts(row), created_at: row.created_at
});
const cleanName = (v) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
const adminRow = (row) => !!row && (row.is_admin || isAdminEmail(row.email));
files.use('/multipart', (_req, _res, next) => { ensureMovieTables(db).then(() => next(), next); });

files.post('/multipart', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = cleanName(b.name), size = Math.floor(Number(b.size));
    const mime = /^video\/[a-z0-9.+-]{1,40}$/i.test(String(b.mime || '')) ? String(b.mime).toLowerCase() : 'video/mp4';
    if (!name) return res.status(400).json({ error: 'Falta el nombre del archivo.' });
    if (!isVideo(b.mime, name)) return res.status(400).json({ error: 'Solo los videos (películas) se suben por partes.' });
    if (!(size > 0)) return res.status(400).json({ error: 'Tamaño no válido.' });
    const small = smallMaxBytes(env), max = movieMaxBytes(env);
    if (size <= small) return res.status(400).json({ error: 'Este video cabe en una subida normal (POST /files/upload).' });
    if (size > max) return res.status(413).json({ error: 'La película supera el máximo de ' + Math.round(max / 1073741824) + ' GB.', code: 'too_large' });
    const acc = await movieAccess(db, req.user.id, adminRow);
    if (!acc.ok) return res.status(402).json({ error: PLAN_REQUIRED + Math.round(small / 1048576) + ' MB.', code: 'plan_required' });
    if (b.accept_rights !== true) return res.status(400).json({ error: RIGHTS_ERROR, code: 'rights_required' });
    const rl = await rateLimit('movie-start:' + req.user.id, 20, 3600);
    if (!rl.ok) return tooMany(res, rl.retryAfter);
    const projectId = b.project_id && UUID_RE.test(String(b.project_id)) ? String(b.project_id) : null;
    if (projectId && !(await ownsProject(req.user.id, projectId))) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    if (Math.random() < 0.05) {
      try { for (const old of await staleUploads(db, 5)) { await abortMultipart(old.storage_key, old.s3_upload_id); await deleteUploadRow(db, old.id); } } catch {}
    }
    const { rows: open } = await query(`SELECT count(*)::int AS n FROM multipart_uploads WHERE user_id = $1 AND updated_at > now() - interval '7 days'`, [req.user.id]);
    if (((open[0] && open[0].n) || 0) >= MAX_OPEN_UPLOADS) return res.status(429).json({ error: 'Ya tienes ' + MAX_OPEN_UPLOADS + ' películas subiéndose. Espera a que terminen o cancela alguna.' });
    try { await purgeExpired(req.user.id); } catch {}
    const left = (await storageLeft(db, req.user.id, acc.admin)) - await reservedBytes(db, req.user.id);
    if (size > left) return res.status(413).json({ error: 'No tienes espacio suficiente en tu plan para esta película. Libera espacio o mejora tu plan.', code: 'storage_full' });
    const key = `users/${req.user.id}/${crypto.randomUUID()}-${safeKeyName(name)}`;
    const s3UploadId = await createMultipart(key, mime);
    const rightsId = await recordRights(db, { userId: req.user.id, email: acc.email, fileName: name, fileSize: size, context: 'movie_upload', ip: clientIp(req), userAgent: req.get('User-Agent') });
    const media = b.media && typeof b.media === 'object' ? cleanMedia(JSON.stringify(b.media)) : null;
    const row = await createUploadRow(db, { userId: req.user.id, projectId, key, s3UploadId, name, mime, size, meta: { optimize: b.optimize !== false, media, rights_id: rightsId } });
    res.status(201).json({ success: true, upload: uploadView(row) });
  } catch (e) { next(e); }
});

// Carga la subida del usuario (o responde 400/404).
async function loadUpload(req, res) {
  if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'Id no válido.' }); return null; }
  const row = await getUploadRow(db, req.user.id, req.params.id);
  if (!row) { res.status(404).json({ error: 'Subida no encontrada (puede que ya terminó o se canceló).' }); return null; }
  return row;
}

files.get('/multipart/:id', async (req, res, next) => {
  try { const row = await loadUpload(req, res); if (row) res.json({ success: true, upload: uploadView(row) }); } catch (e) { next(e); }
});

// PUT /files/multipart/:id/parts/:n — la parte llega como binario (sin parsear).
files.put('/multipart/:id/parts/:n', async (req, res, next) => {
  try {
    const row = await loadUpload(req, res); if (!row) return;
    const n = Number(req.params.n);
    const expected = Number.isInteger(n) ? partLength(row.size, n) : 0;
    if (!expected) return res.status(400).json({ error: 'Número de parte no válido.' });
    if (Number(req.get('Content-Length')) !== expected) return res.status(400).json({ error: 'La parte no tiene el tamaño esperado (' + expected + ' bytes).' });
    const etag = await uploadPart(row.storage_key, row.s3_upload_id, n, req, expected);
    await savePart(db, row.id, n, etag);
    res.json({ ok: true, part: n });
  } catch (e) { next(e); }
});

files.post('/multipart/:id/complete', async (req, res, next) => {
  try {
    const row = await loadUpload(req, res); if (!row) return;
    const b = req.body || {};
    const list = completeList(row);
    if (!list) return res.status(409).json({ error: 'Faltan partes por subir.', parts_done: doneParts(row), parts_total: partsFor(row.size) });
    // El cupo se revisa otra vez: varias subidas abiertas a la vez pudieron pasarse.
    const acc = await movieAccess(db, req.user.id, adminRow);
    const left = (await storageLeft(db, req.user.id, acc.admin)) - ((await reservedBytes(db, req.user.id)) - Number(row.size));
    if (Number(row.size) > left) {
      await abortMultipart(row.storage_key, row.s3_upload_id);
      await deleteUploadRow(db, row.id);
      return res.status(413).json({ error: 'Ya no tienes espacio suficiente en tu plan para esta película. Libera espacio o mejora tu plan.', code: 'storage_full' });
    }
    if (!(await claimComplete(db, row.id))) return res.status(409).json({ error: 'La película ya se está uniendo.' });
    try { await completeMultipart(row.storage_key, row.s3_upload_id, list); }
    catch (e) { await releaseComplete(db, row.id).catch(() => {}); throw e; }
    const real = await headObject(row.storage_key);
    if (real !== null && real !== Number(row.size)) {
      try { await deleteObject(row.storage_key); } catch {}
      await deleteUploadRow(db, row.id);
      return res.status(422).json({ error: 'La película llegó incompleta. Vuelve a subirla.' });
    }
    const m = row.meta || {};
    const media = m.media || null;
    const meta = {
      extension: (/\.([a-z0-9]{1,8})$/i.exec(row.name) || [])[1] || null, type: 'video', category: 'video',
      width: media && media.width || null, height: media && media.height || null,
      status: 'ready', visibility: 'private', provider: config.storageProvider, multipart: true
    };
    if (media) meta.media = media;
    const t = THUMB_DATA_RE.exec(String(b.thumb || ''));
    if (t) {
      const bin = Buffer.from(t[2], 'base64');
      if (bin.length > 0 && bin.length <= THUMB_MAX) {
        try { await putObject(row.storage_key + '.thumb', bin, 'image/' + t[1]); meta.thumb_key = row.storage_key + '.thumb'; meta.thumb_mime = 'image/' + t[1]; } catch {}
      }
    }
    const projectId = row.project_id && await ownsProject(req.user.id, row.project_id) ? row.project_id : null;
    const { rows: ins } = await query(
      `INSERT INTO files (user_id, project_id, name, size, mime, storage_key, meta) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id`,
      [req.user.id, projectId, row.name, Number(row.size), row.mime, row.storage_key, JSON.stringify(meta)]);
    const fileId = ins[0].id;
    await deleteUploadRow(db, row.id);
    if (m.rights_id) { try { await query('UPDATE rights_acceptances SET file_id = $1 WHERE id = $2 AND file_id IS NULL', [fileId, m.rights_id]); } catch {} }
    if (m.optimize) await enqueueVideoJob(db, fileId, req.user.id);
    await query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [req.user.id, 'file', 'Película subida: ' + row.name]);
    const { rows } = await query(`SELECT ${FILE_COLS} FROM files WHERE id = $1`, [fileId]);
    res.status(201).json({ success: true, status: 201, message: 'Película subida correctamente.', data: { item: fileItem(rows[0]) }, error: null });
  } catch (e) { next(e); }
});

files.delete('/multipart/:id', async (req, res, next) => {
  try {
    const row = await loadUpload(req, res); if (!row) return;
    await abortMultipart(row.storage_key, row.s3_upload_id);
    await deleteUploadRow(db, row.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

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
    // ?trashed=1: miniatura de un archivo en la papelera, solo para su dueño
    // (sigue atado a user_id). Lo usa la lista de la papelera.
    const verTrash = req.query.trashed === '1';
    const { rows } = await query(
      'SELECT name, mime, storage_key FROM files WHERE id = $1 AND user_id = $2' + (verTrash ? '' : ' AND deleted_at IS NULL'), [req.params.id, req.user.id]);
    const f = rows[0];
    if (!f) return res.status(404).json({ error: 'Archivo no encontrado.' });
    // Range: adelantar/atrasar videos y canciones sin descargar todo.
    const obj = await getObject(f.storage_key, req.get('Range'));
    // Capa 4: HTML, SVG… nunca se muestran en la página (siempre descarga).
    res.set(fileHeaders(f.name, f.mime || obj.contentType, req.query.inline === '1'));
    res.set({ 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' });
    if (obj.contentLength != null) res.set('Content-Length', String(obj.contentLength));
    if (obj.contentRange) { res.status(206); res.set('Content-Range', obj.contentRange); }
    obj.stream.pipe(res);
  } catch (e) { next(e); }
});

// PATCH /files/:id — publicar/despublicar (igual que en functions/)
files.patch('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    const b = req.body || {};
    if (typeof b.published !== 'boolean') return res.status(400).json({ error: 'Nada que actualizar.' });
    if (b.published) {
      await ensureMovieTables(db);
      const { rows: cur } = await query('SELECT name, mime, size, takedown_at FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
      if (!cur[0]) return res.status(404).json({ error: 'Archivo no encontrado.' });
      if (cur[0].takedown_at) return res.status(403).json({ error: TAKEDOWN_ERROR, code: 'taken_down' });
      if (needsRights(cur[0].mime, cur[0].name) && !(await hasRights(db, req.user.id, req.params.id))) {
        if (b.accept_rights !== true) return res.status(400).json({ error: RIGHTS_ERROR, code: 'rights_required' });
        await recordRights(db, { userId: req.user.id, email: req.user.email, fileId: req.params.id, fileName: cur[0].name, fileSize: cur[0].size, context: 'publish', ip: clientIp(req), userAgent: req.get('User-Agent') });
      }
    }
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
    const verTrash = req.query.trashed === '1';
    const { rows } = await query(`SELECT meta->>'thumb_key' AS k, meta->>'thumb_mime' AS m FROM files WHERE id = $1 AND user_id = $2` + (verTrash ? '' : ' AND deleted_at IS NULL'), [req.params.id, req.user.id]);
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
