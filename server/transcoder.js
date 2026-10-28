/* ==========================================================================
   transcoder.js — Compresor de películas con ffmpeg (proceso aparte).

     npm run transcoder            → se queda trabajando (revisa cada 5 s)
     npm run transcoder -- --once  → procesa lo pendiente y termina

   Cloudflare no puede ejecutar ffmpeg: este proceso corre en un servidor propio
   (VPS, Render, Railway…) con ffmpeg y ffprobe instalados y las MISMAS
   variables que el servidor (DATABASE_URL, STORAGE_PROVIDER, AWS_*…).

   Para cada trabajo de video_jobs (lo crea la API al terminar de subir una
   película con «Optimizar» activado):
     1. Lo toma con FOR UPDATE SKIP LOCKED (varios compresores no chocan).
     2. Descarga el original a una carpeta temporal.
     3. Comprime a 720p (o menos si el original es menor), H.264 + AAC, con
        «faststart»: el video empieza a verse sin descargarlo completo.
     4. Si quedó más chico, reemplaza el original (y borra el viejo); si no,
        se queda el original. El progreso se ve en la app.
     5. Avisa al usuario. Si falla 3 veces, el original queda intacto.

   Variables opcionales: FFMPEG_PATH, FFPROBE_PATH, TRANSCODE_HEIGHT (720),
   TRANSCODE_CRF (23), TRANSCODE_PRESET (veryfast), TRANSCODER_TMP.
   ========================================================================== */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { query, pool } from './db.js';
import { getObject, putObject, deleteObject, createMultipart, uploadPart, completeMultipart, abortMultipart, localFilePath } from './storage.js';
import { notifySafe } from './notify.js';
import { safeKeyName } from './security.js';
import { fmtBytes } from './lists.js';
import { ensureMovieTables, PART_SIZE } from '../functions/_shared/movies.js';

const db = { query };
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const HEIGHT = Math.min(2160, Math.max(240, Number(process.env.TRANSCODE_HEIGHT) || 720));
const CRF = Math.min(35, Math.max(16, Number(process.env.TRANSCODE_CRF) || 23));
const PRESET = /^(ultrafast|superfast|veryfast|faster|fast|medium|slow)$/.test(process.env.TRANSCODE_PRESET || '') ? process.env.TRANSCODE_PRESET : 'veryfast';
const TMP = process.env.TRANSCODER_TMP || os.tmpdir();
const POLL_MS = 5000;
const STALE_MIN = 15;        // un trabajo sin latido en 15 min se da por abandonado
const MAX_ATTEMPTS = 3;
// Solo contenedores de video reales. ffmpeg detecta el formato por el
// CONTENIDO: un «.mp4» que en realidad es una lista HLS o «concat» podría leer
// archivos del servidor o pedir URLs internas. Se rechaza todo lo demás y la
// entrada solo puede abrir archivos locales (protocol_whitelist file).
const ALLOWED_FORMATS = /^(mov,mp4,m4a,3gp,3g2,mj2|matroska,webm|avi|mpeg|mpegts|flv|asf|ogg)$/;
const SAFE_INPUT = ['-protocol_whitelist', 'file'];

const log = (msg, data) => console.log(JSON.stringify({ at: new Date().toISOString(), level: 'transcoder', msg, ...(data || {}) }));

/* ─── Trabajos ─── */
async function claim() {
  const { rows } = await query(
    `WITH j AS (
       SELECT id FROM video_jobs
       -- Un reintento espera 2 minutos (un fallo pasajero no se repite al instante).
       WHERE (status = 'pending' AND (attempts = 0 OR updated_at < now() - interval '2 minutes'))
          OR (status = 'processing' AND heartbeat_at < now() - make_interval(mins => $1))
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     UPDATE video_jobs v SET status = 'processing', attempts = v.attempts + 1, heartbeat_at = now(), updated_at = now()
     FROM j WHERE v.id = j.id RETURNING v.*`, [STALE_MIN]);
  return rows[0] || null;
}
async function setJob(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE video_jobs SET ${sets}, heartbeat_at = now(), updated_at = now() WHERE id = $1`, [id, ...keys.map(k => fields[k])]);
}
// Estado visible en la app (files.meta.transcode). Cambia updated_at: el
// tiempo real de la app lo nota y redibuja.
async function setFileTranscode(fileId, t) {
  await query(
    `UPDATE files SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{transcode}', $2::jsonb), updated_at = now() WHERE id = $1`,
    [fileId, JSON.stringify(t)]);
}

/* ─── ffprobe / ffmpeg ─── */
// timeoutMs: se mata el proceso si tarda más (un archivo raro no cuelga al compresor).
function run(cmd, args, onLine, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    current = p;
    const timer = setTimeout(() => { p.kill('SIGKILL'); }, timeoutMs || 10 * 60 * 1000);
    let out = '', err = '', buf = '';
    p.stdout.on('data', d => {
      const s = d.toString(); out += s.length < 1e6 ? s : '';
      if (onLine) { buf += s; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } }
    });
    p.stderr.on('data', d => { err = (err + d.toString()).slice(-4000); });
    p.on('error', reject);
    p.on('close', code => { clearTimeout(timer); current = null; code === 0 ? resolve(out) : reject(new Error(cmd + ' terminó con código ' + code + ': ' + err.trim().split('\n').slice(-3).join(' | '))); });
  });
}
async function probe(file) {
  const out = await run(FFPROBE, ['-v', 'error', ...SAFE_INPUT, '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,width,height', '-of', 'json', file], null, 2 * 60 * 1000);
  const j = JSON.parse(out || '{}');
  const fmt = String((j.format && j.format.format_name) || '');
  if (!ALLOWED_FORMATS.test(fmt)) throw new Error('Formato de video no admitido: ' + (fmt.slice(0, 40) || 'desconocido'));
  const v = (j.streams || []).find(s => s.codec_type === 'video') || {};
  const a = (j.streams || []).find(s => s.codec_type === 'audio') || null;
  return { duration: Number(j.format && j.format.duration) || 0, width: v.width || 0, height: v.height || 0, vcodec: v.codec_name || '', hasAudio: !!a };
}

/* ─── Almacenamiento ─── */
async function download(key, dest) {
  const local = localFilePath(key);
  if (local) return local;                       // pruebas: se lee directo del disco
  const obj = await getObject(key);
  await pipeline(obj.stream, fs.createWriteStream(dest));
  return dest;
}
async function upload(file, key, size) {
  if (size <= PART_SIZE) { await putObject(key, await fsp.readFile(file), 'video/mp4'); return; }
  const id = await createMultipart(key, 'video/mp4');
  try {
    const parts = [];
    for (let n = 1, start = 0; start < size; n++, start += PART_SIZE) {
      const len = Math.min(PART_SIZE, size - start);
      const etag = await uploadPart(key, id, n, fs.createReadStream(file, { start, end: start + len - 1 }), len);
      parts.push({ n, etag });
    }
    await completeMultipart(key, id, parts);
  } catch (e) { await abortMultipart(key, id); throw e; }
}

/* ─── Un trabajo ─── */
async function processJob(job) {
  const { rows } = await query(
    'SELECT id, user_id, project_id, name, size, mime, storage_key, meta FROM files WHERE id = $1 AND deleted_at IS NULL', [job.file_id]);
  const f = rows[0];
  if (!f) { await setJob(job.id, { status: 'done', error: 'El archivo ya no existe.' }); return; }
  log('start', { job: job.id, file: f.id, size: Number(f.size), attempt: job.attempts });
  await setFileTranscode(f.id, { status: 'processing', progress: 0 });
  const dir = await fsp.mkdtemp(path.join(TMP, 'nubi-tc-'));
  try {
    const input = await download(f.storage_key, path.join(dir, 'in'));
    const info = await probe(input);
    const target = Math.min(HEIGHT, info.height || HEIGHT);
    const out = path.join(dir, 'out.mp4');
    let last = 0, lastBeat = Date.now();
    const args = ['-hide_banner', '-nostats', '-y', ...SAFE_INPUT, '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', PRESET, '-crf', String(CRF), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=-2:' + target, '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart', '-progress', 'pipe:1', out];
    // Tiempo máximo: 4 veces la duración (mínimo 1 h).
    const limit = Math.max(3600, (info.duration || 0) * 4) * 1000;
    await run(FFMPEG, args, (line) => {
      const m = /^out_time_(?:ms|us)=(\d+)/.exec(line);
      if (!m || !info.duration) return;
      const pct = Math.min(99, Math.floor(Number(m[1]) / 1e6 / info.duration * 100));
      // Progreso cada 5 % (o latido cada 60 s): no se satura la base.
      if (pct >= last + 5 || Date.now() - lastBeat > 60000) {
        last = pct; lastBeat = Date.now();
        setJob(job.id, { progress: pct }).catch(() => {});
        setFileTranscode(f.id, { status: 'processing', progress: pct }).catch(() => {});
      }
    }, limit);
    const outSize = (await fsp.stat(out)).size;
    const original = Number(f.size);
    const meta = f.meta || {};
    // No ganó espacio: se queda el original (ya era ligero).
    if (outSize >= original * 0.97) {
      await setFileTranscode(f.id, { status: 'ready', progress: 100, original_size: original, optimized_size: original, resolution: (info.height || target) + 'p', kept_original: true });
      await setJob(job.id, { status: 'done', progress: 100 });
      log('kept-original', { job: job.id, original, outSize });
      await notifyUser(f, 'Tu película está lista', '«' + f.name + '» ya estaba optimizada: se dejó como la subiste (' + fmtBytes(original) + ').');
      return;
    }
    const base = String(f.name).replace(/\.[a-z0-9]{1,5}$/i, '') || 'pelicula';
    const newName = (base + '.mp4').slice(0, 255);
    const newKey = `users/${f.user_id}/${crypto.randomUUID()}-${safeKeyName(newName)}`;
    await upload(out, newKey, outSize);
    const transcode = { status: 'ready', progress: 100, original_size: original, optimized_size: outSize, resolution: target + 'p' };
    const width = info.height ? Math.round(info.width * target / info.height / 2) * 2 : meta.width || null;
    // Solo si el archivo sigue igual (nadie lo cambió mientras se comprimía).
    const upd = await query(
      `UPDATE files SET storage_key = $3, size = $4, mime = 'video/mp4', name = $5,
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('transcode', $6::jsonb, 'width', $7::int, 'height', $8::int, 'extension', 'mp4', 'checksum_sha256', NULL),
         updated_at = now()
       WHERE id = $1 AND storage_key = $2 AND deleted_at IS NULL RETURNING id`,
      [f.id, f.storage_key, newKey, outSize, newName, JSON.stringify(transcode), width, target]);
    if (!upd.rows[0]) { await deleteObject(newKey).catch(() => {}); await setJob(job.id, { status: 'done', error: 'El archivo cambió mientras se comprimía.' }); return; }
    await deleteObject(f.storage_key).catch(() => {});
    await setJob(job.id, { status: 'done', progress: 100 });
    log('done', { job: job.id, original, outSize });
    await notifyUser(f, 'Tu película está lista', '«' + newName + '» se optimizó a ' + target + 'p: pasó de ' + fmtBytes(original) + ' a ' + fmtBytes(outSize) + '. Ya puedes compartirla.');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function notifyUser(f, title, body) {
  await notifySafe(db, f.user_id, { type: 'info', title, body, link: f.project_id ? '/project/' + f.project_id : '/archive' });
}

async function fail(job, e) {
  const msg = String(e && e.message || e).slice(0, 500);
  log('error', { job: job.id, attempt: job.attempts, error: msg });
  if (job.attempts >= MAX_ATTEMPTS) {
    await setJob(job.id, { status: 'failed', error: msg });
    await setFileTranscode(job.file_id, { status: 'failed', progress: 0 }).catch(() => {});
    const { rows } = await query('SELECT id, user_id, project_id, name FROM files WHERE id = $1', [job.file_id]);
    if (rows[0]) await notifyUser(rows[0], 'No se pudo optimizar tu película', '«' + rows[0].name + '» se quedó como la subiste: puedes verla y compartirla igual.');
  } else {
    await setJob(job.id, { status: 'pending', error: msg });
    await setFileTranscode(job.file_id, { status: 'pending', progress: 0 }).catch(() => {});
  }
}

/* ─── Bucle ─── */
let stopping = false, current = null, working = null;
async function tick() {
  const job = await claim();
  if (!job) return false;
  working = job;
  try { await processJob(job); } catch (e) { if (!stopping) await fail(job, e); }
  finally { working = null; }
  return true;
}

async function main() {
  const once = process.argv.includes('--once');
  await run(FFMPEG, ['-version']).catch(() => { throw new Error('No se encontró ffmpeg (FFMPEG_PATH).'); });
  await ensureMovieTables(db);
  log('ready', { height: HEIGHT, crf: CRF, preset: PRESET, once });
  while (!stopping) {
    let did = false;
    try { did = await tick(); } catch (e) { log('loop-error', { error: String(e && e.message || e) }); }
    if (!did) { if (once) break; await new Promise(r => setTimeout(r, POLL_MS)); }
  }
  await pool.end().catch(() => {});
}

// Al apagar: se corta ffmpeg y el trabajo vuelve a la cola (otro lo retoma).
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    log('stopping', { signal: sig });
    if (current) current.kill('SIGKILL');
    if (working) await query(`UPDATE video_jobs SET status = 'pending', attempts = greatest(0, attempts - 1), updated_at = now() WHERE id = $1`, [working.id]).catch(() => {});
    process.exit(0);
  });
}

main().catch(e => { log('fatal', { error: String(e && e.message || e) }); process.exit(1); });
