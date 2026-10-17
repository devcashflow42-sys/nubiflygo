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

// Devuelve { stream, contentType } para enviar al cliente.
export async function getObject(key) {
  if (config.storageProvider === 's3') {
    const out = await s3.send(new GetObjectCommand({ Bucket: config.storageBucket, Key: key }));
    return { stream: out.Body, contentType: out.ContentType };
  }
  const src = localPath(key);
  if (!fs.existsSync(src)) throw new Error('Archivo no encontrado en el almacenamiento.');
  return { stream: fs.createReadStream(src), contentType: null };
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
