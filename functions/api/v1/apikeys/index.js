/* Ruta base de apikeys. Cloudflare rutea aquí /api/v1/apikeys; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
