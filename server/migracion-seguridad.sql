-- ==========================================================================
-- migracion-seguridad.sql — Capas de seguridad de la API.
-- La app crea esto sola la primera vez que lo necesita; este archivo es por si
-- prefieres aplicarlo a mano (Neon → SQL Editor). Se puede ejecutar varias veces.
-- ==========================================================================

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
