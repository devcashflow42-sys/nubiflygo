/* ==========================================================================
   routes/notifications.js — Notificaciones del usuario (igual que en functions/).
     GET    /notifications?status=all|unread&type=&limit=&before=  → lista + contador
     GET    /notifications/unread                → { unread }
     PATCH  /notifications/:id   { read: true|false }
     POST   /notifications/read-all
     DELETE /notifications/:id
     DELETE /notifications?status=read|all
     POST   /notifications/send   (solo admin)   { to: "all" | correo, type, title, body, link }
   ========================================================================== */

import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { isAdminEmail } from '../security.js';
import { ensureNotifications, checkBilling, notify, cleanLink, NOTIF_TYPES } from '../notify.js';

export const notifications = Router();
const db = { query };
const COLS = 'id, type, title, body, link, read_at, created_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const unreadOf = async (uid) =>
  (await query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL', [uid])).rows[0].n;

notifications.use(requireAuth, (req, res, next) => { ensureNotifications(db).then(() => next(), next); });

notifications.get('/', async (req, res, next) => {
  try {
    await checkBilling(db, req.user.id);
    const type = NOTIF_TYPES.includes(req.query.type) ? req.query.type : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const where = ['user_id = $1', 'deleted_at IS NULL'], params = [req.user.id];
    if (req.query.status === 'unread') where.push('read_at IS NULL');
    if (type) { params.push(type); where.push('type = $' + params.length); }
    if (req.query.before && !isNaN(Date.parse(req.query.before))) { params.push(new Date(req.query.before).toISOString()); where.push('created_at < $' + params.length); }
    params.push(limit + 1);
    const { rows } = await query(
      `SELECT ${COLS} FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    res.json({ items: rows.slice(0, limit), unread: await unreadOf(req.user.id), has_more: rows.length > limit });
  } catch (e) { next(e); }
});

notifications.get('/unread', async (req, res, next) => {
  try { res.json({ unread: await unreadOf(req.user.id) }); } catch (e) { next(e); }
});

notifications.post('/read-all', async (req, res, next) => {
  try {
    const r = await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL', [req.user.id]);
    res.json({ updated: r.rowCount || 0, unread: 0 });
  } catch (e) { next(e); }
});

notifications.post('/send', async (req, res, next) => {
  try {
    const { rows: me } = await query('SELECT email, is_admin FROM users WHERE id = $1', [req.user.id]);
    if (!me[0] || !(me[0].is_admin || isAdminEmail(me[0].email))) return res.status(403).json({ error: 'Acceso solo para el administrador.' });
    const b = req.body || {};
    const type = NOTIF_TYPES.includes(b.type) ? b.type : 'info';
    const title = String(b.title || '').trim(), text = String(b.body || '').trim();
    if (title.length < 2) return res.status(400).json({ error: 'El título es obligatorio.' });
    const link = cleanLink(b.link);
    if (b.to === 'all') {
      const r = await query(
        `INSERT INTO notifications (user_id, type, title, body, link)
         SELECT id, $1, $2, $3, $4 FROM users WHERE NOT coalesce(is_guest, false)`,
        [type, title.slice(0, 140), text.slice(0, 1000), link]);
      return res.status(201).json({ sent: r.rowCount || 0 });
    }
    const email = String(b.to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Indica "to": "all" o el correo del usuario.' });
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows[0]) return res.status(404).json({ error: 'No existe un usuario con ese correo.' });
    await notify(db, rows[0].id, { type, title, body: text, link });
    res.status(201).json({ sent: 1 });
  } catch (e) { next(e); }
});

notifications.delete('/', async (req, res, next) => {
  try {
    const all = req.query.status === 'all';
    const r = await query('UPDATE notifications SET deleted_at = now(), read_at = coalesce(read_at, now()) WHERE user_id = $1 AND deleted_at IS NULL' + (all ? '' : ' AND read_at IS NOT NULL'), [req.user.id]);
    res.json({ deleted: r.rowCount || 0, unread: await unreadOf(req.user.id) });
  } catch (e) { next(e); }
});

notifications.patch('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    const read = req.body && req.body.read;
    if (typeof read !== 'boolean') return res.status(400).json({ error: 'Envía { "read": true } o { "read": false }.' });
    const { rows } = await query(
      `UPDATE notifications SET read_at = ${read ? 'coalesce(read_at, now())' : 'NULL'}
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING ${COLS}`, [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Notificación no encontrada.' });
    res.json({ item: rows[0], unread: await unreadOf(req.user.id) });
  } catch (e) { next(e); }
});

notifications.delete('/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Id no válido.' });
    const r = await query('UPDATE notifications SET deleted_at = now(), read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Notificación no encontrada.' });
    res.json({ ok: true, unread: await unreadOf(req.user.id) });
  } catch (e) { next(e); }
});
