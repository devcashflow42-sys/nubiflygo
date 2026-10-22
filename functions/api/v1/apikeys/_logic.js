/* apikeys — claves API del usuario. GET/POST /apikeys, DELETE /apikeys/:id,
   DELETE /apikeys/:id/usage (reinicia el contador de uso).
   GET devuelve en cada clave su uso real: { month: {ok, err}, today: {ok, err},
   days: [{ date, ok, err } × 7] } (días UTC, el último es hoy).
   Las claves permiten llamar a la API desde apps externas (cabecera
   Authorization: Bearer sk_... o X-API-Key). No disponibles para invitados.
   Seguridad: este servicio solo responde a la app con tu sesión; una API key
   no puede ver, crear ni borrar claves (ver keyPolicy en api.js). */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { dataRoute, ensureUsageTable, ownsProject, GUEST_KEY_ERROR } from '../../../_shared/api.js';
import { ensureSecurityColumns } from '../../../_shared/security.js';
import { UUID_RE, body } from '../../../_shared/util.js';

export const handle = dataRoute(async ({ seg, request, env, method, user }) => {
  const db = getDb(env);
  await ensureSecurityColumns(db);
  const id = seg[1];

  if (!id) {
    if (method === 'GET') {
      const { rows } = await db.query(
        'SELECT id, name, value, permission, project_id, created_at, last_used, expires_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC', [user.id]);
      const { today, byKey } = await usageOf(db, user.id);
      const items = rows.map(k => ({ ...k, usage: summarize(byKey.get(k.id) || [], today) }));
      return json({ items, today });
    }
    if (method === 'POST') {
      if (user.isGuest) return json({ error: GUEST_KEY_ERROR }, 403);
      const b = await body(request);
      const name = String(b.name || 'Clave').slice(0, 80);
      // Permisos admitidos: 'all', 'write' (escritura restringida de la app) y 'read'.
      const permission = b.permission == null || b.permission === '' ? 'all' : String(b.permission);
      if (!['all', 'write', 'read'].includes(permission)) return json({ error: 'Permiso no válido (usa "all", "write" o "read").' }, 400);
      // Vencimiento: días (7, 30, 60, 90, 180, 365 o 730) o sin vencimiento.
      const days = b.expires_in_days == null || b.expires_in_days === '' ? null : Number(b.expires_in_days);
      if (days !== null && ![7, 30, 60, 90, 180, 365, 730].includes(days)) return json({ error: 'Vencimiento no válido.' }, 400);
      const projectId = b.project_id && UUID_RE.test(b.project_id) ? b.project_id : null;
      if (projectId && !(await ownsProject(db, user.id, projectId))) return json({ error: 'Proyecto no encontrado.' }, 404);
      const { rows: cnt } = await db.query('SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1', [user.id]);
      if (((cnt[0] && cnt[0].n) || 0) >= 50) return json({ error: 'Llegaste al máximo de 50 claves. Borra alguna que ya no uses.' }, 403);
      const value = 'sk_' + [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 40);
      const { rows } = await db.query(
        `INSERT INTO api_keys (user_id, project_id, name, value, permission, expires_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
         RETURNING id, name, value, permission, project_id, created_at, last_used, expires_at`,
        [user.id, projectId, name, value, permission, days]);
      try { await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [user.id, 'apikey', 'Clave API creada: ' + name]); } catch {}
      return json({ item: rows[0] }, 201);
    }
    return json({ error: 'Método no permitido.' }, 405);
  }

  if (!UUID_RE.test(id)) return json({ error: 'Id no válido.' }, 400);
  if (seg[2] === 'usage' && method === 'DELETE') {
    const own = await db.query('SELECT 1 FROM api_keys WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!own.rows.length) return json({ error: 'No encontrada.' }, 404);
    await ensureUsageTable(db);
    await db.query('DELETE FROM api_key_usage WHERE key_id = $1', [id]);
    return json({ ok: true });
  }
  if (method === 'DELETE' && !seg[2]) {
    const { rowCount } = await db.query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [id, user.id]);
    return rowCount ? json({ ok: true }) : json({ error: 'No encontrada.' }, 404);
  }
  return json({ error: 'Método no permitido.' }, 405);
});

/* ---------------- Uso real por clave ---------------- */

// Filas de uso del mes en curso y de los últimos 7 días (lo que sea más antiguo).
async function usageOf(db, userId) {
  await ensureUsageTable(db);
  const { rows } = await db.query(
    `WITH t AS (SELECT (now() AT TIME ZONE 'UTC')::date AS d)
     SELECT u.key_id, to_char(u.day, 'YYYY-MM-DD') AS day, u.ok, u.err, to_char(t.d, 'YYYY-MM-DD') AS today
     FROM api_key_usage u JOIN api_keys k ON k.id = u.key_id, t
     WHERE k.user_id = $1 AND u.day >= LEAST(date_trunc('month', t.d)::date, t.d - 6)`, [userId]);
  let today = rows[0] && rows[0].today;
  if (!today) {
    const r = await db.query("SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS today");
    today = r.rows[0].today;
  }
  const byKey = new Map();
  for (const r of rows) {
    if (!byKey.has(r.key_id)) byKey.set(r.key_id, []);
    byKey.get(r.key_id).push({ day: r.day, ok: Number(r.ok) || 0, err: Number(r.err) || 0 });
  }
  return { today, byKey };
}

// Resume las filas de una clave: total del mes, hoy y los 7 días (el último es hoy).
function summarize(list, today) {
  const map = new Map(list.map(r => [r.day, r]));
  const base = Date.parse(today + 'T00:00:00Z');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(base - i * 86400000).toISOString().slice(0, 10);
    const r = map.get(date);
    days.push({ date, ok: r ? r.ok : 0, err: r ? r.err : 0 });
  }
  const month = today.slice(0, 7);
  const m = { ok: 0, err: 0 };
  for (const r of list) if (r.day.slice(0, 7) === month) { m.ok += r.ok; m.err += r.err; }
  const t = map.get(today) || { ok: 0, err: 0 };
  return { month: m, today: { ok: t.ok, err: t.err }, days };
}

