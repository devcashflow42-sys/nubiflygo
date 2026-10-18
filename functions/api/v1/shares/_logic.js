/* ==========================================================================
   shares — enlaces para compartir un archivo (el dueño, con sesión o API key).
     POST   /shares          { file_id, expires_in_days? } → crea (o devuelve) el enlace
     GET    /shares/:token   → datos del enlace (visitas, descargas…)
     DELETE /shares/:token   → deja de compartir
   La página pública es /s/:token (ver /api/v1/public/shares/:token).
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json, publicOrigin } from '../../../_shared/http.js';
import { dataRoute } from '../../../_shared/api.js';
import { body, UUID_RE } from '../../../_shared/util.js';
import { createShare, ownShare, deleteShare, ownerView } from '../../../_shared/shares.js';

export const handle = dataRoute(async ({ seg, request, env, method, user }) => {
  const db = getDb(env);
  const origin = publicOrigin(env, request);

  if (!seg[1] && method === 'POST') {
    const b = await body(request);
    if (!UUID_RE.test(String(b.file_id || ''))) return json({ error: 'Indica el archivo (file_id).' }, 400);
    const days = b.expires_in_days == null || b.expires_in_days === '' ? null : Math.round(Number(b.expires_in_days));
    if (days !== null && !(days >= 1 && days <= 365)) return json({ error: 'expires_in_days debe estar entre 1 y 365.' }, 400);
    const r = await createShare(db, user.id, b.file_id, days);
    if (!r) return json({ error: 'Archivo no encontrado.' }, 404);
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
