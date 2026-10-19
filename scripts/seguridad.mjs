#!/usr/bin/env node
/* ==========================================================================
   seguridad.mjs — Chequeo de seguridad antes de publicar NubiFlyGo.

     npm run seguridad                         → revisa el código del repositorio
     npm run seguridad -- --url https://nubiflygo.com
                                               → además revisa el sitio publicado

   Revisa:
     1. Secretos en archivos versionados (claves, tokens, contraseñas).
     2. Archivos que nunca deben subirse (.env, .dev.vars, llaves, zips).
     3. Código peligroso en la página (eval, new Function, document.write).
     4. Que todo el JavaScript compile (node --check).
     5. Dependencias con vulnerabilidades altas o críticas (npm audit).
     6. Con --url: cabeceras de seguridad, cookies, rutas privadas cerradas y
        que no se sirvan archivos internos (.env, .git, server/).

   Sale con código 1 si algo falla: así puede bloquear una publicación.
   ========================================================================== */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const skipAudit = args.includes('--sin-audit');

let fails = 0, warns = 0;
const ok = (m) => console.log('  ✔ ' + m);
const bad = (m) => { fails++; console.log('  ✘ ' + m); };
const warn = (m) => { warns++; console.log('  ! ' + m); };
const title = (m) => console.log('\n' + m);

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(f => existsSync(join(ROOT, f)));

/* ─── 1. Secretos ─── */
title('1. Secretos en el código');
const SECRET_PATTERNS = [
  ['Llave privada', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS Access Key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Google OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Token de GitHub', /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{30,}/],
  ['Mercado Pago access token', /\bAPP_USR-\d{6,}-\d{6}-[a-f0-9]{32}-\d{6,}\b/],
  ['Mercado Pago token de prueba', /\bTEST-\d{6,}-\d{6}-[a-f0-9]{32}-\d{6,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe secret key', /\bsk_live_[A-Za-z0-9]{20,}/],
  ['URL de base de datos con contraseña', /postgres(ql)?:\/\/[^:\s'"`]+:[^@\s'"`]{6,}@(?!localhost|127\.0\.0\.1|host|HOST|db\b)[^\s'"`]+/],
  ['Secreto asignado en texto', /\b(JWT_SECRET|GOOGLE_CLIENT_SECRET|GITHUB_CLIENT_SECRET|MP_ACCESS_TOKEN|MP_WEBHOOK_SECRET|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?[A-Za-z0-9+/_\-]{24,}/]
];
// Valores de ejemplo en la documentación (no son secretos reales).
const PLACEHOLDER = /ejemplo|example|xxxx|pega[-_ ]?aqui|generate|change[-_ ]?me|replace|your[-_ ]|tu[-_ ]?(clave|secreto)|<[^>]+>/i;
const TEXT_EXT = /\.(js|mjs|cjs|ts|json|html|css|md|sql|toml|ya?ml|txt|sh|example|env)$/i;
let secretHits = 0;
for (const f of tracked) {
  if (!TEXT_EXT.test(f) || f.includes('package-lock.json')) continue;
  const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [name, re] of SECRET_PATTERNS) {
      if (re.test(line) && !PLACEHOLDER.test(line)) {
        secretHits++;
        bad(`${name}: ${f}:${i + 1}`);
      }
    }
  });
}
if (!secretHits) ok('No hay secretos en ' + tracked.length + ' archivos versionados');

/* ─── 2. Archivos prohibidos ─── */
title('2. Archivos que no deben publicarse');
const FORBIDDEN = /(^|\/)(\.env(\.[^/]*)?|\.dev\.vars|id_rsa[^/]*|[^/]+\.(pem|key|p12|pfx|jks|keystore|zip|sqlite|db|dump|bak))$/i;
const forbidden = tracked.filter(f => FORBIDDEN.test(f) && !/\.env\.example$/i.test(f));
forbidden.forEach(f => bad('Archivo sensible versionado: ' + f));
if (!forbidden.length) ok('Ningún .env, llave, respaldo ni zip en el repositorio');
const publicDir = tracked.filter(f => f.startsWith('public/') && /\.(map|sql|md|env|log)$/i.test(f));
publicDir.forEach(f => warn('Archivo interno dentro de public/ (se publica): ' + f));

/* ─── 3. Código peligroso en la página ─── */
title('3. Código peligroso en la página');
const DANGEROUS = [
  ['eval()', /\beval\s*\(/],
  ['new Function()', /\bnew\s+Function\s*\(/],
  ['document.write()', /\bdocument\.write(ln)?\s*\(/],
  ['setTimeout/setInterval con texto', /\bset(Timeout|Interval)\s*\(\s*['"`]/],
  ['javascript: en enlaces', /href\s*=\s*["']javascript:/i]
];
let dangerHits = 0;
for (const f of tracked.filter(f => f.startsWith('public/') && /\.(js|html)$/.test(f))) {
  readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
    if (/seguridad: permitido/.test(line)) return;   // excepción revisada a mano y marcada en la línea
    for (const [name, re] of DANGEROUS) if (re.test(line)) { dangerHits++; bad(`${name}: ${f}:${i + 1}`); }
  });
}
if (!dangerHits) ok('Sin eval, new Function, document.write ni javascript: en public/');

/* ─── 4. El JavaScript compila ─── */
title('4. El JavaScript compila');
const jsFiles = tracked.filter(f => /\.(js|mjs)$/.test(f) && /^(public|functions|server|scripts)\//.test(f));
let syntaxBad = 0;
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) { syntaxBad++; bad('No compila: ' + f + '\n      ' + (r.stderr.split('\n').find(l => /Error/.test(l)) || '').trim()); }
}
if (!syntaxBad) ok(jsFiles.length + ' archivos JavaScript compilan');

/* ─── 5. Dependencias ─── */
title('5. Dependencias (npm audit, altas y críticas)');
if (skipAudit) warn('Omitido (--sin-audit)');
else {
  for (const dir of ['.', 'server']) {
    if (!existsSync(join(ROOT, dir, 'package-lock.json'))) continue;
    const r = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: join(ROOT, dir), encoding: 'utf8' });
    let data;
    try { data = JSON.parse(r.stdout); } catch { warn(`${dir}: npm audit no respondió (¿sin internet?)`); continue; }
    if (data.error) { warn(`${dir}: npm audit no respondió (${data.error.code || 'error'})`); continue; }
    const v = data.metadata?.vulnerabilities || {};
    const serious = (v.high || 0) + (v.critical || 0);
    if (serious) {
      bad(`${dir}: ${v.critical || 0} críticas y ${v.high || 0} altas → ejecuta "npm audit fix" en ${dir}`);
      for (const [name, info] of Object.entries(data.vulnerabilities || {})) {
        if (info.severity === 'high' || info.severity === 'critical') console.log(`      - ${name} (${info.severity})`);
      }
    } else ok(`${dir}: sin vulnerabilidades altas ni críticas` + ((v.moderate || v.low) ? ` (${v.moderate || 0} moderadas, ${v.low || 0} bajas)` : ''));
  }
}

/* ─── 6. Sitio publicado ─── */
if (urlArg) {
  const base = urlArg.replace(/\/+$/, '');
  title('6. Sitio publicado: ' + base);
  const get = (path, opts = {}) => fetch(base + path, { redirect: 'manual', ...opts }).catch(e => ({ error: e }));

  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) bad('El sitio debe usar https://');

  for (const page of ['/', '/login', '/main']) {
    const r = await get(page);
    if (r.error) { bad(`${page}: no responde (${r.error.message})`); continue; }
    const h = (n) => r.headers.get(n) || '';
    const csp = h('content-security-policy');
    const missing = [];
    if (base.startsWith('https://') && !/max-age=\d{7,}/.test(h('strict-transport-security'))) missing.push('Strict-Transport-Security (≥ 1 año)');
    if (!csp) missing.push('Content-Security-Policy');
    if (h('x-content-type-options').toLowerCase() !== 'nosniff') missing.push('X-Content-Type-Options: nosniff');
    if (!/frame-ancestors\s+('none'|'self')/.test(csp) && !/deny|sameorigin/i.test(h('x-frame-options'))) missing.push('protección contra iframes (frame-ancestors / X-Frame-Options)');
    if (!h('referrer-policy')) missing.push('Referrer-Policy');
    if (missing.length) bad(`${page} (HTTP ${r.status}): falta ${missing.join(', ')}`);
    else ok(`${page} (HTTP ${r.status}): cabeceras de seguridad completas`);
    if (/unsafe-eval/.test(csp)) warn(`${page}: la CSP permite 'unsafe-eval'`);
    if (h('x-powered-by')) warn(`${page}: expone X-Powered-By: ${h('x-powered-by')}`);
  }

  // Rutas privadas sin sesión
  for (const path of ['/api/v1/files', '/api/v1/projects', '/api/v1/account/profile', '/api/v1/apikeys', '/api/v1/admin/app']) {
    const r = await get(path, { headers: { 'X-NubiFly-Client': 'web', Origin: base } });
    if (r.error) bad(`${path}: no responde`);
    else if (r.status === 401 || r.status === 403) ok(`${path} sin sesión → ${r.status}`);
    else bad(`${path} sin sesión respondió ${r.status} (debe ser 401/403)`);
  }

  // La API rechaza peticiones desde otro sitio
  {
    const r = await get('/api/v1/account/profile', { headers: { Origin: 'https://sitio-malicioso.example' } });
    const acao = r.headers?.get('access-control-allow-origin');
    if (acao === '*' || acao === 'https://sitio-malicioso.example') bad('CORS permite a otro sitio: ' + acao);
    else ok('CORS no permite otros sitios');
  }

  // Archivos internos que nunca deben servirse
  for (const path of ['/.env', '/.dev.vars', '/.git/config', '/server/.env', '/wrangler.toml', '/package.json', '/functions/_shared/security.js', '/server/schema.sql']) {
    const r = await get(path);
    if (r.error) continue;
    const body = r.status === 200 ? await r.text() : '';
    const leaks = /(JWT_SECRET|DATABASE_URL|\[core\]|repositoryformatversion|"dependencies"|compatibility_date|CREATE TABLE|export (async )?function)/.test(body);
    if (leaks) bad(`${path} se puede descargar (HTTP ${r.status})`);
    else ok(`${path} no se expone`);
  }

  // Login: el servidor debe frenar la fuerza bruta
  {
    let limited = false;
    for (let i = 0; i < 15 && !limited; i++) {
      const r = await get('/api/v1/account/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NubiFly-Client': 'web', Origin: base },
        body: JSON.stringify({ email: 'chequeo-seguridad@ejemplo.invalid', password: 'incorrecta-' + i })
      });
      if (r.status === 429) limited = true;
    }
    limited ? ok('El inicio de sesión se bloquea tras varios intentos (429)') : warn('15 intentos de inicio de sesión fallidos sin recibir 429');
  }
}

/* ─── Resultado ─── */
console.log('\n' + (fails
  ? `✘ ${fails} problema(s) de seguridad${warns ? ` y ${warns} aviso(s)` : ''}. No publiques hasta corregirlos.`
  : `✔ Listo para publicar${warns ? ` (${warns} aviso(s) para revisar)` : ''}.`));
process.exit(fails ? 1 : 0);
