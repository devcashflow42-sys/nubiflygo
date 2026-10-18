# server/ — Backend de NubiFlyGo (Node + Express + PostgreSQL + S3)

Login/registro reales, sesión en **cookie httpOnly** (sin tokens en el
navegador) y almacenamiento de toda la información en **PostgreSQL (Neon)**.
Los archivos se guardan en **almacenamiento S3** (Neon) o en disco local.

## Rutas de páginas (sin `.html`)

| Archivo             | Ruta   |
|---------------------|--------|
| `public/main.html`  | `/`    |
| `public/login.html` | `/login` |
| `public/home.html`  | `/main` |

## API (`/api/v1`) — todo lo de datos exige sesión

| Método y ruta | Función |
|---|---|
| `GET  /health` | estado del servidor, BD y almacenamiento |
| `POST /account/register` | crea cuenta e inicia sesión (cookie) |
| `POST /account/login` | inicia sesión |
| `POST /account/logout` | cierra sesión |
| `GET  /account/profile` | datos del usuario de la sesión |
| `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id` | proyectos (lista con información completa) |
| `GET /projects/:id/items`, `DELETE /projects/:id/items`, `DELETE /projects` | elementos del proyecto y borrado masivo |
| `GET/POST /notes`, `.../:id` | notas |
| `GET/POST /documents`, `.../:id` | documentos |
| `GET /apikeys`, `POST /apikeys`, `DELETE /apikeys/:id` | claves API |
| `GET /files`, `POST /files/upload`, `GET /files/:id/download`, `DELETE /files/:id` | archivos (lista con todos los datos) |
| `DELETE /files`, `POST /files/delete` | borrar varios o todos los archivos |
| `GET /activity` | actividad reciente |

Cada usuario solo ve y modifica lo suyo (filtrado por `user_id`).
Las listas completas y el borrado masivo funcionan igual que en Cloudflare
(ver `API.md` en la raíz). En Node no hay límite de llamadas: un borrado
masivo termina en una sola petición (`remaining` siempre es 0).

## Seguridad

- Contraseñas con **bcrypt**; sesión **JWT en cookie httpOnly** (`Secure` en
  producción, `SameSite=Lax`). El token nunca llega al JavaScript del navegador
  → no se usa `localStorage`, `sessionStorage` ni IndexedDB.
- CORS por lista blanca (`ALLOWED_ORIGINS`) con credenciales.
- Límite de tamaño de archivo (`MAX_FILE_SIZE_MB`).

## Variables de entorno

Copia `.env.example` a `.env` (no se sube al repositorio) y rellena:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | cadena de conexión de Neon (PostgreSQL) |
| `JWT_SECRET` | secreto de sesión. Genera uno: `openssl rand -hex 32` |
| `STORAGE_PROVIDER` | `s3` (Neon) o `local` (disco, solo pruebas) |
| `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `STORAGE_BUCKET` | almacenamiento S3 |
| `MAX_FILE_SIZE_MB` | tamaño máximo por archivo (por defecto 100) |
| `ALLOWED_ORIGINS` | dominios del frontend permitidos (p. ej. `https://nubiflygo.com,https://www.nubiflygo.com`) |
| `APP_URL` | dominio público (`https://nubiflygo.com`): enlaces compartidos y regreso de pagos |
| `LEGACY_SESSION_COOKIE` | `on` (transición) u `off`: acepta o no la cookie antigua `ritmogo_session` |
| `SESSION_DAYS`, `PORT`, `NODE_ENV`, `APP_NAME` | opcionales |

**En producción nunca pongas secretos en el frontend ni en el repositorio.**
En tu host (Render/Railway/VPS) se configuran como variables de entorno.

## Puesta en marcha

```bash
cd server
cp .env.example .env     # rellena DATABASE_URL, JWT_SECRET, S3…
npm install
npm run migrate          # crea las tablas en PostgreSQL
npm start                # http://127.0.0.1:8080
```

`npm run migrate` ejecuta `schema.sql` (usuarios, proyectos, notas, documentos,
archivos, claves API y actividad).

## Despliegue

Este servidor necesita **Node.js** y conexión a PostgreSQL; **no corre en
Cloudflare Pages** (que es estático). Despliégalo en un host de Node
(Render, Railway, Fly.io o un VPS) y configura ahí las variables de entorno.
El frontend puede seguir en Cloudflare Pages y llamar a este servidor: pon la
URL del servidor en `API_BASE` (arriba de `public/js/login.js`) y añade el
dominio de las páginas a `ALLOWED_ORIGINS`.

## Pendiente (siguiente paso)

Login y registro ya guardan en la base de datos. La **app** (`home.html`)
todavía guarda proyectos/notas/archivos en el navegador (`store.js`). El
siguiente paso es cambiar `store.js` para que lea y escriba vía esta API y así
toda la información quede en PostgreSQL. Los endpoints ya están listos.
