/* ==========================================================================
   crud.js — Generador de rutas CRUD para tablas de un usuario.
   Crea: GET /  ·  POST /  ·  GET /:id  ·  PATCH /:id  ·  DELETE /:id
   Todo queda filtrado por user_id (cada quien ve solo lo suyo).
   ========================================================================== */

import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { cleanValue, ownsProject } from '../security.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  table:   nombre de la tabla
  columns: columnas que el cliente puede enviar al crear/editar
  touchUpdatedAt: si la tabla tiene updated_at que refrescar al editar
*/
export function crudRouter(table, columns, { touchUpdatedAt = true } = {}) {
  const r = Router();
  r.use(requireAuth);
  const selectCols = ['id', ...columns, 'created_at', touchUpdatedAt ? 'updated_at' : null].filter(Boolean).join(', ');

  // Listar
  r.get('/', async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT ${selectCols} FROM ${table} WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, [req.user.id]);
      res.json({ items: rows });
    } catch (e) { next(e); }
  });

  // Crear (textos con largo máximo; un project_id debe ser un proyecto tuyo)
  r.post('/', async (req, res, next) => {
    try {
      const b = req.body || {};
      const vals = columns.map(c => cleanValue(table, c, b[c]));
      if (vals.some(v => v === undefined)) return res.status(400).json({ error: 'Datos no válidos.' });
      if (columns.includes('project_id') && !(await ownsProject(req.user.id, b.project_id))) return res.status(404).json({ error: 'Proyecto no encontrado.' });
      const placeholders = columns.map((_, i) => `$${i + 2}`).join(', ');
      const { rows } = await query(
        `INSERT INTO ${table} (user_id, ${columns.join(', ')}) VALUES ($1, ${placeholders}) RETURNING ${selectCols}`,
        [req.user.id, ...vals]);
      res.status(201).json({ item: rows[0] });
    } catch (e) { next(e); }
  });

  // Obtener uno
  r.get('/:id', async (req, res, next) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
      const { rows } = await query(
        `SELECT ${selectCols} FROM ${table} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.params.id, req.user.id]);
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
      res.json({ item: rows[0] });
    } catch (e) { next(e); }
  });

  // Editar (solo las columnas enviadas)
  r.patch('/:id', async (req, res, next) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
      const b = req.body || {};
      const sent = columns.filter(c => c in b);
      if (!sent.length) return res.status(400).json({ error: 'Nada que actualizar.' });
      const vals = sent.map(c => cleanValue(table, c, b[c]));
      if (vals.some(v => v === undefined)) return res.status(400).json({ error: 'Datos no válidos.' });
      if (sent.includes('project_id') && !(await ownsProject(req.user.id, b.project_id))) return res.status(404).json({ error: 'Proyecto no encontrado.' });
      const sets = sent.map((c, i) => `${c} = $${i + 3}`);
      if (touchUpdatedAt) sets.push('updated_at = now()');
      const { rows } = await query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING ${selectCols}`,
        [req.params.id, req.user.id, ...vals]);
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado.' });
      res.json({ item: rows[0] });
    } catch (e) { next(e); }
  });

  // Borrar: a la papelera, no fuera (se guarda 30 días y se puede restaurar).
  // Copia de handleCrud en functions/_shared/api.js (misma lógica).
  r.delete('/:id', async (req, res, next) => {
    try {
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
      const { rowCount } = await query(
        `UPDATE ${table} SET deleted_at = now(), trashed_with_project = false
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [req.params.id, req.user.id]);
      if (!rowCount) return res.status(404).json({ error: 'No encontrado.' });
      res.json({ ok: true, trashed: true });
    } catch (e) { next(e); }
  });

  return r;
}
