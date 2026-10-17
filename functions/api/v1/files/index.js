/* Ruta base de files. Cloudflare rutea aquí /api/v1/files; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
