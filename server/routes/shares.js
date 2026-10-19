/* ==========================================================================
   routes/shares.js — Enlaces para compartir un archivo (igual que en functions/).
     POST /shares { file_id, expires_in_days? } · GET /shares/:token · DELETE /shares/:token
   routes/shares.js también exporta publicShares (sin sesión):
     GET /public/shares/:token · /preview (?cover=1) · /download
   ========================================================================== */

import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { getObject } from '../storage.js';
import { fileHeaders, rateLimit, clientIp } from '../security.js';
import { createShare, ownShare, deleteShare, ownerView, publicShare, publicView, previewKind } from '../shares.js';

const db = { query };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Enlaces públicos con el dominio oficial (APP_URL lo cambia; en local, el propio servidor).
// Copia de functions/_shared/http.js → publicOrigin (misma lógica).
const CANONICAL_ORIGIN = 'https://nubiflygo.com';
const originOf = (req) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(req.hostname) ? (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host') : CANONICAL_ORIGIN;
};

export const shares = Router();
shares.use(requireAuth);

shares.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!UUID_RE.test(String(b.file_id || ''))) return res.status(400).json({ error: 'Indica el archivo (file_id).' });
    const days = b.expires_in_days == null || b.expires_in_days === '' ? null : Math.round(Number(b.expires_in_days));
    if (days !== null && !(days >= 1 && days <= 365)) return res.status(400).json({ error: 'expires_in_days debe estar entre 1 y 365.' });
    const r = await createShare(db, req.user.id, b.file_id, days);
    if (!r) return res.status(404).json({ error: 'Archivo no encontrado.' });
    res.status(r.created ? 201 : 200).json({ share: ownerView(r.row, originOf(req)), created: r.created });
  } catch (e) { next(e); }
});

shares.get('/:token', async (req, res, next) => {
  try {
    const r = await ownShare(db, req.user.id, req.params.token);
    r ? res.json({ share: ownerView(r, originOf(req)) }) : res.status(404).json({ error: 'Enlace no encontrado.' });
  } catch (e) { next(e); }
});

shares.delete('/:token', async (req, res, next) => {
  try {
    (await deleteShare(db, req.user.id, req.params.token)) ? res.json({ ok: true }) : res.status(404).json({ error: 'Enlace no encontrado.' });
  } catch (e) { next(e); }
});

/* ─── Público (sin sesión) ─── */
export const publicShares = Router();
const NOT_FOUND = { error: 'Este enlace no existe o ya no está disponible.' };
// Cada visitante cuenta una vez por hora y enlace (solo enlaces que existen):
// las cifras no se pueden inflar.
const once = (req, what) => async () => (await rateLimit('share-' + what + ':' + req.params.token + ':' + clientIp(req), 1, 3600)).ok;
publicShares.use((req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' }); next(); });

publicShares.get('/shares/:token', async (req, res, next) => {
  try {
    const r = await publicShare(db, req.params.token, 'views', once(req, 'views'));
    r ? res.json(publicView(r)) : res.status(404).json(NOT_FOUND);
  } catch (e) { next(e); }
});

for (const sub of ['preview', 'download']) {
  publicShares.get('/shares/:token/' + sub, async (req, res, next) => {
    try {
      const r = await publicShare(db, req.params.token, sub === 'download' ? 'downloads' : null, once(req, 'downloads'));
      if (!r) return res.status(404).json(NOT_FOUND);
      if (sub === 'preview' && req.query.cover === '1') {
        const meta = r.meta || {};
        if (!meta.thumb_key) return res.status(404).json({ error: 'Sin portada.' });
        const obj = await getObject(meta.thumb_key);
        res.set({ 'Content-Type': /^image\/(jpeg|png|webp)$/.test(meta.thumb_mime || '') ? meta.thumb_mime : 'image/jpeg', 'X-Content-Type-Options': 'nosniff' });
        return obj.stream.pipe(res);
      }
      if (sub === 'preview' && !previewKind(r.mime, r.name)) return res.status(415).json({ error: 'Este tipo de archivo no tiene vista previa. Descárgalo.' });
      const obj = await getObject(r.storage_key);
      res.set(fileHeaders(r.name, r.mime || obj.contentType, sub === 'preview'));
      if (r.size) res.set('Content-Length', String(r.size));
      obj.stream.pipe(res);
    } catch (e) { next(e); }
  });
}
