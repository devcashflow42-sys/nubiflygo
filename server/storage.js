/* ==========================================================================
   storage.js — Almacenamiento de archivos.
   STORAGE_PROVIDER=s3     → S3 compatible (Neon) con AWS SDK v3.
   STORAGE_PROVIDER=local  → carpeta en disco (solo para pruebas/desarrollo).
   ========================================================================== */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config } from './config.js';

// Carpeta de pruebas locales: se conserva el nombre para no perder lo ya guardado.
const LOCAL_DIR = path.join(os.tmpdir(), 'ritmogo-files');

// Ruta en disco de una clave: nunca puede salir de LOCAL_DIR ("..", rutas absolutas).
function localPath(key) {
  const parts = String(key).split('/');
  if (parts.some(p => p === '' || p === '.' || p === '..')) throw new Error('Clave de almacenamiento no válida.');
  const full = path.resolve(LOCAL_DIR, ...parts);
  if (!full.startsWith(path.resolve(LOCAL_DIR) + path.sep)) throw new Error('Clave de almacenamiento no válida.');
  return full;
}

let s3 = null;
if (config.storageProvider === 's3') {
  s3 = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
    forcePathStyle: true   // necesario para endpoints S3 no-AWS (Neon, MinIO…)
  });
}

// Guarda un buffer bajo `key`. Devuelve la key.
export async function putObject(key, buffer, contentType) {
  if (config.storageProvider === 's3') {
    await s3.send(new PutObjectCommand({
      Bucket: config.storageBucket, Key: key, Body: buffer, ContentType: contentType
    }));
  } else {
    const dest = localPath(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, buffer);
  }
  return key;
}

// Devuelve { stream, contentType, contentLength?, contentRange? } para enviar al
// cliente. range: cabecera «Range» opcional (bytes=inicio-fin) → respuesta parcial.
export async function getObject(key, range) {
  const r = /^bytes=\d*-\d*$/.test(String(range || '')) ? String(range) : null;
  if (config.storageProvider === 's3') {
    const out = await s3.send(new GetObjectCommand({ Bucket: config.storageBucket, Key: key, ...(r ? { Range: r } : {}) }));
    return { stream: out.Body, contentType: out.ContentType, contentLength: out.ContentLength ?? null, contentRange: out.ContentRange || null };
  }
  const src = localPath(key);
  if (!fs.existsSync(src)) throw new Error('Archivo no encontrado en el almacenamiento.');
  const size = fs.statSync(src).size;
  const m = r && /^bytes=(\d*)-(\d*)$/.exec(r);
  if (m && size > 0 && (m[1] !== '' || m[2] !== '')) {
    let start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    let end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(size - 1, Number(m[2]));
    if (start <= end && start < size) {
      return { stream: fs.createReadStream(src, { start, end }), contentType: null, contentLength: end - start + 1, contentRange: 'bytes ' + start + '-' + end + '/' + size };
    }
  }
  return { stream: fs.createReadStream(src), contentType: null, contentLength: size };
}

export async function deleteObject(key) {
  if (config.storageProvider === 's3') {
    await s3.send(new DeleteObjectCommand({ Bucket: config.storageBucket, Key: key }));
  } else {
    await fsp.rm(localPath(key), { force: true });
  }
}

// Borra muchos objetos: por lotes de 1000 con DeleteObjects (S3) o del disco.
// Si el proveedor S3 no admite DeleteObjects, borra uno por uno.
export async function deleteObjects(keys) {
  keys = (keys || []).filter(Boolean);
  if (!keys.length) return;
  if (config.storageProvider !== 's3') {
    await Promise.all(keys.map(k => { try { return fsp.rm(localPath(k), { force: true }); } catch { return null; } }));
    return;
  }
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try {
      await s3.send(new DeleteObjectsCommand({ Bucket: config.storageBucket, Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: true } }));
    } catch {
      for (let j = 0; j < chunk.length; j += 8) await Promise.all(chunk.slice(j, j + 8).map(k => deleteObject(k).catch(() => {})));
    }
  }
}

/* ─── Subida por partes (películas) ───
   Misma interfaz que functions/_shared/storage.js. En S3 usa el «multipart
   upload»; en disco (pruebas) guarda cada parte en una carpeta y al final las
   une en el archivo. */
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const MP_DIR = path.join(LOCAL_DIR, '_multipart');
const mpDir = (uploadId) => {
  if (!/^[a-f0-9-]{36}$/i.test(String(uploadId))) throw new Error('Subida no válida.');
  return path.join(MP_DIR, uploadId);
};

export async function createMultipart(key, contentType) {
  if (config.storageProvider === 's3') {
    const out = await s3.send(new CreateMultipartUploadCommand({ Bucket: config.storageBucket, Key: key, ContentType: contentType }));
    return out.UploadId;
  }
  const id = crypto.randomUUID();
  await fsp.mkdir(mpDir(id), { recursive: true });
  return id;
}

// body: Buffer o stream con exactamente `length` bytes. Devuelve el ETag.
export async function uploadPart(key, uploadId, n, body, length) {
  if (config.storageProvider === 's3') {
    const out = await s3.send(new UploadPartCommand({ Bucket: config.storageBucket, Key: key, UploadId: uploadId, PartNumber: n, Body: body, ContentLength: length }));
    return out.ETag;
  }
  const dest = path.join(mpDir(uploadId), String(n));
  if (Buffer.isBuffer(body)) await fsp.writeFile(dest, body);
  else await pipeline(body, fs.createWriteStream(dest));
  const st = await fsp.stat(dest);
  if (st.size !== length) throw Object.assign(new Error('La parte no tiene el tamaño esperado.'), { status: 400 });
  return '"' + n + '-' + st.size + '"';
}

export async function completeMultipart(key, uploadId, parts) {
  if (config.storageProvider === 's3') {
    await s3.send(new CompleteMultipartUploadCommand({
      Bucket: config.storageBucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.n, ETag: p.etag })) }
    }));
    return;
  }
  const dest = localPath(key);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(dest);
  // Parte por parte en el mismo archivo (sin pipeline: no acumula oyentes por parte).
  for (const p of parts) {
    for await (const chunk of fs.createReadStream(path.join(mpDir(uploadId), String(p.n)))) {
      if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
    }
  }
  await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
  await fsp.rm(mpDir(uploadId), { recursive: true, force: true });
}

export async function abortMultipart(key, uploadId) {
  try {
    if (config.storageProvider === 's3') await s3.send(new AbortMultipartUploadCommand({ Bucket: config.storageBucket, Key: key, UploadId: uploadId }));
    else await fsp.rm(mpDir(uploadId), { recursive: true, force: true });
  } catch {}
}

// Tamaño real del objeto (o null si no existe).
export async function headObject(key) {
  try {
    if (config.storageProvider === 's3') {
      const out = await s3.send(new HeadObjectCommand({ Bucket: config.storageBucket, Key: key }));
      return Number(out.ContentLength) || 0;
    }
    return (await fsp.stat(localPath(key))).size;
  } catch { return null; }
}

// Ruta local del objeto (solo con STORAGE_PROVIDER=local; la usa el compresor).
export function localFilePath(key) { return config.storageProvider === 's3' ? null : localPath(key); }
