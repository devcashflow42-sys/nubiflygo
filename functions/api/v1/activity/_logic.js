/* activity — actividad reciente del usuario. GET /activity */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { dataRoute } from '../../../_shared/api.js';

export const handle = dataRoute(async ({ env, method, user }) => {
  if (method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  const { rows } = await getDb(env).query(
    'SELECT id, kind, text, created_at FROM activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40', [user.id]);
  return json({ items: rows });
});
