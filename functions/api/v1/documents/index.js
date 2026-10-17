/* Ruta base de documents. Cloudflare rutea aquí /api/v1/documents; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
