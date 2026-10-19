/* ==========================================================================
   routes/app.js — Control de la app Android (igual que en functions/).
     GET /api/v1/app/status            → público: versión, descarga, mantenimiento, suspensión
     GET /api/v1/admin/app             → admin: configuración + historial reciente
     GET /api/v1/admin/app/audit       → admin: historial
     PUT /api/v1/admin/app/update | maintenance | suspension → admin
   La lógica vive en functions/_shared/appcontrol.js (módulo puro compartido).
   ========================================================================== */
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { rateLimit, tooMany, clientIp, isAdminEmail, secLog } from '../security.js';
import {
  readConfig, buildStatus, clientInfo, adminView, readAudit, saveSection,
  validateUpdate, validateMaintenance, validateSuspension, appGateFor, resetAppGateCache
} from '../../functions/_shared/appcontrol.js';

const db = { query };

export const appPublic = Router();
appPublic.get('/status', async (req, res, next) => {
  try {
    const rl = await rateLimit('app-status:' + clientIp(req), 120, 60);
    if (!rl.ok) return tooMany(res, rl.retryAfter);
    const client = clientInfo((k) => (req.query[k] != null ? String(req.query[k]) : req.get(k)));
    res.set({ 'Cache-Control': 'no-store', Vary: 'X-App-Build, X-App-Version' });
    res.json(buildStatus(await readConfig(db), client));
  } catch (e) { next(e); }
});

// Solo el administrador (correo de ADMIN_EMAILS o columna is_admin), con sesión.
async function requireAdmin(req, res, next) {
  try {
    const { rows } = await query('SELECT email, is_admin FROM users WHERE id = $1', [req.user.id]);
    const r = rows[0];
    if (!r || !(r.is_admin || isAdminEmail(r.email))) return res.status(403).json({ success: false, error: 'Acceso solo para el administrador.' });
    req.adminEmail = r.email;
    const rl = await rateLimit('admin-app:' + req.user.id, 60, 60);
    if (!rl.ok) return tooMany(res, rl.retryAfter);
    next();
  } catch (e) { next(e); }
}

export const appAdmin = Router();
appAdmin.use(requireAuth, requireAdmin);
appAdmin.get('/', async (_req, res, next) => {
  try { res.json({ success: true, config: adminView(await readConfig(db)), audit: await readAudit(db, 20) }); } catch (e) { next(e); }
});
appAdmin.get('/audit', async (req, res, next) => {
  try { res.json({ success: true, items: await readAudit(db, Number(req.query.limit) || 50) }); } catch (e) { next(e); }
});
const V = { update: validateUpdate, maintenance: validateMaintenance, suspension: validateSuspension };
appAdmin.put('/:section(update|maintenance|suspension)', async (req, res, next) => {
  try {
    const section = req.params.section;
    const v = V[section](req.body, await readConfig(db));
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    const row = await saveSection(db, section, v.values, { id: req.user.id, email: req.adminEmail, ip: clientIp(req) });
    resetAppGateCache();
    secLog('admin_app_' + section, req, { admin: req.user.id });
    res.json({ success: true, section, config: adminView(row) });
  } catch (e) { next(e); }
});

// Bloqueo en el servidor para la app Android (suspensión, mantenimiento, versión mínima).
export async function androidGate(req, res, next) {
  try {
    const path = req.originalUrl.split('?')[0];
    const hit = await appGateFor(db, path, (k) => (k === 'build' || k === 'version' ? req.query[k] : req.get(k)));
    if (!hit) return next();
    if (hit.status === 503) res.set('Retry-After', '300');
    res.set('Cache-Control', 'no-store').status(hit.status).json(Object.assign({ success: false }, hit.body));
  } catch (e) { next(e); }
}
