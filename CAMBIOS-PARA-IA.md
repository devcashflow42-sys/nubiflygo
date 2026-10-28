# CAMBIOS-PARA-IA.md — Qué se cambió y cómo (para la siguiente inteligencia artificial)

Este archivo resume el trabajo hecho en NubiFlyGo para que otro agente pueda seguir sin
leer toda la conversación. **Lee primero `CLAUDE.md`** (reglas del proyecto); aquí solo va
qué se hizo, dónde y por qué.

- Rama de trabajo: `ccr-953befa1-9b68i6` (la misma de siempre; también se copió a
  `ccr-606fcc16-ti4l7g`). No crear ramas nuevas.
- Idioma de la interfaz: español (México). Nada de nombres de modelos de IA en código,
  commits ni documentos.
- Toda API va en los **dos** backends: `functions/` (Cloudflare, producción) y `server/`
  (Node/Express, pruebas locales). Tablas nuevas en `server/esquema-completo.sql` **y**
  `server/schema.sql`.

---

## 1. Lista de cambios en orden (commit → qué hace)

| Commit | Cambio |
|---|---|
| `04a2000` | Paginación y reproductor: un solo flotante al cambiar de hoja (antes se encimaban). |
| `406d48a` | Paginación de cristal (borde blanco, fondo translúcido) y la canción que suena queda marcada en la lista, como Spotify / YouTube Music. |
| `2f39dcb` | Anillo de progreso alrededor de la portada de la paginación. |
| `eb9381f` | **Películas** para planes de pago: subida por partes, compresión con ffmpeg, declaración de derechos de autor y reportes. |
| `bd96bdf` | Esqueletos con brillo (shimmer) en todas las secciones mientras cargan. |
| `4ba355f` → `78d32be` | API keys: la sección global solo muestra claves de la **cuenta**; las de proyecto viven solo en la pestaña «API key» del proyecto. |
| `8edaa55` | Versión nueva del zip del usuario: guardia de sesión (`auth-guard`), pantallas vacías con icono, pruebas. |
| `e1140f0` | La recarga ya no muestra «Verificando tu sesión»; el aviso solo sale si el servidor no está listo. |

---

## 2. Detalle de cada cambio

### 2.1 Reproductor flotante y paginación
- Archivos: `public/js/widgets/music.js`, `public/css/widgets.css`, `public/css/components.css`,
  `public/css/library.css`, `public/js/views/library.js`.
- La paginación va **dentro** del reproductor flotante cuando hay música; nunca dos flotantes.
- Estilo de cristal: borde blanco y fondo translúcido con `backdrop-filter`.
- La fila de la canción que suena lleva una clase de «reproduciendo» (ecualizador animado) en
  `library.js`.
- Anillo de progreso: **un solo** anillo SVG alrededor de la mini portada. Lección aprendida:
  no sumar onda + pista + borde (se veían varios círculos al terminar la canción).
- El usuario eligió dejar **5 columnas** en escritorio; no cambiar.

### 2.2 Películas (solo planes de pago)
- **Lógica compartida**: `functions/_shared/movies.js` (límites, validación, cálculo de partes);
  `functions/_shared/storage.js` (funciones multipart S3 con aws4fetch, `UNSIGNED-PAYLOAD`).
- **API** (en los dos backends):
  - `functions/api/v1/files/_logic.js`
  - `server/routes/files.js`
  - `server/storage.js` (AWS SDK o disco local)
  - Rutas:
    - `POST /files/multipart` abre la subida. Exige `accept_rights: true` y un plan de pago.
    - `PUT /files/multipart/:id/parts/:n` sube una parte.
    - `GET /files/multipart/:id` devuelve las partes recibidas para reanudar.
    - `POST /files/multipart/:id/complete` une las partes y crea el archivo.
    - `DELETE /files/multipart/:id` cancela la subida.
  - La documentación está en `API.md`, en la sección «Películas».
- **Compresor**: `server/transcoder.js` (`npm run transcoder`).
  - Toma trabajos de `video_jobs` con `FOR UPDATE SKIP LOCKED`.
  - Convierte a 720p H.264 y reemplaza el original.
  - Usa `protocol_whitelist file` y una lista de formatos permitidos.
  - Variables:
    - `FFMPEG_PATH`, `FFPROBE_PATH`
    - `TRANSCODE_HEIGHT`, `TRANSCODE_CRF`, `TRANSCODE_PRESET`
    - `TRANSCODER_TMP`
    - `MAX_MOVIE_SIZE_GB`
- **Tablas nuevas** (en los dos .sql):
  - `multipart_uploads` y `video_jobs`.
  - `rights_acceptances`: la declaración de derechos. **No tiene llaves foráneas a propósito:
    nunca se borra**, aunque se borren el archivo o el usuario. El usuario es el único
    responsable del contenido.
  - `share_reports`: los reportes. Además, la columna `files.takedown_at` marca los archivos
    dados de baja.
- **Reportes y moderación**:
  - `POST /public/shares/:token/report` es pública, con un máximo de 5 por hora.
  - Rutas de administración:
    - `GET /admin/reports`
    - `POST /admin/reports/:id/remove`: da de baja el archivo, borra sus enlaces y no permite
      volver a compartirlo.
    - `POST /admin/reports/:id/dismiss`
  - Archivos: `functions/api/v1/public/_logic.js`, `functions/api/v1/admin/_logic.js`,
    `functions/api/v1/shares/_logic.js` y `server/routes/shares.js`.
- **Frontend**:
  - `public/js/media.js`:
    - `movieDialog` analiza duración, resolución y tamaño, y estima el tamaño comprimido.
    - `uploadMovie` y `xhrPart` hacen la subida por partes con progreso.
  - `public/js/sharing.js` (`askRights`) pide la declaración de derechos antes de compartir.
  - `public/js/share.js` (`openReport`) tiene el botón «Reportar» en la página pública.
  - `public/js/views/settings.js` (`tabModeration`) es la pestaña de moderación del administrador.
  - Estilos: `public/css/movies.css` y `public/css/share.css`.
- `public/js/components/overlays.js`:
  - `modal()` tiene ahora la opción `onClose` y un guardia `modalSeq`.
  - Así, el cierre de un modal ya no borra el siguiente que se abre (pasaba de `askRights` a
    compartir).

### 2.3 Esqueletos (shimmer)
- `public/js/skeleton.js` tiene las funciones `skelRows`, `skelTabs`, `skelHero` y
  `skelCollections`, y marca las imágenes al terminar de cargar.
- CSS en `public/css/components.css`: clase `.sk` y animación `sk-sweep`. Las imágenes sin
  cargar usan `:has(> img:not(.is-loaded))`.
- Se usan en estos archivos:
  - `dashboard.js`, `projects.js`, `library.js` (parámetro de carga en `projectHero`)
  - `files.js`, `notes.js`, `billing.js`, `settings.js`
  - `nav.js`: los contadores muestran `is-loading`.
  - `session.js`: la tarjeta de almacenamiento.
  - `share.html`
- Los contadores del menú se redibujan con `renderNav` en el `.then` de cada carga (antes se
  quedaban cargando).

### 2.4 API keys
- `public/js/views/apikeys.js`:
  `function accountKeys() { return (store.apiKeys || []).filter(k => !k.project_id); }`.
- Esa lista se usa en la sección API keys, en el contador del menú (`nav.js`) y en la tarjeta
  del Inicio (`dashboard.js`).
- **Lo que pidió el usuario:** las claves de proyecto **no** aparecen ni cuentan en la sección
  global; solo en la pestaña «API key» del proyecto. El primer intento (agrupar las claves por
  tipo) **no** le gustó.

### 2.5 Guardia de sesión (`auth-guard`)
- Archivos: `public/js/auth-guard.js`, `public/css/auth-guard.css` y pruebas en
  `tests/auth-guard.test.mjs` y `tests/auth-browser.cjs`.
- Se carga en el `<head>` de `home.html` y `bienvenida.html`.
- Envuelve `window.fetch`: un **401** de cualquier API privada (`/api/v1/*` excepto
  `/api/v1/public/*`) manda a `/login`.
- Comprueba `/api/v1/account/profile` al cargar, al enfocar la pestaña, al volver visible y
  cada 60 s. Las cuentas nuevas (`onboarded_at === null`) van a `/bienvenida`.
- **Cambio de `e1140f0`** (queja del usuario: el mensaje salía en cada recarga):
  - La app se ve **directo** mientras se verifica. Los datos privados solo llegan de APIs
    autenticadas, así que no hace falta taparla.
  - La pantalla completa solo sale en estos casos:
    - **Sesión vencida (401)**: «Volviendo al inicio de sesión».
    - **El servidor responde con error no-401 en la primera carga**: «El servidor no está
      listo». El aviso consulta `/api/v1/health` y lista `missingConfig` (por ejemplo
      `JWT_SECRET`, `DATABASE_URL`) o avisa que no hay base de datos. Lleva icono de
      advertencia y botón Reintentar. El texto pasa por `esc()`.
  - Las revisiones de fondo y los cortes de red **no** tapan la app.
  - Al volver con atrás/adelante (bfcache), la página guardada se oculta **sin texto** hasta
    confirmar. Si no se puede comprobar, muestra el aviso de error y no los datos guardados.
    Así se evita ver datos de otra sesión.
- Antes de `8edaa55`, `apiclient.js` y `session.js` llamaban a `showServerBanner`; ahora el 401
  usa `window.NubiAuth.requireLogin()`.

---

## 3. Cómo probar en local (lo que funcionó)
1. Postgres local está en el puerto 5433 (`server/.env`). Si se cae tras reiniciar el
   contenedor, se levanta así:
   ```
   rm -f /var/tmp/nubipg/data/postmaster.pid
   su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/nubipg/data -o '-p 5433' -l /var/tmp/nubipg/pg2.log start"
   ```
2. Servidor:
   ```
   cd server && env -u DATABASE_URL node server.js
   ```
   Escucha en `http://127.0.0.1:8080`. Hay que quitar `DATABASE_URL` porque la del
   contenedor pisa la del `.env`.
3. Para apagarlo: `pgrep -f "^node server.js" | xargs -r kill`. **No** usar
   `pkill -f "node server.js"`, porque mata la propia terminal.
4. Pruebas:
   - `node --test tests/auth-guard.test.mjs` (12 pruebas).
   - `tests/auth-browser.cjs` con Playwright, ejecutado **desde otra carpeta**, porque escribe
     en `deliverables/`.
5. Para registrarse por API hay que mandar las cabeceras `Origin` y `X-NubiFly-Client: web`,
   o responde 403. Después se pone `onboarded_at` en la base de datos para saltar la
   bienvenida.

## 4. Huecos conocidos (ya estaban antes, no se arreglaron)
- El servidor Node no tiene `GET /files/:id`, `/api/v1/stream` ni `/auth/google`, por eso en
  local salen 404 en la consola.
- Cloudflare no se probó porque no hay credenciales; solo se probó el backend Node.
- El aviso «El servidor no está listo» muestra a cualquier visitante los nombres de las
  variables que faltan. Se dejó así a propósito porque el usuario lo pidió; se puede limitar
  al administrador.
- En Android, el saludo «Hola, …» queda con poco aire bajo la barra superior (detalle de
  diseño anterior).

## 5. Gustos del usuario (respetar)
- Le gustan:
  - el login con 3 botones rectangulares solo con icono;
  - la tarjeta dorada con corona para suscriptores;
  - un solo anillo de progreso;
  - la paginación de cristal.
- Pide ver que funciona: capturas en escritorio (1366 px) y Android (390 px), y videos.
- Antes de entregar, revisar con los agentes `ojo-diseno` y `ojo-seguridad`
  (`.claude/agents/`).
