/* ==========================================================================
   config.js — Carga de variables de entorno (.env) y configuración.
   ========================================================================== */

import 'dotenv/config';

const int = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export const config = {
  appName: process.env.APP_NAME || 'NubiFlyGo',
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 8080),

  databaseUrl: process.env.DATABASE_URL || '',

  storageProvider: (process.env.STORAGE_PROVIDER || 'local').toLowerCase(),
  // Bucket S3 real donde ya están los archivos: el nombre se conserva (no es marca).
  storageBucket: process.env.STORAGE_BUCKET || 'ritmogo',
  maxFileBytes: int(process.env.MAX_FILE_SIZE_MB, 100) * 1024 * 1024,

  s3: {
    endpoint: process.env.AWS_ENDPOINT_URL_S3 || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'us-east-2'
  },

  jwtSecret: process.env.JWT_SECRET || '',
  sessionDays: int(process.env.SESSION_DAYS, 7),

  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean),

  get isProd() { return this.env === 'production'; }
};

// Avisos de configuración incompleta (no detienen el arranque en desarrollo).
export function checkConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.jwtSecret || config.jwtSecret === 'GENERATE_SECURE_RANDOM_SECRET') missing.push('JWT_SECRET');
  if (config.storageProvider === 's3') {
    if (!config.s3.endpoint) missing.push('AWS_ENDPOINT_URL_S3');
    if (!config.s3.accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
    if (!config.s3.secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
  }
  return missing;
}
