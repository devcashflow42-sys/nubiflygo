/* ==========================================================================
   shares — enlaces para compartir un archivo (el dueño, con sesión o API key).
     POST   /shares          { file_id, expires_in_days?, accept_rights? } → crea (o devuelve) el enlace
                             (videos y música: accept_rights = true la primera vez)
     GET    /shares/:token   → datos del enlace (visitas, descargas…)
     DELETE /shares/:token   → deja de compartir
   La página pública es /s/:token (ver /api/v1/public/shares/:token).
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json, publicOrigin } from '../../../_shared/http.js';
import { dataRoute } from '../../../_shared/api.js';
import { body, UUID_RE } from '../../../_shared/util.js';
import { clientIp } from '../../../_shared/security.js';
import { needsRights, hasRights, recordRights, RIGHTS_ERROR, TAKEDOWN_ERROR } from '../../../_shared/movies.js';
import { createShare, ownShare, deleteShare, ownerView } from '../../../_shared/shares.js';

export const handle = dataRoute(async ({ seg, request, env, method, user }) => {
  const db = getDb(env);
  const origin = publicOrigin(env, request);

  if (!seg[1] && method === 'POST') {
    const b = await body(request);
    if (!UUID_RE.test(String(b.file_id || ''))) return json({ error: 'Indica el archivo (file_id).' }, 400);
    const days = b.expires_in_days == null || b.expires_in_days === '' ? null : Math.round(Number(b.expires_in_days));
    if (days !== null && !(days >= 1 && days <= 365)) return json({ error: 'expires_in_days debe estar entre 1 y 365.' }, 400);
    // Videos y música: declaración de derechos de autor (una vez por archivo; no se borra).
    const { rows: f } = await db.query('SELECT name, mime, size FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [b.file_id, user.id]);
    if (!f[0]) return json({ error: 'Archivo no encontrado.' }, 404);
    const askRights = needsRights(f[0].mime, f[0].name) && !(await hasRights(db, user.id, b.file_id));
    if (askRights && b.accept_rights !== true) return json({ error: RIGHTS_ERROR, code: 'rights_required' }, 400);
    const r = await createShare(db, user.id, b.file_id, days);
    if (!r) return json({ error: 'Archivo no encontrado.' }, 404);
    if (r.takenDown) return json({ error: TAKEDOWN_ERROR, code: 'taken_down' }, 403);
    if (askRights) await recordRights(db, { userId: user.id, email: user.email, fileId: b.file_id, fileName: f[0].name, fileSize: f[0].size, context: 'share', ip: clientIp(request), userAgent: request.headers.get('User-Agent') });
    return json({ share: ownerView(r.row, origin), created: r.created }, r.created ? 201 : 200);
  }

  if (seg[1] && !seg[2]) {
    if (method === 'GET') {
      const r = await ownShare(db, user.id, seg[1]);
      return r ? json({ share: ownerView(r, origin) }) : json({ error: 'Enlace no encontrado.' }, 404);
    }
    if (method === 'DELETE') {
      return (await deleteShare(db, user.id, seg[1])) ? json({ ok: true }) : json({ error: 'Enlace no encontrado.' }, 404);
    }
  }
  return json({ error: 'Ruta no encontrada.' }, 404);
});
