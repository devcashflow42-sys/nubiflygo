/* ==========================================================================
   migrate.js — Crea las tablas ejecutando schema.sql. Uso: npm run migrate
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
try {
  await pool.query(sql);
  console.log('✅ Migración completada: tablas creadas/actualizadas.');
} catch (e) {
  console.error('❌ Error en la migración:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
