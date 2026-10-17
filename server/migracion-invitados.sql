-- ==========================================================================
-- migracion-invitados.sql — Cuentas de invitado (prueba temporal de 24 h que
-- se elimina al expirar). Cópialo y pégalo en el SQL Editor de Neon y ejecútalo
-- (es idempotente).
-- ==========================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_guest_expiry ON users(guest_expires_at) WHERE is_guest;

-- Idioma del usuario (detectado del navegador al registrarse)
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es';
