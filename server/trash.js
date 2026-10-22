/* trash.js — Papelera del servidor Node.
   Copia de functions/_shared/trash.js (misma lógica). Ver allí la explicación
   completa; en resumen: borrar marca `deleted_at`, se guarda 30 días, y los
   archivos solo se sueltan del almacenamiento al borrarlos de verdad. */

import { query } from './db.js';
import { deleteFilesWhere } from './lists.js';

export const TRASH_DAYS = 30;

export const TRASH_TABLES = ['projects', 'files', 'documents', 'notes', 'api_keys'];
const WITH_PROJECT = ['files', 'documents', 'notes', 'api_keys'];
const ROW_ONLY = ['documents', 'notes', 'api_keys'];

const TRASH_DDL = {};
for (const t of TRASH_TABLES) TRASH_DDL[t + '.deleted_at'] = `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
for (const t of WITH_PROJECT) TRASH_DDL[t + '.trashed_with_project'] = `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS trashed_with_project BOOLEAN NOT NULL DEFAULT false`;

let trashReady = false;
export async function ensureTrashColumns() {
  if (trashReady) return;
  const { rows } = await query(
    `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name IN ('projects', 'files', 'documents', 'notes', 'api_keys')
       AND column_name IN ('deleted_at', 'trashed_with_project')`);
  const have = new Set(rows.map(r => r.c));
  for (const [c, sql] of Object.entries(TRASH_DDL)) if (!have.has(c)) await query(sql);
  trashReady = true;
}

/* ─── Mandar a la papelera ─── */

export async function trashOne(table, userId, id) {
  const { rowCount } = await query(
    `UPDATE ${table} SET deleted_at = now(), trashed_with_project = false
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [id, userId]);
  return rowCount > 0;
}

export async function trashFilesWhere(userId, where, params) {
  const { rowCount } = await query(
    `UPDATE files SET deleted_at = now(), trashed_with_project = false
     WHERE user_id = $1 AND deleted_at IS NULL${where}`, [userId, ...params]);
  return rowCount || 0;
}

export async function trashProject(userId, id) {
  const { rowCount } = await query(
    'UPDATE projects SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId]);
  if (!rowCount) return false;
  for (const t of WITH_PROJECT) {
    await query(
      `UPDATE ${t} SET deleted_at = now(), trashed_with_project = true
       WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [id, userId]);
  }
  return true;
}

/* ─── Devolver a su sitio ─── */

export async function restoreProject(userId, id) {
  const { rowCount } = await query(
    'UPDATE projects SET deleted_at = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL', [id, userId]);
  if (!rowCount) return false;
  for (const t of WITH_PROJECT) {
    await query(
      `UPDATE ${t} SET deleted_at = NULL, trashed_with_project = false
       WHERE project_id = $1 AND user_id = $2 AND trashed_with_project = true`, [id, userId]);
  }
  return true;
}

// 'ok' · 'no' (no está en la papelera) · 'parent' (su proyecto sigue borrado).
export async function restoreOne(table, userId, id) {
  const { rows } = await query(
    `SELECT (SELECT p.deleted_at IS NOT NULL FROM projects p WHERE p.id = t.project_id) AS parent_gone
     FROM ${table} t WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NOT NULL`, [id, userId]);
  if (!rows.length) return 'no';
  if (rows[0].parent_gone) return 'parent';
  await query(
    `UPDATE ${table} SET deleted_at = NULL, trashed_with_project = false
     WHERE id = $1 AND user_id = $2`, [id, userId]);
  return 'ok';
}

/* ─── Borrado definitivo ─── */

async function purgeMatching(userId, cond, params) {
  const mine = ` AND deleted_at IS NOT NULL${cond}`;
  const ofProject = ` AND trashed_with_project AND project_id IN
    (SELECT id FROM projects WHERE user_id = $1 AND deleted_at IS NOT NULL${cond})`;

  const a = await deleteFilesWhere(userId, mine + ' AND NOT trashed_with_project', params);
  const b = await deleteFilesWhere(userId, ofProject, params);
  let n = a.deleted + b.deleted;
  for (const t of ROW_ONLY) {
    const r1 = await query(`DELETE FROM ${t} WHERE user_id = $1${mine} AND NOT trashed_with_project`, [userId, ...params]);
    const r2 = await query(`DELETE FROM ${t} WHERE user_id = $1${ofProject}`, [userId, ...params]);
    n += (r1.rowCount || 0) + (r2.rowCount || 0);
  }
  const p = await query(`DELETE FROM projects WHERE user_id = $1${mine}`, [userId, ...params]);
  return { deleted: n + (p.rowCount || 0), bytes: a.bytes + b.bytes, remaining: 0 };
}

export const purgeOne = (userId, id) => purgeMatching(userId, ' AND id = $2', [id]);
export const purgeAll = (userId) => purgeMatching(userId, '', []);
export const purgeExpired = (userId) => purgeMatching(userId, ` AND deleted_at < now() - interval '${TRASH_DAYS} days'`, []);

/* ─── Lo que hay en la papelera ─── */

export const TRASH_SQL = `
  SELECT 'project' AS kind, p.id, p.name AS title, NULL::text AS mime, p.deleted_at,
         (SELECT coalesce(sum(f.size), 0) FROM files f WHERE f.project_id = p.id AND f.trashed_with_project)::bigint AS size,
         ((SELECT count(*) FROM files f WHERE f.project_id = p.id AND f.trashed_with_project)
        + (SELECT count(*) FROM documents d WHERE d.project_id = p.id AND d.trashed_with_project))::int AS items,
         NULL::text AS parent
  FROM projects p WHERE p.user_id = $1 AND p.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'file', f.id, f.name, f.mime, f.deleted_at, f.size::bigint, NULL::int,
         (SELECT p.name FROM projects p WHERE p.id = f.project_id)
  FROM files f WHERE f.user_id = $1 AND f.deleted_at IS NOT NULL AND NOT f.trashed_with_project
  UNION ALL
  SELECT 'document', d.id, d.title, NULL::text, d.deleted_at, NULL::bigint, NULL::int,
         (SELECT p.name FROM projects p WHERE p.id = d.project_id)
  FROM documents d WHERE d.user_id = $1 AND d.deleted_at IS NOT NULL AND NOT d.trashed_with_project
  UNION ALL
  SELECT 'note', n.id, n.title, NULL::text, n.deleted_at, NULL::bigint, NULL::int,
         (SELECT p.name FROM projects p WHERE p.id = n.project_id)
  FROM notes n WHERE n.user_id = $1 AND n.deleted_at IS NOT NULL AND NOT n.trashed_with_project
  UNION ALL
  SELECT 'apikey', k.id, k.name, NULL::text, k.deleted_at, NULL::bigint, NULL::int,
         (SELECT p.name FROM projects p WHERE p.id = k.project_id)
  FROM api_keys k WHERE k.user_id = $1 AND k.deleted_at IS NOT NULL AND NOT k.trashed_with_project
  ORDER BY deleted_at DESC`;

export const TRASH_BYTES_SQL =
  `SELECT coalesce(sum(size), 0)::bigint AS bytes, count(*)::int AS files
   FROM files WHERE user_id = $1 AND deleted_at IS NOT NULL`;

export function shapeTrash(r) {
  const left = TRASH_DAYS - Math.floor((Date.now() - new Date(r.deleted_at).getTime()) / 86400000);
  return {
    kind: r.kind, id: r.id, title: r.title || '', mime: r.mime || null,
    size: r.size == null ? null : Number(r.size),
    items: r.items == null ? null : Number(r.items),
    parent: r.parent || null, deleted_at: r.deleted_at,
    days_left: Math.max(0, left)
  };
}

export const KIND_TABLE = { project: 'projects', file: 'files', document: 'documents', note: 'notes', apikey: 'api_keys' };
