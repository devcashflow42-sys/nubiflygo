/* Ruta base de projects. Cloudflare rutea aquí /api/v1/projects; la lógica está en _logic.js. */
export { handle as onRequest } from './_logic.js';
