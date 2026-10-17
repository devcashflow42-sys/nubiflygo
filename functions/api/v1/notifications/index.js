/* Ruta base de notifications. Cloudflare rutea aquí /api/v1/notifications; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
