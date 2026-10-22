/* ==========================================================================
   projects — proyectos del usuario y su contenido.
     GET /projects                        → lista con la información completa de
                                            cada proyecto (conteos, espacio,
                                            publicados, claves). ?include=items
                                            añade todos sus elementos.
     POST /projects                       → crea
     DELETE /projects · POST /projects/delete
                                          → borrado masivo: {"all": true} o
                                            {"ids": [...]}, con todo su contenido
     GET /projects/:id                    → estructura completa (docs+archivos 1ª pág,
                                            stats). ?all=1 → TODOS los elementos
     GET /projects/:id/documents|files    → colecciones paginadas (?all=1 → todas)
     GET /projects/:id/items              → todos los elementos (documentos +
                                            archivos) en una sola lista
     DELETE /projects/:id/items · POST /projects/:id/items/delete
                                          → vacía el proyecto: {"all": true} o
                                            {"ids": [...]} (opcional "kind")
     DELETE /projects/:id/documents|files → borra todos sus documentos / archivos
     PATCH /projects/:id                  → edita
     DELETE /projects/:id                 → borra el proyecto y todo su contenido
   Los borrados con archivos van por tandas (límite de llamadas de Cloudflare):
   si la respuesta trae "remaining" > 0, se repite la misma petición.
   El owner_id SIEMPRE sale de la BD; nunca del cliente. Un usuario no puede
   consultar proyectos ajenos (se filtra por user_id en cada consulta).
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { dataRoute, handleCrud } from '../../../_shared/api.js';
import { UUID_RE, CRUD, pageParams, fmtBytes, toISO, body } from '../../../_shared/util.js';
import { buildFileItem } from '../../../_shared/files-util.js';
import { fileFilters, wantsAll, readSelection, deleteFilesWhere, logActivity, bulkResponse, docItem } from '../../../_shared/bulk.js';

const FILE_COLS = 'id, user_id, project_id, name, original_name, size, mime, storage_key, meta, published, published_at, created_at, updated_at';
const DOC_COLS = 'id, project_id, title, left(content, 240) AS excerpt, published, published_at, created_at, updated_at';

// Columna del icono elegido (NULL = «Auto»). Primero una lectura: el ALTER
// TABLE bloquea la tabla aunque la columna ya exista, así que solo se lanza si
// de verdad falta (una vez por instancia).
let iconColumnReady = false;
async function ensureProjectIcon(db) {
  if (iconColumnReady) return;
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'projects' AND column_name = 'icon'`);
  if (!rows.length) await db.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT');
  iconColumnReady = true;
}

export const handle = dataRoute(async ({ seg, request, env, method, user }) => {
  const db = getDb(env);
  await ensureProjectIcon(db);
  const qs = new URL(request.url).searchParams;

  /* ─── Colección: /projects ─── */
  if (seg.length === 1 || (seg.length === 2 && seg[1] === 'delete')) {
    if (seg.length === 1 && method === 'GET') return json(await projectList(db, env, user.id, qs));
    if ((seg.length === 1 && method === 'DELETE') || (seg[1] === 'delete' && method === 'POST')) {
      const sel = readSelection(await body(request), qs);
      if (sel.error) return json({ error: sel.error }, 400);
      return json(await deleteProjects(db, env, user.id, sel));
    }
    if (seg.length === 1) return handleCrud('projects', CRUD.projects, undefined, request, env, method, user);
  }

  const id = seg[1];
  if (!UUID_RE.test(id)) return json({ error: 'Id no válido.' }, 400);
  const sub = seg[2] || '';

  // Todo lo de un proyecto exige que sea del usuario.
  const { rows: prows } = await db.query(
    'SELECT id, user_id, name, description, color, icon, created_at, updated_at FROM projects WHERE id = $1 AND user_id = $2',
    [id, user.id]);
  const project = prows[0];

  /* ─── Lectura ─── */
  if (method === 'GET' && (!sub || sub === 'documents' || sub === 'files' || sub === 'items') && seg.length <= 3) {
    if (!project) return json({ success: false, status: 404, message: 'Proyecto no encontrado.', data: null, error: 'No encontrado.' }, 404);
    if (sub === 'documents') return json(await documentsPage(db, id, user.id, request));
    if (sub === 'files') return json(await filesPage(db, id, user.id, request, env));
    if (sub === 'items') { const r = await projectItems(db, env, id, user.id, request); return json(r, r.error ? 400 : 200); }
    return json({ success: true, status: 200, message: '', data: { item: await projectDetail(db, env, project, user.id, request) }, error: null });
  }

  /* ─── Vaciar: borrar elementos del proyecto ─── */
  const isItemsDelete = (sub === 'items' && seg.length === 3 && method === 'DELETE') ||
    (sub === 'items' && seg[3] === 'delete' && seg.length === 4 && method === 'POST');
  const isKindDelete = (sub === 'documents' || sub === 'files') && seg.length === 3 && method === 'DELETE';
  if (isItemsDelete || isKindDelete) {
    if (!project) return json({ error: 'Proyecto no encontrado.' }, 404);
    const b = await body(request);
    const sel = isKindDelete ? { all: true } : readSelection(b, qs);
    if (sel.error) return json({ error: sel.error }, 400);
    // "kind" es estricto: si viene (aunque sea vacío o null) debe ser válido; nunca se ignora.
    const hasKind = !isKindDelete && (b.kind !== undefined || qs.has('kind'));
    const kind = isKindDelete ? (sub === 'documents' ? 'document' : 'file') : hasKind ? String(b.kind !== undefined ? b.kind : qs.get('kind')) : '';
    if (hasKind && kind !== 'document' && kind !== 'file') return json({ error: 'kind debe ser "document" o "file".' }, 400);
    return json(await deleteProjectItems(db, env, user.id, project, sel, kind));
  }

  /* ─── Borrar el proyecto (con todo su contenido, por tandas) ─── */
  if (!sub && method === 'DELETE') {
    if (!project) return json({ ok: true, already_deleted: true });
    const f = await deleteFilesWhere(db, env, user.id, ' AND project_id = $2', [id]);
    if (f.remaining) {
      return json({ ok: false, pending: true, deleted: { files: f.deleted }, remaining: f.remaining,
        message: 'Borrando el contenido del proyecto… quedan ' + f.remaining + ' archivos: repite la petición.' }, 202);
    }
    await db.query('DELETE FROM documents WHERE project_id = $1 AND user_id = $2', [id, user.id]);
    await db.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, user.id]);
    await logActivity(db, user.id, 'project', 'Proyecto eliminado: ' + project.name);
    return json({ ok: true });
  }

  if (sub) return json({ error: 'Ruta de proyectos no encontrada.' }, 404);
  // Resto (PATCH, GET simple…) → CRUD genérico.
  return handleCrud('projects', CRUD.projects, id, request, env, method, user);
});

/* ───────────────────────── Lectura ───────────────────────── */

// Lista de proyectos con su información completa (y, si se pide, sus elementos).
async function projectList(db, env, userId, qs) {
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.description, p.color, p.icon, p.created_at, p.updated_at,
       (SELECT count(*) FROM documents d WHERE d.project_id = p.id AND d.user_id = $1)::int AS doc_count,
       (SELECT count(*) FROM files f WHERE f.project_id = p.id AND f.user_id = $1)::int AS file_count,
       (SELECT coalesce(sum(size), 0) FROM files f WHERE f.project_id = p.id AND f.user_id = $1)::bigint AS bytes,
       ((SELECT count(*) FROM documents d WHERE d.project_id = p.id AND d.user_id = $1 AND d.published)
        + (SELECT count(*) FROM files f WHERE f.project_id = p.id AND f.user_id = $1 AND f.published))::int AS published_count,
       (SELECT count(*) FROM api_keys k WHERE k.project_id = p.id AND k.user_id = $1)::int AS api_keys
     FROM projects p WHERE p.user_id = $1 ORDER BY p.created_at DESC`, [userId]);
  const withItems = String(qs.get('include') || '').split(',').includes('items');
  let byProject = null;
  if (withItems && rows.length) {
    byProject = new Map(rows.map(r => [r.id, []]));
    const { rows: docs } = await db.query(
      `SELECT ${DOC_COLS} FROM documents WHERE user_id = $1 AND project_id IS NOT NULL ORDER BY created_at DESC`, [userId]);
    const { rows: files } = await db.query(
      `SELECT ${FILE_COLS} FROM files WHERE user_id = $1 AND project_id IS NOT NULL ORDER BY created_at DESC`, [userId]);
    docs.forEach(d => { const l = byProject.get(d.project_id); if (l) l.push(docItem(d)); });
    files.forEach(f => { const l = byProject.get(f.project_id); if (l) l.push(fileListItem(f, env)); });
    byProject.forEach(l => l.sort(byNewest));
  }
  const items = rows.map(r => {
    const bytes = Number(r.bytes) || 0;
    const it = {
      id: r.id, name: r.name, description: r.description || '', color: r.color || '', icon: r.icon || null,
      created_at: r.created_at, updated_at: r.updated_at,
      doc_count: r.doc_count, file_count: r.file_count,
      stats: {
        documents: r.doc_count, files: r.file_count, total_items: r.doc_count + r.file_count,
        published: r.published_count, api_keys: r.api_keys,
        storage: { bytes, formatted: fmtBytes(bytes) }
      },
      items_url: '/api/v1/projects/' + r.id + '/items'
    };
    if (byProject) it.items = byProject.get(r.id) || [];
    return it;
  });
  return { success: true, status: 200, items, total: items.length, error: null };
}

// Detalle completo del proyecto. Con ?all=1 trae TODOS sus documentos y archivos.
async function projectDetail(db, env, project, userId, request) {
  const id = project.id;
  const { rows: srows } = await db.query(
    `SELECT
       (SELECT count(*) FROM documents WHERE project_id = $1 AND user_id = $2) AS documents,
       (SELECT count(*) FROM files     WHERE project_id = $1 AND user_id = $2) AS files,
       (SELECT coalesce(sum(size),0) FROM files WHERE project_id = $1 AND user_id = $2) AS bytes,
       (SELECT count(*) FROM api_keys WHERE project_id = $1 AND user_id = $2) AS api_keys,
       (SELECT count(*) FROM documents WHERE project_id = $1 AND user_id = $2 AND published) AS pub_docs,
       (SELECT count(*) FROM files     WHERE project_id = $1 AND user_id = $2 AND published) AS pub_files`,
    [id, userId]);
  const st = srows[0] || {};
  const docsPg = await documentsPage(db, id, userId, request);
  const filesPg = await filesPage(db, id, userId, request, env);
  const bytes = Number(st.bytes) || 0;
  const nDocs = Number(st.documents) || 0;
  const nFiles = Number(st.files) || 0;
  return {
    id: project.id,
    owner_id: project.user_id,
    name: project.name,
    description: project.description || '',
    color: project.color || '',
    icon: project.icon || null,          // icono elegido; null = «Auto»
    banner: { enabled: false, url: null },
    visibility: 'private',
    status: 'active',
    stats: {
      documents: nDocs,
      files: nFiles,
      total_items: nDocs + nFiles,
      published: (Number(st.pub_docs) || 0) + (Number(st.pub_files) || 0),
      members: 0,
      api_keys: Number(st.api_keys) || 0,
      storage: { bytes, formatted: fmtBytes(bytes) }
    },
    permissions: { can_view: true, can_edit: true, can_delete: true, can_upload: true, can_publish: true },
    settings: { allow_public_access: false, default_file_visibility: 'private' },
    documents: { items: docsPg.items, total: docsPg.total, page: docsPg.page, limit: docsPg.limit, has_more: docsPg.has_more },
    files: { items: filesPg.items, total: filesPg.total, page: filesPg.page, limit: filesPg.limit, has_more: filesPg.has_more },
    published: { items: [], total: 0 },
    created_at: toISO(project.created_at),
    updated_at: toISO(project.updated_at),
    total_all: nDocs + nFiles
  };
}

// Una página de documentos del proyecto (sin el contenido completo). ?all=1 → todos.
async function documentsPage(db, projectId, userId, request) {
  const all = wantsAll(new URL(request.url).searchParams);
  const { limit, page, offset } = pageParams(request);
  const { rows } = await db.query(
    `SELECT ${DOC_COLS}, count(*) OVER() AS __total
     FROM documents WHERE project_id = $1 AND user_id = $2
     ORDER BY created_at DESC, id` + (all ? '' : ' LIMIT $3 OFFSET $4'),
    all ? [projectId, userId] : [projectId, userId, limit, offset]);
  const total = rows[0] ? Number(rows[0].__total) : (all || offset === 0 ? 0 : await countIn(db, 'documents', projectId, userId));
  const items = rows.map(docItem);
  return all
    ? { items, total, page: 1, limit: total, has_more: false }
    : { items, total, page, limit, has_more: offset + items.length < total };
}

// Una página de archivos del proyecto (estructura profesional). ?all=1 → todos.
async function filesPage(db, projectId, userId, request, env) {
  const all = wantsAll(new URL(request.url).searchParams);
  const { limit, page, offset } = pageParams(request);
  const { rows } = await db.query(
    `SELECT ${FILE_COLS}, count(*) OVER() AS __total
     FROM files WHERE project_id = $1 AND user_id = $2
     ORDER BY created_at DESC, id` + (all ? '' : ' LIMIT $3 OFFSET $4'),
    all ? [projectId, userId] : [projectId, userId, limit, offset]);
  const total = rows[0] ? Number(rows[0].__total) : (all || offset === 0 ? 0 : await countIn(db, 'files', projectId, userId));
  const items = rows.map(r => fileListItem(r, env));
  return all
    ? { items, total, page: 1, limit: total, has_more: false }
    : { items, total, page, limit, has_more: offset + items.length < total };
}

async function countIn(db, table, projectId, userId) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE project_id = $1 AND user_id = $2`, [projectId, userId]);
  return (rows[0] && rows[0].n) || 0;
}

// Todos los elementos del proyecto en una sola lista (más recientes primero).
// Filtros opcionales: ?kind=document|file ?q= ?published= ?type= (archivos);
// paginación opcional con ?page/&limit.
async function projectItems(db, env, projectId, userId, request) {
  const qs = new URL(request.url).searchParams;
  const kind = qs.get('kind') || '';
  let docs = [], files = [];
  if (kind !== 'file' && !qs.get('type')) {
    const params = [projectId, userId];
    let where = '';
    const q = String(qs.get('q') || '').trim().slice(0, 120);
    if (q) { params.push('%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%'); where += ` AND (title ILIKE $3 OR content ILIKE $3)`; }
    const pub = qs.get('published');
    if (pub === 'true' || pub === '1') where += ' AND published';
    else if (pub === 'false' || pub === '0') where += ' AND NOT published';
    const { rows } = await db.query(
      `SELECT ${DOC_COLS} FROM documents WHERE project_id = $1 AND user_id = $2${where} ORDER BY created_at DESC`, params);
    docs = rows.map(docItem);
  }
  if (kind !== 'document') {
    const f = fileFilters({ q: qs.get('q'), published: qs.get('published'), type: qs.get('type') }, 3);
    if (f.error) return { error: f.error };
    const { rows } = await db.query(
      `SELECT ${FILE_COLS} FROM files WHERE project_id = $1 AND user_id = $2${f.sql} ORDER BY created_at DESC`,
      [projectId, userId, ...f.params]);
    files = rows.map(r => fileListItem(r, env));
  }
  const all = docs.concat(files).sort(byNewest);
  const paged = qs.has('page') || (qs.has('limit') && qs.get('limit') !== 'all');
  let items = all, page = 1, limit = all.length;
  if (paged) { ({ limit, page } = pageParams(request)); items = all.slice((page - 1) * limit, page * limit); }
  const bytes = files.reduce((s, f) => s + (f.size.bytes || 0), 0);
  return {
    success: true, status: 200, items, total: all.length,
    documents: docs.length, files: files.length,
    storage: { bytes, formatted: fmtBytes(bytes) },
    page, limit, has_more: paged ? page * limit < all.length : false, error: null
  };
}

const byNewest = (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);

// Archivo para listas: item completo + "kind" para mezclarlo con documentos.
function fileListItem(r, env) {
  return Object.assign(buildFileItem(r, env), { kind: 'file' });
}

/* ───────────────────────── Borrado ───────────────────────── */

// Borra elementos de un proyecto (documentos y/o archivos; todos o por ids).
async function deleteProjectItems(db, env, userId, project, sel, kind) {
  const idsSql = sel.ids ? ' AND id = ANY($3::uuid[])' : '';
  const params = [userId, project.id].concat(sel.ids ? [sel.ids] : []);
  let docs = 0;
  if (kind !== 'file') {
    const { rows } = await db.query(`DELETE FROM documents WHERE user_id = $1 AND project_id = $2${idsSql} RETURNING id`, params);
    docs = rows.length;
  }
  let f = { deleted: 0, bytes: 0, remaining: 0, ids: [] };
  if (kind !== 'document') f = await deleteFilesWhere(db, env, userId, ' AND project_id = $2' + idsSql, params.slice(1));
  if (docs || f.deleted) {
    try { await db.query('UPDATE projects SET updated_at = now() WHERE id = $1 AND user_id = $2', [project.id, userId]); } catch {}
    await logActivity(db, userId, 'project', 'Elementos eliminados de «' + project.name + '»: ' + (docs + f.deleted));
  }
  const total = docs + f.deleted;
  return Object.assign(bulkResponse(
    total === 1 ? 'Se eliminó 1 elemento.' : 'Se eliminaron ' + total + ' elementos.',
    { documents: docs, files: f.deleted, total }, f.remaining, f.bytes), { ids: f.ids });
}

// Borra varios proyectos (todos o por ids) con TODO su contenido.
async function deleteProjects(db, env, userId, sel) {
  const scope = sel.ids ? ' AND project_id = ANY($2::uuid[])' : ' AND project_id IN (SELECT id FROM projects WHERE user_id = $1)';
  const params = sel.ids ? [sel.ids] : [];
  // 1) Archivos (con su binario), por tandas.
  const f = await deleteFilesWhere(db, env, userId, scope, params);
  if (f.remaining) {
    return bulkResponse('Borrando el contenido de los proyectos: ' + f.deleted + ' archivos eliminados.',
      { projects: 0, documents: 0, files: f.deleted }, f.remaining, f.bytes);
  }
  // 2) Documentos y proyectos.
  const { rows: d } = await db.query(`DELETE FROM documents WHERE user_id = $1${scope} RETURNING id`, [userId, ...params]);
  const { rows: p } = await db.query(
    `DELETE FROM projects WHERE user_id = $1${sel.ids ? ' AND id = ANY($2::uuid[])' : ''} RETURNING id`, [userId, ...params]);
  if (p.length) await logActivity(db, userId, 'project', p.length === 1 ? 'Proyecto eliminado' : p.length + ' proyectos eliminados');
  return bulkResponse(p.length === 1 ? 'Se eliminó 1 proyecto.' : 'Se eliminaron ' + p.length + ' proyectos.',
    { projects: p.length, documents: d.length, files: f.deleted }, 0, f.bytes);
}