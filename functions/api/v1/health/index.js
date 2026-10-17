/* Ruta base de health. Cloudflare rutea aquí /api/v1/health; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
