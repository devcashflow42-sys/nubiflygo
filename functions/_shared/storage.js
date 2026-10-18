/* ==========================================================================
   storage.js — Subida/descarga/borrado en almacenamiento S3 (Neon) desde
   Workers, firmando con SigV4 mediante aws4fetch.
   ========================================================================== */

import { AwsClient } from 'aws4fetch';

// Limpia un valor de entorno: quita espacios, saltos de línea y comillas que a
// veces se pegan al copiar desde un .env (p. ej. "abc" → abc). Una sola
// comilla de más hace que S3 responda 403 (firma o clave no válida).
function clean(v) {
  return String(v == null ? '' : v).trim().replace(/^['"]+|['"]+$/g, '').trim();
}

// Configuración ya limpia. En Cloudflare R2 la región debe ser "auto".
export function storageConfig(env) {
  const endpoint = clean(env.AWS_ENDPOINT_URL_S3).replace(/\/+$/, '');
  const isR2 = /\.r2\.cloudflarestorage\.com$/i.test(endpoint.replace(/^https?:\/\//, '').split('/')[0]);
  return {
    endpoint,
    // Bucket S3 real donde ya están los archivos: el nombre se conserva (no es marca).
    bucket: clean(env.STORAGE_BUCKET) || 'ritmogo',
    accessKeyId: clean(env.AWS_ACCESS_KEY_ID),
    secretAccessKey: clean(env.AWS_SECRET_ACCESS_KEY),
    region: clean(env.AWS_REGION) || (isR2 ? 'auto' : 'us-east-2')
  };
}

// opts.retries: aws4fetch reintenta solo hasta 10 veces ante un 5xx; en el
// borrado masivo se usa 0 (cada reintento gasta una llamada del límite).
function client(env, opts) {
  const c = storageConfig(env);
  return new AwsClient({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    region: c.region,
    service: 's3',
    ...(opts && opts.retries != null ? { retries: opts.retries } : {})
  });
}

function objectUrl(env, key) {
  const c = storageConfig(env);
  const parts = String(key).split('/');
  // Nunca se sale de la carpeta del usuario ni del bucket ("." o ".." en la ruta).
  if (parts.some(p => p === '.' || p === '..' || p === '')) throw new Error('Clave de almacenamiento no válida.');
  return `${c.endpoint}/${c.bucket}/${parts.map(encodeURIComponent).join('/')}`;
}

// Explica el error de S3 con su código (p. ej. SignatureDoesNotMatch) y una pista.
const HINTS = {
  SignatureDoesNotMatch: 'AWS_SECRET_ACCESS_KEY o AWS_REGION no son correctos',
  InvalidAccessKeyId: 'AWS_ACCESS_KEY_ID no es correcto',
  AccessDenied: 'la clave no tiene permiso de escritura en el bucket',
  NoSuchBucket: 'el bucket de STORAGE_BUCKET no existe',
  AuthorizationHeaderMalformed: 'AWS_REGION no es la del bucket',
  InvalidRegionName: 'AWS_REGION no es válida (en Cloudflare R2 usa "auto")'
};
async function storageError(res, action) {
  let code = '', msg = '';
  try {
    const xml = await res.text();
    code = (/<Code>([^<]+)<\/Code>/.exec(xml) || [])[1] || '';
    msg = (/<Message>([^<]+)<\/Message>/.exec(xml) || [])[1] || '';
  } catch {}
  const hint = HINTS[code] ? ' — ' + HINTS[code] : '';
  const err = new Error('No se pudo ' + action + ' el archivo en el almacenamiento (' + res.status + (code ? ' ' + code : '') + ')' + hint + '.' + (msg && !hint ? ' ' + msg : ''));
  err.status = res.status; err.code = code;
  return err;
}

export async function putObject(env, key, body, contentType) {
  if (globalThis.__NUBIFLYGO_STORAGE__) return globalThis.__NUBIFLYGO_STORAGE__.put(key, body, contentType);
  const res = await client(env).fetch(objectUrl(env, key), {
    method: 'PUT',
    body,
    headers: { 'Content-Type': contentType || 'application/octet-stream' }
  });
  if (!res.ok) throw await storageError(res, 'guardar');
  return key;
}

export async function getObject(env, key, headers) {
  if (globalThis.__NUBIFLYGO_STORAGE__) return globalThis.__NUBIFLYGO_STORAGE__.get(key, headers);
  const res = await client(env).fetch(objectUrl(env, key), { method: 'GET', headers: headers || {} });
  if (!res.ok) throw await storageError(res, 'leer');
  return res;
}

export async function deleteObject(env, key, opts) {
  if (globalThis.__NUBIFLYGO_STORAGE__) return globalThis.__NUBIFLYGO_STORAGE__.del(key);
  await client(env, opts).fetch(objectUrl(env, key), { method: 'DELETE' });
}

/* ─── Borrado masivo ───
   Cloudflare limita las llamadas (subpeticiones) que hace cada petición (50 en
   el plan gratuito), y borrar objeto por objeto agotaría ese límite con pocas
   decenas de archivos. Por eso primero se usa el borrado por lotes de S3
   (DeleteObjects: hasta 1000 objetos en UNA llamada). Si el proveedor no lo
   admite, se borra uno por uno hasta `budget` llamadas y se informa cuántos
   se procesaron; quien llama borra solo esas filas y deja el resto para la
   siguiente petición.
   Devuelve { processed, all }: `processed` objetos ya tratados (en orden). */
let batchUnsupported = false;
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function deleteBatch(env, keys) {
  const c = storageConfig(env);
  const xml = '<?xml version="1.0" encoding="UTF-8"?><Delete xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Quiet>true</Quiet>' +
    keys.map(k => '<Object><Key>' + xmlEsc(k) + '</Key></Object>').join('') + '</Delete>';
  const body = new TextEncoder().encode(xml);
  // S3 exige Content-MD5 en DeleteObjects (Workers sí calcula MD5).
  const md5 = b64(await crypto.subtle.digest('MD5', body));
  const res = await client(env, { retries: 0 }).fetch(`${c.endpoint}/${c.bucket}?delete`, {
    method: 'POST', body, headers: { 'Content-Type': 'application/xml', 'Content-MD5': md5 }
  });
  if (!res.ok) {
    const err = await storageError(res, 'borrar');
    // Solo «no lo admite» desactiva los lotes; un error pasajero (5xx, red) no.
    err.unsupported = res.status === 501 || res.status === 405 ||
      ['NotImplemented', 'MethodNotAllowed', 'InvalidRequest', 'InvalidDigest', 'MissingContentMD5', 'BadDigest'].includes(err.code);
    throw err;
  }
  // En modo «Quiet» la respuesta solo lista los que fallaron. «NoSuchKey»
  // (ya no existía) cuenta como borrado; el resto se reintenta uno por uno.
  const out = await res.text();
  const failed = [];
  const re = /<Error>([\s\S]*?)<\/Error>/g;
  let m;
  while ((m = re.exec(out))) {
    const key = (/<Key>([\s\S]*?)<\/Key>/.exec(m[1]) || [])[1];
    const code = (/<Code>([\s\S]*?)<\/Code>/.exec(m[1]) || [])[1] || '';
    if (key && code !== 'NoSuchKey') failed.push(xmlUnesc(key));
  }
  return failed;
}
const xmlUnesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export async function deleteObjects(env, keys, opts) {
  keys = (keys || []).filter(Boolean);
  if (!keys.length) return { processed: 0, all: true };
  let budget = Math.max(1, (opts && opts.budget) || 40);
  const hook = globalThis.__NUBIFLYGO_STORAGE__;
  let done = 0;
  if (hook ? hook.batch !== false : !batchUnsupported) {
    const retry = [];
    try {
      for (; done < keys.length; done += 1000) {
        const chunk = keys.slice(done, done + 1000);
        if (hook) { for (const k of chunk) await hook.del(k); } else { budget--; retry.push(...await deleteBatch(env, chunk)); }
      }
    } catch (e) {
      // Proveedor sin DeleteObjects (o sin MD5 en este entorno): se recuerda.
      // Un error pasajero solo afecta a esta llamada.
      if (!hook && (e.unsupported || e instanceof TypeError || /MD5|not supported|Unrecognized/i.test(e.message || ''))) batchUnsupported = true;
    }
    // Los que el lote no pudo borrar se reintentan uno por uno (dentro del presupuesto).
    if (done >= keys.length) {
      const again = retry.slice(0, Math.max(0, budget));
      for (let i = 0; i < again.length; i += 6) {
        await Promise.all(again.slice(i, i + 6).map(k => deleteObject(env, k, { retries: 0 }).catch(() => {})));
      }
      return { processed: keys.length, all: true };
    }
  }
  const todo = keys.slice(done, done + budget);
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(k => deleteObject(env, k, { retries: 0 }).catch(() => {})));
  }
  const processed = done + todo.length;
  return { processed, all: processed >= keys.length };
}
