import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../public/js/auth-guard.js', import.meta.url), 'utf8');
function setup(status = 200, data = { user: { onboarded_at: 'done' } }) {
  let panel, redirects = [], events = {}, docEvents = {};
  const root = { dataset: {} };
  const document = { documentElement: root, visibilityState: 'visible', body: { appendChild(p) { panel = p; } }, getElementById() { return panel; }, createElement() { return { setAttribute() {}, querySelector() { return {}; }, remove() { panel = null; } }; }, addEventListener(n, fn) { docEvents[n] = fn; } };
  const location = { href: 'https://example.test/settings', origin: 'https://example.test', pathname: '/settings', replace(p) { redirects.push(p); } };
  const window = { fetch: async () => ({ status, ok: status === 200, json: async () => data }), location, addEventListener(n, fn) { events[n] = fn; } };
  vm.runInNewContext(source, { window, document, location, URL, AbortSignal, setInterval() {} });
  return { window, root, redirects, events, docEvents, document };
}
test('private content is gated before DOM ready', () => assert.equal(setup().root.dataset.authState, 'checking'));
test('valid session reveals content', async () => { const s = setup(); await s.window.NubiAuth.check(); assert.equal(s.root.dataset.authState, undefined); });
test('401 blocks and replaces history exactly once', async () => { const s = setup(401); await s.window.NubiAuth.check(); s.window.NubiAuth.requireLogin(); assert.deepEqual(s.redirects, ['/login']); assert.equal(s.root.dataset.authState, 'expired'); });
test('503 and malformed profile never reveal private content or redirect', async () => { for (const s of [setup(503), setup(200, {})]) { await s.window.NubiAuth.check(); assert.equal(s.root.dataset.authState, 'error'); assert.equal(s.redirects.length, 0); } });
test('a 401 from any private API redirects, public and external APIs do not', async () => { for (const url of ['/api/v1/projects', '/api/v1/files', '/api/v1/notifications', '/api/v1/account/profile']) { const s = setup(401); await s.window.fetch(url); assert.deepEqual(s.redirects, ['/login']); } for (const url of ['/api/v1/public/shares/a', 'https://external.test/api/v1/files']) { const s = setup(401); await s.window.fetch(url); assert.equal(s.redirects.length, 0); } });
test('guest session remains supported', async () => { const s = setup(200, {user:{is_guest:true,onboarded_at:null}}); await s.window.NubiAuth.check(); assert.equal(s.root.dataset.authState,undefined); });
test('new account goes to onboarding without exposing the app', async () => { const s = setup(200,{user:{onboarded_at:null}}); await s.window.NubiAuth.check(); assert.deepEqual(s.redirects,['/bienvenida']); assert.equal(s.root.dataset.authState,'checking'); });
test('restored and visible pages revalidate session', async () => { const s = setup(401); await s.events.pageshow({persisted:true}); await s.window.NubiAuth.check(); assert.deepEqual(s.redirects,['/login']); });
