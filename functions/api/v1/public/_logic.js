/* ==========================================================================
   public — lo que ve cualquiera con un enlace compartido (sin cuenta).
     GET /public/shares/:token            → datos del archivo (sin proyecto ni ids)
     GET /public/shares/:token/preview    → vista previa en línea (imagen, audio, video, PDF, texto)
                                            ?cover=1 → portada de la canción
     GET /public/shares/:token/download   → descarga
     POST /public/shares/:token/report    → reportar el enlace { reason, details, email? }
                                            reason: copyright | illegal | other
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { getObject } from '../../../_shared/storage.js';
import { fileHeaders, serverError, rateLimit, clientIp } from '../../../_shared/security.js';
import { publicShare, publicView, previewKind } from '../../../_shared/shares.js';
import { adminEmails } from '../../../_shared/api.js';
import { body } from '../../../_shared/util.js';
import { validateReport, createReport, adminIds, REPORT_REASONS } from '../../../_shared/movies.js';
import { notifySafe } from '../../../_shared/notify.js';

const NOT_FOUND = { error: 'Este enlace no existe o ya no está disponible.' };
const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };

export async function handle({ request, env }) {
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/api\/v1\/public\/?/, '').split('/').filter(Boolean);   // ['shares', token, sub?]
  if (seg[0] !== 'shares' || !seg[1] || seg.length > 3) return json({ error: 'Ruta no encontrada.' }, 404);
  const sub = seg[2] || '';
  if (request.method === 'POST' && sub === 'report') return report(request, env, seg[1]);
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Método no permitido.' }, 405);
  try {
    const db = getDb(env);
    const range = request.headers.get('Range');
    const count = !sub ? 'views' : (sub === 'download' && (!range || /^bytes=0-/.test(range)) ? 'downloads' : null);
    // Cada visitante cuenta una vez por hora y enlace (solo enlaces que existen):
    // las cifras no se pueden inflar.
    const once = async () => (await rateLimit(db, 'share-' + count + ':' + seg[1] + ':' + clientIp(request), 1, 3600)).ok;
    const r = await publicShare(db, seg[1], count, once);
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

/* Reportar un enlace (cualquiera, sin cuenta). Se guarda para el administrador
   y se le avisa; el dueño no ve quién reportó. Límite: 5 por hora y conexión. */
async function report(request, env, token) {
  try {
    const db = getDb(env);
    const rl = await rateLimit(db, 'share-report:' + clientIp(request), 5, 3600);
    if (!rl.ok) return json({ error: 'Ya enviaste varios reportes. Inténtalo más tarde.' }, 429, { 'Retry-After': String(rl.retryAfter) });
    const r = await publicShare(db, token, null);
    if (!r) return json(NOT_FOUND, 404, PRIVATE);
    const v = validateReport(await body(request));
    if (v.error) return json({ error: v.error }, 400, PRIVATE);
    await createReport(db, r, v.values, clientIp(request));
    for (const id of await adminIds(db, adminEmails(env))) {
      await notifySafe(db, id, {
        type: 'warning', title: 'Nuevo reporte: ' + (REPORT_REASONS[v.values.reason] || 'reporte'),
        body: 'Reportaron el archivo «' + String(r.name || '').slice(0, 80) + '». Revísalo en Configuración → Moderación.',
        link: '/settings', dedupe: 'report:' + token + ':' + new Date().toISOString().slice(0, 13)
      });
    }
    return json({ ok: true, message: 'Gracias. Revisaremos el reporte.' }, 201, PRIVATE);
  } catch (e) {
    return json({ error: 'Error del servidor (código ' + serverError(e, 'share-report') + ').' }, 500);
  }
}
