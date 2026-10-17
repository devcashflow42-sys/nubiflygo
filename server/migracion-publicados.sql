-- ==========================================================================
-- migracion-publicados.sql — Guarda el estado "Publicado" de documentos y
-- archivos para que NO se pierda al recargar la página.
-- Cópialo y pégalo en el SQL Editor de Neon y ejecútalo (es idempotente).
-- ==========================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE files     ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE files     ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
