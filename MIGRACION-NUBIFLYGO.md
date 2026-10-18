# Migración de RitmoGo a NubiFlyGo

Dominio oficial: **https://nubiflygo.com**. Las rutas `/api/v1/` no cambian.

## 1. Qué cambió

| Antes | Ahora | Dónde |
|---|---|---|
| Cookie `ritmogo_session` | `nubiflygo_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`, sin `Domain`) | `functions/_shared/http.js`, `server/auth.js` |
| `ritmogo.site` / `www.ritmogo.site` | `nubiflygo.com` / `www.nubiflygo.com` | `functions/GOOGLE-SETUP.md`, `functions/_shared/google.js`, `public/js/login.js` |
| `https://ritmogo.pages.dev/api/v1` | `https://nubiflygo.com/api/v1` | `API.md` |
| `ALLOWED_ORIGINS="https://ritmogo.pages.dev,…"` | `https://nubiflygo.com,https://www.nubiflygo.com,…` | `server/.env.example` |
| Enlaces compartidos con el dominio de la petición | Siempre `https://nubiflygo.com/s/…` (o `APP_URL`; en local, el propio servidor) | `functions/_shared/http.js` (`publicOrigin`), `functions/api/v1/shares/_logic.js`, `server/routes/shares.js` |
| Invitados nuevos `@guest.ritmogo` | `@guest.nubiflygo` (los existentes conservan su correo) | `functions/api/v1/account/_logic.js` |
| Ganchos de prueba `__RITMOGO_DB__` / `__RITMOGO_STORAGE__` | `__NUBIFLYGO_DB__` / `__NUBIFLYGO_STORAGE__` | `functions/_shared/db.js`, `storage.js`, `api.js` |
| Paquetes `ritmogo` / `ritmogo-server` | `nubiflygo` / `nubiflygo-server` | `package.json`, `server/package.json` y sus `package-lock.json` |
| Proyecto de Pages `ritmogo` | `nubiflygo` (el que sirve `nubiflygo.pages.dev`) | `wrangler.toml` |
| Enlace inventado `nubiflygo.app/p/…` | eliminado (no se usaba) | `public/js/views/projects.js` |

### Lo que se conserva a propósito (no es marca: son recursos con datos)

| Identificador | Por qué no se cambia |
|---|---|
| Base de datos `ritmogo` (en `DATABASE_URL`) | Es la base real de Neon con todos los datos. |
| `STORAGE_BUCKET=ritmogo` | Es el bucket S3 real con los archivos de los usuarios; renombrarlo los dejaría inaccesibles. |
| Correos `…@guest.ritmogo` ya guardados | Son registros existentes; solo los invitados nuevos usan `@guest.nubiflygo`. |
| Carpeta local `/tmp/ritmogo-files` | Solo pruebas locales; conserva lo ya guardado. |
| La palabra «ritmo» en «a tu ritmo» | Es español, no la marca. |

**No hace falta migrar la base de datos.** La cookie no se guarda en la base; los JWT siguen
firmados con el mismo `JWT_SECRET` y las API keys no cambian.

## 2. Transición de la cookie (sin desconectar a nadie)

1. Cualquier petición que llegue **solo** con `ritmogo_session` válida recibe
   `nubiflygo_session` con **el mismo token**, con la misma caducidad: no se alarga ni se acorta.
2. En la misma respuesta se caduca `ritmogo_session` con sus atributos originales (`Path=/`, sin `Domain`).
3. Mientras dura la transición, la API también acepta la cookie antigua directamente.
4. Si la respuesta ya fija `nubiflygo_session` (inicio o cierre de sesión), se respeta. Por eso el
   cierre de sesión nunca revive la sesión antigua.
5. `SameSite=Lax` se mantiene: la vuelta de Google/GitHub es una navegación GET de primer nivel
   y Lax la permite. `Strict` rompería la cookie de estado del OAuth y `None` no hace falta,
   porque no hay peticiones con cookies desde otros sitios. La app Android usa API keys.

Lugares: `functions/_middleware.js` (todas las respuestas pasan por `migrateLegacySession`),
`functions/_shared/http.js` y `server/server.js` + `server/auth.js`.

### Fase 2: quitar el soporte antiguo

Los tokens duran `SESSION_DAYS` (7 días). **7 días después del despliegue** ya no queda ningún
`ritmogo_session` válido.

1. En Cloudflare (Pages → Settings → Variables), crea `LEGACY_SESSION_COOKIE=off`.
   Las cookies antiguas dejan de aceptarse, pero se siguen caducando.
2. Unas semanas después, ese bloque se puede borrar del código. La línea que caduca
   `ritmogo_session` puede quedarse indefinidamente: no cuesta nada.

## 3. Variables de entorno (sin secretos)

Cloudflare Pages → Settings → Variables and secrets:

```
APP_URL=https://nubiflygo.com              # enlaces compartidos y regreso de pagos
LEGACY_SESSION_COOKIE=on                   # "off" en la fase 2
GOOGLE_REDIRECT_URI=                       # vacío = el dominio de la petición (recomendado)
# Sin cambios: DATABASE_URL, STORAGE_BUCKET=ritmogo, JWT_SECRET, AWS_*, GOOGLE_*, GITHUB_*, MP_*
```

Servidor Node (`server/.env`), ver `server/.env.example`:

```
ALLOWED_ORIGINS="https://nubiflygo.com,https://www.nubiflygo.com,http://localhost:8080"
APP_URL="https://nubiflygo.com"
LEGACY_SESSION_COOKIE=on
```

> **No cambies `JWT_SECRET`.** Si cambia, todas las sesiones (antiguas y nuevas) se invalidan.

## 4. Desplegar

1. **Respaldo:** en Neon, crea una *branch* (copia instantánea) antes de desplegar. Este cambio no
   escribe en la base, pero es la práctica segura.
2. **Google Cloud Console** → Credentials → OAuth Client (Web): añade como *JavaScript origins*
   `https://nubiflygo.com` y `https://www.nubiflygo.com`. Como *Redirect URIs*, añade
   `https://nubiflygo.com/auth/google/callback` y `https://www.nubiflygo.com/auth/google/callback`.
   Conserva las de `nubiflygo.pages.dev`.
3. **GitHub OAuth App:** *Homepage URL* `https://nubiflygo.com` y *Callback URL*
   `https://nubiflygo.com/auth/github/callback`.
4. **Mercado Pago:** si configuraste el webhook a mano, apúntalo a
   `https://nubiflygo.com/api/v1/billing/webhook`.
5. Variables de la sección 3 en Cloudflare y luego despliega la rama.
6. **Comprobar** (navegador ya conectado antes del despliegue): abre `https://nubiflygo.com/main`.
   Debes seguir dentro; en DevTools → Application → Cookies solo debe quedar `nubiflygo_session`.

## 5. Revertir

- **Código:** vuelve a desplegar el commit anterior (Cloudflare → Deployments → *Rollback*, o
  `git revert`). Lo que pasa con las sesiones:
  - Mientras duró la nueva versión, `ritmogo_session` se caducó en esos navegadores, y la versión
    anterior solo lee `ritmogo_session`. Esas sesiones tendrían que iniciar sesión otra vez.
  - Para evitarlo, revierte en las primeras horas o tolera ese único inicio de sesión.
  - Los datos no se ven afectados en ningún caso.
- **Variables:** borra `LEGACY_SESSION_COOKIE` y deja `APP_URL` como estaba.
- **Base de datos y archivos:** no hay nada que revertir; esta migración no los modifica.

## 6. App Android

- **Con API key** (`Authorization: Bearer sk_…` o `X-API-Key`): sin cambios, probado.
- **Con sesión** (`POST /auth/google` y la cookie): sigue funcionando si la app guarda las cookies
  con un *CookieJar* genérico (OkHttp/Retrofit), sin importar su nombre.
  - Si el código de Android busca la cookie **por nombre** `ritmogo_session`, hay que cambiarlo a
    `nubiflygo_session`.
  - Mientras `LEGACY_SESSION_COOKIE=on`, el servidor sigue aceptando la cookie antigua que la app
    ya tenga guardada.
