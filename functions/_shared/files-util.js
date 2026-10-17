/* ==========================================================================
   files-util.js — Utilidades de archivos: tipo/ícono por MIME, checksum,
   dimensiones de imagen y el "item" con la estructura profesional de la API.
   Lo usan el servicio de archivos y el detalle de proyectos.
   ========================================================================== */

import { fmtBytes, toISO } from './util.js';

export function extOf(name) {
  const m = String(name || '').match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1].toLowerCase() : null;
}

export function categoryOf(mime) {
  mime = mime || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'document';
  if (/(zip|rar|7z|tar|gzip|compressed)/.test(mime)) return 'archive';
  return 'other';
}

export function iconFor(type, mime) {
  if (mime === 'application/pdf') return 'pdf';
  return ({ image: 'image', video: 'video', audio: 'audio', document: 'document', archive: 'archive' })[type] || 'file';
}

export async function sha256hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Dimensiones de imagen leyendo la cabecera (PNG, GIF, JPEG). null si no aplica.
export function imageSize(buf, mime) {
  try {
    const b = new Uint8Array(buf);
    if (b.length < 24) return null;
    if (b[0] === 0x89 && b[1] === 0x50) { // PNG
      const dv = new DataView(buf);
      return { width: dv.getUint32(16), height: dv.getUint32(20) };
    }
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) { // GIF
      const dv = new DataView(buf);
      return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    }
    if (b[0] === 0xFF && b[1] === 0xD8) { // JPEG
      let i = 2;
      while (i < b.length - 8) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          return { width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
        }
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    }
  } catch {}
  return null;
}

// Construye el item de archivo con la estructura profesional de la API.
export function buildFileItem(row, env) {
  const meta = row.meta || {};
  const mime = row.mime || 'application/octet-stream';
  const type = meta.type || categoryOf(mime);
  const isImage = mime.startsWith('image/');
  const downloadUrl = '/api/v1/files/' + row.id + '/download';
  const thumbUrl = '/api/v1/files/' + row.id + '/thumb';
  const published = !!row.published;
  return {
    id: row.id,
    owner_id: row.user_id,
    published,
    published_at: toISO(row.published_at),
    name: row.name,
    original_name: row.original_name || row.name,
    extension: meta.extension || extOf(row.name),
    mime_type: mime,
    type,
    icon: iconFor(type, mime),
    banner: { enabled: !!meta.thumb_key, url: meta.thumb_key ? thumbUrl : null, width: null, height: null, fit: 'cover' },
    thumbnail: { available: !!meta.thumb_key, url: meta.thumb_key ? thumbUrl : null, width: null, height: null },
    preview: { available: isImage, url: isImage ? downloadUrl : null },
    media: meta.media || null,
    size: { bytes: Number(row.size) || 0, formatted: fmtBytes(row.size) },
    storage: { provider: meta.provider || env.STORAGE_PROVIDER || 's3', visibility: meta.visibility || 'private' },
    metadata: {
      category: meta.category || type,
      width: meta.width ?? null,
      height: meta.height ?? null,
      checksum_sha256: meta.checksum_sha256 || null
    },
    project_id: row.project_id || null,
    status: meta.status || 'ready',
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at || row.created_at)
  };
}

// Datos multimedia enviados por el navegador (JSON). Solo texto corto y números.
export function cleanMedia(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 4000) return null;
  let o; try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const txt = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) : '') || null;
  const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 10) / 10 : null);
  const m = { title: txt(o.title), artist: txt(o.artist), album: txt(o.album), duration: num(o.duration), width: num(o.width), height: num(o.height) };
  return Object.values(m).some(v => v != null) ? m : null;
}
