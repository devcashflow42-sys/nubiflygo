# Login con Google en NubiFlyGo (Cloudflare Pages Functions)

Mismo esquema que Syrtra: el servidor **verifica** lo que viene de Google antes
de dejar la sesión. Hay **dos caminos** y los dos acaban en la misma cookie
`ritmogo_session` (httpOnly):

| Camino | Ruta | Para qué |
|---|---|---|
| **idToken** (principal, como Syrtra) | `POST /auth/google` | Google Identity / One Tap en la web y la app Android mandan el `credential` (idToken); el servidor lo verifica (firma RS256 contra las llaves de Google, `aud`, `iss`, `exp`, correo verificado). |
| **Redirección** (respaldo) | `GET /auth/google/start` → `GET /auth/google/callback` | El botón lleva a la pantalla de Google y vuelve. No se "cancela" solo. |
| Config pública | `GET /auth/google` | Devuelve `{ configured, clientId }` para arrancar Google Identity en el navegador. |

> El `clientId` **no es secreto** (va en el navegador por diseño). El secreto es
> el `client_secret`, que vive **solo** en las variables de entorno del servidor.

---

## 1) Variables de entorno (Cloudflare → Pages → tu proyecto → Settings → Variables and secrets)

| Variable | Obligatoria | Valor |
|---|---|---|
| `GOOGLE_CLIENT_ID` | ✅ | El **Client ID** de tipo *Web* de Google Cloud. También es la `aud` del idToken. |
| `GOOGLE_CLIENT_SECRET` | ✅ (solo para redirección) | El **Client secret** del mismo cliente web. Guárdalo como *Secret*. |
| `GOOGLE_REDIRECT_URI` | Opcional | Si NO la pones, se usa `https://TU-DOMINIO/auth/google/callback` automáticamente. Si la pones, debe coincidir **exacta** con la registrada en Google. |
| `GOOGLE_ALLOWED_AUDIENCES` | Opcional | Otros `client_id` válidos separados por comas (p. ej. el **Client ID de Android** de SyrtraMaster) para que el MISMO servidor acepte a la app. |
| `JWT_SECRET` | ✅ | Secreto de la sesión. Genera uno: `openssl rand -hex 32`. |
| `DATABASE_URL` | ✅ | Cadena de Neon (PostgreSQL). |
| `SESSION_DAYS` | Opcional | Días de validez de la cookie (por defecto 7). |

Tras cambiar variables, **vuelve a desplegar** (Deployments → Retry / nuevo deploy)
para que las Functions las tomen.

---

## 2) Google Cloud Console (aquí es donde solía fallar / "me lo cancelaba")

En <https://console.cloud.google.com> → **APIs & Services → Credentials**:

### a) Pantalla de consentimiento (OAuth consent screen)
- Si está en **Testing**, SOLO entran los correos añadidos en **Test users**.
  Si tu correo no está ahí, Google **bloquea/cancela** el acceso. → Añádete como
  test user, o pulsa **Publish app** (modo *In production*) para que entre
  cualquiera.
- Rellena nombre de la app, correo de soporte y dominios autorizados.

### b) Credenciales → OAuth 2.0 Client ID (tipo **Web application**)
- **Authorized JavaScript origins** (necesario para One Tap / Google Identity):
  ```
  https://ritmogo.site
  https://www.ritmogo.site
  https://TU-PROYECTO.pages.dev
  ```
  (sin barra final; añade cada dominio desde el que se abra el login).
- **Authorized redirect URIs** (necesario para el flujo de redirección):
  ```
  https://ritmogo.site/auth/google/callback
  https://www.ritmogo.site/auth/google/callback
  https://TU-PROYECTO.pages.dev/auth/google/callback
  ```
  Deben coincidir **carácter por carácter** con la que use el servidor. Si ves
  `redirect_uri_mismatch`, es que falta exactamente esta URL aquí.

> **Causas típicas del "me lo cancelaba y no aceptaba la petición":**
> 1. App en *Testing* y tu correo no es *test user* → bloquea.
> 2. El dominio real (p. ej. `*.pages.dev`) no está en *JavaScript origins* → One Tap no aparece o se cierra.
> 3. La `redirect_uri` no está registrada → `redirect_uri_mismatch`.
> 4. Faltaba `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` en Cloudflare.

---

## 3) Base de datos

El alta de Google usa las columnas que ya trae el esquema (`avatar_url`,
`language`, etc.). Si aún no migraste, ejecuta `server/esquema-completo.sql` en
Neon una vez.

---

## 4) App Android (SyrtraMaster / NubiFlyGo)

Que Android siga mandando su idToken de One Tap a `POST /auth/google` con el
cuerpo `{"credential":"<idToken>"}`. Para que el servidor lo acepte, añade el
**Client ID de Android** a `GOOGLE_ALLOWED_AUDIENCES`. La respuesta deja la
cookie `ritmogo_session` y luego `GET /api/v1/account/profile` da los datos,
igual que el patrón `POST /auth/google → GET /v1/account` de Syrtra.

---

## 5) Prueba rápida

1. `GET https://TU-DOMINIO/auth/google` → debe responder `{"configured":true,"clientId":"..."}`.
2. Abre `/login`: debería aparecer One Tap (si el navegador lo permite). Si lo
   cierras, **no pasa nada**: el botón "Continuar con Google" sigue entrando por
   redirección.
3. `GET https://TU-DOMINIO/api/v1/health` → revisa `missingConfig` (debe venir vacío).
