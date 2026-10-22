/* trash.js — la papelera. Copia de functions/api/v1/trash/_logic.js (misma
   lógica): ver lo borrado, devolverlo a su sitio o borrarlo de verdad. */
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { UUID_RE } from '../security.js';
import { logActivity } from '../lists.js';
import {
  TRASH_DAYS, TRASH_SQL, TRASH_BYTES_SQL, KIND_TABLE, shapeTrash,
  purgeExpired, purgeOne, purgeAll, restoreOne, restoreProject
} from '../trash.js';

export const trash = Router();
trash.use(requireAuth);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// GET /trash
trash.get('/', wrap(async (req, res) => {
  await purgeExpired(req.user.id);
  const { rows } = await query(TRASH_SQL, [req.user.id]);
  const { rows: b } = await query(TRASH_BYTES_SQL, [req.user.id]);
  res.json({ items: rows.map(shapeTrash), bytes: Number((b[0] && b[0].bytes) || 0), days: TRASH_DAYS });
}));

// POST /trash/restore  { kind, id }
trash.post('/restore', wrap(async (req, res) => {
  const b = req.body || {};
  const table = KIND_TABLE[String(b.kind || '')];
  if (!table) return res.status(400).json({ error: 'kind debe ser project, file, document, note o apikey.' });
  if (!UUID_RE.test(String(b.id || ''))) return res.status(400).json({ error: 'Id no válido.' });
  if (table === 'projects') {
    if (!(await restoreProject(req.user.id, b.id))) return res.status(404).json({ error: 'No está en la papelera.' });
    await logActivity(req.user.id, 'project', 'Proyecto restaurado');
    return res.json({ ok: true, restored: true });
  }
  const r = await restoreOne(table, req.user.id, b.id);
  if (r === 'no') return res.status(404).json({ error: 'No está en la papelera.' });
  if (r === 'parent') return res.status(409).json({ error: 'Su proyecto también está en la papelera. Restaura primero el proyecto.' });
  res.json({ ok: true, restored: true });
}));

// DELETE /trash/:kind/:id — borrar un elemento de verdad
trash.delete('/:kind/:id', wrap(async (req, res) => {
  if (!KIND_TABLE[req.params.kind]) return res.status(400).json({ error: 'Tipo no válido.' });
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
  const r = await purgeOne(req.user.id, req.params.id);
  if (!r.deleted) return res.status(404).json({ error: 'No está en la papelera.' });
  res.json({ ok: true, deleted: r.deleted, bytes: r.bytes });
}));

// DELETE /trash — vaciar
trash.delete('/', wrap(async (req, res) => {
  const r = await purgeAll(req.user.id);
  if (r.deleted) await logActivity(req.user.id, 'file', 'Papelera vaciada: ' + r.deleted + ' elementos');
  res.json({ ok: true, deleted: r.deleted, bytes: r.bytes });
}));
