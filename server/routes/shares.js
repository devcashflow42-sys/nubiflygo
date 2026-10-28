/* ==========================================================================
   routes/shares.js — Enlaces para compartir un archivo (igual que en functions/).
     POST /shares { file_id, expires_in_days? } · GET /shares/:token · DELETE /shares/:token
   routes/shares.js también exporta publicShares (sin sesión):
     GET /public/shares/:token · /preview (?cover=1) · /download
     POST /public/shares/:token/report { reason, details, email? }
   routes/shares.js también exporta adminReports (moderación, solo el admin):
     GET /admin/reports?status= · POST /admin/reports/:id/remove | dismiss
   ========================================================================== */

import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { getObject } from '../storage.js';
import { fileHeaders, rateLimit, clientIp, tooMany, isAdminEmail, secLog } from '../security.js';
import { notifySafe } from '../notify.js';
import {
  needsRights, hasRights, recordRights, RIGHTS_ERROR, TAKEDOWN_ERROR,
  validateReport, createReport, adminIds, REPORT_REASONS, listReports, resolveReport
} from '../../functions/_shared/movies.js';
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
    // Videos y música: declaración de derechos de autor (una vez por archivo; no se borra).
    const { rows: f } = await query('SELECT name, mime, size FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [b.file_id, req.user.id]);
    if (!f[0]) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const askRights = needsRights(f[0].mime, f[0].name) && !(await hasRights(db, req.user.id, b.file_id));
    if (askRights && b.accept_rights !== true) return res.status(400).json({ error: RIGHTS_ERROR, code: 'rights_required' });
    const r = await createShare(db, req.user.id, b.file_id, days);
    if (!r) return res.status(404).json({ error: 'Archivo no encontrado.' });
    if (r.takenDown) return res.status(403).json({ error: TAKEDOWN_ERROR, code: 'taken_down' });
    if (askRights) await recordRights(db, { userId: req.user.id, email: req.user.email, fileId: b.file_id, fileName: f[0].name, fileSize: f[0].size, context: 'share', ip: clientIp(req), userAgent: req.get('User-Agent') });
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

// Reportar un enlace (sin cuenta). 5 por hora y conexión.
publicShares.post('/shares/:token/report', async (req, res, next) => {
  try {
    const rl = await rateLimit('share-report:' + clientIp(req), 5, 3600);
    if (!rl.ok) return res.status(429).set('Retry-After', String(rl.retryAfter)).json({ error: 'Ya enviaste varios reportes. Inténtalo más tarde.' });
    const r = await publicShare(db, req.params.token, null);
    if (!r) return res.status(404).json(NOT_FOUND);
    const v = validateReport(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    await createReport(db, r, v.values, clientIp(req));
    const emails = String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim()).filter(Boolean);
    for (const id of await adminIds(db, emails)) {
      await notifySafe(db, id, {
        type: 'warning', title: 'Nuevo reporte: ' + (REPORT_REASONS[v.values.reason] || 'reporte'),
        body: 'Reportaron el archivo «' + String(r.name || '').slice(0, 80) + '». Revísalo en Configuración → Moderación.',
        link: '/settings', dedupe: 'report:' + req.params.token + ':' + new Date().toISOString().slice(0, 13)
      });
    }
    res.status(201).json({ ok: true, message: 'Gracias. Revisaremos el reporte.' });
  } catch (e) { next(e); }
});

/* ─── Moderación (solo el administrador, con sesión) ─── */
export const adminReports = Router();
adminReports.use(requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT email, is_admin FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !(rows[0].is_admin || isAdminEmail(rows[0].email))) return res.status(403).json({ error: 'Acceso solo para el administrador.' });
    const rl = await rateLimit('admin-reports:' + req.user.id, 120, 60);
    if (!rl.ok) return tooMany(res, rl.retryAfter);
    next();
  } catch (e) { next(e); }
});
adminReports.get('/', async (req, res, next) => {
  try { res.json({ success: true, items: await listReports(db, String(req.query.status || 'open'), Number(req.query.limit) || 50) }); } catch (e) { next(e); }
});
adminReports.post('/:id/:action(remove|dismiss)', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Reporte no encontrado.' });
    const r = await resolveReport(db, req.params.id, req.user.id, req.params.action);
    if (!r) return res.status(404).json({ error: 'Reporte no encontrado.' });
    secLog('admin_report_' + req.params.action, req, { admin: req.user.id, report: req.params.id });
    if (r.action === 'remove' && r.owner_id) {
      await notifySafe(db, r.owner_id, {
        type: 'warning', title: 'Un archivo tuyo fue dado de baja',
        body: 'Recibimos un reporte sobre «' + String(r.file_name || 'tu archivo').slice(0, 80) + '». Se desactivaron sus enlaces y ya no se puede compartir ni publicar. El archivo sigue en tu cuenta.',
        link: '/archive'
      });
    }
    res.json({ success: true, action: r.action });
  } catch (e) { next(e); }
});
