/* ==========================================================================
   server.js — Servidor de NubiFlyGo (Express)
   Páginas con rutas limpias (sin .html):
       /        → public/main.html   (landing)
       /login   → public/login.html  (acceso)
       /main    → public/home.html   (la app)
   API bajo /api/v1 (ver routes-api.js) con sesión en cookie httpOnly.
   No usa localStorage, sessionStorage ni IndexedDB. El token de sesión va en
   una cookie httpOnly, nunca accesible desde el JavaScript del navegador.
   ========================================================================== */

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, checkConfig } from './config.js';
import { api } from './routes-api.js';
import { apiGate, securityHeaders, errorRef } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                 // detrás de Nginx/Cloudflare
// Capa 5: cabeceras de seguridad en todas las respuestas.
app.use(securityHeaders);
// Capa 3: cuerpo JSON acotado (1 MB; la foto de perfil, data URL de hasta 2 MB, admite 3 MB).
const jsonSmall = express.json({ limit: '1mb' }), jsonAvatar = express.json({ limit: '3mb' });
app.use((req, res, next) => (req.path === '/api/v1/account/avatar' ? jsonAvatar : jsonSmall)(req, res, next));
app.use(cookieParser());

// CORS con credenciales: solo los orígenes de ALLOWED_ORIGINS pueden llamar
// a la API desde otro dominio enviando la cookie de sesión.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-NubiFly-Client');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Oculta el .html: redirige las direcciones con .html a su ruta limpia.
const CLEAN = { '/main.html': '/', '/index.html': '/', '/login.html': '/login', '/home.html': '/main' };
app.get(Object.keys(CLEAN), (req, res) => res.redirect(301, CLEAN[req.path]));

// API primero, para que no la capture el servidor de archivos. Antes pasa por
// la capa 1: sin datos en la barra de direcciones y solo desde la app.
app.use('/api', apiGate);
app.use('/api/v1', api);

// Enlace compartido: /s/<token> → página pública del archivo.
app.get(/^\/s\/[A-Za-z0-9]{22}\/?$/, (_req, res) => res.sendFile(path.join(PUBLIC, 'share.html')));

// Páginas con ruta limpia.
const PAGES = { '/': 'main.html', '/login': 'login.html', '/main': 'home.html' };
for (const [route, file] of Object.entries(PAGES)) {
  app.get(route, (_req, res) => res.sendFile(path.join(PUBLIC, file)));
}

// Recursos estáticos (css, js, imágenes). No sirve .html por defecto.
app.use(express.static(PUBLIC, { extensions: [], index: false }));

// Secciones de la app (SPA): sirven home.html para que la entrada directa y la
// recarga abran la sección correcta (el front ajusta la vista según la URL).
// Admite también el detalle /seccion/<id>.
const APP_SECTIONS = new Set(['main', 'project', 'note', 'archive', 'report', 'apikeys', 'automation', 'settings', 'notifications']);
app.get(/^\/([^/]+)(\/.*)?$/, (req, res, nextFn) => {
  const first = (req.path.split('/')[1] || '').toLowerCase();
  if (APP_SECTIONS.has(first)) return res.sendFile(path.join(PUBLIC, 'home.html'));
  return nextFn();
});

// Rutas desconocidas → la landing (API devuelve 404 JSON).
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta de API no encontrada.' });
  res.status(404).sendFile(path.join(PUBLIC, 'main.html'));
});

// Manejador de errores.
app.use((err, _req, res, _next) => {
  // Capa 4: el cliente solo ve un código; el detalle queda en el registro.
  const ref = errorRef();
  console.error('[error]', ref, err.message);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status === 413) return res.status(413).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo.' : 'El cuerpo de la petición es demasiado grande.' });
  if (status === 400 && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
  res.status(status >= 400 && status < 500 ? status : 500).json({ error: 'Error interno del servidor (código ' + ref + ').', ref });
});

app.listen(config.port, () => {
  console.log(`${config.appName} escuchando en http://127.0.0.1:${config.port}  (${config.env})`);
  console.log('  Páginas:  /  ·  /login  ·  /main');
  console.log('  API:      /api/v1/*  (health, account, projects, notes, documents, files, apikeys, activity, notifications)');
  const missing = checkConfig();
  if (missing.length) console.warn('  ⚠ Faltan variables de entorno:', missing.join(', '));
});
