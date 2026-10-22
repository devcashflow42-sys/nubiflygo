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
     PATCH /files/:id                    → publicar/despublicar
     DELETE /files/:id                   → borra (BD + binario)
   ========================================================================== */
import { getDb } from '../../../_shared/db.js';
import { json, CORS } from '../../../_shared/http.js';
import { putObject, getObject, deleteObject } from '../../../_shared/storage.js';
import { dataRoute, storageReady, ownsProject, rowIsAdmin } from '../../../_shared/api.js';
import { storageLeft } from '../../../_shared/billing.js';
import { fileHeaders } from '../../../_shared/security.js';
import { UUID_RE, GUEST_LIMITS, body, pageParams, fmtBytes } from '../../../_shared/util.js';
import { sha256hex, imageSize, categoryOf, extOf, buildFileItem, cleanMedia } from '../../../_shared/files-util.js';
import { fileFilters, strictFilterError, FILE_SORTS, FILE_TYPE_SQL, FILE_TYPES, readSelection, logActivity, bulkResponse } from '../../../_shared/bulk.js';
import { trashOne, trashFilesWhere } from '../../../_shared/trash.js';

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

  // POST /files/upload
  if (seg[1] === 'upload' && method === 'POST') {
    if (!storageReady(env)) {
      return json({ error: 'Las subidas necesitan configurar el almacenamiento (AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) en Cloudflare.' }, 503);
    }
    if (user.isGuest) {
      const { rows: c } = await db.query('SELECT count(*)::int AS n FROM files WHERE user_id = $1 AND deleted_at IS NULL', [user.id]);
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
    const { rows } = await db.query('SELECT name, mime, storage_key FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [seg[1], user.id]);
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
    const { rows } = await db.query(`SELECT meta->>'thumb_key' AS k, meta->>'thumb_mime' AS m FROM files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [seg[1], user.id]);
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
    const { rows } = await db.query(
      `UPDATE files SET published = $3, published_at = CASE WHEN $3 THEN now() ELSE NULL END, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
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
