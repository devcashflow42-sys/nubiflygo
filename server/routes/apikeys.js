/* ==========================================================================
   routes/apikeys.js — /api/v1/apikeys
   Lista/crea/borra claves secretas. El valor se genera en el servidor.
   ========================================================================== */

import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { ownsProject, ensureSecurity } from '../security.js';

export const apikeys = Router();
apikeys.use(requireAuth);

const UUID_RE = /^[0-9a-f-]{36}$/i;

function genSecret() {
  return 'sk_' + crypto.randomBytes(24).toString('hex').slice(0, 40);
}

apikeys.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, value, permission, project_id, created_at, last_used FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]);
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// Copia de functions/_shared/api.js (mismo texto que en Cloudflare).
const GUEST_KEY_ERROR = 'Las API keys requieren una cuenta. Crea una cuenta gratis para generarlas y usarlas.';

apikeys.post('/', async (req, res, next) => {
  try {
    // Las cuentas de invitado no generan claves (son temporales y sin verificar).
    const { rows: me } = await query('SELECT is_guest FROM users WHERE id = $1', [req.user.id]);
    if (me[0] && me[0].is_guest) return res.status(403).json({ error: GUEST_KEY_ERROR });
    const b = req.body || {};
    const name = String(b.name || 'Clave').slice(0, 80);
    // Permisos admitidos: 'all', 'write' (escritura restringida de la app) y 'read'.
    const permission = b.permission == null || b.permission === '' ? 'all' : String(b.permission);
    if (!['all', 'write', 'read'].includes(permission)) return res.status(400).json({ error: 'Permiso no válido (usa "all", "write" o "read").' });
    const days = b.expires_in_days == null || b.expires_in_days === '' ? null : Number(b.expires_in_days);
    if (days !== null && ![7, 30, 60, 90, 180, 365, 730].includes(days)) return res.status(400).json({ error: 'Vencimiento no válido.' });
    await ensureSecurity();
    const projectId = b.project_id && UUID_RE.test(b.project_id) ? b.project_id : null;
    if (projectId && !(await ownsProject(req.user.id, projectId))) return res.status(404).json({ error: 'Proyecto no encontrado.' });
    const { rows: cnt } = await query('SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1', [req.user.id]);
    if (((cnt[0] && cnt[0].n) || 0) >= 50) return res.status(403).json({ error: 'Llegaste al máximo de 50 claves. Borra alguna que ya no uses.' });
    const { rows } = await query(
      `INSERT INTO api_keys (user_id, project_id, name, value, permission, expires_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
       RETURNING id, name, value, permission, project_id, created_at, last_used, expires_at`,
      [req.user.id, projectId, name, genSecret(), permission, days]);
    await query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [req.user.id, 'apikey', 'Clave API creada: ' + name]).catch(() => {});
    res.status(201).json({ item: rows[0] });
  } catch (e) { next(e); }
});

apikeys.delete('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    const { rowCount } = await query(
      'DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'No encontrada.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
