# API global de la app Android: actualizaciones, mantenimiento y suspensión

La app Android consulta **una sola URL**: `https://nubiflygo.com/api/v1/app/status`. Con esa
respuesta decide si puede seguir, si está en mantenimiento, si fue suspendida o si debe
actualizarse. La configuración vive en la base de datos y solo la cambia un administrador.

No hay nombres de archivos APK ni rutas generadas: el administrador registra la URL https de
descarga que quiera. Tampoco hay changelog, diálogos ni botones: eso lo decide la app.

## 1. Arquitectura

```
App Android ──GET /api/v1/app/status?build=N──▶ Functions (Cloudflare) / server (Node)
     │                                                 │
     │  resto de la API con                           ├─ functions/_shared/appcontrol.js  ← lógica única
     │  X-NubiFly-Client: android                     │     (estado, validación, bloqueo, historial)
     │  X-App-Build: N                                ├─ functions/api/v1/app/_logic.js    (público)
     ▼                                                 ├─ functions/api/v1/admin/_logic.js  (admin)
 _middleware (androidGate) ── 503 / 426 si toca ──────┤─ server/routes/app.js            (Node, mismo módulo)
                                                       ▼
                                          PostgreSQL: app_control + app_control_audit
```

- **Una sola lógica**: `functions/_shared/appcontrol.js` es un módulo puro. Lo importan las
  Functions y el servidor Node; las respuestas son iguales en los dos.
- **Bloqueo en el servidor**: no basta con que la app obedezca. Toda petición con
  `X-NubiFly-Client: android` pasa por `androidGate` (en `functions/_middleware.js` y
  `server/routes-api.js`) y se rechaza si la app está suspendida, en mantenimiento o por debajo
  de la compilación mínima. Quedan libres `/api/v1/app/status` (la app necesita leerlo) y
  `/api/v1/admin/*` (para poder reactivar).
- **La web no se ve afectada**: el bloqueo solo aplica a la app Android.
- **Cambios en tiempo real**:
  - `/app/status` siempre lee la configuración vigente.
  - El bloqueo del resto de la API usa una caché en memoria de **15 segundos como máximo**
    por instancia.
  - En el servidor Node, guardar un cambio limpia la caché al instante. En Cloudflare cada
    instancia la renueva en esos 15 s.

## 2. Base de datos

Las tablas se crean solas (idempotente) y también están en `server/esquema-completo.sql` y
`server/schema.sql`.

**`app_control`**: una fila por plataforma (`android`).

| Columna | Tipo | Uso |
|---|---|---|
| `platform` | TEXT PK | `android` |
| `environment` | TEXT | `production`, `staging`… |
| `latest_version` / `latest_build` | TEXT / INT | Última versión publicada |
| `release_date` | TIMESTAMPTZ | Se fija sola al cambiar la compilación |
| `download_url` | TEXT | URL https que registra el admin |
| `min_supported_version` / `min_supported_build` | TEXT / INT | Debajo de esto, la actualización es obligatoria y la API responde 426 |
| `force_update` | BOOL | Toda actualización disponible es obligatoria |
| `maintenance_active`, `maintenance_message`, `maintenance_starts_at`, `maintenance_ends_at` | | Mantenimiento (con ventana opcional) |
| `suspension_active`, `suspension_reason`, `suspension_message`, `suspended_at` | | Suspensión |
| `updated_at`, `updated_by` | | Último cambio |

Restricciones de la tabla:
- `CHECK (min_supported_build <= latest_build)`.
- Compilaciones ≥ 1.

**`app_control_audit`**: historial de cada cambio administrativo.

| Columna | Uso |
|---|---|
| `section` | `update` \| `maintenance` \| `suspension` |
| `admin_id`, `admin_email`, `ip` | Quién y desde dónde |
| `before`, `after` (JSONB) | Fila completa antes y después |
| `created_at` | Cuándo |

El cambio y su registro se escriben en **una sola sentencia SQL**: no puede quedar un cambio
sin historial.

## 3. Endpoints

| Método | Ruta | Acceso | Límite |
|---|---|---|---|
| GET | `/api/v1/app/status` | Público | 120 por minuto por IP |
| GET | `/api/v1/admin/app` | Admin (sesión) | 60 por minuto |
| GET | `/api/v1/admin/app/audit?limit=50` | Admin (sesión) | 60 por minuto |
| PUT | `/api/v1/admin/app/update` | Admin (sesión) | 60 por minuto |
| PUT | `/api/v1/admin/app/maintenance` | Admin (sesión) | 60 por minuto |
| PUT | `/api/v1/admin/app/suspension` | Admin (sesión) | 60 por minuto |

### Autenticación y permisos
- **Administrador**: sesión web iniciada (cookie `nubiflygo_session`) con `users.is_admin = true`
  o con el correo en `ADMIN_EMAILS`. El rol se revisa **en el servidor** en cada petición.
- **Las API keys no pueden administrar** (403), aunque sean de un administrador.
- Sin sesión → 401. Usuario normal → 403.
- Los cuerpos deben ser JSON válido (si no, 400). Se rechazan campos desconocidos y tipos
  incorrectos.
- Cada cambio queda en `app_control_audit` y en el registro de seguridad
  (`admin_app_update`, `admin_app_maintenance`, `admin_app_suspension`).

## 4. Estado público: `GET /api/v1/app/status`

La app envía su compilación (`versionCode`) por query o cabecera:

```
GET /api/v1/app/status?build=11&version=1.1.5
X-NubiFly-Client: android
X-App-Build: 11
X-App-Version: 1.1.5
```

Respuesta (`Cache-Control: no-store`):

```json
{
  "success": true,
  "status": "ok",
  "server_time": "2026-10-19T20:57:33.143Z",
  "app": { "platform": "android", "environment": "production" },
  "suspension": { "active": false, "reason": null, "message": null, "suspended_at": null },
  "maintenance": { "active": false, "message": null, "starts_at": null, "ends_at": null },
  "update": {
    "available": true,
    "mandatory": false,
    "min_supported_version": "1.1.0",
    "min_supported_build": 10,
    "latest": {
      "version": "1.2.0",
      "build": 12,
      "release_date": "2026-10-19T20:57:33.029Z",
      "download_url": "https://dl.nubiflygo.com/android/1.2.0"
    }
  }
}
```

### Lógica de actualización (la calcula el servidor)
- `available = build < latest.build`
- `mandatory = available && (build < min_supported_build || force_update)`
- `status`, por prioridad: `suspended` > `maintenance` > `update_required` > `ok`.
- Sin `build` no se puede decidir: `available` y `mandatory` son `false`.

| Compilación instalada | available | mandatory | status |
|---|---|---|---|
| 12 (= latest) | false | false | `ok` |
| 11 (≥ mínimo 10) | true | false | `ok` |
| 9 (< mínimo 10) | true | true | `update_required` |

**Mantenimiento**:
- `active` es `true` solo si está activado **y** dentro de su ventana (`starts_at` ≤ ahora <
  `ends_at`, si existen).
- Un mantenimiento programado a futuro responde `active: false`, con su mensaje y sus fechas.

## 5. Operaciones del administrador (ejemplos)

Todas devuelven `{ "success": true, "section": "…", "config": { … } }`.

### Publicar una versión: `PUT /api/v1/admin/app/update`

```json
{
  "version": "1.2.0",
  "build": 12,
  "download_url": "https://dl.nubiflygo.com/android/1.2.0",
  "min_supported_version": "1.1.0",
  "min_supported_build": 10,
  "mandatory": false
}
```

Reglas del cuerpo:
- Todos los campos son opcionales: solo cambia lo que envías.
- También acepta `release_date` (ISO con zona) y `environment`.
- `mandatory: true` vuelve obligatoria cualquier versión anterior.

Respuesta:

```json
{
  "success": true,
  "section": "update",
  "config": {
    "platform": "android",
    "environment": "production",
    "update": {
      "version": "1.2.0", "build": 12, "release_date": "2026-10-19T20:57:33.029Z",
      "download_url": "https://dl.nubiflygo.com/android/1.2.0",
      "min_supported_version": "1.1.0", "min_supported_build": 10, "mandatory": false
    },
    "maintenance": { "active": false, "in_effect": false, "message": null, "starts_at": null, "ends_at": null },
    "suspension": { "active": false, "reason": null, "message": null, "suspended_at": null },
    "updated_at": "2026-10-19T20:57:33.029Z"
  }
}
```

Reglas de `download_url`:
- Solo `https://`, con dominio público.
- No acepta IP, `localhost`, `.local`, usuario o contraseña en la URL.
- Máximo 2048 caracteres. `null` la quita.

### Mantenimiento: `PUT /api/v1/admin/app/maintenance`

```json
{ "active": true, "message": "Mejoras en el servidor.", "starts_at": "2026-10-20T03:00:00Z", "ends_at": "2026-10-20T04:00:00Z" }
```

Reglas:
- `active` es obligatorio.
- `message` admite hasta 500 caracteres.
- Las fechas van en ISO 8601 con zona y `ends_at` debe ser posterior a `starts_at`.
- Sin fechas, el mantenimiento empieza en ese momento.

Para terminarlo: `{ "active": false }`, que también limpia las fechas.

### Suspensión: `PUT /api/v1/admin/app/suspension`

```json
{ "active": true, "reason": "Revisión de seguridad", "message": "La app está suspendida temporalmente." }
```

Reglas:
- `reason` admite hasta 200 caracteres y `message` hasta 500.
- `suspended_at` lo pone el servidor.

Para reactivar: `{ "active": false }`.

### Ver configuración e historial

`GET /api/v1/admin/app` devuelve `config` y los últimos 20 cambios.

`GET /api/v1/admin/app/audit?limit=1`:

```json
{
  "success": true,
  "items": [{
    "id": 34, "section": "suspension", "admin_email": "admin@ejemplo.com", "ip": "203.0.113.7",
    "before": { "suspension_active": true, "suspension_reason": "Revisión de seguridad", "suspension_message": "La app está suspendida temporalmente.", "suspended_at": "2026-10-19T20:57:33.106+00:00" },
    "after":  { "suspension_active": false, "suspension_reason": null, "suspension_message": null, "suspended_at": null },
    "created_at": "2026-10-19T20:57:33.130Z"
  }]
}
```

### Errores

```json
{ "success": false, "error": "download_url debe usar https://." }        // 400
{ "success": false, "error": "Campos no permitidos: foo." }              // 400
{ "error": "No autenticado." }                                            // 401
{ "error": "Acceso solo para el administrador." }                         // 403
{ "error": "Demasiados intentos. Espera un momento e inténtalo de nuevo.", "retry_after": 42 }  // 429 (+ Retry-After)
```

## 6. Bloqueo del resto de la API (para la app)

Toda petición de la app debe llevar `X-NubiFly-Client: android` y `X-App-Build: <versionCode>`.

| Situación | HTTP | Cuerpo |
|---|---|---|
| Suspendida | 503 | `{"success":false,"error":"La app está suspendida temporalmente.","code":"app_suspended","reason":"Revisión de seguridad"}` |
| Mantenimiento vigente | 503 | `{"success":false,"error":"Mejoras en el servidor.","code":"maintenance","ends_at":"2026-10-20T04:00:00.000Z"}` |
| Compilación < mínima | 426 | `{"success":false,"error":"Esta versión de la app ya no es compatible. Actualízala para continuar.","code":"update_required","min_supported_build":10,"download_url":"https://dl.nubiflygo.com/android/1.2.0"}` |

Notas:
- La suspensión bloquea también el inicio de sesión: `/api/v1/account/login` y, en Cloudflare,
  `/auth/*` (Google y GitHub).
- Si la app recibe uno de estos códigos, debe volver a consultar `/app/status`.
  `AppStatusClient.blockedAction(code, errorCode)` lo detecta.

## 7. Cliente Android (Java)

Está en `android-client/src/main/java/com/nubiflygo/appstatus/`. Solo depende de `org.json`,
que viene con Android.

| Clase | Qué hace |
|---|---|
| `AppStatusClient` | Hace la consulta HTTPS y entrega el resultado (ver detalles abajo). |
| `AppStatus` | Modelo inmutable con parseo estricto: si falta un campo o tiene otro tipo, se lanza `InvalidResponseException`. |
| `AppDecision` | Decide la acción, en este orden: **suspensión → mantenimiento → actualización obligatoria → opcional → OK**. También compara las compilaciones en la app. `safeDownloadUrl()` solo devuelve URLs https. |
| `StatusCache` | Guarda el último estado válido para usarlo sin conexión. Va asociado a la compilación instalada. |

Cómo funciona `AppStatusClient`:
- Consulta con `HttpsURLConnection` y no sigue redirecciones.
- Tiempos límite: 8 s para conectar y 10 s para leer. Respuesta máxima de 64 KB.
- Hace un reintento si falla la red.
- Trabaja en segundo plano y entrega el resultado en el hilo principal.

Uso:

```java
AppStatusClient client = new AppStatusClient(context, BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME);
client.check(new AppStatusClient.Callback() {
    @Override public void onDecision(AppDecision d) {
        switch (d.action) {
            case SUSPENDED:        /* mostrar d.status.suspension.message y no continuar */ break;
            case MAINTENANCE:      /* mostrar d.status.maintenance.message */ break;
            case UPDATE_REQUIRED:  /* abrir d.safeDownloadUrl(); no continuar */ break;
            case UPDATE_AVAILABLE: /* sugerir d.safeDownloadUrl(); se puede continuar */ break;
            case OK:               /* continuar */ break;
        }
    }
    @Override public void onUnavailable(AppStatusClient.Failure f) {
        // NETWORK, TIMEOUT, RATE_LIMITED, HTTP_ERROR o INVALID_RESPONSE, sin estado guardado.
        // El servidor bloquea igual (503/426), así que dejar continuar sin red es seguro.
    }
});
```

### Errores de red y respuestas inválidas
- **Sin red, tiempo agotado o error HTTP**:
  - Se reintenta una vez.
  - Si sigue fallando, se usa el último estado válido guardado (`d.fromCache = true`).
  - Si no hay ninguno, se llama a `onUnavailable`.
- **Respuesta inválida** (no es JSON, faltan campos o los números no cuadran): no se guarda y
  se trata igual que un fallo de red.
- **Mantenimiento leído de la caché**: no bloquea, porque pudo haber terminado. La suspensión y
  la versión obligatoria sí se respetan.
- **429**: `RATE_LIMITED`. La app no debe consultar más de una vez por arranque o regreso a
  primer plano.

## 8. Qué se probó
- **Servidor Node** (41 comprobaciones):
  - Forma del JSON.
  - 401/403 para quien no es admin.
  - Validación de URL, JSON, fechas y campos.
  - Cálculo por compilación.
  - 426, y 503 por mantenimiento y por suspensión; la web no se ve afectada.
  - Mantenimiento programado.
  - El admin puede entrar durante la suspensión.
  - Historial con antes y después.
- **Functions de Cloudflare** (19 comprobaciones, ejecutadas localmente contra PostgreSQL):
  - Lo mismo, y además que una API key de un admin no puede administrar.
  - El bloqueo del middleware, incluido `/auth/*` durante la suspensión.
- **Cliente Java**:
  - Compilado y ejecutado contra el servidor por HTTPS.
  - Decisiones OK, opcional, obligatoria, obligatoria por `force_update`, mantenimiento y
    suspensión.
  - Sin red con y sin caché.
  - Respuesta no JSON y HTTP 404.
- **No probado**:
  - En un dispositivo Android real.
  - En Cloudflare desplegado (sin credenciales).
