# Login con GitHub en NubiFlyGo (Cloudflare Pages Functions)

Funciona igual que el login con Google por redirección: el usuario pulsa el
botón de GitHub, autoriza la app en GitHub y vuelve a NubiFlyGo con la sesión
iniciada. En su perfil aparecen su **nombre**, su **correo** y su **foto** de GitHub.

| Ruta | Para qué |
|---|---|
| `GET /auth/github/start` | Lleva a la pantalla de autorización de GitHub. |
| `GET /auth/github/callback` | GitHub vuelve aquí; se valida todo y se crea la sesión. |

- Se pide el permiso `read:user user:email` (solo lectura del perfil y los correos).
- Solo se acepta un **correo verificado** en GitHub (primero el principal).
  Si el correo ya existe en NubiFlyGo (por registro con correo o con Google),
  entra a **esa misma cuenta**.
- El `client_secret` vive **solo** en las variables de entorno del servidor.

---

## 1) Crear la OAuth App en GitHub (Client ID y Client secret)

1. Entra a **GitHub → Settings → Developer settings → OAuth Apps**:
   👉 https://github.com/settings/developers
   (Para una organización: `https://github.com/organizations/TU-ORG/settings/applications`)
2. Pulsa **New OAuth App** (o directamente 👉 https://github.com/settings/applications/new).
3. Rellena el formulario:

   | Campo | Valor |
   |---|---|
   | **Application name** | `NubiFlyGo` |
   | **Homepage URL** | `https://TU-DOMINIO` (p. ej. `https://nubiflygo.pages.dev`) |
   | **Application description** | Opcional |
   | **Authorization callback URL** | `https://TU-DOMINIO/auth/github/callback` |
   | **Enable Device Flow** | Déjalo **sin marcar** |

4. Pulsa **Register application**.
5. Copia el **Client ID** que aparece en la página.
6. Pulsa **Generate a new client secret** y copia el secreto **en ese momento**
   (GitHub no lo vuelve a mostrar; si lo pierdes, genera otro).
7. (Opcional) Sube el logo de NubiFlyGo en **Upload new logo** para que los
   usuarios lo vean en la pantalla de autorización.

> ⚠️ La **Authorization callback URL** debe coincidir con tu dominio real.
> Una OAuth App solo admite **una** URL de callback: para probar en local
> (`http://localhost:8788/auth/github/callback`) crea una **segunda OAuth App**
> de desarrollo con sus propias claves.

---

## 2) Variables de entorno (Cloudflare → Pages → tu proyecto → Settings → Variables and secrets)

| Variable | Obligatoria | Valor |
|---|---|---|
| `GITHUB_CLIENT_ID` | ✅ | El **Client ID** de la OAuth App. |
| `GITHUB_CLIENT_SECRET` | ✅ | El **Client secret**. Guárdalo como tipo **Secret** (encriptado). |
| `GITHUB_REDIRECT_URI` | Opcional | Si no la pones, se usa `https://TU-DOMINIO/auth/github/callback` automáticamente. Si la pones, debe ser **idéntica** a la registrada en GitHub. |
| `JWT_SECRET` · `DATABASE_URL` | ✅ | Las mismas que ya usa la app. |

Después de guardar las variables, **vuelve a desplegar** el proyecto
(Deployments → Retry deployment) para que se apliquen.

### Probar en local

Crea un archivo `.dev.vars` en la raíz (ya está en `.gitignore`) con las claves
de tu OAuth App de desarrollo:

```env
GITHUB_CLIENT_ID="Ov23li..."
GITHUB_CLIENT_SECRET="tu_secreto_de_desarrollo"
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
```

y ejecuta `npx wrangler pages dev`. Abre `http://localhost:8788/login`.

---

## 3) Comprobar que funciona

1. Abre `https://TU-DOMINIO/login` y pulsa el botón de **GitHub**.
2. GitHub muestra *“NubiFlyGo by … wants to access your account”* → **Authorize**.
3. Vuelves a `/main` con la sesión iniciada; en tu perfil aparecen tu nombre,
   correo y foto de GitHub.

## Mensajes de error

Si algo falla, vuelves a `/login` con un aviso:

| Código (`?error=`) | Causa habitual | Solución |
|---|---|---|
| `github_config` | Faltan `GITHUB_CLIENT_ID` o `GITHUB_CLIENT_SECRET`. | Añádelas y vuelve a desplegar. |
| `github_token` | Secreto incorrecto o la callback URL no coincide. | Revisa el secreto y la **Authorization callback URL**. |
| `github_state` | Pasaron más de 10 minutos o se abrió en otro navegador. | Vuelve a intentarlo. |
| `github_email` | La cuenta de GitHub no tiene ningún correo verificado. | Verifica un correo en https://github.com/settings/emails |
| `github_profile` / `github` | GitHub no respondió o el usuario canceló. | Vuelve a intentarlo. |

> Si un usuario quiere revocar el acceso: https://github.com/settings/applications
