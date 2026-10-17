/* ==========================================================================
   db.js — Conexión a PostgreSQL (Neon) con node-postgres.
   Expone query() y tx() para usar en los manejadores de rutas.
   ========================================================================== */

import pg from 'pg';
import { config } from './config.js';

// SSL activado salvo que la URL pida sslmode=disable (útil en local).
const ssl = /sslmode=disable/.test(config.databaseUrl) ? false : { rejectUnauthorized: false };

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', err => console.error('[db] error del pool:', err.message));

export function query(text, params) {
  return pool.query(text, params);
}

// Ejecuta una función dentro de una transacción.
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function ping() {
  try { await pool.query('SELECT 1'); return true; }
  catch { return false; }
}
