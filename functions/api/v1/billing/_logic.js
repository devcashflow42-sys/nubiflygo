/* ==========================================================================
   billing — suscripción con Mercado Pago.
     GET  /billing               → plan actual, planes, historial de pagos
     POST /billing/checkout      { plan: "pro"|"mega"|"super" } → { init_point }
     POST /billing/confirm       { payment_id } → verifica el pago al volver de Mercado Pago
     POST /billing/cancel        → apaga la renovación (el plan sigue hasta su fecha)
     POST /billing/resume        → la vuelve a activar
     POST /billing/webhook       → aviso de Mercado Pago (público, se valida la firma)
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json } from '../../../_shared/http.js';
import { dataRoute } from '../../../_shared/api.js';
import { body } from '../../../_shared/util.js';
import { secLog } from '../../../_shared/security.js';
import { createCheckout, fetchPayment, applyPayment, verifyWebhookSignature, billingState, setCancel, PLANS } from '../../../_shared/billing.js';
import { notifySafe } from '../../../_shared/notify.js';

const fmtDay = (d) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });

export async function paidNotice(db, r) {
  if (!r || !r.applied) return;
  await notifySafe(db, r.user_id, {
    type: 'billing', dedupe: 'paid:' + r.user_id + ':' + new Date(r.expires_at).toISOString(),
    title: 'Pago recibido · Plan ' + r.plan_name + ' activo',
    body: '¡Gracias! Tu plan ' + r.plan_name + ' está activo hasta el ' + fmtDay(r.expires_at) + '.',
    link: '/settings'
  });
}

const userRoutes = dataRoute(async ({ seg, request, env, method, user, auth }) => {
  if (auth.viaKey) return json({ error: 'La facturación solo se gestiona desde la app.' }, 403);
  const db = getDb(env);
  const sub = seg[1] || '';

  if (!sub && method === 'GET') return json(await billingState(db, env, user.id));

  if (method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (user.isGuest) return json({ error: 'Crea una cuenta gratis para contratar un plan.' }, 403);

  if (sub === 'checkout') {
    const b = await body(request);
    if (!PLANS[b.plan]) return json({ error: 'Plan no válido.' }, 400);
    try {
      const c = await createCheckout(env, user, b.plan, new URL(request.url).origin);
      return json({ init_point: c.init_point, preference_id: c.id });
    } catch (e) { return json({ error: e.message }, e.status || 500); }
  }

  if (sub === 'confirm') {
    const b = await body(request);
    if (!env.MP_ACCESS_TOKEN) return json({ error: 'Los pagos aún no están configurados.' }, 503);
    const payment = await fetchPayment(env, b.payment_id);
    if (!payment) return json({ error: 'No encontramos ese pago en Mercado Pago.' }, 404);
    const r = await applyPayment(db, env, payment, user.id);
    if (r.error) return json({ error: r.error }, 400);
    await paidNotice(db, r);
    return json({ status: r.status, applied: !!r.applied, already: !!r.already, billing: await billingState(db, env, user.id) });
  }

  if (sub === 'cancel' || sub === 'resume') {
    const r = await setCancel(db, user.id, sub === 'cancel');
    if (!r) return json({ error: 'No tienes un plan de pago activo.' }, 400);
    const name = PLANS[r.plan] ? PLANS[r.plan].name : r.plan;
    await notifySafe(db, user.id, sub === 'cancel'
      ? { type: 'billing', title: 'Renovación cancelada', body: 'Tu plan ' + name + ' seguirá activo hasta el ' + fmtDay(r.plan_expires_at) + '. Después pasarás al plan Gratis sin perder tus archivos.', link: '/settings' }
      : { type: 'billing', title: 'Suscripción reactivada', body: 'Tu plan ' + name + ' seguirá activo. Te avisaremos antes del ' + fmtDay(r.plan_expires_at) + ' para renovarlo.', link: '/settings' });
    return json({ ok: true, billing: await billingState(db, env, user.id) });
  }

  return json({ error: 'Ruta de facturación no encontrada.' }, 404);
});

async function webhook(request, env) {
  const url = new URL(request.url);
  let b = {};
  try { b = await request.json(); } catch {}
  const type = b.type || url.searchParams.get('type') || url.searchParams.get('topic');
  // El mismo id que se firma es el que se consulta (primero el de la URL, como lo firma Mercado Pago).
  const dataId = url.searchParams.get('data.id') || (b.data && b.data.id) || url.searchParams.get('id');
  if (type !== 'payment' || !dataId) return json({ ok: true, ignored: true });   // otros avisos: se ignoran
  const okSig = await verifyWebhookSignature(env, request.headers.get('x-signature'), request.headers.get('x-request-id'), dataId);
  if (!okSig) { secLog('mp_bad_signature', request, {}); return json({ error: 'Firma no válida.' }, 401); }
  if (!env.MP_ACCESS_TOKEN) return json({ error: 'Pagos no configurados.' }, 503);
  const payment = await fetchPayment(env, dataId);
  if (!payment) return json({ error: 'Pago no encontrado.' }, 404);           // Mercado Pago reintentará
  const db = getDb(env);
  const r = await applyPayment(db, env, payment, null);
  await paidNotice(db, r);
  return json({ ok: true, status: r.status || null });
}

export async function handle(context) {
  const { request, env } = context;
  const seg = new URL(request.url).pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
  if (seg[1] === 'webhook') {
    if (request.method !== 'POST') return json({ ok: true });
    try { return await webhook(request, env); }
    catch (e) { console.error('[mercadopago] webhook', e && e.message); return json({ error: 'Error del servidor.' }, 500); }
  }
  return userRoutes(context);
}
