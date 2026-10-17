/* ==========================================================================
   notifications — avisos del usuario (seguridad, suscripción, abuso, novedades).
     GET    /notifications?status=all|unread&type=&limit=&before=  → lista + contador
     GET    /notifications/unread                → { unread }
     PATCH  /notifications/:id   { read: true|false }  → marca leída / no leída
     POST   /notifications/read-all              → marca todas como leídas
     DELETE /notifications/:id                   → borra una
     DELETE /notifications?status=read|all       → borra las leídas (o todas)
     POST   /notifications/send   (solo admin)   → envía un aviso a un usuario o a todos
   Cada usuario solo ve y modifica las suyas (filtrado por user_id).
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { dataRoute, rowIsAdmin } from '../../../_shared/api.js';
import { UUID_RE, body, EMAIL_RE } from '../../../_shared/util.js';
import { ensureNotifications, checkBilling, notify, cleanLink, NOTIF_TYPES } from '../../../_shared/notify.js';

const COLS = 'id, type, title, body, link, read_at, created_at';
const unreadOf = async (db, uid) =>
  (await db.query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL', [uid])).rows[0].n;

export const handle = dataRoute(async ({ seg, request, env, method, user, auth }) => {
  const db = getDb(env);
  await ensureNotifications(db);
  const sub = seg[1] || '';
  const url = new URL(request.url);

  // Lista (y revisión de la suscripción al consultar).
  if (!sub && method === 'GET') {
    await checkBilling(db, user.id);
    const status = url.searchParams.get('status') === 'unread' ? 'unread' : 'all';
    const type = NOTIF_TYPES.includes(url.searchParams.get('type')) ? url.searchParams.get('type') : null;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const before = url.searchParams.get('before');
    const where = ['user_id = $1', 'deleted_at IS NULL'], params = [user.id];
    if (status === 'unread') where.push('read_at IS NULL');
    if (type) { params.push(type); where.push('type = $' + params.length); }
    if (before && !isNaN(Date.parse(before))) { params.push(new Date(before).toISOString()); where.push('created_at < $' + params.length); }
    params.push(limit + 1);
    const { rows } = await db.query(
      `SELECT ${COLS} FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    const more = rows.length > limit;
    return json({ items: rows.slice(0, limit), unread: await unreadOf(db, user.id), has_more: more });
  }

  if (sub === 'unread' && method === 'GET') return json({ unread: await unreadOf(db, user.id) });

  if (sub === 'read-all' && method === 'POST') {
    const r = await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND deleted_at IS NULL', [user.id]);
    return json({ updated: r.rowCount || 0, unread: 0 });
  }

  // Envío (solo administrador, solo con la sesión de la app).
  if (sub === 'send' && method === 'POST') {
    let admin = !auth.viaKey && user.isAdmin;
    if (!admin && !auth.viaKey) {
      const { rows } = await db.query('SELECT email, is_admin FROM users WHERE id = $1', [user.id]);
      admin = rowIsAdmin(rows[0] || { email: user.email }, env);
    }
    if (!admin) return json({ error: 'Acceso solo para el administrador.' }, 403);
    const b = await body(request);
    const type = NOTIF_TYPES.includes(b.type) ? b.type : 'info';
    const title = String(b.title || '').trim(), text = String(b.body || '').trim();
    if (title.length < 2) return json({ error: 'El título es obligatorio.' }, 400);
    const link = cleanLink(b.link);
    if (b.to === 'all') {
      const r = await db.query(
        `INSERT INTO notifications (user_id, type, title, body, link)
         SELECT id, $1, $2, $3, $4 FROM users WHERE NOT coalesce(is_guest, false)`,
        [type, title.slice(0, 140), text.slice(0, 1000), link]);
      return json({ sent: r.rowCount || 0 }, 201);
    }
    const email = String(b.to || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: 'Indica "to": "all" o el correo del usuario.' }, 400);
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows[0]) return json({ error: 'No existe un usuario con ese correo.' }, 404);
    await notify(db, rows[0].id, { type, title, body: text, link });
    return json({ sent: 1 }, 201);
  }

  // Borrado masivo.
  if (!sub && method === 'DELETE') {
    const all = url.searchParams.get('status') === 'all';
    const r = await db.query(
      'UPDATE notifications SET deleted_at = now(), read_at = coalesce(read_at, now()) WHERE user_id = $1 AND deleted_at IS NULL' + (all ? '' : ' AND read_at IS NOT NULL'), [user.id]);
    return json({ deleted: r.rowCount || 0, unread: await unreadOf(db, user.id) });
  }

  // Una notificación.
  if (sub && !seg[2]) {
    if (!UUID_RE.test(sub)) return json({ error: 'Id no válido.' }, 400);
    if (method === 'PATCH') {
      const b = await body(request);
      if (typeof b.read !== 'boolean') return json({ error: 'Envía { "read": true } o { "read": false }.' }, 400);
      const { rows } = await db.query(
        `UPDATE notifications SET read_at = ${b.read ? 'coalesce(read_at, now())' : 'NULL'}
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING ${COLS}`, [sub, user.id]);
      if (!rows[0]) return json({ error: 'Notificación no encontrada.' }, 404);
      return json({ item: rows[0], unread: await unreadOf(db, user.id) });
    }
    if (method === 'DELETE') {
      const r = await db.query('UPDATE notifications SET deleted_at = now(), read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [sub, user.id]);
      if (!r.rowCount) return json({ error: 'Notificación no encontrada.' }, 404);
      return json({ ok: true, unread: await unreadOf(db, user.id) });
    }
  }

  return json({ error: 'Ruta de notificaciones no encontrada.' }, 404);
});
