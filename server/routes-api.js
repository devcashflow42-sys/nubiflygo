/* ==========================================================================
   routes-api.js — Router de la API bajo /api/v1
   Monta: cuenta, proyectos, notas, documentos, archivos, claves API,
   actividad, notificaciones y estado. Todo lo de datos exige sesión (cookie httpOnly).
   ========================================================================== */

import { Router } from 'express';
import { ping } from './db.js';
import { requireAuth, readSession } from './auth.js';
import { config, checkConfig } from './config.js';
import { account } from './routes/account.js';
import { files } from './routes/files.js';
import { apikeys } from './routes/apikeys.js';
import { trash } from './routes/trash.js';
import { ensureTrashColumns } from './trash.js';
import { crudRouter } from './routes/crud.js';
import { projects } from './routes/projects.js';
import { notifications } from './routes/notifications.js';
import { billing } from './routes/billing.js';
import { shares, publicShares, adminReports } from './routes/shares.js';
import { appPublic, appAdmin, androidGate } from './routes/app.js';

export const api = Router();

// Estado del servidor. Sin sesión solo dice si funciona; los detalles
// (base de datos, almacenamiento, variables que faltan) solo para el admin.
api.get('/health', async (req, res) => {
  const db = await ping();
  const status = db ? 'ok' : 'error';
  const s = readSession(req);
  const admins = String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const admin = !!(s && admins.includes(String(s.email || '').toLowerCase()));
  if (!admin) return res.status(db ? 200 : 503).json({ status });
  res.status(db ? 200 : 503).json({ service: 'nubiflygo', status, version: 'v1', db, storage: config.storageProvider, missingConfig: checkConfig() });
});

// Las columnas de la papelera se crean solas una vez; de aquí para abajo TODA
// lectura filtra por deleted_at.
api.use((_req, _res, next) => { ensureTrashColumns().then(() => next(), next); });

// App Android: bloqueo en el servidor (suspensión, mantenimiento, versión mínima),
// estado público y administración.
api.use(androidGate);
api.use('/app', appPublic);
api.use('/admin/app', appAdmin);
api.use('/admin/reports', adminReports);

// Cuenta
api.use('/account', account);

// Recursos del usuario (CRUD)
api.use('/projects',  projects);   // información completa, elementos y borrado masivo
api.use('/notes',     crudRouter('notes',     ['title', 'body', 'project_id']));
api.use('/documents', crudRouter('documents', ['title', 'content', 'project_id']));

// Archivos y claves API (lógica propia)
api.use('/files', files);
api.use('/apikeys', apikeys);

// Papelera: lo borrado se guarda 30 días y se puede restaurar
api.use('/trash', trash);

// Notificaciones (seguridad, suscripción, abuso, novedades)
api.use('/notifications', notifications);

// Suscripción con Mercado Pago (incluye el webhook público)
api.use('/billing', billing);

// Enlaces para compartir archivos (dueño) y su lado público (sin sesión)
api.use('/shares', shares);
api.use('/public', publicShares);

// Actividad reciente (solo lectura)
api.get('/activity', requireAuth, async (req, res, next) => {
  try {
    const { query } = await import('./db.js');
    const { rows } = await query(
      'SELECT id, kind, text, created_at FROM activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40',
      [req.user.id]);
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// Cualquier otra ruta de API.
api.use((_req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }));
