/* ==========================================================================
   routes/projects.js — /api/v1/projects (servidor Express)
   Misma API que las Functions de Cloudflare:
     GET    /projects                       → lista con información completa
                                              (?include=items: con sus elementos)
     POST   /projects                       → crea
     DELETE /projects · POST /projects/delete → borrado masivo {"all"}|{"ids"}
     GET    /projects/:id                   → detalle (1ª página; ?all=1 → todo)
     GET    /projects/:id/documents|files   → paginadas (?all=1 → todas)
     GET    /projects/:id/items             → todos los elementos en una lista
     DELETE /projects/:id/items · POST /projects/:id/items/delete → vaciar
     DELETE /projects/:id/documents|files   → borra todos sus documentos/archivos
     PATCH  /projects/:id                   → edita
     DELETE /projects/:id                   → borra con todo su contenido
   Todo filtrado por user_id: cada quien ve y borra solo lo suyo.
   ========================================================================== */

import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { cleanValue } from '../security.js';
import {
  UUID_RE, FILE_COLS, DOC_COLS, fileFilters, pageOf, wantsAll, readSelection,
  fileItem, docItem, deleteFilesWhere, logActivity, bulkResponse, fmtBytes, toISO
} from '../lists.js';

export const projects = Router();
projects.use(requireAuth);

// Columna del icono elegido (NULL = «Auto»). Copia de
// functions/api/v1/projects/_logic.js (misma lógica): primero una lectura, y el
// ALTER TABLE solo si de verdad falta la columna.
let iconColumnReady = false;
async function ensureProjectIcon() {
  if (iconColumnReady) return;
  const { rows } = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'icon'`);
  if (!rows.length) await query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT');
  iconColumnReady = true;
}
projects.use((req, res, next) => { ensureProjectIcon().then(() => next(), next); });

const COLS = ['name', 'description', 'color', 'icon'];
const SELECT = 'id, name, description, color, icon, created_at, updated_at';
const byNewest = (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
const fileListItem = (r) => Object.assign(fileItem(r), { kind: 'file' });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ─── Colección ─── */
projects.get('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const { rows } = await query(
    `SELECT p.id, p.name, p.description, p.color, p.icon, p.created_at, p.updated_at,
       (SELECT count(*) FROM documents d WHERE d.project_id = p.id AND d.user_id = $1)::int AS doc_count,
       (SELECT count(*) FROM files f WHERE f.project_id = p.id AND f.user_id = $1)::int AS file_count,
       (SELECT coalesce(sum(size), 0) FROM files f WHERE f.project_id = p.id AND f.user_id = $1)::bigint AS bytes,
       ((SELECT count(*) FROM documents d WHERE d.project_id = p.id AND d.user_id = $1 AND d.published)
        + (SELECT count(*) FROM files f WHERE f.project_id = p.id AND f.user_id = $1 AND f.published))::int AS published_count,
       (SELECT count(*) FROM api_keys k WHERE k.project_id = p.id AND k.user_id = $1)::int AS api_keys
     FROM projects p WHERE p.user_id = $1 ORDER BY p.created_at DESC`, [uid]);
  let byProject = null;
  if (String(req.query.include || '').split(',').includes('items') && rows.length) {
    byProject = new Map(rows.map(r => [r.id, []]));
    const { rows: docs } = await query(`SELECT ${DOC_COLS} FROM documents WHERE user_id = $1 AND project_id IS NOT NULL`, [uid]);
    const { rows: fs } = await query(`SELECT ${FILE_COLS} FROM files WHERE user_id = $1 AND project_id IS NOT NULL`, [uid]);
    docs.forEach(d => { const l = byProject.get(d.project_id); if (l) l.push(docItem(d)); });
    fs.forEach(f => { const l = byProject.get(f.project_id); if (l) l.push(fileListItem(f)); });
    byProject.forEach(l => l.sort(byNewest));
  }
  const items = rows.map(r => {
    const bytes = Number(r.bytes) || 0;
    const it = {
      id: r.id, name: r.name, description: r.description || '', color: r.color || '', icon: r.icon || null,
      created_at: r.created_at, updated_at: r.updated_at, doc_count: r.doc_count, file_count: r.file_count,
      stats: { documents: r.doc_count, files: r.file_count, total_items: r.doc_count + r.file_count,
        published: r.published_count, api_keys: r.api_keys, storage: { bytes, formatted: fmtBytes(bytes) } },
      items_url: '/api/v1/projects/' + r.id + '/items'
    };
    if (byProject) it.items = byProject.get(r.id) || [];
    return it;
  });
  res.json({ success: true, status: 200, items, total: items.length, error: null });
}));

projects.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const sent = COLS.filter(c => b[c] !== undefined && b[c] !== null && b[c] !== '');
  if (!sent.length) return res.status(400).json({ error: 'Faltan datos para crear el registro.' });
  const vals = sent.map(c => cleanValue('projects', c, b[c]));
  if (vals.some(v => v === undefined)) return res.status(400).json({ error: 'Datos no válidos.' });
  const { rows } = await query(
    `INSERT INTO projects (user_id, ${sent.join(', ')}) VALUES ($1, ${sent.map((_, i) => '$' + (i + 2)).join(', ')}) RETURNING ${SELECT}`,
    [req.user.id, ...vals]);
  res.status(201).json({ item: rows[0] });
}));

async function bulkDeleteProjects(req, res) {
  const uid = req.user.id;
  const sel = readSelection(req.body, req.query);
  if (sel.error) return res.status(400).json({ error: sel.error });
  const scope = sel.ids ? ' AND project_id = ANY($2::uuid[])' : ' AND project_id IN (SELECT id FROM projects WHERE user_id = $1)';
  const params = sel.ids ? [sel.ids] : [];
  const f = await deleteFilesWhere(uid, scope, params);
  const { rows: d } = await query(`DELETE FROM documents WHERE user_id = $1${scope} RETURNING id`, [uid, ...params]);
  const { rows: p } = await query(`DELETE FROM projects WHERE user_id = $1${sel.ids ? ' AND id = ANY($2::uuid[])' : ''} RETURNING id`, [uid, ...params]);
  if (p.length) await logActivity(uid, 'project', p.length === 1 ? 'Proyecto eliminado' : p.length + ' proyectos eliminados');
  res.json(bulkResponse(p.length === 1 ? 'Se eliminó 1 proyecto.' : 'Se eliminaron ' + p.length + ' proyectos.',
    { projects: p.length, documents: d.length, files: f.deleted }, 0, f.bytes));
}
projects.delete('/', wrap(bulkDeleteProjects));
projects.post('/delete', wrap(bulkDeleteProjects));

/* ─── Un proyecto ─── */
// Carga el proyecto (solo si es del usuario) en req.project.
projects.use('/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
  const { rows } = await query(`SELECT user_id, ${SELECT} FROM projects WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
  req.project = rows[0] || null;
  next();
}));
const notFound = (res) => res.status(404).json({ success: false, status: 404, message: 'Proyecto no encontrado.', data: null, error: 'No encontrado.' });

async function docsPage(pid, uid, q) {
  const all = wantsAll(q), pg = pageOf(q);
  const { rows } = await query(
    `SELECT ${DOC_COLS}, count(*) OVER() AS __total FROM documents WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC, id` +
    (all ? '' : ' LIMIT $3 OFFSET $4'), all ? [pid, uid] : [pid, uid, pg.limit, pg.offset]);
  const total = rows[0] ? Number(rows[0].__total) : (all || pg.offset === 0 ? 0 : await countIn('documents', pid, uid));
  const items = rows.map(docItem);
  return all ? { items, total, page: 1, limit: total, has_more: false } : { items, total, page: pg.page, limit: pg.limit, has_more: pg.offset + items.length < total };
}
async function filesPage(pid, uid, q) {
  const all = wantsAll(q), pg = pageOf(q);
  const { rows } = await query(
    `SELECT ${FILE_COLS}, count(*) OVER() AS __total FROM files WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC, id` +
    (all ? '' : ' LIMIT $3 OFFSET $4'), all ? [pid, uid] : [pid, uid, pg.limit, pg.offset]);
  const total = rows[0] ? Number(rows[0].__total) : (all || pg.offset === 0 ? 0 : await countIn('files', pid, uid));
  const items = rows.map(fileListItem);
  return all ? { items, total, page: 1, limit: total, has_more: false } : { items, total, page: pg.page, limit: pg.limit, has_more: pg.offset + items.length < total };
}
async function countIn(table, pid, uid) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM ${table} WHERE project_id = $1 AND user_id = $2`, [pid, uid]);
  return (rows[0] && rows[0].n) || 0;
}

projects.get('/:id', wrap(async (req, res) => {
  const p = req.project; if (!p) return notFound(res);
  const uid = req.user.id;
  const { rows: s } = await query(
    `SELECT (SELECT count(*) FROM documents WHERE project_id = $1 AND user_id = $2)::int AS documents,
            (SELECT count(*) FROM files WHERE project_id = $1 AND user_id = $2)::int AS files,
            (SELECT coalesce(sum(size),0) FROM files WHERE project_id = $1 AND user_id = $2)::bigint AS bytes,
            (SELECT count(*) FROM api_keys WHERE project_id = $1 AND user_id = $2)::int AS api_keys,
            (SELECT count(*) FROM documents WHERE project_id = $1 AND user_id = $2 AND published)::int AS pub_docs,
            (SELECT count(*) FROM files WHERE project_id = $1 AND user_id = $2 AND published)::int AS pub_files`, [p.id, uid]);
  const st = s[0] || {};
  const docs = await docsPage(p.id, uid, req.query), fls = await filesPage(p.id, uid, req.query);
  const bytes = Number(st.bytes) || 0;
  res.json({ success: true, status: 200, message: '', error: null, data: { item: {
    id: p.id, owner_id: p.user_id, name: p.name, description: p.description || '', color: p.color || '',
    icon: p.icon || null, banner: { enabled: false, url: null }, visibility: 'private', status: 'active',
    stats: { documents: st.documents, files: st.files, total_items: st.documents + st.files,
      published: st.pub_docs + st.pub_files, members: 0, api_keys: st.api_keys, storage: { bytes, formatted: fmtBytes(bytes) } },
    permissions: { can_view: true, can_edit: true, can_delete: true, can_upload: true, can_publish: true },
    settings: { allow_public_access: false, default_file_visibility: 'private' },
    documents: docs, files: fls, published: { items: [], total: 0 },
    created_at: toISO(p.created_at), updated_at: toISO(p.updated_at), total_all: st.documents + st.files
  } } });
}));
projects.get('/:id/documents', wrap(async (req, res) => req.project ? res.json(await docsPage(req.project.id, req.user.id, req.query)) : notFound(res)));
projects.get('/:id/files', wrap(async (req, res) => req.project ? res.json(await filesPage(req.project.id, req.user.id, req.query)) : notFound(res)));

projects.get('/:id/items', wrap(async (req, res) => {
  const p = req.project; if (!p) return notFound(res);
  const q = req.query, uid = req.user.id, kind = q.kind || '';
  let docs = [], fls = [];
  if (kind !== 'file' && !q.type) {
    const params = [p.id, uid];
    let where = '';
    const s = String(q.q || '').trim().slice(0, 120);
    if (s) { params.push('%' + s.replace(/[\\%_]/g, m => '\\' + m) + '%'); where += ' AND (title ILIKE $3 OR content ILIKE $3)'; }
    if (q.published === 'true' || q.published === '1') where += ' AND published';
    else if (q.published === 'false' || q.published === '0') where += ' AND NOT published';
    docs = (await query(`SELECT ${DOC_COLS} FROM documents WHERE project_id = $1 AND user_id = $2${where} ORDER BY created_at DESC`, params)).rows.map(docItem);
  }
  if (kind !== 'document') {
    const f = fileFilters({ q: q.q, published: q.published, type: q.type }, 3);
    if (f.error) return res.status(400).json({ error: f.error });
    fls = (await query(`SELECT ${FILE_COLS} FROM files WHERE project_id = $1 AND user_id = $2${f.sql} ORDER BY created_at DESC`, [p.id, uid, ...f.params])).rows.map(fileListItem);
  }
  const all = docs.concat(fls).sort(byNewest);
  const pg = pageOf(q);
  const items = pg.paged ? all.slice(pg.offset, pg.offset + pg.limit) : all;
  const bytes = fls.reduce((n, x) => n + (x.size.bytes || 0), 0);
  res.json({ success: true, status: 200, items, total: all.length, documents: docs.length, files: fls.length,
    storage: { bytes, formatted: fmtBytes(bytes) }, page: pg.paged ? pg.page : 1, limit: pg.paged ? pg.limit : all.length,
    has_more: pg.paged ? pg.offset + items.length < all.length : false, error: null });
}));

// Vaciar: borra elementos del proyecto (documentos y/o archivos; todos o por ids).
async function emptyProject(req, res, sel, kind, strict) {
  const p = req.project; if (!p) return res.status(404).json({ error: 'Proyecto no encontrado.' });
  if (sel.error) return res.status(400).json({ error: sel.error });
  if ((strict || kind) && kind !== 'document' && kind !== 'file') return res.status(400).json({ error: 'kind debe ser "document" o "file".' });
  const uid = req.user.id;
  const idsSql = sel.ids ? ' AND id = ANY($3::uuid[])' : '';
  const params = [uid, p.id].concat(sel.ids ? [sel.ids] : []);
  let docs = 0;
  if (kind !== 'file') docs = (await query(`DELETE FROM documents WHERE user_id = $1 AND project_id = $2${idsSql} RETURNING id`, params)).rows.length;
  let f = { deleted: 0, bytes: 0, ids: [] };
  if (kind !== 'document') f = await deleteFilesWhere(uid, ' AND project_id = $2' + idsSql, params.slice(1));
  if (docs || f.deleted) {
    await query('UPDATE projects SET updated_at = now() WHERE id = $1 AND user_id = $2', [p.id, uid]).catch(() => {});
    await logActivity(uid, 'project', 'Elementos eliminados de «' + p.name + '»: ' + (docs + f.deleted));
  }
  const total = docs + f.deleted;
  res.json(Object.assign(bulkResponse(total === 1 ? 'Se eliminó 1 elemento.' : 'Se eliminaron ' + total + ' elementos.',
    { documents: docs, files: f.deleted, total }, 0, f.bytes), { ids: f.ids }));
}
// "kind" es estricto: si viene (aunque sea vacío o null) debe ser válido; nunca se ignora.
const kindOf = (req) => {
  const b = req.body || {};
  if (b.kind !== undefined) return { kind: String(b.kind), strict: true };
  if (req.query.kind !== undefined) return { kind: String(req.query.kind), strict: true };
  return { kind: '', strict: false };
};
const itemsDelete = (req, res) => { const k = kindOf(req); return emptyProject(req, res, readSelection(req.body, req.query), k.kind, k.strict); };
projects.delete('/:id/items', wrap(itemsDelete));
projects.post('/:id/items/delete', wrap(itemsDelete));
projects.delete('/:id/documents', wrap((req, res) => emptyProject(req, res, { all: true }, 'document')));
projects.delete('/:id/files', wrap((req, res) => emptyProject(req, res, { all: true }, 'file')));

projects.patch('/:id', wrap(async (req, res) => {
  if (!req.project) return res.status(404).json({ error: 'No encontrado.' });
  const b = req.body || {};
  const sent = COLS.filter(c => c in b);
  if (!sent.length) return res.status(400).json({ error: 'Nada que actualizar.' });
  const vals = sent.map(c => cleanValue('projects', c, b[c]));
  if (vals.some(v => v === undefined)) return res.status(400).json({ error: 'Datos no válidos.' });
  const { rows } = await query(
    `UPDATE projects SET ${sent.map((c, i) => c + ' = $' + (i + 3)).join(', ')}, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${SELECT}`,
    [req.params.id, req.user.id, ...vals]);
  res.json({ item: rows[0] });
}));

// Borra el proyecto con todo su contenido (archivos con su binario y documentos).
projects.delete('/:id', wrap(async (req, res) => {
  const p = req.project;
  if (!p) return res.json({ ok: true, already_deleted: true });
  await deleteFilesWhere(req.user.id, ' AND project_id = $2', [p.id]);
  await query('DELETE FROM documents WHERE project_id = $1 AND user_id = $2', [p.id, req.user.id]);
  await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [p.id, req.user.id]);
  await logActivity(req.user.id, 'project', 'Proyecto eliminado: ' + p.name);
  res.json({ ok: true });
}));

projects.use('/:id', (_req, res) => res.status(404).json({ error: 'Ruta de proyectos no encontrada.' }));
