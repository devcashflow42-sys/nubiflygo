/* ==========================================================================
   public — lo que ve cualquiera con un enlace compartido (sin cuenta).
     GET /public/shares/:token            → datos del archivo (sin proyecto ni ids)
     GET /public/shares/:token/preview    → vista previa en línea (imagen, audio, video, PDF, texto)
                                            ?cover=1 → portada de la canción
     GET /public/shares/:token/download   → descarga
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { getObject } from '../../../_shared/storage.js';
import { fileHeaders, serverError } from '../../../_shared/security.js';
import { publicShare, publicView, previewKind } from '../../../_shared/shares.js';

const NOT_FOUND = { error: 'Este enlace no existe o ya no está disponible.' };
const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

export async function handle({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Método no permitido.' }, 405);
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/api\/v1\/public\/?/, '').split('/').filter(Boolean);   // ['shares', token, sub?]
  if (seg[0] !== 'shares' || !seg[1] || seg.length > 3) return json({ error: 'Ruta no encontrada.' }, 404);
  const sub = seg[2] || '';
  try {
    const db = getDb(env);
    const range = request.headers.get('Range');
    const r = await publicShare(db, seg[1], !sub ? 'views' : (sub === 'download' && (!range || /^bytes=0-/.test(range)) ? 'downloads' : null));
    if (!r) return json(NOT_FOUND, 404, PRIVATE);

    if (!sub) return json(publicView(r), 200, PRIVATE);

    if (sub === 'preview' && url.searchParams.get('cover') === '1') {
      const meta = r.meta || {};
      if (!meta.thumb_key) return json({ error: 'Sin portada.' }, 404, PRIVATE);
      const res = await getObject(env, meta.thumb_key);
      const m = /^image\/(jpeg|png|webp)$/.test(meta.thumb_mime || '') ? meta.thumb_mime : 'image/jpeg';
      return new Response(res.body, { headers: { 'Content-Type': m, 'X-Content-Type-Options': 'nosniff', ...PRIVATE } });
    }
    if (sub === 'preview' || sub === 'download') {
      const inline = sub === 'preview';
      if (inline && !previewKind(r.mime, r.name)) return json({ error: 'Este tipo de archivo no tiene vista previa. Descárgalo.' }, 415, PRIVATE);
      const res = await getObject(env, r.storage_key, range ? { Range: range } : undefined);
      const headers = { ...fileHeaders(r.name, r.mime, inline), ...PRIVATE, 'Accept-Ranges': 'bytes' };
      for (const h of ['Content-Length', 'Content-Range']) { const v = res.headers.get(h); if (v) headers[h] = v; }
      return new Response(request.method === 'HEAD' ? null : res.body, { status: res.status === 206 ? 206 : 200, headers });
    }
    return json({ error: 'Ruta no encontrada.' }, 404);
  } catch (e) {
    return json({ error: 'Error del servidor (código ' + serverError(e, 'public-share') + ').' }, 500);
  }
}
