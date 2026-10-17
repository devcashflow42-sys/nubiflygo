# Pagos con Mercado Pago en NubiFlyGo

Los planes de la página de Precios (**Pro $99**, **Mega $199** y **Super $399** MXN al mes)
se pagan con **Mercado Pago Checkout Pro**: tarjeta, OXXO, transferencia o saldo.

## Cómo funciona
1. En **Configuración → Facturación** el usuario elige un plan y va a la página de Mercado Pago.
2. Al pagar, Mercado Pago avisa al servidor (**webhook**) y el usuario vuelve a la app.
3. El servidor **consulta el pago a Mercado Pago** (nunca confía en el navegador), revisa que
   esté aprobado, que el importe y la moneda coincidan con el plan y que sea de ese usuario.
4. Se activa el plan **30 días** (si renueva el mismo plan, se suman a los que le quedan).
   Cada pago se aplica una sola vez. Aparece la **corona** 👑 y llega una notificación.
5. 3 días antes del vencimiento llega un aviso para renovar; al vencer vuelve a **Gratis**
   (sus archivos no se borran).

**Cancelar:** no hay cobros automáticos. "Cancelar suscripción" pide confirmación y solo
apaga la renovación: el plan sigue activo hasta su fecha y después pasa a Gratis, sin
reembolsos de días pagados. Puede **reactivarla** antes de esa fecha.

## Variables de entorno
| Variable | Obligatoria | Valor |
|---|---|---|
| `MP_ACCESS_TOKEN` | ✅ | **Access Token** de producción (`APP_USR-…`). Guárdalo como *Secret*. |
| `MP_WEBHOOK_SECRET` | Recomendada | **Clave secreta** de Webhooks. Con ella se valida la firma `x-signature`. |
| `APP_URL` | Opcional | `https://tu-dominio.com`. Si no, se usa el dominio de la petición. |

En Cloudflare: **Pages → tu proyecto → Settings → Variables and secrets** y vuelve a desplegar.
En Node: en `server/.env`.

## Configuración en Mercado Pago
1. Panel: https://www.mercadopago.com.mx/developers/panel/app → tu aplicación.
2. **Credenciales de producción** → copia el **Access Token** → `MP_ACCESS_TOKEN`.
3. **Webhooks → Configurar notificaciones**:
   - URL de producción: `https://TU-DOMINIO/api/v1/billing/webhook`
   - Evento: **Pagos** (`payment`)
   - Guarda y copia la **Clave secreta** → `MP_WEBHOOK_SECRET`.
4. Para probar sin cobrar, usa las credenciales y **usuarios de prueba** de Mercado Pago.

## API
| Ruta | Qué hace |
|---|---|
| `GET /api/v1/billing` | Plan actual, planes y historial de pagos |
| `POST /api/v1/billing/checkout` `{plan}` | Crea el pago y devuelve `init_point` |
| `POST /api/v1/billing/confirm` `{payment_id}` | Verifica el pago al volver de Mercado Pago |
| `POST /api/v1/billing/cancel` · `/resume` | Cancela / reactiva la renovación |
| `POST /api/v1/billing/webhook` | Aviso de Mercado Pago (público, firma validada) |
