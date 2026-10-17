/* ==========================================================================
   routes/billing.js — Suscripción con Mercado Pago (igual que en functions/).
     GET  /billing · POST /billing/checkout · POST /billing/confirm
     POST /billing/cancel · POST /billing/resume · POST /billing/webhook (público)
   ========================================================================== */

import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { secLog } from '../security.js';
import { createCheckout, fetchPayment, applyPayment, verifyWebhookSignature, billingState, setCancel, PLANS } from '../billing.js';
import { notifySafe } from '../notify.js';

export const billing = Router();
const db = { query };
const env = process.env;
const fmtDay = (d) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
const originOf = (req) => (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host');

async function paidNotice(r) {
  if (!r || !r.applied) return;
  await notifySafe(db, r.user_id, {
    type: 'billing', dedupe: 'paid:' + r.user_id + ':' + new Date(r.expires_at).toISOString(),
    title: 'Pago recibido · Plan ' + r.plan_name + ' activo',
    body: '¡Gracias! Tu plan ' + r.plan_name + ' está activo hasta el ' + fmtDay(r.expires_at) + '.',
    link: '/settings'
  });
}

// Aviso de Mercado Pago (sin sesión; se valida la firma y se consulta el pago).
billing.post('/webhook', async (req, res) => {
  try {
    const b = req.body || {};
    const type = b.type || req.query.type || req.query.topic;
    const dataId = (b.data && b.data.id) || req.query['data.id'] || req.query.id;
    if (type !== 'payment' || !dataId) return res.json({ ok: true, ignored: true });
    const okSig = await verifyWebhookSignature(env, req.get('x-signature'), req.get('x-request-id'), req.query['data.id'] || dataId);
    if (!okSig) { secLog('mp_bad_signature', req, {}); return res.status(401).json({ error: 'Firma no válida.' }); }
    if (!env.MP_ACCESS_TOKEN) return res.status(503).json({ error: 'Pagos no configurados.' });
    const payment = await fetchPayment(env, dataId);
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado.' });
    const r = await applyPayment(db, env, payment, null);
    await paidNotice(r);
    res.json({ ok: true, status: r.status || null });
  } catch (e) { console.error('[mercadopago] webhook', e.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

billing.use(requireAuth);

billing.get('/', async (req, res, next) => {
  try { res.json(await billingState(db, env, req.user.id)); } catch (e) { next(e); }
});

// Invitados: no pueden contratar.
billing.use(async (req, res, next) => {
  try {
    const { rows } = await query('SELECT is_guest FROM users WHERE id = $1', [req.user.id]);
    if (rows[0] && rows[0].is_guest) return res.status(403).json({ error: 'Crea una cuenta gratis para contratar un plan.' });
    next();
  } catch (e) { next(e); }
});

billing.post('/checkout', async (req, res, next) => {
  try {
    const plan = req.body && req.body.plan;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Plan no válido.' });
    const c = await createCheckout(env, req.user, plan, originOf(req));
    res.json({ init_point: c.init_point, preference_id: c.id });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
});

billing.post('/confirm', async (req, res, next) => {
  try {
    if (!env.MP_ACCESS_TOKEN) return res.status(503).json({ error: 'Los pagos aún no están configurados.' });
    const payment = await fetchPayment(env, req.body && req.body.payment_id);
    if (!payment) return res.status(404).json({ error: 'No encontramos ese pago en Mercado Pago.' });
    const r = await applyPayment(db, env, payment, req.user.id);
    if (r.error) return res.status(400).json({ error: r.error });
    await paidNotice(r);
    res.json({ status: r.status, applied: !!r.applied, already: !!r.already, billing: await billingState(db, env, req.user.id) });
  } catch (e) { next(e); }
});

for (const action of ['cancel', 'resume']) {
  billing.post('/' + action, async (req, res, next) => {
    try {
      const r = await setCancel(db, req.user.id, action === 'cancel');
      if (!r) return res.status(400).json({ error: 'No tienes un plan de pago activo.' });
      const name = PLANS[r.plan] ? PLANS[r.plan].name : r.plan;
      await notifySafe(db, req.user.id, action === 'cancel'
        ? { type: 'billing', title: 'Renovación cancelada', body: 'Tu plan ' + name + ' seguirá activo hasta el ' + fmtDay(r.plan_expires_at) + '. Después pasarás al plan Gratis sin perder tus archivos.', link: '/settings' }
        : { type: 'billing', title: 'Suscripción reactivada', body: 'Tu plan ' + name + ' seguirá activo. Te avisaremos antes del ' + fmtDay(r.plan_expires_at) + ' para renovarlo.', link: '/settings' });
      res.json({ ok: true, billing: await billingState(db, env, req.user.id) });
    } catch (e) { next(e); }
  });
}
