/* ==========================================================================
   shares.js — Enlaces para compartir un archivo (como MEGA).
   Copia de functions/_shared/shares.js para el servidor Node (misma lógica).
   · Un enlace = un token aleatorio de 22 caracteres que apunta a UN archivo.
   · La página pública /s/<token> solo muestra ese archivo: nombre, tamaño,
     vista previa y descarga. Nunca el proyecto ni otros datos del dueño
     (solo su nombre, "Compartido por …").
   · Borrar el enlace (o el archivo) lo desactiva al instante.
   ========================================================================== */

import { webcrypto } from 'node:crypto';
const crypto = globalThis.crypto || webcrypto;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const TOKEN_RE = /^[A-Za-z0-9]{22}$/;

let ready = false;
export async function ensureShares(db) {
  if (ready) return;
  await db.query(`CREATE TABLE IF NOT EXISTS shares (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token       TEXT NOT NULL UNIQUE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_id     UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ,
    views       INTEGER NOT NULL DEFAULT 0,
    downloads   INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query('CREATE INDEX IF NOT EXISTS shares_file_idx ON shares (file_id)');
  ready = true;
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(22));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % 62];
  return s;
}

// Tipo de vista previa que puede mostrarse con seguridad (nunca HTML/SVG/JS).
export function previewKind(mime, name) {
  const m = String(mime || '').toLowerCase(), n = String(name || '').toLowerCase();
  if (/\.(html?|xhtml|svgz?|xml|xsl|js|mjs)$/.test(n) || /svg|html|xml|javascript/.test(m)) return null;
  if (/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(m)) return 'image';
  if (/^audio\//.test(m)) return 'audio';
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(m)) return 'video';
  if (m === 'application/pdf') return 'pdf';
  if (/^text\/plain$/.test(m)) return 'text';
  return null;
}

const SHARE_SELECT = `SELECT s.token, s.user_id, s.file_id, s.expires_at, s.views, s.downloads, s.created_at,
    f.name, f.size, f.mime, f.storage_key, f.meta, u.name AS owner_name
  FROM shares s JOIN files f ON f.id = s.file_id JOIN users u ON u.id = s.user_id`;

// Datos que ve el dueño en la app.
export function ownerView(r, origin) {
  return {
    token: r.token,
    url: origin.replace(/\/+$/, '') + '/s/' + r.token,
    file: { id: r.file_id, name: r.name, size: Number(r.size) || 0, mime: r.mime },
    expires_at: r.expires_at, views: r.views, downloads: r.downloads, created_at: r.created_at
  };
}

// Etiquetas Open Graph para la vista previa al compartir el enlace (/s/<token>).
// Si el archivo es imagen o tiene portada, se usa esa imagen; si no, el logo.
export function shareOgTags(r, origin) {
  const o = String(origin || 'https://nubiflygo.com').replace(/\/+$/, '');
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const meta = r.meta || {};
  const base = o + '/api/v1/public/shares/' + r.token;
  const kind = previewKind(r.mime, r.name);
  const image = meta.thumb_key ? base + '/preview?cover=1'
    : kind === 'image' ? base + '/preview'
    : o + '/assets/og-image.png';
  const title = esc((r.name || 'Archivo compartido') + ' \u00b7 NubiFlyGo');
  const who = r.owner_name || 'Un usuario de NubiFlyGo';
  const desc = esc(who + ' compartió un archivo contigo en NubiFlyGo.');   // se escapa una sola vez
  const url = esc(o + '/s/' + r.token);
  const img = esc(image);
  return [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="NubiFlyGo">',
    '<meta property="og:title" content="' + title + '">',
    '<meta property="og:description" content="' + desc + '">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:image" content="' + img + '">',
    '<meta property="og:image:alt" content="' + title + '">',
    '<meta property="og:locale" content="es_MX">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + title + '">',
    '<meta name="twitter:description" content="' + desc + '">',
    '<meta name="twitter:image" content="' + img + '">'
  ].join('\n');
}

// Datos públicos: SOLO el archivo (sin ids, proyecto, rutas ni correo).
export function publicView(r) {
  const meta = r.meta || {};
  const kind = previewKind(r.mime, r.name);
  const base = '/api/v1/public/shares/' + r.token;
  const media = meta.media && typeof meta.media === 'object'
    ? { title: meta.media.title || null, artist: meta.media.artist || null, album: meta.media.album || null, duration: meta.media.duration || null }
    : null;
  return {
    token: r.token,
    file: { name: r.name, size: Number(r.size) || 0, mime: r.mime || 'application/octet-stream', media },
    owner: { name: r.owner_name || 'Un usuario de NubiFlyGo' },
    shared_at: r.created_at, expires_at: r.expires_at,
    preview: kind ? { kind, url: base + '/preview' } : null,
    cover_url: meta.thumb_key ? base + '/preview?cover=1' : null,
    download_url: base + '/download'
  };
}

/* El dueño crea un enlace. Si el archivo ya tiene uno vigente, lo devuelve. */
export async function createShare(db, userId, fileId, days) {
  await ensureShares(db);
  const own = await db.query('SELECT id FROM files WHERE id = $1 AND user_id = $2', [fileId, userId]);
  if (!own.rows[0]) return null;
  const existing = await db.query(
    `${SHARE_SELECT} WHERE s.file_id = $1 AND s.user_id = $2 AND (s.expires_at IS NULL OR s.expires_at > now())
     ORDER BY s.created_at DESC LIMIT 1`, [fileId, userId]);
  if (existing.rows[0] && !days) return { row: existing.rows[0], created: false };
  const exp = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  for (let i = 0; i < 3; i++) {
    const token = newToken();
    const ins = await db.query(
      `INSERT INTO shares (token, user_id, file_id, expires_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO NOTHING RETURNING token`, [token, userId, fileId, exp]);
    if (ins.rows[0]) {
      const { rows } = await db.query(`${SHARE_SELECT} WHERE s.token = $1`, [token]);
      return { row: rows[0], created: true };
    }
  }
  throw new Error('No se pudo generar el enlace.');
}

export async function ownShare(db, userId, token) {
  await ensureShares(db);
  if (!TOKEN_RE.test(token || '')) return null;
  const { rows } = await db.query(`${SHARE_SELECT} WHERE s.token = $1 AND s.user_id = $2`, [token, userId]);
  return rows[0] || null;
}

export async function deleteShare(db, userId, token) {
  await ensureShares(db);
  if (!TOKEN_RE.test(token || '')) return false;
  const r = await db.query('DELETE FROM shares WHERE token = $1 AND user_id = $2', [token, userId]);
  return r.rowCount > 0;
}

/* Enlace público vigente (o null). count: 'views' | 'downloads' | null.
   shouldCount (opcional): se consulta solo si el enlace existe y decide si
   esta visita suma (p. ej. una por persona y hora). */
export async function publicShare(db, token, count, shouldCount) {
  await ensureShares(db);
  if (!TOKEN_RE.test(token || '')) return null;
  const { rows } = await db.query(`${SHARE_SELECT} WHERE s.token = $1 AND (s.expires_at IS NULL OR s.expires_at > now())`, [token]);
  const r = rows[0];
  if (r && (count === 'views' || count === 'downloads') && (!shouldCount || await shouldCount())) {
    try { await db.query(`UPDATE shares SET ${count} = ${count} + 1 WHERE token = $1`, [token]); } catch {}
  }
  return r || null;
}
