/* health — estado del servicio. Sin sesión solo dice si funciona (sin
   detalles internos: ni errores de la base ni variables que faltan). Los
   detalles solo los ve el administrador con su sesión en la app. */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { publicRoute, storageReady, missingConfig, authenticate, rowIsAdmin } from '../../../_shared/api.js';
import { serverError } from '../../../_shared/security.js';

export const handle = publicRoute(async ({ request, env }) => {
  let db = false, ref = null;
  try { await getDb(env).query('SELECT 1'); db = true; }
  catch (e) { ref = serverError(e, 'health'); }
  const status = db ? 'ok' : 'error';
  let admin = false;
  try {
    const auth = await authenticate(request, env);
    if (auth && !auth.viaKey) {
      const { rows } = await getDb(env).query('SELECT email, is_admin FROM users WHERE id = $1', [auth.user.id]);
      admin = rowIsAdmin(rows[0], env);
    }
  } catch {}
  if (!admin) return json({ status }, db ? 200 : 503);
  return json({ service: 'nubiflygo', status, version: 'v1', db, error_ref: ref, storage: storageReady(env), missingConfig: missingConfig(env) }, db ? 200 : 503);
});
