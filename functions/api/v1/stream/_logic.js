/* ==========================================================================
   stream — Cambios en tiempo real (Server-Sent Events).
     GET /api/v1/stream   (cookie de sesión o API key)
   Mantiene la conexión abierta ~25 s y revisa cada 2 s una "firma" barata de
   los datos del usuario (cantidad + última modificación por colección). Cuando
   algo cambia envía:  event: change  data: {"projects":"…","files":"…",…}
   Al cerrar, el navegador (EventSource) se reconecta solo con "retry". Así
   funciona en Cloudflare Pages sin servicios extra.
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json, CORS } from '../../../_shared/http.js';
import { dataRoute } from '../../../_shared/api.js';
import { serverError } from '../../../_shared/security.js';
import { ensureNotifications } from '../../../_shared/notify.js';

const TICK_MS = 2000;
const LIFE_MS = 25000;

// Una sola consulta: "cantidad.última-modificación" por colección.
const SIG_SQL = `SELECT
  (SELECT count(*) || '.' || coalesce(extract(epoch FROM max(updated_at))::text, '') FROM projects  WHERE user_id = $1) AS projects,
  (SELECT count(*) || '.' || coalesce(extract(epoch FROM max(updated_at))::text, '') FROM notes     WHERE user_id = $1) AS notes,
  (SELECT count(*) || '.' || coalesce(extract(epoch FROM max(updated_at))::text, '') FROM documents WHERE user_id = $1) AS documents,
  (SELECT count(*) || '.' || coalesce(extract(epoch FROM max(updated_at))::text, '') FROM files     WHERE user_id = $1) AS files,
  (SELECT count(*) || '.' || coalesce(extract(epoch FROM max(greatest(created_at, coalesce(last_used, created_at))))::text, '') FROM api_keys WHERE user_id = $1) AS apikeys,
  (SELECT count(*) || '.' || coalesce(extract(epoch FROM max(created_at))::text, '') FROM activity  WHERE user_id = $1) AS activity,
  (SELECT count(*) || '.' || count(read_at) || '.' || coalesce(extract(epoch FROM max(created_at))::text, '') FROM notifications WHERE user_id = $1 AND deleted_at IS NULL) AS notifications`;

export async function signature(db, userId) {
  await ensureNotifications(db);
  const { rows } = await db.query(SIG_SQL, [userId]);
  return rows[0] || {};
}

export const handle = dataRoute(async ({ request, env, method, user }) => {
  if (method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  const db = getDb(env);
  const enc = new TextEncoder();
  const signal = request.signal;

  const body = new ReadableStream({
    async start(controller) {
      const send = (txt) => { try { controller.enqueue(enc.encode(txt)); return true; } catch { return false; } };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let last = '';
      const started = Date.now();
      send('retry: 1500\n\n');
      try {
        while (Date.now() - started < LIFE_MS && !(signal && signal.aborted)) {
          const sig = await signature(db, user.id);
          const str = JSON.stringify(sig);
          if (str !== last) {
            if (!send('event: ' + (last ? 'change' : 'hello') + '\ndata: ' + str + '\n\n')) break;
            last = str;
          } else if (!send(': ping\n\n')) break;    // mantiene viva la conexión
          await sleep(TICK_MS);
        }
      } catch (e) {
        send('event: error\ndata: ' + JSON.stringify({ error: 'Error del servidor.', ref: serverError(e, 'stream') }) + '\n\n');
      }
      try { controller.close(); } catch {}
    }
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      ...CORS
    }
  });
});
