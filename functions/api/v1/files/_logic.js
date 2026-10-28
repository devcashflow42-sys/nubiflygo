/* ==========================================================================
   files — archivos del usuario (metadatos en BD, binario en almacenamiento S3).
     GET /files                         → lista completa (cada archivo con todos sus
                                           datos, como GET /files/:id) + totales.
                                           Opcional: ?type= ?project_id= ?q= ?published=
                                           ?sort=newest|oldest|name|size ?page= ?limit=
     DELETE /files  · POST /files/delete → borrado masivo: {"all": true} (todos, o
                                           todos los filtrados) o {"ids": [...]}
     POST /files/upload                  → sube (multipart; campo "file" y, opcionales,
                                           "thumb" = portada JPEG/PNG/WEBP y "media" = JSON
                                           { title, artist, album, duration })
     GET /files/:id                      → detalle
     GET /files/:id/download[?inline=1]  → descarga/vista (admite Range para audio/video)
     GET /files/:id/thumb                → portada / miniatura (banner)
     PATCH /files/:id                    → publicar/despublicar (videos y música:
                                           { published: true, accept_rights: true })
     DELETE /files/:id                   → borra (BD + binario)
   Películas (videos de más del límite normal; solo planes de pago):
     POST   /files/multipart                  → abre la subida { name, size, mime,
                                                project_id?, optimize?, media?, accept_rights }
     GET    /files/multipart/:id              → estado (partes ya recibidas, para reanudar)
     PUT    /files/multipart/:id/parts/:n     → una parte (application/octet-stream)
     POST   /files/multipart/:id/complete     → une las partes y crea el archivo { thumb? }
     DELETE /files/multipart/:id              → cancela la subida
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json, CORS } from '../../../_shared/http.js';
import { putObject, getObject, deleteObject, createMultipart, uploadPart, completeMultipart, abortMultipart, headObject } from '../../../_shared/storage.js';
import { dataRoute, storageReady, ownsProject, rowIsAdmin } from '../../../_shared/api.js';
import { storageLeft } from '../../../_shared/billing.js';
import { fileHeaders, clientIp, rateLimit, tooMany } from '../../../_shared/security.js';
import { UUID_RE, GUEST_LIMITS, body, pageParams, fmtBytes } from '../../../_shared/util.js';
import { sha256hex, imageSize, categoryOf, extOf, buildFileItem, cleanMedia } from '../../../_shared/files-util.js';
import { fileFilters, strictFilterError, FILE_SORTS, FILE_TYPE_SQL, FILE_TYPES, readSelection, logActivity, bulkResponse } from '../../../_shared/bulk.js';
import { trashOne, trashFilesWhere, purgeExpired } from '../../../_shared/trash.js';
import {
  ensureMovieTables, smallMaxBytes, movieMaxBytes, partsFor, partLength, isVideo, needsRights, movieAccess, PLAN_REQUIRED,
  RIGHTS_ERROR, TAKEDOWN_ERROR, recordRights, hasRights, createUploadRow, getUploadRow, savePart, deleteUploadRow, doneParts,
  completeList, staleUploads, reservedBytes, enqueueVideoJob, claimComplete, releaseComplete
} from '../../../_shared/movies.js';

const THUMB_MAX = 400 * 1024;   // la portada la genera el navegador (≈ 20–60 KB)

// Nombre seguro para la clave del almacenamiento: sin "/", "..", espacios ni
// caracteres raros (el nombre original se guarda aparte, en la base).
export function safeKeyName(name) {
  const n = String(name || 'archivo').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^[._-]+/, '').slice(-120);
  return n || 'archivo';
}

export const handle = dataRoute(async ({ seg, request, env, method, user, scope }) => {
  const db = getDb(env);
  // Clave de un proyecto: solo ve y toca los archivos de ese proyecto (capa 2).
  if (scope && UUID_RE.test(seg[1] || '')) {
    const { rows: own } = await db.query('SELECT 1 FROM files WHERE id = $1 AND user_id = $2 AND project_id = $3 AND deleted_at IS NULL', [seg[1], user.id, scope]);
    if (!own[0]) return json({ error: 'Archivo no encontrado.' }, 404);
  }

  // GET /files  — lista completa con todos los datos de cada archivo.
  if (seg.length === 1 && method === 'GET') {
    const qs = new URL(request.url).searchParams;
    const src = Object.fromEntries(qs);
    if (scope) {
      if (src.project_id && String(src.project_id).toLowerCase() !== String(scope).toLowerCase()) return json({ error: 'Esta API key solo puede ver los archivos de su proyecto.' }, 403);
      src.project_id = scope;
    }
    const f = fileFilters(src, 2);
    if (f.error) return json({ error: f.error }, 400);
    const order = Object.hasOwn(FILE_SORTS, qs.get('sort') || '') ? FILE_SORTS[qs.get('sort')] : FILE_SORTS.newest;
    // Sin ?page ni ?limit (o con ?limit=all) devuelve TODOS los archivos.
    const paged = qs.has('page') || (qs.has('limit') && qs.get('limit') !== 'all');
    const params = [user.id, ...f.params];
    let limitSql = '', page = 1, limit = null, offset = 0;
    if (paged) {
      ({ limit, page, offset } = pageParams(request));
      params.push(limit, offset);
      limitSql = ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT id, user_id, project_id, name, original_name, size, mime, storage_key, meta, published, published_at, created_at, updated_at
       FROM files WHERE user_id = $1 AND deleted_at IS NULL${f.sql} ORDER BY ${order}${limitSql}`, params);
    // Totales del conjunto (con los mismos filtros): cantidad, espacio y por tipo.
    const { rows: st } = await db.query(
      `SELECT count(*)::int AS n, coalesce(sum(size), 0)::bigint AS bytes, (${FILE_TYPE_SQL}) AS type
       FROM files WHERE user_id = $1 AND deleted_at IS NULL${f.sql} GROUP BY 3`, [user.id, ...f.params]);
    const byType = Object.fromEntries(FILE_TYPES.map(t => [t, 0]));
    let total = 0, bytes = 0;
    st.forEach(r => { byType[r.type] = r.n; total += r.n; bytes += Number(r.bytes) || 0; });
    const items = rows.map(r => Object.assign(buildFileItem(r, env), {
      // Alias de la lista anterior (compatibilidad): mime y thumb_url.
      mime: r.mime || 'application/octet-stream',
      thumb_url: (r.meta && r.meta.thumb_key) ? '/api/v1/files/' + r.id + '/thumb' : null
    }));
    return json({
      success: true, status: 200, items, total,
      page: paged ? page : 1, limit: paged ? limit : total,
      has_more: paged ? offset + items.length < total : false,
      stats: { count: total, bytes, size_formatted: fmtBytes(bytes), by_type: byType },
      error: null
    });
  }

  // DELETE /files  ·  POST /files/delete  — borrado masivo (todo o por ids).
  if ((seg.length === 1 && method === 'DELETE') || (seg.length === 2 && seg[1] === 'delete' && method === 'POST')) {
    const qs = new URL(request.url).searchParams;
    const b = await body(request);
    const sel = readSelection(b, qs);
    if (sel.error) return json({ error: sel.error }, 400);
    // Con "all" se pueden acotar con los mismos filtros de la lista (p. ej. type=audio).
    // En un borrado los filtros son estrictos: vacío, inválido o desconocido → 400.
    if (b.filters !== undefined && (b.filters === null || typeof b.filters !== 'object' || Array.isArray(b.filters))) return json({ error: 'filters debe ser un objeto.' }, 400);
    const strictErr = strictFilterError(b.filters || {}, false) || strictFilterError(Object.fromEntries(qs), true);
    if (strictErr) return json({ error: strictErr }, 400);
    const src = Object.assign(Object.fromEntries(qs), b.filters || {});
    if (scope) {
      if (src.project_id && String(src.project_id).toLowerCase() !== String(scope).toLowerCase()) return json({ error: 'Esta API key solo puede borrar archivos de su proyecto.' }, 403);
      src.project_id = scope;
    }
    const f = fileFilters(src, sel.ids ? 3 : 2);
    if (f.error) return json({ error: f.error }, 400);
    const where = (sel.ids ? ' AND id = ANY($2::uuid[])' : '') + f.sql;
    const params = (sel.ids ? [sel.ids] : []).concat(f.params);
    // A la papelera: es un UPDATE, así que no hay tandas ni presupuesto de
    // almacenamiento que repartir (eso llega al borrarlos de verdad).
    const n = await trashFilesWhere(db, user.id, where, params);
    if (n) await logActivity(db, user.id, 'file', n === 1 ? 'Archivo eliminado' : n + ' archivos eliminados');
    return json(bulkResponse(n === 1 ? 'Se eliminó 1 archivo.' : 'Se eliminaron ' + n + ' archivos.', n, 0, 0));
  }

  // Películas: subida por partes.
  if (seg[1] === 'multipart') return multipart({ seg, request, env, method, user, scope, db });

  // POST /files/upload
  if (seg[1] === 'upload' && method === 'POST') {
    if (!storageReady(env)) {
      return json({ error: 'Las subidas necesitan configurar el almacenamiento (AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) en Cloudflare.' }, 503);
    }
    if (user.isGuest) {
      // La papelera cuenta: si no, se podía borrar y subir otra vez sin fin.
      const { rows: c } = await db.query('SELECT count(*)::int AS n FROM files WHERE user_id = $1', [user.id]);
      if (((c[0] && c[0].n) || 0) >= GUEST_LIMITS.files) {
        return json({ error: 'Como invitado puedes subir hasta ' + GUEST_LIMITS.files + ' archivos. Crea una cuenta gratis para más.' }, 403);
      }
    }
    const maxBytes = (Number(env.MAX_FILE_SIZE_MB) || 100) * 1024 * 1024;
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return json({ error: 'Falta el archivo (campo "file").' }, 400);
    if (file.size > maxBytes) return json({ error: 'El archivo supera el tamaño máximo.' }, 413);
    // Espacio del plan: no se puede subir más de lo que cubre.
    const { rows: me } = await db.query('SELECT email, is_admin FROM users WHERE id = $1', [user.id]);
    // Antes de medir el cupo se tira lo que ya pasó de los 30 días: si no, una
    // papelera que nadie abre dejaría el plan lleno para siempre.
    try { await purgeExpired(db, env, user.id); } catch {}
    if (file.size > await storageLeft(db, user.id, rowIsAdmin(me[0], env))) {
      return json({ error: 'No tienes espacio suficiente en tu plan para este archivo. Libera espacio o mejora tu plan.', code: 'storage_full' }, 413);
    }
    let projectId = form.get('project_id') && UUID_RE.test(form.get('project_id')) ? form.get('project_id') : null;
    if (scope) {
      if (projectId && projectId.toLowerCase() !== String(scope).toLowerCase()) return json({ error: 'Esta API key solo puede subir a su proyecto.' }, 403);
      projectId = scope;
    }
    // El proyecto debe ser tuyo (no se puede colgar un archivo en un proyecto ajeno).
    if (projectId && !(await ownsProject(db, user.id, projectId))) return json({ error: 'Proyecto no encontrado.' }, 404);
    const fileName = String(file.name || 'archivo').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'archivo';
    // Subida idempotente: si la misma subida (upload_id) ya llegó —p. ej. la
    // página se recargó a mitad y la reanudó—, se devuelve el archivo existente.
    const uploadId = String(form.get('upload_id') || '').slice(0, 64);
    if (/^[a-z0-9]{8,64}$/i.test(uploadId)) {
      const { rows: dup } = await db.query(
        `SELECT id, user_id, project_id, name, original_name, size, mime, storage_key, meta, published, published_at, created_at, updated_at
         FROM files WHERE user_id = $1 AND deleted_at IS NULL AND meta->>'upload_id' = $2 LIMIT 1`, [user.id, uploadId]);
      if (dup[0]) return json({ success: true, status: 200, message: 'Archivo ya subido.', data: { item: buildFileItem(dup[0], env) }, error: null }, 200);
    }
    const buf = await file.arrayBuffer();
    const mime = file.type || 'application/octet-stream';
    const checksum = await sha256hex(buf);
    const dims = imageSize(buf, mime) || { width: null, height: null };
    const type = categoryOf(mime);
    const meta = {
      extension: extOf(fileName), type, category: type,
      width: dims.width, height: dims.height,
      checksum_sha256: checksum, status: 'ready', visibility: 'private',
      provider: env.STORAGE_PROVIDER || 's3'
    };
    const key = `users/${user.id}/${crypto.randomUUID()}-${safeKeyName(fileName)}`;
    await putObject(env, key, buf, mime);
    // Portada (banner): miniatura de imagen/video o carátula de la canción.
    const thumb = form.get('thumb');
    if (thumb && typeof thumb !== 'string' && /^image\/(jpeg|png|webp)$/.test(thumb.type) && thumb.size > 0 && thumb.size <= THUMB_MAX) {
      try {
        meta.thumb_key = key + '.thumb';
        meta.thumb_mime = thumb.type;
        await putObject(env, meta.thumb_key, await thumb.arrayBuffer(), thumb.type);
      } catch { delete meta.thumb_key; delete meta.thumb_mime; }
    }
    // Datos de la canción/video detectados en el navegador (título, artista…).
    if (/^[a-z0-9]{8,64}$/i.test(uploadId)) meta.upload_id = uploadId;
    const media = cleanMedia(form.get('media'));
    if (media) meta.media = media;
    const { rows } = await db.query(
      `INSERT INTO files (user_id, project_id, name, original_name, size, mime, storage_key, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, user_id, project_id, name, original_name, size, mime, storage_key, meta, created_at, updated_at`,
      [user.id, projectId, fileName, fileName, file.size, mime, key, JSON.stringify(meta)]);
    await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [user.id, 'file', 'Archivo subido: ' + fileName]);
    return json({ success: true, status: 201, message: 'Archivo subido correctamente.', data: { item: buildFileItem(rows[0], env) }, error: null }, 201);
  }

  // GET /files/:id  (detalle, solo del propietario)
  if (seg.length === 2 && method === 'GET') {
    if (!UUID_RE.test(seg[1])) return json({ error: 'Id no válido.' }, 400);
    const { rows } = await db.query(
      'SELECT id, user_id, project_id, name, original_name, size, mime, storage_key, meta, created_at, updated_at FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [seg[1], user.id]);
    if (!rows[0]) return json({ error: 'Archivo no encontrado.' }, 404);
    return json({ success: true, status: 200, message: '', data: { item: buildFileItem(rows[0], env) }, error: null });
  }

  // GET /files/:id/download
  if (seg.length === 3 && seg[2] === 'download' && method === 'GET') {
    if (!UUID_RE.test(seg[1])) return json({ error: 'Id no válido.' }, 400);
    // ?trashed=1 deja ver la miniatura de un archivo que está en la papelera,
    // pero solo a su dueño (la consulta sigue atada a user_id): lo usa la lista
    // de la papelera para enseñar la imagen de verdad.
    const verTrash = new URL(request.url).searchParams.get('trashed') === '1';
    const { rows } = await db.query('SELECT name, mime, storage_key FROM files WHERE id = $1 AND user_id = $2' + (verTrash ? '' : ' AND deleted_at IS NULL'), [seg[1], user.id]);
    const f = rows[0];
    if (!f) return json({ error: 'Archivo no encontrado.' }, 404);
    // Range: permite adelantar/atrasar canciones y videos sin descargar todo.
    const range = request.headers.get('Range');
    const res = await getObject(env, f.storage_key, range ? { Range: range } : undefined);
    const inline = new URL(request.url).searchParams.get('inline') === '1';
    // Capa 4: lo que el navegador podría ejecutar (HTML, SVG…) se descarga
    // siempre; nada se interpreta con permisos de la app.
    const headers = {
      ...fileHeaders(f.name, f.mime, inline),
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
      ...CORS
    };
    for (const h of ['Content-Length', 'Content-Range']) { const v = res.headers.get(h); if (v) headers[h] = v; }
    return new Response(res.body, { status: res.status === 206 ? 206 : 200, headers });
  }

  // GET /files/:id/thumb  (portada del archivo)
  if (seg.length === 3 && seg[2] === 'thumb' && method === 'GET') {
    if (!UUID_RE.test(seg[1])) return json({ error: 'Id no válido.' }, 400);
    // ?trashed=1: portada de un archivo en la papelera, solo para su dueño.
    const verTrash = new URL(request.url).searchParams.get('trashed') === '1';
    const { rows } = await db.query(`SELECT meta->>'thumb_key' AS k, meta->>'thumb_mime' AS m FROM files WHERE id = $1 AND user_id = $2` + (verTrash ? '' : ' AND deleted_at IS NULL'), [seg[1], user.id]);
    if (!rows[0] || !rows[0].k) return json({ error: 'Sin portada.' }, 404);
    const res = await getObject(env, rows[0].k);
    const m = /^image\/(jpeg|png|webp)$/.test(rows[0].m || '') ? rows[0].m : 'image/jpeg';
    return new Response(res.body, { headers: { 'Content-Type': m, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400', ...CORS } });
  }

  // PATCH /files/:id  (por ahora solo publicar/despublicar)
  if (seg.length === 2 && method === 'PATCH') {
    if (!UUID_RE.test(seg[1])) return json({ error: 'Id no válido.' }, 400);
    const b = await body(request);
    if (typeof b.published !== 'boolean') return json({ error: 'Nada que actualizar.' }, 400);
    if (b.published) {
      // Publicar: un archivo dado de baja no vuelve; videos y música piden la
      // declaración de derechos de autor (queda registrada y no se borra).
      await ensureMovieTables(db);
      const { rows: cur } = await db.query('SELECT name, mime, size, takedown_at FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [seg[1], user.id]);
      if (!cur[0]) return json({ error: 'Archivo no encontrado.' }, 404);
      if (cur[0].takedown_at) return json({ error: TAKEDOWN_ERROR, code: 'taken_down' }, 403);
      if (needsRights(cur[0].mime, cur[0].name) && !(await hasRights(db, user.id, seg[1]))) {
        if (b.accept_rights !== true) return json({ error: RIGHTS_ERROR, code: 'rights_required' }, 400);
        await recordRights(db, { userId: user.id, email: user.email, fileId: seg[1], fileName: cur[0].name, fileSize: cur[0].size, context: 'publish', ip: clientIp(request), userAgent: request.headers.get('User-Agent') });
      }
    }
    const { rows } = await db.query(
      `UPDATE files SET published = $3, published_at = CASE WHEN $3 THEN now() ELSE NULL END, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
      [seg[1], user.id, b.published]);
    return rows[0] ? json({ ok: true, published: b.published }) : json({ error: 'Archivo no encontrado.' }, 404);
  }

  // DELETE /files/:id
  if (seg.length === 2 && method === 'DELETE') {
    if (!UUID_RE.test(seg[1])) return json({ error: 'Id no válido.' }, 400);
    // A la papelera: el objeto del almacenamiento se suelta solo al borrarlo
    // de verdad (a los 30 días o desde la papelera), para poder restaurarlo.
    if (!(await trashOne(db, 'files', user.id, seg[1]))) return json({ error: 'Archivo no encontrado.' }, 404);
    return json({ ok: true, trashed: true });
  }

  return json({ error: 'Ruta de archivos no encontrada.' }, 404);
});

/* ─── Películas: subida por partes ───
   El navegador manda la película en partes de 16 MB (cada una en su propia
   petición: Cloudflare no acepta cuerpos de más de 100 MB) y la API las pasa a
   S3. Las partes recibidas se guardan en la base: si la conexión se corta, la
   subida sigue desde la parte que faltaba. */
const MAX_OPEN_UPLOADS = 3;
const THUMB_DATA_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function uploadView(row) {
  return {
    id: row.id, name: row.name, size: Number(row.size), mime: row.mime, project_id: row.project_id || null,
    part_size: row.part_size, parts_total: partsFor(row.size), parts_done: doneParts(row), created_at: row.created_at
  };
}
function cleanName(v) {
  return String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
}

async function multipart({ seg, request, env, method, user, scope, db }) {
  if (!storageReady(env)) return json({ error: 'Las subidas necesitan configurar el almacenamiento en Cloudflare.' }, 503);
  await ensureMovieTables(db);

  // POST /files/multipart — abre la subida de una película.
  if (seg.length === 2 && method === 'POST') {
    const b = await body(request);
    const name = cleanName(b.name), size = Math.floor(Number(b.size));
    const mime = /^video\/[a-z0-9.+-]{1,40}$/i.test(String(b.mime || '')) ? String(b.mime).toLowerCase() : 'video/mp4';
    if (!name) return json({ error: 'Falta el nombre del archivo.' }, 400);
    if (!isVideo(b.mime, name)) return json({ error: 'Solo los videos (películas) se suben por partes.' }, 400);
    if (!(size > 0)) return json({ error: 'Tamaño no válido.' }, 400);
    const small = smallMaxBytes(env), max = movieMaxBytes(env);
    if (size <= small) return json({ error: 'Este video cabe en una subida normal (POST /files/upload).' }, 400);
    if (size > max) return json({ error: 'La película supera el máximo de ' + Math.round(max / 1073741824) + ' GB.', code: 'too_large' }, 413);
    const acc = await movieAccess(db, user.id, (row) => rowIsAdmin(row, env));
    if (!acc.ok) return json({ error: PLAN_REQUIRED + Math.round(small / 1048576) + ' MB.', code: 'plan_required' }, 402);
    if (b.accept_rights !== true) return json({ error: RIGHTS_ERROR, code: 'rights_required' }, 400);
    const rl = await rateLimit(db, 'movie-start:' + user.id, 20, 3600);
    if (!rl.ok) return tooMany(rl.retryAfter);
    let projectId = b.project_id && UUID_RE.test(String(b.project_id)) ? String(b.project_id) : null;
    if (scope) {
      if (projectId && projectId.toLowerCase() !== String(scope).toLowerCase()) return json({ error: 'Esta API key solo puede subir a su proyecto.' }, 403);
      projectId = scope;
    }
    if (projectId && !(await ownsProject(db, user.id, projectId))) return json({ error: 'Proyecto no encontrado.' }, 404);
    // Subidas abandonadas (más de 7 días): se cancelan en S3 de vez en cuando.
    if (Math.random() < 0.05) {
      try { for (const old of await staleUploads(db, 5)) { await abortMultipart(env, old.storage_key, old.s3_upload_id); await deleteUploadRow(db, old.id); } } catch {}
    }
    const { rows: open } = await db.query(`SELECT count(*)::int AS n FROM multipart_uploads WHERE user_id = $1 AND updated_at > now() - interval '7 days'`, [user.id]);
    if (((open[0] && open[0].n) || 0) >= MAX_OPEN_UPLOADS) return json({ error: 'Ya tienes ' + MAX_OPEN_UPLOADS + ' películas subiéndose. Espera a que terminen o cancela alguna.' }, 429);
    try { await purgeExpired(db, env, user.id); } catch {}
    const left = (await storageLeft(db, user.id, acc.admin)) - await reservedBytes(db, user.id);
    if (size > left) return json({ error: 'No tienes espacio suficiente en tu plan para esta película. Libera espacio o mejora tu plan.', code: 'storage_full' }, 413);
    const key = `users/${user.id}/${crypto.randomUUID()}-${safeKeyName(name)}`;
    const s3UploadId = await createMultipart(env, key, mime);
    const rightsId = await recordRights(db, { userId: user.id, email: acc.email, fileName: name, fileSize: size, context: 'movie_upload', ip: clientIp(request), userAgent: request.headers.get('User-Agent') });
    const media = b.media && typeof b.media === 'object' ? cleanMedia(JSON.stringify(b.media)) : null;
    const row = await createUploadRow(db, { userId: user.id, projectId, key, s3UploadId, name, mime, size, meta: { optimize: b.optimize !== false, media, rights_id: rightsId } });
    return json({ success: true, upload: uploadView(row) }, 201);
  }

  const id = seg[2] || '';
  if (!UUID_RE.test(id)) return json({ error: 'Id no válido.' }, 400);
  const row = await getUploadRow(db, user.id, id);
  // Una API key de proyecto solo toca las subidas de su proyecto.
  if (!row || (scope && String(row.project_id || '').toLowerCase() !== String(scope).toLowerCase())) {
    return json({ error: 'Subida no encontrada (puede que ya terminó o se canceló).' }, 404);
  }

  // GET /files/multipart/:id — partes ya recibidas (para reanudar).
  if (seg.length === 3 && method === 'GET') return json({ success: true, upload: uploadView(row) });

  // PUT /files/multipart/:id/parts/:n — una parte.
  if (seg.length === 5 && seg[3] === 'parts' && method === 'PUT') {
    const n = Number(seg[4]);
    const expected = Number.isInteger(n) ? partLength(row.size, n) : 0;
    if (!expected) return json({ error: 'Número de parte no válido.' }, 400);
    // Content-Length obligatorio y exacto ANTES de leer el cuerpo (sin él, un
    // envío «chunked» llenaría la memoria del Worker).
    const declared = Number(request.headers.get('Content-Length'));
    if (!declared) return json({ error: 'Falta Content-Length.' }, 411);
    if (declared !== expected) return json({ error: 'La parte no tiene el tamaño esperado (' + expected + ' bytes).' }, 400);
    const buf = await request.arrayBuffer();
    if (buf.byteLength !== expected) return json({ error: 'La parte no tiene el tamaño esperado (' + expected + ' bytes).' }, 400);
    const etag = await uploadPart(env, row.storage_key, row.s3_upload_id, n, buf);
    await savePart(db, row.id, n, etag);
    return json({ ok: true, part: n });
  }

  // POST /files/multipart/:id/complete — une las partes y crea el archivo.
  if (seg.length === 4 && seg[3] === 'complete' && method === 'POST') {
    const b = await body(request);
    const list = completeList(row);
    if (!list) return json({ error: 'Faltan partes por subir.', parts_done: doneParts(row), parts_total: partsFor(row.size) }, 409);
    // El cupo se revisa otra vez: varias subidas abiertas a la vez pudieron pasarse.
    const acc = await movieAccess(db, user.id, (r) => rowIsAdmin(r, env));
    const left = (await storageLeft(db, user.id, acc.admin)) - ((await reservedBytes(db, user.id)) - Number(row.size));
    if (Number(row.size) > left) {
      await abortMultipart(env, row.storage_key, row.s3_upload_id);
      await deleteUploadRow(db, row.id);
      return json({ error: 'Ya no tienes espacio suficiente en tu plan para esta película. Libera espacio o mejora tu plan.', code: 'storage_full' }, 413);
    }
    if (!(await claimComplete(db, row.id))) return json({ error: 'La película ya se está uniendo.' }, 409);
    try { await completeMultipart(env, row.storage_key, row.s3_upload_id, list); }
    catch (e) { await releaseComplete(db, row.id).catch(() => {}); throw e; }
    const real = await headObject(env, row.storage_key);
    if (real !== null && real !== Number(row.size)) {
      try { await deleteObject(env, row.storage_key); } catch {}
      await deleteUploadRow(db, row.id);
      return json({ error: 'La película llegó incompleta. Vuelve a subirla.' }, 422);
    }
    const m = row.meta || {};
    const media = m.media || null;
    const meta = {
      extension: extOf(row.name), type: 'video', category: 'video',
      width: media && media.width || null, height: media && media.height || null,
      checksum_sha256: null, status: 'ready', visibility: 'private',
      provider: env.STORAGE_PROVIDER || 's3', multipart: true
    };
    if (media) meta.media = media;
    // Portada: la genera el navegador (fotograma del video).
    const t = THUMB_DATA_RE.exec(String(b.thumb || ''));
    if (t) {
      try {
        const bin = Uint8Array.from(atob(t[2]), c => c.charCodeAt(0));
        if (bin.length > 0 && bin.length <= THUMB_MAX) {
          meta.thumb_key = row.storage_key + '.thumb';
          meta.thumb_mime = 'image/' + t[1];
          await putObject(env, meta.thumb_key, bin, meta.thumb_mime);
        }
      } catch { delete meta.thumb_key; delete meta.thumb_mime; }
    }
    const projectId = row.project_id && await ownsProject(db, user.id, row.project_id) ? row.project_id : null;
    const { rows: ins } = await db.query(
      `INSERT INTO files (user_id, project_id, name, original_name, size, mime, storage_key, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
      [user.id, projectId, row.name, row.name, Number(row.size), row.mime, row.storage_key, JSON.stringify(meta)]);
    const fileId = ins[0].id;
    await deleteUploadRow(db, row.id);
    if (m.rights_id) { try { await db.query('UPDATE rights_acceptances SET file_id = $1 WHERE id = $2 AND file_id IS NULL', [fileId, m.rights_id]); } catch {} }
    if (m.optimize) await enqueueVideoJob(db, fileId, user.id);
    await db.query('INSERT INTO activity (user_id, kind, text) VALUES ($1, $2, $3)', [user.id, 'file', 'Película subida: ' + row.name]);
    const { rows } = await db.query(
      `SELECT id, user_id, project_id, name, original_name, size, mime, storage_key, meta, published, published_at, created_at, updated_at FROM files WHERE id = $1`, [fileId]);
    return json({ success: true, status: 201, message: 'Película subida correctamente.', data: { item: buildFileItem(rows[0], env) }, error: null }, 201);
  }

  // DELETE /files/multipart/:id — cancela la subida.
  if (seg.length === 3 && method === 'DELETE') {
    await abortMultipart(env, row.storage_key, row.s3_upload_id);
    await deleteUploadRow(db, row.id);
    return json({ ok: true });
  }
  return json({ error: 'Ruta no encontrada.' }, 404);
}
