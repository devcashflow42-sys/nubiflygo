/* ==========================================================================
   admin — solo el administrador (verificado por correo del servidor ADMIN_EMAILS
   o por la columna users.is_admin). Estadísticas globales y listado/detalle de
   usuarios (sin credenciales ni hashes).
     GET /admin  |  /admin/stats            → estadísticas globales
     GET /admin/users?page=&limit=&q=        → listado de usuarios
     GET /admin/users/:id                    → detalle de un usuario
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { dataRoute, rowIsAdmin } from '../../../_shared/api.js';
import { UUID_RE, pageParams, fmtBytes, toISO } from '../../../_shared/util.js';

export const handle = dataRoute(async ({ seg, request, env, method, user, auth }) => {
  const db = getDb(env);
  // Solo con la sesión de la app (nunca con una API key).
  if (!auth || auth.viaKey) return json({ error: 'Acceso solo para el administrador.' }, 403);
  // Verificación robusta (servidor): correo admin o columna is_admin.
  let admin = user.isAdmin;
  if (!admin) {
    try {
      const { rows } = await db.query('SELECT email, is_admin FROM users WHERE id = $1', [user.id]);
      admin = rowIsAdmin(rows[0] || { email: user.email }, env);
    } catch {}
  }
  if (!admin) return json({ error: 'Acceso solo para el administrador.' }, 403);

  // GET /admin  o  /admin/stats → estadísticas globales
  if ((!seg[1] || seg[1] === 'stats') && method === 'GET') {
    const { rows } = await db.query(
      `SELECT
         (SELECT count(*) FROM users) AS users,
         (SELECT count(*) FROM users WHERE is_guest) AS guests,
         (SELECT count(*) FROM users WHERE NOT is_guest) AS registered,
         (SELECT count(*) FROM projects) AS projects,
         (SELECT count(*) FROM notes) AS notes,
         (SELECT count(*) FROM documents) AS documents,
         (SELECT count(*) FROM files) AS files,
         (SELECT coalesce(sum(size),0) FROM files) AS storage_bytes,
         (SELECT count(*) FROM api_keys) AS api_keys`);
    const s = rows[0] || {};
    const bytes = Number(s.storage_bytes) || 0;
    return json({ success: true, status: 200, data: { stats: {
      users: Number(s.users) || 0,
      registered: Number(s.registered) || 0,
      guests: Number(s.guests) || 0,
      projects: Number(s.projects) || 0,
      notes: Number(s.notes) || 0,
      documents: Number(s.documents) || 0,
      files: Number(s.files) || 0,
      api_keys: Number(s.api_keys) || 0,
      storage: { bytes, formatted: fmtBytes(bytes) }
    } }, error: null });
  }

  // GET /admin/users?page=&limit=&q= → listado de usuarios
  if (seg[1] === 'users' && !seg[2] && method === 'GET') {
    const { limit, page, offset } = pageParams(request);
    const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
    const cols = `u.id, u.name, u.email, u.created_at, u.is_guest, u.guest_expires_at, u.language, u.plan, u.is_admin,
       (SELECT count(*) FROM projects p WHERE p.user_id = u.id) AS projects,
       (SELECT count(*) FROM files f WHERE f.user_id = u.id) AS files,
       count(*) OVER() AS __total`;
    let rows;
    if (q) {
      ({ rows } = await db.query(
        `SELECT ${cols} FROM users u WHERE lower(u.email) LIKE $1 OR lower(u.name) LIKE $1
         ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`, ['%' + q + '%', limit, offset]));
    } else {
      ({ rows } = await db.query(
        `SELECT ${cols} FROM users u ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]));
    }
    const total = rows[0] ? Number(rows[0].__total) : 0;
    const items = rows.map(r => adminUserItem(r, env));
    return json({ success: true, status: 200, data: { items, total, page, limit, has_more: offset + items.length < total }, error: null });
  }

  // GET /admin/users/:id → detalle de un usuario (con todos sus datos)
  if (seg[1] === 'users' && seg[2] && method === 'GET') {
    if (!UUID_RE.test(seg[2])) return json({ error: 'Id no válido.' }, 400);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.created_at, u.is_guest, u.guest_expires_at, u.language, u.plan, u.is_admin,
         (SELECT count(*) FROM projects p WHERE p.user_id = u.id) AS projects,
         (SELECT count(*) FROM notes n WHERE n.user_id = u.id) AS notes,
         (SELECT count(*) FROM documents d WHERE d.user_id = u.id) AS documents,
         (SELECT count(*) FROM files f WHERE f.user_id = u.id) AS files,
         (SELECT coalesce(sum(size),0) FROM files f WHERE f.user_id = u.id) AS storage_bytes,
         (SELECT count(*) FROM api_keys k WHERE k.user_id = u.id) AS api_keys
       FROM users u WHERE u.id = $1`, [seg[2]]);
    if (!rows[0]) return json({ error: 'Usuario no encontrado.' }, 404);
    return json({ success: true, status: 200, data: { item: adminUserItem(rows[0], env) }, error: null });
  }

  return json({ error: 'Ruta de administración no encontrada.' }, 404);
});

// Da forma a un usuario para el panel de administración (plan, estado, conteos).
// NUNCA incluye credenciales ni el hash de contraseña.
function adminUserItem(r, env) {
  const admin = rowIsAdmin(r, env);
  const plan = admin ? 'unlimited' : (r.plan || 'free');
  const bytes = Number(r.storage_bytes) || 0;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: admin ? 'admin' : 'user',
    is_admin: admin,
    is_guest: !!r.is_guest,
    guest_expires_at: toISO(r.guest_expires_at),
    language: r.language || 'es',
    plan,
    plan_label: admin ? 'Sin límites' : (r.is_guest ? 'Invitado' : (plan === 'free' ? 'Gratis' : plan)),
    status: r.is_guest ? 'invitado' : 'activo',
    stats: {
      projects: Number(r.projects) || 0,
      notes: Number(r.notes) || 0,
      documents: Number(r.documents) || 0,
      files: Number(r.files) || 0,
      api_keys: Number(r.api_keys) || 0,
      storage: { bytes, formatted: fmtBytes(bytes) }
    },
    created_at: toISO(r.created_at)
  };
}
