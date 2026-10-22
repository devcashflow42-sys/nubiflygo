/* trash.js — Papelera: borrado suave compartido por toda la API.

   Al borrar un proyecto, archivo, documento, nota o API key no se borra la
   fila: se marca `deleted_at`. Durante 30 días se puede devolver a su sitio
   desde la sección Papelera; pasado ese plazo se borra de verdad, y solo
   entonces se sueltan los archivos del almacenamiento.

   Reglas que hay que respetar en TODA consulta nueva:
   · toda lectura lleva `deleted_at IS NULL` (listas, contadores, cuota del
     plan, buscador, enlaces compartidos y la firma de tiempo real);
   · al mandar un proyecto a la papelera, su contenido va con él marcado con
     `trashed_with_project`, para que al restaurarlo vuelva lo mismo que se fue
     y no lo que el usuario ya había tirado por su cuenta antes;
   · una API key en la papelera NO autentica (ver authenticate() en api.js).

   Copia en server/trash.js (misma lógica) para el servidor Node. */

import { deleteFilesWhere } from './bulk.js';

// Días que se guarda lo borrado antes de eliminarse solo.
export const TRASH_DAYS = 30;

export const TRASH_TABLES = ['projects', 'files', 'documents', 'notes', 'api_keys'];
// Las de contenido se arrastran con su proyecto.
const WITH_PROJECT = ['files', 'documents', 'notes', 'api_keys'];
// Las que no guardan nada en el almacenamiento.
const ROW_ONLY = ['documents', 'notes', 'api_keys'];

const TRASH_DDL = {};
for (const t of TRASH_TABLES) TRASH_DDL[t + '.deleted_at'] = `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
for (const t of WITH_PROJECT) TRASH_DDL[t + '.trashed_with_project'] = `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS trashed_with_project BOOLEAN NOT NULL DEFAULT false`;

// Primero una lectura, como ensureSecurityColumns: un ALTER TABLE bloquea la
// tabla un instante aunque la columna ya exista.
let trashColumnsReady = false;
export async function ensureTrashColumns(db) {
  if (trashColumnsReady) return;
  const { rows } = await db.query(
    `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name IN ('projects', 'files', 'documents', 'notes', 'api_keys')
       AND column_name IN ('deleted_at', 'trashed_with_project')`);
  const have = new Set(rows.map(r => r.c));
  for (const [c, sql] of Object.entries(TRASH_DDL)) if (!have.has(c)) await db.query(sql);
  trashColumnsReady = true;
}

/* ─── Mandar a la papelera ─── */

// Un elemento suelto (archivo, documento, nota o API key).
export async function trashOne(db, table, userId, id) {
  const { rowCount } = await db.query(
    `UPDATE ${table} SET deleted_at = now(), trashed_with_project = false
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [id, userId]);
  return rowCount > 0;
}

// Varios archivos a la vez (lo usa el borrado masivo de /files).
export async function trashFilesWhere(db, userId, where, params) {
  const { rowCount } = await db.query(
    `UPDATE files SET deleted_at = now(), trashed_with_project = false
     WHERE user_id = $1 AND deleted_at IS NULL${where}`, [userId, ...params]);
  return rowCount || 0;
}

/* Un proyecto entero: él y todo lo suyo que no estuviera ya en la papelera.
   Lo que el usuario había tirado antes se queda como estaba, con su propia
   cuenta atrás, y sigue saliendo como elemento suelto. */
export async function trashProject(db, userId, id) {
  const { rowCount } = await db.query(
    'UPDATE projects SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, userId]);
  if (!rowCount) return false;
  for (const t of WITH_PROJECT) {
    await db.query(
      `UPDATE ${t} SET deleted_at = now(), trashed_with_project = true
       WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [id, userId]);
  }
  return true;
}

/* ─── Devolver a su sitio ─── */

/* Restaura el proyecto y, con él, lo que se fue a la papelera a su lado. */
export async function restoreProject(db, userId, id) {
  const { rowCount } = await db.query(
    'UPDATE projects SET deleted_at = NULL WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL', [id, userId]);
  if (!rowCount) return false;
  for (const t of WITH_PROJECT) {
    await db.query(
      `UPDATE ${t} SET deleted_at = NULL, trashed_with_project = false
       WHERE project_id = $1 AND user_id = $2 AND trashed_with_project = true`, [id, userId]);
  }
  return true;
}

/* Restaura un elemento suelto. Devuelve 'ok', 'no' (no está en la papelera) o
   'parent' (su proyecto sigue borrado: hay que restaurar antes el proyecto). */
export async function restoreOne(db, table, userId, id) {
  const { rows } = await db.query(
    `SELECT (SELECT p.deleted_at IS NOT NULL FROM projects p WHERE p.id = t.project_id) AS parent_gone
     FROM ${table} t WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NOT NULL`, [id, userId]);
  if (!rows.length) return 'no';
  if (rows[0].parent_gone) return 'parent';
  await db.query(
    `UPDATE ${table} SET deleted_at = NULL, trashed_with_project = false
     WHERE id = $1 AND user_id = $2`, [id, userId]);
  return 'ok';
}

/* ─── Borrado definitivo ───

   Borra de verdad todo lo que esté en la papelera y cumpla `cond`: un trozo de
   SQL que se aplica igual a los proyectos y a los elementos sueltos ($2 en
   adelante para `params`). Va por tandas porque soltar los objetos del
   almacenamiento tiene presupuesto; si queda trabajo devuelve `remaining > 0` y
   el cliente vuelve a llamar (lo hace solo apiBulk).

   Un archivo que el usuario había tirado por su cuenta ANTES de borrar su
   proyecto no se va con él: la clave externa lo deja sin proyecto y se queda en
   la papelera como elemento suelto, con su propia cuenta atrás. */
async function purgeMatching(db, env, userId, cond, params) {
  const mine = ` AND deleted_at IS NOT NULL${cond}`;
  const ofProject = ` AND trashed_with_project AND project_id IN
    (SELECT id FROM projects WHERE user_id = $1 AND deleted_at IS NOT NULL${cond})`;

  // 1) Archivos sueltos de la papelera.
  const a = await deleteFilesWhere(db, env, userId, mine + ' AND NOT trashed_with_project', params);
  if (a.remaining) return { deleted: a.deleted, bytes: a.bytes, remaining: a.remaining };
  // 2) Archivos que se fueron con un proyecto que ahora desaparece.
  const b = await deleteFilesWhere(db, env, userId, ofProject, params);
  if (b.remaining) return { deleted: a.deleted + b.deleted, bytes: a.bytes + b.bytes, remaining: b.remaining };

  // 3) Filas que no tocan el almacenamiento.
  let n = a.deleted + b.deleted;
  for (const t of ROW_ONLY) {
    const r1 = await db.query(`DELETE FROM ${t} WHERE user_id = $1${mine} AND NOT trashed_with_project`, [userId, ...params]);
    const r2 = await db.query(`DELETE FROM ${t} WHERE user_id = $1${ofProject}`, [userId, ...params]);
    n += (r1.rowCount || 0) + (r2.rowCount || 0);
  }
  // Las claves que el usuario tiró por su cuenta no deben irse con el proyecto:
  // su clave externa es CASCADE, así que se desenganchan antes de borrarlo.
  await db.query(
    `UPDATE api_keys SET project_id = NULL
     WHERE user_id = $1 AND deleted_at IS NOT NULL AND NOT trashed_with_project
       AND project_id IN (SELECT id FROM projects WHERE user_id = $1 AND deleted_at IS NOT NULL${cond})`,
    [userId, ...params]);
  // 4) Y por último los proyectos.
  const p = await db.query(`DELETE FROM projects WHERE user_id = $1${mine}`, [userId, ...params]);
  return { deleted: n + (p.rowCount || 0), bytes: a.bytes + b.bytes, remaining: 0 };
}

// Un elemento concreto de la papelera, sea del tipo que sea (los ids son UUID,
// así que la condición solo puede casar con uno).
export function purgeOne(db, env, userId, id) {
  return purgeMatching(db, env, userId, ' AND id = $2', [id]);
}

// Vaciar la papelera entera.
export function purgeAll(db, env, userId) {
  return purgeMatching(db, env, userId, '', []);
}

// Lo que ya pasó de los 30 días. Se llama al abrir la papelera.
export function purgeExpired(db, env, userId) {
  return purgeMatching(db, env, userId, ` AND deleted_at < now() - interval '${TRASH_DAYS} days'`, []);
}

/* ─── Lo que hay en la papelera ───
   Una sola consulta. No salen los elementos que se fueron con su proyecto: esos
   ya cuentan dentro de la fila del proyecto. */
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

// Cuánto ocupa la papelera (solo los archivos pesan).
export const TRASH_BYTES_SQL =
  `SELECT coalesce(sum(size), 0)::bigint AS bytes, count(*)::int AS files
   FROM files WHERE user_id = $1 AND deleted_at IS NOT NULL`;

// Fila de la base → lo que entiende la app.
export function shapeTrash(r) {
  const left = TRASH_DAYS - Math.floor((Date.now() - new Date(r.deleted_at).getTime()) / 86400000);
  return {
    kind: r.kind,
    id: r.id,
    title: r.title || '',
    mime: r.mime || null,
    size: r.size == null ? null : Number(r.size),
    items: r.items == null ? null : Number(r.items),
    parent: r.parent || null,
    deleted_at: r.deleted_at,
    days_left: Math.max(0, left)
  };
}

export const KIND_TABLE = { project: 'projects', file: 'files', document: 'documents', note: 'notes', apikey: 'api_keys' };
