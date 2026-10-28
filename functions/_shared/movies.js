/* ==========================================================================
   movies.js — Películas (videos grandes), derechos de autor y reportes.

   Módulo puro (sin dependencias): lo usan las Functions de Cloudflare y el
   servidor Node con su propio `db` ({ query(text, params) → { rows, rowCount } }).

   · Películas: un video que pasa del límite normal de subida se sube por
     partes (PART_SIZE). Solo con un plan de pago vigente (o el administrador).
     Al terminar, si el usuario lo pidió, queda un trabajo en video_jobs que el
     compresor (server/transcoder.js, con ffmpeg) convierte a 720p.
   · Derechos de autor: antes de subir una película o de publicar/compartir un
     video o una canción, el usuario declara que tiene los derechos. Cada
     declaración queda en rights_acceptances SIN llaves foráneas: no se borra
     aunque se elimine el archivo o la cuenta (es la prueba de que el usuario
     asumió la responsabilidad).
   · Reportes: cualquiera puede reportar un enlace compartido. El administrador
     lo revisa y puede dar de baja el archivo (se borran sus enlaces y ya no se
     puede volver a compartir ni publicar).
   ========================================================================== */

const MB = 1024 * 1024, GB = 1024 * MB;

// Cada parte viaja en su propia petición (Cloudflare acepta hasta 100 MB por
// petición); 16 MB es poco para reintentar en una conexión móvil.
export const PART_SIZE = 16 * MB;

// Límite de una subida normal (sin partes) y de una película.
export function smallMaxBytes(env) { return (Number(env && env.MAX_FILE_SIZE_MB) || 100) * MB; }
export function movieMaxBytes(env) {
  const g = Number(env && env.MAX_MOVIE_SIZE_GB) || 10;
  return Math.min(50, Math.max(1, g)) * GB;
}
export function partsFor(size) { return Math.max(1, Math.ceil(Number(size) / PART_SIZE)); }
// Bytes exactos que debe traer la parte n (1…total).
export function partLength(size, n) {
  const total = partsFor(size);
  if (!(n >= 1 && n <= total)) return 0;
  return n < total ? PART_SIZE : Number(size) - (total - 1) * PART_SIZE;
}

export const VIDEO_EXT_RE = /\.(mp4|m4v|mov|mkv|webm|avi|mpe?g|3gp|ogv|wmv|flv|ts)$/i;
export function isVideo(mime, name) {
  return /^video\//i.test(String(mime || '')) || VIDEO_EXT_RE.test(String(name || ''));
}
// Contenido con derechos de autor habituales: videos y música.
export function needsRights(mime, name) {
  return isVideo(mime, name) || /^audio\//i.test(String(mime || ''));
}

/* ─── Declaración de derechos de autor ─── */
export const RIGHTS_VERSION = '2026-10-28';
export const RIGHTS_TEXT =
  'Declaro que soy el titular de los derechos de autor de este contenido o que tengo la autorización ' +
  'de su titular para subirlo, publicarlo y compartirlo. Soy el único responsable de este contenido y de ' +
  'cualquier reclamo de terceros. NubiFlyGo solo lo guarda a petición mía y puede retirarlo si recibe un reporte.';
export const RIGHTS_ERROR = 'Para continuar debes declarar que tienes los derechos de autor de este contenido.';

/* ─── Tablas (idempotente, una vez por instancia) ─── */
let ready = null;
export function ensureMovieTables(db) {
  if (!ready) {
    ready = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS multipart_uploads (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id    UUID,
        storage_key   TEXT NOT NULL,
        s3_upload_id  TEXT NOT NULL,
        name          TEXT NOT NULL,
        mime          TEXT NOT NULL,
        size          BIGINT NOT NULL,
        part_size     INTEGER NOT NULL,
        parts         JSONB NOT NULL DEFAULT '{}'::jsonb,
        meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await db.query('CREATE INDEX IF NOT EXISTS idx_multipart_user ON multipart_uploads(user_id, created_at)');
      await db.query(`CREATE TABLE IF NOT EXISTS video_jobs (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id       UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
        progress      INTEGER NOT NULL DEFAULT 0,
        attempts      INTEGER NOT NULL DEFAULT 0,
        error         TEXT,
        heartbeat_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await db.query('CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status, created_at)');
      // Sin llaves foráneas a propósito: la declaración se conserva siempre.
      await db.query(`CREATE TABLE IF NOT EXISTS rights_acceptances (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID NOT NULL,
        user_email         TEXT,
        file_id            UUID,
        file_name          TEXT,
        file_size          BIGINT,
        context            TEXT NOT NULL,
        statement_version  TEXT NOT NULL,
        statement          TEXT NOT NULL,
        ip                 TEXT,
        user_agent         TEXT,
        accepted_at        TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await db.query('CREATE INDEX IF NOT EXISTS idx_rights_file ON rights_acceptances(file_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_rights_user ON rights_acceptances(user_id, accepted_at DESC)');
      await db.query(`CREATE TABLE IF NOT EXISTS share_reports (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        share_token     TEXT NOT NULL,
        file_id         UUID,
        owner_id        UUID,
        file_name       TEXT,
        reason          TEXT NOT NULL CHECK (reason IN ('copyright', 'illegal', 'other')),
        details         TEXT,
        reporter_email  TEXT,
        reporter_ip     TEXT,
        status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'dismissed')),
        resolved_at     TIMESTAMPTZ,
        resolved_by     UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await db.query('CREATE INDEX IF NOT EXISTS idx_share_reports_status ON share_reports(status, created_at DESC)');
      await db.query('ALTER TABLE files ADD COLUMN IF NOT EXISTS takedown_at TIMESTAMPTZ');
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}

/* ─── Plan ─── */
// ¿Puede subir películas? Plan de pago vigente o administrador.
// isAdminRow(row) lo da quien llama (correo ADMIN_EMAILS o columna is_admin).
export async function movieAccess(db, userId, isAdminRow) {
  const { rows } = await db.query('SELECT email, is_admin, is_guest, plan, plan_expires_at FROM users WHERE id = $1', [userId]);
  const u = rows[0];
  if (!u) return { ok: false };
  if (isAdminRow && isAdminRow(u)) return { ok: true, admin: true, email: u.email };
  const paid = !u.is_guest && u.plan && u.plan !== 'free' && (!u.plan_expires_at || new Date(u.plan_expires_at).getTime() > Date.now());
  return { ok: !!paid, email: u.email };
}
export const PLAN_REQUIRED = 'Subir películas es una función de los planes de pago (Pro, Mega y Super). Mejora tu plan para subir videos de más de ';

/* ─── Declaraciones ─── */
export async function recordRights(db, r) {
  await ensureMovieTables(db);
  const { rows } = await db.query(
    `INSERT INTO rights_acceptances (user_id, user_email, file_id, file_name, file_size, context, statement_version, statement, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [r.userId, r.email || null, r.fileId || null, String(r.fileName || '').slice(0, 255) || null, r.fileSize == null ? null : Number(r.fileSize) || 0,
      String(r.context || 'other').slice(0, 40), RIGHTS_VERSION, RIGHTS_TEXT, r.ip ? String(r.ip).slice(0, 64) : null, r.userAgent ? String(r.userAgent).slice(0, 300) : null]);
  return rows[0] && rows[0].id;
}
// ¿Este usuario ya declaró los derechos de este archivo?
export async function hasRights(db, userId, fileId) {
  await ensureMovieTables(db);
  const { rows } = await db.query('SELECT 1 FROM rights_acceptances WHERE user_id = $1 AND file_id = $2 LIMIT 1', [userId, fileId]);
  return !!rows[0];
}

/* ─── Subidas por partes ─── */
const UPLOAD_COLS = 'id, user_id, project_id, storage_key, s3_upload_id, name, mime, size, part_size, parts, meta, created_at';
export async function createUploadRow(db, u) {
  await ensureMovieTables(db);
  const { rows } = await db.query(
    `INSERT INTO multipart_uploads (user_id, project_id, storage_key, s3_upload_id, name, mime, size, part_size, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING ${UPLOAD_COLS}`,
    [u.userId, u.projectId || null, u.key, u.s3UploadId, u.name, u.mime, u.size, PART_SIZE, JSON.stringify(u.meta || {})]);
  return rows[0];
}
export async function getUploadRow(db, userId, id) {
  await ensureMovieTables(db);
  const { rows } = await db.query(`SELECT ${UPLOAD_COLS} FROM multipart_uploads WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] || null;
}
export async function savePart(db, id, n, etag) {
  await db.query(
    `UPDATE multipart_uploads SET parts = parts || jsonb_build_object($2::text, $3::text), updated_at = now() WHERE id = $1`,
    [id, String(n), String(etag)]);
}
export async function deleteUploadRow(db, id) {
  await db.query('DELETE FROM multipart_uploads WHERE id = $1', [id]);
}
// Solo una petición puede unir las partes a la vez (dos «complete» en paralelo
// crearían dos archivos con el mismo binario). true si esta la tomó.
export async function claimComplete(db, id) {
  const { rows } = await db.query(
    `UPDATE multipart_uploads SET meta = meta || '{"completing": true}'::jsonb, updated_at = now()
     WHERE id = $1 AND NOT (meta ? 'completing') RETURNING id`, [id]);
  return !!rows[0];
}
export async function releaseComplete(db, id) {
  await db.query(`UPDATE multipart_uploads SET meta = meta - 'completing' WHERE id = $1`, [id]);
}
// Partes ya recibidas (números), para reanudar.
export function doneParts(row) {
  return Object.keys((row && row.parts) || {}).map(Number).filter(n => n >= 1).sort((a, b) => a - b);
}
// Lista para CompleteMultipartUpload, o null si falta alguna parte.
export function completeList(row) {
  const total = partsFor(row.size), parts = row.parts || {}, out = [];
  for (let n = 1; n <= total; n++) {
    if (!parts[n]) return null;
    out.push({ n, etag: parts[n] });
  }
  return out;
}
// Subidas abandonadas (más de 7 días): quien llama aborta su parte en S3.
export async function staleUploads(db, limit) {
  await ensureMovieTables(db);
  const { rows } = await db.query(
    `SELECT ${UPLOAD_COLS} FROM multipart_uploads WHERE updated_at < now() - interval '7 days' ORDER BY updated_at LIMIT $1`, [limit || 20]);
  return rows;
}
// Bytes reservados por subidas en curso (cuentan para el espacio del plan).
export async function reservedBytes(db, userId) {
  await ensureMovieTables(db);
  const { rows } = await db.query(
    `SELECT coalesce(sum(size), 0)::bigint AS n FROM multipart_uploads WHERE user_id = $1 AND updated_at > now() - interval '7 days'`, [userId]);
  return Number(rows[0] && rows[0].n) || 0;
}

/* ─── Compresión (trabajos para el compresor) ─── */
export async function enqueueVideoJob(db, fileId, userId) {
  await ensureMovieTables(db);
  await db.query(`INSERT INTO video_jobs (file_id, user_id) VALUES ($1, $2)`, [fileId, userId]);
  await db.query(
    `UPDATE files SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{transcode}', $2::jsonb), updated_at = now() WHERE id = $1`,
    [fileId, JSON.stringify({ status: 'pending', progress: 0 })]);
}
// Lo que ve la app del estado de compresión de un archivo (o null).
export function transcodeView(meta) {
  const t = meta && meta.transcode;
  if (!t || typeof t !== 'object') return null;
  const status = ['pending', 'processing', 'ready', 'failed', 'skipped'].includes(t.status) ? t.status : null;
  if (!status) return null;
  return {
    status,
    progress: Math.max(0, Math.min(100, Math.round(Number(t.progress) || 0))),
    original_size: t.original_size != null ? Number(t.original_size) : null,
    optimized_size: t.optimized_size != null ? Number(t.optimized_size) : null,
    resolution: t.resolution || null
  };
}

/* ─── Reportes ─── */
export const REPORT_REASONS = { copyright: 'Derechos de autor', illegal: 'Contenido ilegal o dañino', other: 'Otro motivo' };
const EMAIL_LOOSE = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
export function validateReport(b) {
  const reason = String((b && b.reason) || '');
  if (!Object.hasOwn(REPORT_REASONS, reason)) return { error: 'Elige un motivo.' };
  const details = String((b && b.details) || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 2000);
  if (details.length < 10) return { error: 'Explica el motivo del reporte (mínimo 10 caracteres).' };
  const email = String((b && b.email) || '').trim().slice(0, 254);
  if (email && !EMAIL_LOOSE.test(email)) return { error: 'El correo no es válido.' };
  return { values: { reason, details, email: email || null } };
}
export async function createReport(db, share, v, ip) {
  await ensureMovieTables(db);
  const { rows } = await db.query(
    `INSERT INTO share_reports (share_token, file_id, owner_id, file_name, reason, details, reporter_email, reporter_ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [share.token, share.file_id, share.user_id, String(share.name || '').slice(0, 255), v.reason, v.details, v.email, ip ? String(ip).slice(0, 64) : null]);
  return rows[0] && rows[0].id;
}
export async function listReports(db, status, limit) {
  await ensureMovieTables(db);
  const st = ['open', 'removed', 'dismissed', 'all'].includes(status) ? status : 'open';
  const { rows } = await db.query(
    `SELECT r.id, r.share_token, r.file_id, r.file_name, r.reason, r.details, r.reporter_email, r.status, r.created_at, r.resolved_at,
            u.email AS owner_email, u.name AS owner_name, f.size AS file_size, f.mime AS file_mime, f.takedown_at,
            (SELECT count(*)::int FROM share_reports x WHERE x.file_id = r.file_id) AS reports_for_file,
            (SELECT max(a.accepted_at) FROM rights_acceptances a WHERE a.file_id = r.file_id) AS rights_accepted_at
     FROM share_reports r LEFT JOIN users u ON u.id = r.owner_id LEFT JOIN files f ON f.id = r.file_id
     ${st === 'all' ? '' : 'WHERE r.status = $2'} ORDER BY r.created_at DESC LIMIT $1`,
    st === 'all' ? [Math.min(200, limit || 50)] : [Math.min(200, limit || 50), st]);
  return rows.map(r => ({
    id: r.id, token: r.share_token, file_id: r.file_id, file_name: r.file_name, file_size: r.file_size == null ? null : Number(r.file_size),
    file_mime: r.file_mime || null, reason: r.reason, reason_label: REPORT_REASONS[r.reason] || r.reason, details: r.details,
    reporter_email: r.reporter_email, status: r.status, created_at: r.created_at, resolved_at: r.resolved_at,
    owner: { email: r.owner_email || null, name: r.owner_name || null }, taken_down: !!r.takedown_at,
    reports_for_file: r.reports_for_file, rights_accepted_at: r.rights_accepted_at || null
  }));
}
/* action: 'remove' → baja del archivo (se borran todos sus enlaces, deja de
   estar publicado y no se puede volver a compartir); cierra todos los reportes
   abiertos de ese archivo. 'dismiss' → se descarta solo este reporte.
   Devuelve { owner_id, file_name, file_id } o null si el reporte no existe. */
export async function resolveReport(db, id, adminId, action) {
  await ensureMovieTables(db);
  const { rows } = await db.query('SELECT id, file_id, owner_id, file_name, status FROM share_reports WHERE id = $1', [id]);
  const r = rows[0];
  if (!r) return null;
  if (action === 'dismiss') {
    await db.query(`UPDATE share_reports SET status = 'dismissed', resolved_at = now(), resolved_by = $2 WHERE id = $1`, [id, adminId]);
    return { owner_id: r.owner_id, file_name: r.file_name, file_id: r.file_id, action };
  }
  if (r.file_id) {
    await db.query('DELETE FROM shares WHERE file_id = $1', [r.file_id]);
    await db.query('UPDATE files SET published = false, published_at = NULL, takedown_at = coalesce(takedown_at, now()), updated_at = now() WHERE id = $1', [r.file_id]);
    await db.query(`UPDATE share_reports SET status = 'removed', resolved_at = now(), resolved_by = $2 WHERE file_id = $1 AND status = 'open'`, [r.file_id, adminId]);
  }
  await db.query(`UPDATE share_reports SET status = 'removed', resolved_at = coalesce(resolved_at, now()), resolved_by = coalesce(resolved_by, $2) WHERE id = $1`, [id, adminId]);
  return { owner_id: r.owner_id, file_name: r.file_name, file_id: r.file_id, action: 'remove' };
}
export const TAKEDOWN_ERROR = 'Este archivo fue dado de baja por un reporte y ya no se puede compartir ni publicar.';
// Cuentas de administrador (columna is_admin o correos de ADMIN_EMAILS), para avisarles.
export async function adminIds(db, emails) {
  const list = (emails || []).map(e => String(e).toLowerCase()).filter(Boolean);
  const { rows } = await db.query('SELECT id FROM users WHERE is_admin OR lower(email) = ANY($1::text[]) LIMIT 20', [list]);
  return rows.map(r => r.id);
}
