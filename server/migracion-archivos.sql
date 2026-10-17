-- Ejecuta esto una vez en el SQL Editor de Neon para la estructura
-- profesional de /api/v1/files/upload. Es seguro ejecutarlo varias veces.
ALTER TABLE files ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
