/* ==========================================================================
   app — estado público de la app Android (sin sesión).
     GET /app/status?build=12&version=1.4.0   (o cabeceras X-App-Build / X-App-Version)
   Devuelve versión publicada, URL de descarga, mantenimiento y suspensión.
   update.available / update.mandatory se calculan con la compilación enviada.
   Siempre la configuración vigente (sin caché).
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { publicRoute } from '../../../_shared/api.js';
import { rateLimit, tooMany, clientIp } from '../../../_shared/security.js';
import { readConfig, buildStatus, clientInfo } from '../../../_shared/appcontrol.js';

export const handle = publicRoute(async ({ request, env, method }) => {
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/api\/v1\/app\/?/, '').split('/').filter(Boolean);
  if (seg.length !== 1 || seg[0] !== 'status') return json({ success: false, error: 'Ruta no encontrada.' }, 404);
  if (method !== 'GET' && method !== 'HEAD') return json({ success: false, error: 'Método no permitido.' }, 405, { Allow: 'GET, HEAD' });
  const db = getDb(env);
  // 120 consultas por minuto por IP: de sobra para consultas periódicas.
  const rl = await rateLimit(db, 'app-status:' + clientIp(request), 120, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const client = clientInfo((k) => url.searchParams.get(k) || request.headers.get(k));
  const row = await readConfig(db);
  return json(buildStatus(row, client), 200, { 'Cache-Control': 'no-store', 'Vary': 'X-App-Build, X-App-Version' });
});
