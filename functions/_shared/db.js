/* ==========================================================================
   db.js — PostgreSQL (Neon) sobre HTTP para Workers (@neondatabase/serverless).
   El driver http solo acepta template literals, así que convertimos las
   consultas con marcadores $1, $2… al formato que entiende el driver.
   Expone query(text, params) → { rows, rowCount }.
   ========================================================================== */

import { neon } from '@neondatabase/serverless';

// Convierte "… $1 … $2 …" + [v1, v2] en un template literal sintético
// (array de trozos con .raw) + sus valores en orden de aparición.
export function toTagged(text, params = []) {
  const strings = [];
  const values = [];
  let last = 0;
  const re = /\$(\d+)/g;
  let m;
  while ((m = re.exec(text))) {
    strings.push(text.slice(last, m.index));
    values.push(params[Number(m[1]) - 1]);
    last = m.index + m[0].length;
  }
  strings.push(text.slice(last));
  strings.raw = strings.slice();
  return { strings, values };
}

export function getDb(env) {
  // Gancho solo para pruebas locales (nunca se define en producción).
  if (globalThis.__RITMOGO_DB__) return globalThis.__RITMOGO_DB__;
  const sql = neon(env.DATABASE_URL);
  return {
    async query(text, params = []) {
      const { strings, values } = toTagged(text, params);
      const rows = await sql(strings, ...values);
      const arr = Array.isArray(rows) ? rows : (rows?.rows || []);
      return { rows: arr, rowCount: arr.length };
    }
  };
}
