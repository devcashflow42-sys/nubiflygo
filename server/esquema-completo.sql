-- ==========================================================================
-- NubiFlyGo — Esquema COMPLETO de la base de datos (PostgreSQL / Neon)
-- Copia y pega TODO esto en el SQL Editor de Neon y ejecútalo.
-- Es idempotente: puedes ejecutarlo las veces que quieras sin romper nada
-- (usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). No borra datos.
-- Incluye: cuentas, proyectos, notas, documentos, archivos, actividad,
-- API keys, publicación (Publicados), cuentas de invitado, idioma, plan y
-- foto de perfil. Sirve tanto para una base nueva como para actualizar una
-- base existente (añade lo que falte).
-- ==========================================================================

-- gen_random_uuid() viene incluido en PostgreSQL 13+ (Neon): no hace falta
-- ninguna extensión.

-- ─────────────────────────── Usuarios ───────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Cuentas de invitado (prueba temporal que se elimina al expirar, p. ej. 24 h)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_expires_at TIMESTAMPTZ;
-- Idioma del usuario (se detecta del navegador al registrarse y se guarda)
ALTER TABLE users ADD COLUMN IF NOT EXISTS language         TEXT NOT NULL DEFAULT 'es';
-- Foto de perfil (p. ej. la de Google al entrar con Google)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url       TEXT;
-- Foto subida desde Ajustes (data URL redimensionada en el navegador)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data      TEXT;
-- Plan y administrador (para el futuro panel de administración)
--   plan: 'free' (gratis, por defecto) | 'pro' | 'unlimited' …
--   is_admin: marca manual opcional. El admin principal se verifica en el
--   servidor con la variable de entorno ADMIN_EMAILS (el correo NO va en el
--   código ni aquí). Esta columna es solo un refuerzo opcional.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan             TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin         BOOLEAN NOT NULL DEFAULT false;
-- Preferencias de interfaz guardadas en la cuenta (orden/posición de widgets flotantes)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_prefs         JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_users_guest_expiry ON users(guest_expires_at) WHERE is_guest;
-- (Opcional) Marcar tu cuenta como admin también en la BD. Reemplaza el correo
-- por el tuyo y ejecútalo solo tú:
--   UPDATE users SET is_admin = true WHERE lower(email) = 'tu-correo@ejemplo.com';

-- ─────────────────────────── Proyectos ───────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT '#2b5fff',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color       TEXT NOT NULL DEFAULT '#2b5fff';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- ─────────────────────────── Claves API ───────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  value       TEXT NOT NULL,
  permission  TEXT NOT NULL DEFAULT 'all',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used   TIMESTAMPTZ
);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'all';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_value ON api_keys(value);

-- ─────────────────────────── Uso de las API keys ───────────────────────────
-- Una fila por clave y día (UTC): éxitos (respuesta < 400) y fallas (≥ 400).
CREATE TABLE IF NOT EXISTS api_key_usage (
  key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  day    DATE NOT NULL,
  ok     INTEGER NOT NULL DEFAULT 0,
  err    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, day)
);

-- ─────────────────────────── Notas ───────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE notes ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

-- ─────────────────────────── Documentos ───────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
-- Publicación (que el estado "Publicado" se guarde y no se pierda al recargar)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ─────────────────────────── Archivos ───────────────────────────
-- (metadatos; el binario vive en el almacenamiento S3/local)
CREATE TABLE IF NOT EXISTS files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  size        BIGINT NOT NULL DEFAULT 0,
  mime        TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_key TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE files ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
-- Estructura profesional de la API de subida (/api/v1/files/upload)
ALTER TABLE files ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS meta          JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();
-- Publicación de archivos
ALTER TABLE files ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE files ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
-- Índices útiles para cargar un proyecto y sus publicaciones
CREATE INDEX IF NOT EXISTS idx_files_project     ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_project   ON api_keys(project_id);

-- ─────────────────────────── Actividad reciente ───────────────────────────
CREATE TABLE IF NOT EXISTS activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'info',
  text        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at DESC);

-- ─────────────────────────── Seguridad ───────────────────────────
-- Sesiones: al cambiar la contraseña sube la versión y las sesiones
-- anteriores (otros dispositivos) dejan de valer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- API keys: límite de peticiones por minuto (ventana y contador) y
-- vencimiento (expires_at; vacío = no vence).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rl_window  TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rl_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Límite de intentos (inicio de sesión, registro, invitados…): una fila por
-- clave ("login-ip:1.2.3.4", "login-fail:correo"…) con su ventana de tiempo.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count        INTEGER NOT NULL DEFAULT 0
);
-- (Opcional) limpieza de contadores viejos:
-- DELETE FROM rate_limits WHERE window_start < now() - interval '1 day';

-- ==========================================================================
-- (Opcional) Limpieza de invitados vencidos que nunca volvieron a entrar.
-- La app ya los elimina sola en la siguiente petición; esto es solo por si
-- quieres borrarlos manualmente de una vez. Descomenta para ejecutarlo:
-- DELETE FROM users WHERE is_guest AND guest_expires_at < now();
-- ==========================================================================

-- ─── Notificaciones (seguridad, suscripción, abuso, novedades) ───
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;  -- vencimiento del plan de pago
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'info',        -- info | feature | billing | security | warning
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  link        TEXT,
  dedupe_key  TEXT,                                -- evita avisos repetidos
  read_at     TIMESTAMPTZ,                         -- NULL = no leída
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;  -- borrada por el usuario (se oculta y no se vuelve a crear)
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
-- Dispositivos con los que el usuario inició sesión (para avisar de uno nuevo).
CREATE TABLE IF NOT EXISTS login_devices (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device      TEXT NOT NULL,
  ip          TEXT,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device)
);

-- ─── Suscripciones con Mercado Pago ───
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;  -- canceló la renovación
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mp_payment_id  TEXT NOT NULL UNIQUE,              -- id del pago en Mercado Pago (se aplica una sola vez)
  plan           TEXT NOT NULL,                     -- pro | mega | super
  amount         NUMERIC(10,2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'MXN',
  status         TEXT NOT NULL,                     -- approved | pending | rejected | …
  method         TEXT,                              -- visa, oxxo, account_money…
  period_end     TIMESTAMPTZ,                       -- hasta cuándo dio acceso este pago
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);

-- ─── Enlaces para compartir archivos (/s/<token>) ───
CREATE TABLE IF NOT EXISTS shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,                 -- 22 caracteres aleatorios (va en el enlace)
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,  -- borrar el archivo apaga el enlace
  expires_at  TIMESTAMPTZ,                          -- NULL = sin vencimiento
  views       INTEGER NOT NULL DEFAULT 0,
  downloads   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shares_file_idx ON shares (file_id);

-- ─────────────────────────── Comprobación ───────────────────────────

-- Al terminar verás las 13 tablas con su número de columnas.
SELECT table_name AS tabla, count(*) AS columnas
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('users', 'projects', 'api_keys', 'notes', 'documents', 'files', 'activity', 'api_key_usage', 'rate_limits', 'notifications', 'login_devices', 'payments', 'shares')
GROUP BY table_name
ORDER BY table_name;

-- Inicio de sesión con Google: ID fijo de la cuenta de Google (sub), una por usuario.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;

-- Control global de la app Android (GET /api/v1/app/status): versión publicada, URL de
-- descarga, mantenimiento y suspensión. Una fila por plataforma; solo la cambia un admin.
CREATE TABLE IF NOT EXISTS app_control (
  platform              TEXT PRIMARY KEY CHECK (platform IN ('android')),
  environment           TEXT NOT NULL DEFAULT 'production',
  latest_version        TEXT NOT NULL DEFAULT '1.0.0',
  latest_build          INTEGER NOT NULL DEFAULT 1 CHECK (latest_build >= 1),
  release_date          TIMESTAMPTZ,
  download_url          TEXT,                         -- HTTPS que registra el admin (no se genera)
  min_supported_version TEXT NOT NULL DEFAULT '1.0.0',
  min_supported_build   INTEGER NOT NULL DEFAULT 1 CHECK (min_supported_build >= 1),
  force_update          BOOLEAN NOT NULL DEFAULT false,
  maintenance_active    BOOLEAN NOT NULL DEFAULT false,
  maintenance_message   TEXT,
  maintenance_starts_at TIMESTAMPTZ,
  maintenance_ends_at   TIMESTAMPTZ,
  suspension_active     BOOLEAN NOT NULL DEFAULT false,
  suspension_reason     TEXT,
  suspension_message    TEXT,
  suspended_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID,
  CHECK (min_supported_build <= latest_build)
);
-- Historial de cambios administrativos (quién, cuándo, desde qué IP, antes y después).
CREATE TABLE IF NOT EXISTS app_control_audit (
  id          BIGSERIAL PRIMARY KEY,
  platform    TEXT NOT NULL,
  section     TEXT NOT NULL CHECK (section IN ('update', 'maintenance', 'suspension')),
  admin_id    UUID,
  admin_email TEXT,
  ip          TEXT,
  before      JSONB,
  after       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_control_audit_time ON app_control_audit(platform, created_at DESC);
INSERT INTO app_control (platform) VALUES ('android') ON CONFLICT (platform) DO NOTHING;
