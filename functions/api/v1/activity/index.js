/* Ruta base de activity. Cloudflare rutea aquí /api/v1/activity; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
