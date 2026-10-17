/* Ruta base de notes. Cloudflare rutea aquí /api/v1/notes; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
