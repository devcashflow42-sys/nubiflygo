# API de NubiFlyGo (`/api/v1`)

Base: `https://nubiflygo.com/api/v1`

## Autenticación

Dos formas:

1. **Sesión (web):** cookie httpOnly que se obtiene al hacer login/registro.
   Solo sirve **dentro de la app**: la petición debe salir de la propia web
   (mismo origen; la app envía además la cabecera `X-NubiFly-Client: web`).
   Abrir `/api/v1/...` en la barra de direcciones **no muestra datos**
   (401 «Autenticación requerida»), aunque hayas iniciado sesión, y otra web
   no puede usar tu sesión (403).
2. **API key (apps móviles / servicios):** genera una clave en la app
   (sección *API keys*) y envíala en cada petición, **siempre en la cabecera**:

   ```
   Authorization: Bearer sk_tu_clave
   ```
   (También se acepta la cabecera `X-API-Key: sk_tu_clave`.)

   Por seguridad la clave **ya no se acepta en la URL** (`?key=` o
   `?api_key=` → 401): quedaría en el historial, en los registros del servidor
   y en capturas de pantalla.

Cada clave pertenece a un usuario y solo ve/crea datos de ese usuario.

### Permisos de la API key
- `read` → solo peticiones **GET** (si intenta escribir devuelve **403**).
- `write` o `all` → lectura y escritura. Cualquier otro valor al crearla → **400**.
- **Clave de proyecto** (creada desde un proyecto): solo puede usar ese
  proyecto (`/projects/:id/...`) y sus documentos, notas y archivos
  (`/documents`, `/notes`, `/files` quedan filtrados a ese proyecto; lo que
  crea o sube va a ese proyecto). No puede ver otros proyectos ni borrar el
  proyecto en sí.
- **Vencimiento:** `expires_in_days` al crearla (7, 30, 60, 90, 180, 365 o 730;
  sin valor = no vence). Una clave vencida responde **401**.
- Ninguna API key puede ver, crear o borrar claves (`/apikeys`), entrar a
  `/admin`, ni cambiar la cuenta (contraseña, nombre, foto): eso solo desde la
  app con tu sesión. Con una clave solo se puede **leer** el perfil.
- Límite: **120 peticiones por minuto** por clave (después **429** con
  `Retry-After`). Se puede cambiar con la variable `API_KEY_RPM`.

Claves inválidas, vencidas o ausentes → **401**.

## Seguridad (5 capas)

1. **Acceso:** la API solo responde a la app (sesión + mismo origen) o a una
   API key en la cabecera. La barra de direcciones nunca muestra datos.
2. **Permisos:** cada consulta va filtrada por tu usuario; las claves tienen
   permisos y alcance (solo lectura, solo un proyecto, nunca administración);
   un `project_id` enviado debe ser un proyecto tuyo.
3. **Límites:** inicio de sesión (8 intentos por cuenta y conexión cada 15 min,
   30 por conexión), registro e invitados (10 por conexión por hora), cuerpo
   JSON de 1 MB, textos con largo máximo, 120 peticiones/min por clave.
4. **Salida segura:** errores sin detalles internos (solo un código de
   referencia), `/health` sin detalles para el público, nunca se devuelven
   hashes ni rutas internas, y los archivos que el navegador podría ejecutar
   (HTML, SVG, XML, JavaScript) siempre se descargan, nunca se muestran.
5. **Navegador y sesiones:** cabeceras de seguridad (CSP, anti-iframe,
   `nosniff`, HSTS, `Referrer-Policy`), cambiar la contraseña cierra las
   demás sesiones, y los eventos de seguridad quedan en el registro del
   servidor y en la actividad de la cuenta.

## Endpoints

| Método y ruta | Descripción | Auth |
|---|---|---|
| `GET  /health` | `{"status":"ok"}` (los detalles solo para el administrador) | pública |
| `POST /account/register` | `{name,email,password}` → crea cuenta (cookie) | pública |
| `POST /account/login` | `{email,password}` → inicia sesión (cookie) | pública |
| `POST /account/logout` | Cierra sesión | cookie |
| `GET  /account/profile` | Datos del usuario | cookie o key |
| `PATCH /account/profile` | `{name?, language?, current_password?, new_password?}` → actualiza el perfil (cambiar la contraseña cierra las demás sesiones) | cookie |
| `GET  /account/avatar` | Foto de perfil subida (imagen) | cookie o key |
| `POST /account/avatar` | `{image: "data:image/jpeg;base64,…"}` (JPG, PNG, WEBP o GIF, máx. 2 MB) → guarda la foto | cookie |
| `DELETE /account/avatar` | Quita la foto de perfil | cookie |

`GET /account/profile` incluye `plan`, `plan_label` y `has_paid_plan`
(`false` si el usuario todavía no tiene un plan de pago: Gratis, invitado o administrador).
| `GET/POST /projects` · `GET/PATCH/DELETE /projects/:id` | Proyectos (lista con información completa) | cookie o key |
| `GET /projects/:id/items` | Todos los elementos del proyecto (documentos + archivos) | cookie o key |
| `DELETE /projects/:id/items` · `POST /projects/:id/items/delete` | Vaciar el proyecto (todo o por ids) | cookie o key |
| `DELETE /projects` · `POST /projects/delete` | Borrar varios o todos los proyectos con su contenido | cookie o key |
| `GET/POST /notes` · `.../:id` | Notas | cookie o key |
| `GET/POST /documents` · `.../:id` | Documentos | cookie o key |
| `GET /apikeys` · `POST /apikeys` · `DELETE /apikeys/:id` | Claves API (`POST`: `{name, permission?, project_id?, expires_in_days?}`) | cookie |
| `GET /files` · `POST /files/upload` · `GET /files/:id/download` · `DELETE /files/:id` | Archivos (lista con todos los datos) | cookie o key |
| `DELETE /files` · `POST /files/delete` | Borrar varios o todos los archivos | cookie o key |
| `GET /files/:id/thumb` | Portada del archivo (banner: miniatura de imagen/video o carátula de la canción) | cookie o key |
| `GET /stream` | Tiempo real (Server-Sent Events): evento `change` cuando cambian proyectos, archivos, notas, documentos o API keys | cookie o key |

`POST /files/upload` acepta, además de `file` y `project_id`, dos campos opcionales:
`thumb` (imagen JPEG/PNG/WEBP de hasta 400 KB, la portada) y `media` (JSON
`{"title","artist","album","duration","width","height"}`). La web los detecta sola
antes de subir (etiquetas MP3/ID3, M4A y FLAC; fotograma del video; miniatura de
la imagen). `GET /files/:id/download` admite `Range` para adelantar audio y video.
| `GET /activity` | Actividad reciente | cookie o key |
| `GET /notifications` | Notificaciones (`?status=unread`, `?type=security\|billing\|warning\|feature\|info`, `?limit=`, `?before=`) → `{items, unread, has_more}` | cookie o key |
| `GET /notifications/unread` | Solo el contador → `{unread}` | cookie o key |
| `PATCH /notifications/:id` | `{read: true\|false}` → marca leída / no leída | cookie o key |
| `POST /notifications/read-all` | Marca todas como leídas | cookie o key |
| `DELETE /notifications/:id` · `DELETE /notifications?status=read\|all` | Borra una, las leídas o todas | cookie o key |
| `POST /notifications/send` | `{to: "all" \| correo, type, title, body?, link?}` → envía un aviso (novedades, suscripción…) | solo admin (cookie) |

Respuestas: `{ item }` o `{ items }` en éxito; `{ error }` con el código HTTP
correspondiente en error (400 datos inválidos, 401 sin auth, 403 sin permiso,
404 no encontrado, 409 duplicado, 413 archivo o cuerpo muy grande, 429
demasiados intentos —mira `Retry-After`—, 500 error interno con un `ref`
para buscarlo en el registro del servidor).

## Notificaciones

Se guardan en el servidor (tabla `notifications`) y la app las muestra en la
sección **Notificaciones** del menú y en la campana de cada vista.

| Tipo | Cuándo se crea |
|---|---|
| `security` | Inicio de sesión desde un **dispositivo nuevo** (navegador + sistema), con correo, Google, GitHub o invitado. |
| `warning` | Bloqueo por **intentos fallidos** de contraseña, o una API key que **supera su límite** por minuto (máx. 1 aviso por hora). |
| `billing` | El plan de pago **vence en 3 días o ya venció** (`users.plan_expires_at`). Un aviso por fecha. |
| `feature` | Bienvenida y **novedades** enviadas por el administrador con `POST /notifications/send`. |
| `info` | Avisos generales del administrador. |

```bash
# Anunciar una novedad a todos los usuarios (sesión del administrador)
curl -X POST https://TU-DOMINIO/api/v1/notifications/send \
  -H "Content-Type: application/json" -H "X-NubiFly-Client: web" -b cookies.txt \
  -d '{"to":"all","type":"feature","title":"Nuevo: login con GitHub","body":"Ya puedes entrar con GitHub.","link":"/settings"}'

# Avisar a un usuario de un pago pendiente
  -d '{"to":"ana@correo.com","type":"billing","title":"Pago pendiente","body":"Renueva tu plan.","link":"/settings"}'
```

`link` solo admite rutas internas (`/settings`) o enlaces `https://`.

## Compartir archivos (enlaces públicos)

Crea un enlace como `https://TU-DOMINIO/s/<token>`. Quien lo abre ve **solo ese
archivo** (vista previa, nombre, tamaño, quién lo compartió y botón de descarga),
aunque no tenga cuenta. Nunca ve el proyecto ni otros archivos.

| Método y ruta | Descripción | Auth |
|---|---|---|
| `POST /shares` | `{file_id, expires_in_days?}` → crea el enlace (si ya existe uno vigente lo devuelve, `created:false`) | cookie o key |
| `GET /shares/:token` | Datos del enlace: `url`, archivo, `views`, `downloads`, vencimiento | cookie o key (dueño) |
| `DELETE /shares/:token` | Deja de compartir (el enlace deja de funcionar al instante) | cookie o key (dueño) |
| `GET /public/shares/:token` | Datos públicos del archivo (nombre, tamaño, tipo, dueño, `preview`, `download_url`) | pública |
| `GET /public/shares/:token/preview` | Vista previa en línea: imagen, audio, video, PDF o texto (`?cover=1`: portada de la canción). HTML/SVG/JS nunca se muestran | pública |
| `GET /public/shares/:token/download` | Descarga el archivo | pública |

Borrar el archivo también borra sus enlaces.

## Ejemplos para una app móvil (con API key)

```bash
# Listar proyectos
curl https://nubiflygo.com/api/v1/projects \
  -H "Authorization: Bearer sk_tu_clave"

# Crear un proyecto
curl -X POST https://nubiflygo.com/api/v1/projects \
  -H "Authorization: Bearer sk_tu_clave" \
  -H "Content-Type: application/json" \
  -d '{"name":"Mi proyecto","color":"#3b82f6"}'

# Subir (publicar) un archivo
curl -X POST https://nubiflygo.com/api/v1/files/upload \
  -H "Authorization: Bearer sk_tu_clave" \
  -F "file=@cancion.mp3" -F "project_id=UUID_DEL_PROYECTO"

# Ver el perfil del dueño de la clave
curl https://nubiflygo.com/api/v1/account/profile \
  -H "Authorization: Bearer sk_tu_clave"
```

En Android/Kotlin, Swift o React Native es lo mismo: añade la cabecera
`Authorization: Bearer sk_...` a cada petición HTTPS.


## Respuesta de `POST /files/upload`

Devuelve una estructura profesional (HTTP 201 en éxito):

```json
{
  "success": true,
  "status": 201,
  "message": "Archivo subido correctamente.",
  "data": { "item": {
    "id": "...", "owner_id": "...", "name": "...", "original_name": "...",
    "extension": "png", "mime_type": "image/png", "type": "image", "icon": "image",
    "banner":    { "enabled": false, "url": null, "width": null, "height": null, "fit": "cover" },
    "thumbnail": { "available": false, "url": null, "width": null, "height": null },
    "preview":   { "available": true, "url": "/api/v1/files/<id>/download" },
    "size": { "bytes": 12345, "formatted": "12.1 KB" },
    "storage": { "provider": "s3", "visibility": "private" },
    "metadata": { "category": "image", "width": 1200, "height": 800, "checksum_sha256": "..." },
    "project_id": null, "status": "ready",
    "created_at": "2026-10-14T17:15:23.006Z", "updated_at": "2026-10-14T17:15:23.006Z"
  } },
  "error": null
}
```

- Todos los archivos son **privados** (`visibility: "private"`): solo el dueño
  puede ver, descargar o consultar (`GET /files/:id`, `GET /files/:id/download`).
- `checksum_sha256` y dimensiones (`width`/`height` para PNG/JPEG/GIF) se calculan
  al subir. `banner` y `thumbnail` aún no se generan → `false`/`null` (no se
  devuelven URLs de recursos inexistentes). `preview` de imágenes usa la ruta de
  descarga protegida.

## Listas completas

### `GET /files`

Devuelve **todos** los archivos del usuario. Cada uno trae los mismos datos que
`GET /files/:id`: nombre, extensión, `mime_type`, tipo, icono, tamaño
`{ "bytes", "formatted" }`, portada (`thumbnail`/`banner`), datos de la canción
(`media`), dimensiones, checksum, proyecto, publicado y fechas. También vienen
los alias `mime` y `thumb_url`.

> Cambio: antes `size` era un número; ahora es `{ "bytes": 12345, "formatted": "12.1 KB" }`
> (igual que en la subida y el detalle).

Además de `items` trae `total` y `stats` con la cantidad, el espacio usado y
el conteo por tipo:

```json
{ "success": true, "items": [ … ], "total": 150, "page": 1, "limit": 150, "has_more": false,
  "stats": { "count": 150, "bytes": 450123456, "size_formatted": "429.3 MB",
             "by_type": { "image": 10, "video": 2, "audio": 130, "document": 6, "archive": 1, "other": 1 } } }
```

Parámetros opcionales:

| Parámetro | Ejemplo | Qué hace |
|---|---|---|
| `type` | `audio` | `image`, `video`, `audio`, `document`, `archive` u `other` |
| `project_id` | `UUID` o `none` | archivos de un proyecto, o sin proyecto |
| `q` | `mar azul` | busca en el nombre, título, artista y álbum |
| `published` | `true` / `false` | solo publicados o no publicados |
| `sort` | `newest` (predeterminado), `oldest`, `name`, `size` | orden |
| `page`, `limit` | `page=2&limit=50` | paginación (máx. 100). Sin ellos devuelve todo |

### `GET /projects`

Cada proyecto trae su información completa:

```json
{ "id": "…", "name": "Música", "doc_count": 5, "file_count": 110,
  "stats": { "documents": 5, "files": 110, "total_items": 115, "published": 3, "api_keys": 1,
             "storage": { "bytes": 315000000, "formatted": "300.4 MB" } },
  "items_url": "/api/v1/projects/<id>/items" }
```

Con `?include=items`, cada proyecto incluye también todos sus elementos (`items`).

### `GET /projects/:id` y `GET /projects/:id/items`

- `GET /projects/:id?all=1` devuelve **todos** los documentos y archivos (sin
  paginar). Sin `all` sigue paginando de 20 en 20 (`page`, `limit`).
- `GET /projects/:id/documents?all=1` y `GET /projects/:id/files?all=1`: igual, por colección.
- `GET /projects/:id/items` devuelve todos los elementos juntos, los más
  recientes primero. Cada uno lleva `kind: "document"` o `kind: "file"`. Filtros
  opcionales: `kind`, `q`, `published`, `type` (solo archivos), `page`/`limit`.

## Borrado masivo

Todas estas peticiones aceptan un cuerpo JSON con **una** de estas dos formas:

- `{"all": true}` borra **todo**;
- `{"ids": ["uuid", …]}` borra los elegidos (máximo 1000 por petición).

Si tu cliente no puede enviar cuerpo en `DELETE`, usa la variante `POST …/delete`
con el mismo JSON. Una API key de solo lectura recibe **403**. Cada usuario
solo puede borrar lo suyo.

| Petición | Borra |
|---|---|
| `DELETE /files` · `POST /files/delete` | archivos (registro, binario y portada) |
| `DELETE /projects/:id/items` · `POST /projects/:id/items/delete` | documentos y archivos del proyecto; el proyecto se conserva. Opcional `"kind": "document"` o `"file"` |
| `DELETE /projects/:id/documents` · `DELETE /projects/:id/files` | todos los documentos, o todos los archivos, del proyecto |
| `DELETE /projects` · `POST /projects/delete` | proyectos con todo su contenido |
| `DELETE /projects/:id` | un proyecto con todo su contenido |

Con `{"all": true}` en `/files` también se pueden usar los filtros de la lista,
por ejemplo `{"all": true, "filters": {"type": "audio"}}` borra solo la música.
Los filtros admitidos son `type`, `project_id`, `q` y `published`. En un borrado
son **estrictos**: un filtro vacío (`""` o `null`), con un valor no válido o con
un nombre desconocido responde **400** y no borra nada (nunca se ignora, porque
ignorarlo convertiría «borrar lo filtrado» en «borrar todo»). Lo mismo con
`kind` al vaciar un proyecto.

Respuesta:

```json
{ "success": true, "message": "Se eliminaron 150 archivos.", "deleted": 150,
  "remaining": 0, "done": true, "freed": { "bytes": 450123456, "formatted": "429.3 MB" } }
```

En proyectos, `deleted` es `{ "projects", "documents", "files" }` o
`{ "documents", "files", "total" }`.

**Por tandas:** los archivos se borran del almacenamiento por lotes (hasta 1000
en una sola llamada a S3). Si tu proveedor S3 no admite el borrado por lotes,
cada petición borra lo que cabe en el límite de Cloudflare. En ese caso
`remaining` es mayor que 0 y hay que **repetir la misma petición** hasta que
`done` sea `true`. Al borrar un proyecto grande, la respuesta es **202**
(`"pending": true`) mientras falte contenido. La app web repite sola.

```bash
# Borrar todos los archivos (repite mientras "remaining" > 0)
curl -X POST https://nubiflygo.com/api/v1/files/delete \
  -H "Authorization: Bearer sk_tu_clave" -H "Content-Type: application/json" \
  -d '{"all": true}'

# Vaciar un proyecto
curl -X POST https://nubiflygo.com/api/v1/projects/UUID/items/delete \
  -H "Authorization: Bearer sk_tu_clave" -H "Content-Type: application/json" \
  -d '{"all": true}'

# Todos los elementos de un proyecto
curl https://nubiflygo.com/api/v1/projects/UUID/items \
  -H "Authorization: Bearer sk_tu_clave"
```
