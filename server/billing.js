/* ==========================================================================
   billing.js — Suscripciones con Mercado Pago (Checkout Pro), en MXN.
   Copia de functions/_shared/billing.js para el servidor Node (misma lógica).
   Cómo funciona:
     1. El usuario elige un plan → se crea una "preferencia" de pago y se le
        manda a la página de Mercado Pago (init_point).
     2. Mercado Pago avisa al servidor (webhook) y además el usuario vuelve a
        /settings?pay=success&payment_id=… → en ambos casos se CONSULTA el pago
        a la API de Mercado Pago (nunca se confía en lo que manda el navegador).
     3. Si el pago está aprobado, el importe y la moneda coinciden con el plan y
        es de ese usuario → se activa el plan 30 días (si ya tenía días, se suman).
        Cada pago se aplica una sola vez (payments.mp_payment_id es único).
   Cancelar: no hay cobros automáticos. "Cancelar" apaga la renovación: el plan
   sigue activo hasta su fecha y después vuelve a Gratis (sin reembolsos).
   Variables: MP_ACCESS_TOKEN (obligatoria), MP_WEBHOOK_SECRET (recomendada),
   APP_URL (opcional; por defecto el dominio de la petición).
   ========================================================================== */

import { webcrypto } from 'node:crypto';
const crypto = globalThis.crypto || webcrypto;
// Precios de la página de Precios (main.html), en pesos mexicanos.
export const PLANS = {
  pro:   { id: 'pro',   name: 'Pro',   price: 99,  feats: ['100 GB de almacenamiento', 'Proyectos ilimitados', '5 API keys', 'Automatizaciones básicas', 'Soporte por correo'] },
  mega:  { id: 'mega',  name: 'Mega',  price: 199, feats: ['1 TB de almacenamiento', 'Proyectos ilimitados', '20 API keys', 'Automatizaciones avanzadas', 'Historial de versiones'] },
  super: { id: 'super', name: 'Super', price: 399, feats: ['5 TB de almacenamiento', 'API keys ilimitadas', 'Prioridad en la API', 'Soporte prioritario'] }
};
// Espacio de cada plan (el mismo que muestra la tarjeta de almacenamiento).
const GB = 1024 * 1024 * 1024;
export const PLAN_QUOTA = { free: 2 * GB, pro: 100 * GB, mega: 1024 * GB, super: 5 * 1024 * GB };

// Bytes que el usuario aún puede subir según su plan vigente (Infinity para el administrador).
export async function storageLeft(db, userId, isAdmin) {
  if (isAdmin) return Infinity;
  await ensureBilling(db);
  const { rows } = await db.query(
    `SELECT plan, plan_expires_at, (SELECT COALESCE(sum(size), 0) FROM files WHERE user_id = $1)::bigint AS used
     FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) return 0;
  const quota = PLAN_QUOTA[effectivePlan(rows[0])] || PLAN_QUOTA.free;
  return quota - Number(rows[0].used || 0);
}

export const CURRENCY = 'MXN';
export const PERIOD_DAYS = 30;
const MP_API = 'https://api.mercadopago.com';

let ready = false;
export async function ensureBilling(db) {
  if (ready) return;
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ');
  await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false');
  await db.query(`CREATE TABLE IF NOT EXISTS payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mp_payment_id  TEXT NOT NULL UNIQUE,
    plan           TEXT NOT NULL,
    amount         NUMERIC(10,2) NOT NULL,
    currency       TEXT NOT NULL DEFAULT 'MXN',
    status         TEXT NOT NULL,
    method         TEXT,
    period_end     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query('CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC)');
  ready = true;
}

// Plan vigente: un plan de pago vencido cuenta como Gratis.
export function effectivePlan(u) {
  if (!u || !u.plan || u.plan === 'free') return 'free';
  if (u.plan_expires_at && new Date(u.plan_expires_at).getTime() <= Date.now()) return 'free';
  return u.plan;
}

function mpHeaders(env, extra) {
  return Object.assign({ 'Authorization': 'Bearer ' + env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json' }, extra || {});
}

/* ---------- 1) Crear el pago (preferencia de Checkout Pro) ---------- */
export async function createCheckout(env, user, planId, origin) {
  const plan = PLANS[planId];
  if (!plan) { const e = new Error('Plan no válido.'); e.status = 400; throw e; }
  if (!env.MP_ACCESS_TOKEN) { const e = new Error('Los pagos aún no están configurados (falta MP_ACCESS_TOKEN).'); e.status = 503; throw e; }
  const base = String(env.APP_URL || origin).replace(/\/+$/, '');
  const back = base + '/settings';
  const pref = {
    items: [{ id: 'nubiflygo-' + plan.id, title: 'NubiFlyGo ' + plan.name + ' · 1 mes', quantity: 1, currency_id: CURRENCY, unit_price: plan.price }],
    payer: { email: user.email },
    external_reference: user.id + '|' + plan.id,
    metadata: { user_id: user.id, plan: plan.id },
    back_urls: { success: back + '?pay=success', pending: back + '?pay=pending', failure: back + '?pay=failure' },
    auto_return: 'approved',
    notification_url: base + '/api/v1/billing/webhook',
    statement_descriptor: 'NUBIFLYGO'
  };
  const res = await fetch(MP_API + '/checkout/preferences', {
    method: 'POST', headers: mpHeaders(env, { 'X-Idempotency-Key': crypto.randomUUID() }), body: JSON.stringify(pref)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.init_point) {
    console.error('[mercadopago] preference', res.status, data && data.message);
    const e = new Error('Mercado Pago no pudo crear el pago. Inténtalo de nuevo.'); e.status = 502; throw e;
  }
  return { id: data.id, init_point: data.init_point, sandbox_init_point: data.sandbox_init_point };
}

/* ---------- 2) Verificar un pago consultando a Mercado Pago y aplicarlo ---------- */
export async function fetchPayment(env, paymentId) {
  if (!/^\d{1,30}$/.test(String(paymentId || ''))) return null;
  const res = await fetch(MP_API + '/v1/payments/' + paymentId, { headers: mpHeaders(env) });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// Devuelve { applied, status, plan, expires_at } o { error }.
// onlyUserId: cuando lo pide el navegador, el pago debe ser de ese usuario.
export async function applyPayment(db, env, payment, onlyUserId) {
  await ensureBilling(db);
  if (!payment || !payment.id) return { error: 'Pago no encontrado.' };
  const [userId, planId] = String(payment.external_reference || '').split('|');
  const plan = PLANS[planId];
  if (!plan || !/^[0-9a-f-]{36}$/i.test(userId || '')) return { error: 'El pago no corresponde a NubiFlyGo.' };
  if (onlyUserId && onlyUserId !== userId) return { error: 'Este pago no es de tu cuenta.' };
  const status = String(payment.status || 'unknown');
  const amount = Number(payment.transaction_amount);
  const okAmount = payment.currency_id === CURRENCY && Math.abs(amount - plan.price) < 0.01;
  const method = String(payment.payment_method_id || payment.payment_type_id || '').slice(0, 40) || null;

  // Reembolso o contracargo de un pago que ya activó el plan: se quitan sus días.
  if (status === 'refunded' || status === 'charged_back') {
    const rev = await db.query(
      `UPDATE payments SET status = $3 WHERE mp_payment_id = $1 AND user_id = $2 AND status = 'approved' RETURNING plan`,
      [String(payment.id), userId, status]);
    if (rev.rows[0]) {
      await db.query(
        `UPDATE users SET plan_expires_at = plan_expires_at - make_interval(days => $3)
         WHERE id = $1 AND plan = $2 AND plan_expires_at IS NOT NULL`, [userId, rev.rows[0].plan, PERIOD_DAYS]);
      try { await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [userId, 'account', 'Pago ' + (status === 'refunded' ? 'reembolsado' : 'con contracargo') + ': se quitaron ' + PERIOD_DAYS + ' días del plan ' + plan.name]); } catch {}
      return { applied: false, revoked: true, status, plan: plan.id };
    }
  }

  if (status !== 'approved' || !okAmount) {
    // Se registra (pendiente / rechazado) para el historial, sin activar nada.
    await db.query(
      `INSERT INTO payments (user_id, mp_payment_id, plan, amount, currency, status, method)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (mp_payment_id) DO UPDATE SET status = EXCLUDED.status WHERE payments.status NOT IN ('approved', 'refunded', 'charged_back')`,
      [userId, String(payment.id), plan.id, isFinite(amount) ? amount : 0, String(payment.currency_id || CURRENCY).slice(0, 3), okAmount ? status : 'invalid_amount', method]);
    return { applied: false, status: okAmount ? status : 'invalid_amount', plan: plan.id };
  }

  // Aprobado: se reserva el pago (una sola vez) y se extiende el plan.
  const ins = await db.query(
    `INSERT INTO payments (user_id, mp_payment_id, plan, amount, currency, status, method)
     VALUES ($1, $2, $3, $4, $5, 'approved', $6)
     ON CONFLICT (mp_payment_id) DO UPDATE SET status = 'approved' WHERE payments.status NOT IN ('approved', 'refunded', 'charged_back')
     RETURNING id`, [userId, String(payment.id), plan.id, amount, CURRENCY, method]);
  if (!ins.rows[0]) {
    const { rows } = await db.query('SELECT plan, plan_expires_at FROM users WHERE id = $1', [userId]);
    return { applied: false, already: true, status, plan: rows[0] && rows[0].plan, expires_at: rows[0] && rows[0].plan_expires_at };
  }
  // Mismo plan con días restantes → se suman; plan distinto → empieza hoy.
  const { rows } = await db.query(
    `UPDATE users SET
       plan_expires_at = CASE WHEN plan = $2 AND plan_expires_at > now() THEN plan_expires_at ELSE now() END + make_interval(days => $3),
       plan = $2, plan_cancel_at_period_end = false
     WHERE id = $1 RETURNING plan, plan_expires_at`, [userId, plan.id, PERIOD_DAYS]);
  if (!rows[0]) return { error: 'La cuenta ya no existe.' };
  await db.query('UPDATE payments SET period_end = $2 WHERE id = $1', [ins.rows[0].id, rows[0].plan_expires_at]);
  try { await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [userId, 'account', 'Plan ' + plan.name + ' activado']); } catch {}
  return { applied: true, status, plan: plan.id, expires_at: rows[0].plan_expires_at, user_id: userId, plan_name: plan.name };
}

/* ---------- Firma del webhook (x-signature) ----------
   Mercado Pago firma con HMAC-SHA256 el texto
   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" usando la clave secreta
   del webhook. Sin MP_WEBHOOK_SECRET no se valida la firma, pero igual se
   consulta el pago a Mercado Pago antes de aplicarlo. */
export async function verifyWebhookSignature(env, signature, requestId, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return true;
  const parts = Object.fromEntries(String(signature || '').split(',').map(p => p.trim().split('=').map(s => s.trim())));
  if (!parts.ts || !parts.v1) return false;
  let manifest = '';
  if (dataId) manifest += 'id:' + String(dataId).toLowerCase() + ';';
  if (requestId) manifest += 'request-id:' + requestId + ';';
  manifest += 'ts:' + parts.ts + ';';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.MP_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(manifest)));
  const hex = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

/* ---------- Estado para la pantalla de Facturación ---------- */
export async function billingState(db, env, userId) {
  await ensureBilling(db);
  const { rows } = await db.query('SELECT plan, plan_expires_at, plan_cancel_at_period_end FROM users WHERE id = $1', [userId]);
  const u = rows[0] || {};
  const plan = effectivePlan(u);
  const pays = await db.query(
    `SELECT mp_payment_id, plan, amount, currency, status, method, period_end, created_at
     FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 24`, [userId]);
  return {
    configured: !!env.MP_ACCESS_TOKEN,
    currency: CURRENCY,
    plans: Object.values(PLANS),
    current: {
      plan, plan_name: PLANS[plan] ? PLANS[plan].name : 'Gratis', paid: plan !== 'free',
      expires_at: plan !== 'free' ? u.plan_expires_at : null,
      cancel_at_period_end: plan !== 'free' && !!u.plan_cancel_at_period_end,
      expired_plan: u.plan && u.plan !== 'free' && plan === 'free' ? u.plan : null
    },
    payments: pays.rows.map(p => Object.assign(p, { amount: Number(p.amount), plan_name: PLANS[p.plan] ? PLANS[p.plan].name : p.plan }))
  };
}

export async function setCancel(db, userId, cancel) {
  await ensureBilling(db);
  const { rows } = await db.query(
    `UPDATE users SET plan_cancel_at_period_end = $2
     WHERE id = $1 AND plan <> 'free' AND plan_expires_at > now() RETURNING plan, plan_expires_at`, [userId, !!cancel]);
  return rows[0] || null;
}
