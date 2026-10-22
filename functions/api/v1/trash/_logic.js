/* trash — la papelera: ver lo borrado, devolverlo a su sitio o borrarlo de
   verdad.  GET /trash · POST /trash/restore · DELETE /trash/:kind/:id ·
   DELETE /trash  (vaciar)

   Lo borrado se guarda 30 días; al abrir la papelera se limpia lo vencido. */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { dataRoute } from '../../../_shared/api.js';
import { UUID_RE, body } from '../../../_shared/util.js';
import { logActivity } from '../../../_shared/bulk.js';
import {
  TRASH_DAYS, TRASH_SQL, TRASH_BYTES_SQL, KIND_TABLE, shapeTrash,
  purgeExpired, purgeOne, purgeAll, restoreOne, restoreProject
} from '../../../_shared/trash.js';

export const handle = dataRoute(async ({ seg, request, env, method, user }) => {
  const db = getDb(env);

  // GET /trash
  if (seg.length === 1 && method === 'GET') {
    await purgeExpired(db, env, user.id);
    const { rows } = await db.query(TRASH_SQL, [user.id]);
    const { rows: b } = await db.query(TRASH_BYTES_SQL, [user.id]);
    return json({
      items: rows.map(shapeTrash),
      bytes: Number((b[0] && b[0].bytes) || 0),
      days: TRASH_DAYS
    });
  }

  // POST /trash/restore  { kind, id }
  if (seg.length === 2 && seg[1] === 'restore' && method === 'POST') {
    const b = await body(request);
    const table = KIND_TABLE[String(b.kind || '')];
    if (!table) return json({ error: 'kind debe ser project, file, document, note o apikey.' }, 400);
    if (!UUID_RE.test(String(b.id || ''))) return json({ error: 'Id no válido.' }, 400);
    if (table === 'projects') {
      if (!(await restoreProject(db, user.id, b.id))) return json({ error: 'No está en la papelera.' }, 404);
      await logActivity(db, user.id, 'project', 'Proyecto restaurado');
      return json({ ok: true, restored: true });
    }
    const r = await restoreOne(db, table, user.id, b.id);
    if (r === 'no') return json({ error: 'No está en la papelera.' }, 404);
    if (r === 'parent') return json({ error: 'Su proyecto también está en la papelera. Restaura primero el proyecto.' }, 409);
    return json({ ok: true, restored: true });
  }

  // DELETE /trash/:kind/:id — borrar un elemento de verdad
  if (seg.length === 3 && method === 'DELETE') {
    if (!KIND_TABLE[seg[1]]) return json({ error: 'Tipo no válido.' }, 400);
    if (!UUID_RE.test(seg[2])) return json({ error: 'Id no válido.' }, 400);
    const r = await purgeOne(db, env, user.id, seg[2]);
    if (r.remaining) return json({ ok: false, pending: true, remaining: r.remaining,
      message: 'Borrando… quedan ' + r.remaining + ' archivos: repite la petición.' }, 202);
    if (!r.deleted) return json({ error: 'No está en la papelera.' }, 404);
    return json({ ok: true, deleted: r.deleted, bytes: r.bytes });
  }

  // DELETE /trash — vaciar
  if (seg.length === 1 && method === 'DELETE') {
    const r = await purgeAll(db, env, user.id);
    if (r.remaining) return json({ ok: false, pending: true, remaining: r.remaining,
      message: 'Vaciando la papelera… quedan ' + r.remaining + ' archivos: repite la petición.' }, 202);
    if (r.deleted) await logActivity(db, user.id, 'file', 'Papelera vaciada: ' + r.deleted + ' elementos');
    return json({ ok: true, deleted: r.deleted, bytes: r.bytes });
  }

  return json({ error: 'Ruta de papelera no encontrada.' }, 404);
});
