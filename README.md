<div align="center">

# ☁️ NubiFlyGo

**Organiza proyectos, notas, documentos y archivos en un solo espacio de trabajo.**

Web + API REST · Node.js / Express o Cloudflare Pages · PostgreSQL (Neon) · Almacenamiento S3

![Node](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)
![i18n](https://img.shields.io/badge/idiomas-8-blue)

<img src="docs/screenshots/landing.png" alt="Página principal de NubiFlyGo" width="860">

</div>

---

## 📑 Contenido

- [Características](#-características)
- [Capturas](#-capturas)
- [Cómo funciona](#-cómo-funciona)
- [Inicio rápido (local)](#-inicio-rápido-local)
- [Variables de entorno](#-variables-de-entorno)
- [Despliegue](#-despliegue)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [API](#-api)
- [Seguridad](#-seguridad)
- [Idiomas](#-idiomas)

---

## ✨ Características

| | |
|---|---|
| 📁 **Proyectos** | Agrupa documentos, notas y archivos por proyecto. |
| 📝 **Notas y documentos** | Crea, edita y publica contenido dentro de cada proyecto. |
| 📦 **Archivos** | Sube archivos de cualquier tipo a S3 (o disco local en pruebas). |
| 🔑 **API keys** | Genera claves con permisos para conectar apps externas o móviles. |
| ⚙️ **Automatización** | Usa tus propias claves de servicios externos. |
| 📊 **Informes y actividad** | Resumen del espacio de trabajo y registro de actividad. |
| 👑 **Suscripciones** | Planes Pro, Mega y Super con Mercado Pago; corona para suscriptores y cancelación sin sorpresas. |
| 🔔 **Notificaciones** | Avisos de inicio de sesión en otro dispositivo, pagos pendientes, abusos y novedades; leídas / no leídas. |
| 🔐 **Cuentas** | Registro con correo, login con Google o GitHub y cuentas de invitado (Cloudflare). |
| 🌍 **8 idiomas** | Detección automática del idioma del navegador. |

---

## 🖼 Capturas

| Inicio de sesión | Panel principal |
|---|---|
| <img src="docs/screenshots/login.png" alt="Login" width="420"> | <img src="docs/screenshots/dashboard.png" alt="Panel" width="420"> |

| Configuración |
|---|
| <img src="docs/screenshots/settings.png" alt="Configuración" width="420"> |

---

## 🧭 Cómo funciona

```
 Navegador (public/)            Backend                         Servicios
┌──────────────────┐   HTTPS   ┌──────────────────────────┐    ┌────────────────────┐
│ /        landing │ ────────▶ │ server/   (Node+Express) │ ─▶ │ PostgreSQL (Neon)  │
│ /login   acceso  │  cookie   │     — o —                │    │ datos de usuarios  │
│ /main    la app  │  httpOnly │ functions/ (Cloudflare)  │ ─▶ │ S3 (Neon / R2 /…)  │
└──────────────────┘           │ API REST en /api/v1      │    │ archivos subidos   │
                               └──────────────────────────┘    └────────────────────┘
```

1. **Frontend** — HTML, CSS y JavaScript puro en `public/`, sin paso de build.
2. **Sesión** — al iniciar sesión el servidor deja una cookie `httpOnly` firmada
   con `JWT_SECRET`. El navegador nunca guarda tokens.
3. **Datos** — todo (usuarios, proyectos, notas, documentos, actividad, API keys)
   vive en PostgreSQL. Cada usuario solo ve lo suyo.
4. **Archivos** — se guardan en un bucket compatible con S3, o en disco con
   `STORAGE_PROVIDER=local` para pruebas.
5. **Dos backends con la misma API** — elige uno:
   - `server/` → servidor Node.js / Express (VPS, Render, Railway, Fly.io…).
   - `functions/` → Cloudflare Pages Functions (sin servidor).

---

## 🚀 Inicio rápido (local)

**Requisitos:** Node.js 18 o superior y una base de datos PostgreSQL (local o
[Neon](https://neon.tech), tiene plan gratis).

```bash
# 1. Clonar el repositorio
git clone https://github.com/devcashflow42-sys/nubiflygo.git
cd nubiflygo/server

# 2. Instalar dependencias
npm install

# 3. Configurar las variables de entorno
cp .env.example .env
#    → edita .env con tus datos (mira la tabla de abajo)

# 4. Crear las tablas en la base de datos
npm run migrate

# 5. Arrancar
npm start          # o: npm run dev  (se reinicia al guardar)
```

Abre **http://localhost:8080** 🎉

| Ruta | Página |
|---|---|
| `/` | Página principal (landing) |
| `/login` | Iniciar sesión / registrarse |
| `/main` | La aplicación (requiere sesión) |
| `/api/v1/health` | Estado del servidor, base de datos y almacenamiento |

> 💡 Para probar sin S3, pon `STORAGE_PROVIDER=local` en tu `.env`: los archivos
> se guardan en una carpeta del disco.

---

## 🔧 Variables de entorno

Copia `server/.env.example` como `server/.env` (Node) o crea las variables en
**Cloudflare → Pages → tu proyecto → Settings → Variables and secrets**.

> ⚠️ **Nunca subas tu `.env` al repositorio.** Ya está incluido en `.gitignore`.

### Obligatorias

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión de PostgreSQL. | `postgresql://usuario:clave@host/nubiflygo?sslmode=require` |
| `JWT_SECRET` | Secreto para firmar la sesión. Largo y aleatorio. Genera uno con `openssl rand -hex 32`. | `9f2c…e41a` |

### Aplicación

| Variable | Por defecto | Descripción |
|---|---|---|
| `APP_NAME` | `NubiFlyGo` | Nombre que aparece en los registros. |
| `NODE_ENV` | `development` | Ponlo en `production` al publicar (activa cookies `Secure`). |
| `PORT` | `8080` | Puerto del servidor Node. |
| `SESSION_DAYS` | `7` | Días que dura la sesión. |
| `ALLOWED_ORIGINS` | *(vacío)* | Dominios del frontend permitidos por CORS, separados por comas. Puede quedar vacío si el servidor sirve las páginas. |
| `ADMIN_EMAILS` | *(vacío)* | Correos de administrador, separados por comas. No pueden registrarse con contraseña (solo Google). |

### Almacenamiento de archivos

| Variable | Por defecto | Descripción |
|---|---|---|
| `STORAGE_PROVIDER` | `local` (Node) · `s3` (Cloudflare) | `s3` para un bucket compatible con S3, o `local` para disco (solo pruebas). |
| `STORAGE_BUCKET` | `ritmogo` | Nombre del bucket. |
| `MAX_FILE_SIZE_MB` | `100` | Tamaño máximo por archivo. |
| `AWS_ENDPOINT_URL_S3` | — | URL del servicio S3 (Neon, Cloudflare R2, AWS, MinIO…). |
| `AWS_ACCESS_KEY_ID` | — | Clave de acceso del bucket. |
| `AWS_SECRET_ACCESS_KEY` | — | Clave secreta del bucket. |
| `AWS_REGION` | `us-east-2` | Región del bucket. |

### Login con Google *(opcional, Cloudflare Pages)*

| Variable | Descripción |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID tipo *Web* de Google Cloud. Activa el botón “Continuar con Google”. |
| `GOOGLE_CLIENT_SECRET` | Client secret del mismo cliente (para el login por redirección). |
| `GOOGLE_REDIRECT_URI` | Opcional. Por defecto `https://TU-DOMINIO/auth/google/callback`. |
| `GOOGLE_ALLOWED_AUDIENCES` | Opcional. Otros Client ID aceptados (p. ej. una app Android), separados por comas. |

Guía paso a paso: [`functions/GOOGLE-SETUP.md`](functions/GOOGLE-SETUP.md).

### Pagos con Mercado Pago

| Variable | Descripción |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token de producción de tu aplicación de Mercado Pago (*Secret*). Activa los pagos. |
| `MP_WEBHOOK_SECRET` | Clave secreta de Webhooks; valida que los avisos vengan de Mercado Pago. |
| `APP_URL` | Opcional. Dominio público para las URLs de regreso y del webhook. |

URL del webhook: `https://TU-DOMINIO/api/v1/billing/webhook`. Guía: [`functions/MERCADOPAGO-SETUP.md`](functions/MERCADOPAGO-SETUP.md).

### Login con GitHub *(opcional, Cloudflare Pages)*

| Variable | Descripción |
|---|---|
| `GITHUB_CLIENT_ID` | Client ID de tu OAuth App de GitHub. Activa el botón de GitHub. |
| `GITHUB_CLIENT_SECRET` | Client secret de la misma OAuth App (guárdalo como *Secret*). |
| `GITHUB_REDIRECT_URI` | Opcional. Por defecto `https://TU-DOMINIO/auth/github/callback`. |

Guía paso a paso (crear las claves y la URL de callback): [`functions/GITHUB-SETUP.md`](functions/GITHUB-SETUP.md).

### Límites *(opcional, Cloudflare)*

| Variable | Por defecto | Descripción |
|---|---|---|
| `GUEST_HOURS` | `24` | Horas que dura una cuenta de invitado. |
| `API_KEY_RPM` | `120` | Peticiones por minuto permitidas por cada API key. |

### Ejemplo de `.env`

```env
NODE_ENV=production
PORT=8080
DATABASE_URL="postgresql://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/nubiflygo?sslmode=require"
JWT_SECRET="pega-aqui-el-resultado-de-openssl-rand-hex-32"
SESSION_DAYS=7

STORAGE_PROVIDER=s3
STORAGE_BUCKET=nubiflygo
MAX_FILE_SIZE_MB=100
AWS_ENDPOINT_URL_S3="https://xxxx.storage.us-east-2.aws.neon.tech"
AWS_ACCESS_KEY_ID="TU_ACCESS_KEY"
AWS_SECRET_ACCESS_KEY="TU_SECRET_KEY"
AWS_REGION="us-east-2"

ADMIN_EMAILS="tu-correo@ejemplo.com"
ALLOWED_ORIGINS="https://tu-dominio.com"
```

---

## ☁️ Despliegue

### Opción A — Servidor Node.js (VPS, Render, Railway, Fly.io…)

1. Directorio raíz: `server/` · Comando de inicio: `npm start`.
2. Define las variables de entorno en el panel de tu proveedor.
3. Ejecuta una vez `npm run migrate` para crear las tablas.

### Opción B — Cloudflare Pages

1. Conecta este repositorio en **Cloudflare → Workers & Pages → Create → Pages**.
2. Directorio de salida: `public` (ya está configurado en `wrangler.toml`).
3. Añade las variables de entorno en **Settings → Variables and secrets**.
4. Crea las tablas: abre el **SQL Editor de Neon**, pega el contenido de
   [`server/esquema-completo.sql`](server/esquema-completo.sql) y ejecútalo.
   Puedes ejecutarlo de nuevo sin perder datos.
5. Vuelve a desplegar para aplicar las variables.

Para probar en local con Cloudflare, pon las variables en `.dev.vars` y ejecuta
`npx wrangler pages dev`.

---

## 🗂 Estructura del proyecto

```
nubiflygo/
├── public/                  # Frontend (HTML + CSS + JS, sin build)
│   ├── main.html            #   Landing         →  /
│   ├── login.html           #   Acceso          →  /login
│   ├── home.html            #   La aplicación   →  /main
│   ├── css/                 #   Estilos (landing/ y app)
│   ├── js/                  #   Lógica (landing/, views/, components/…)
│   └── assets/              #   Imágenes e iconos
├── server/                  # Backend Node.js + Express
│   ├── server.js            #   Punto de entrada
│   ├── config.js            #   Lectura de variables de entorno
│   ├── routes/ · routes-api.js  # Rutas de la API /api/v1
│   ├── auth.js · security.js    # Sesión y protección
│   ├── storage.js           #   S3 / disco local
│   ├── migrate.js           #   npm run migrate
│   ├── esquema-completo.sql #   Esquema completo de la base de datos
│   └── .env.example         #   Plantilla de variables
├── functions/               # Backend Cloudflare Pages Functions
│   ├── api/v1/              #   Misma API que server/
│   ├── auth/google/         #   Login con Google
│   ├── auth/github/         #   Login con GitHub
│   └── _shared/             #   Utilidades comunes
├── docs/screenshots/        # Capturas del README
├── API.md                   # Documentación completa de la API
└── wrangler.toml            # Configuración de Cloudflare
```

---

## 🔌 API

API REST en `/api/v1`. Se autentica con la **cookie de sesión** (web) o con una
**API key** (`Authorization: Bearer <clave>`) para apps externas.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Estado del servicio |
| `POST` | `/account/register` · `/account/login` · `/account/logout` | Cuenta y sesión |
| `GET` | `/account/profile` | Perfil del usuario |
| `GET` `POST` `PATCH` `DELETE` | `/projects` · `/projects/:id` | Proyectos |
| `GET` `POST` | `/notes` · `/documents` | Notas y documentos |
| `GET` `POST` `DELETE` | `/files` · `/files/upload` · `/files/:id/download` | Archivos |
| `GET` `POST` `DELETE` | `/apikeys` | API keys |
| `GET` | `/activity` | Actividad reciente |
| `GET` `PATCH` `POST` `DELETE` | `/notifications` | Notificaciones (leídas / no leídas, envío del admin) |

```bash
curl -H "Authorization: Bearer TU_API_KEY" https://tu-dominio.com/api/v1/projects
```

📘 Referencia completa con ejemplos: [`API.md`](API.md) · Detalles del servidor: [`server/README.md`](server/README.md)

---

## 🛡 Seguridad

- Contraseñas cifradas con **bcrypt**.
- Sesión **JWT en cookie `httpOnly`** (con `Secure` en producción).
- Límite de intentos en login y registro.
- Cada consulta se filtra por usuario: nadie ve datos de otros.
- Los errores devuelven solo un código de referencia; el detalle queda en el registro del servidor.
- Los secretos solo viven en variables de entorno, nunca en el código.

---

## 🌍 Idiomas

Español · English · Português · Français · Deutsch · Italiano · 中文 · 日本語

Todos los textos están en `public/js/languages.js`. El idioma se detecta
automáticamente y el usuario puede cambiarlo desde el selector. Para añadir un
idioma, agrega una entrada en `LANGS` y copia/traduce la sección
correspondiente de `STRINGS.es`.

---

<div align="center">

Hecho con ☁️ por el equipo de **NubiFlyGo**

</div>
