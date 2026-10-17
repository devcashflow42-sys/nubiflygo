/* Ruta base de account. Cloudflare rutea aquí /api/v1/account; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
