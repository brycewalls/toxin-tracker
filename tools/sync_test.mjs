// Sync and sign-out tests for the hosted build (#83), against tools/fake-firebase.js (a fake Firestore with
// server latency, an offline cache and a write queue) instead of the live Firebase project.
//   node tools/sync_test.mjs                                    # every scenario, against its own build
//   node tools/sync_test.mjs --dist some/other/dist --only repro,merge
// Without --dist it builds the app into .sync-dist/ with encryption off: the fake has no passphrase setup, and
// the encrypted path is covered by tools/emulator_test.sh against the real emulators.
// Exits 1 if any check fails. Needs Playwright (Chromium), like tools/smoke_test.mjs.
import { chromium } from 'playwright';
import { createServer as http } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = resolve(process.argv[1], '..', '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const dist = resolve(root, arg('--dist') || '.sync-dist');
if (!arg('--dist')) execFileSync(process.execPath, [join(root, 'tools', 'build.mjs'), '--out', dist, '--encryption', 'off'], { stdio: 'ignore' });
const only = arg('--only') ? arg('--only').split(',') : null;
const LATENCY = +(arg('--latency') || 1500);
const { createServer } = createRequire(import.meta.url)('./fake-firebase.js');
const fake = readFileSync(join(root, 'tools', 'fake-firebase.js'));
const content = JSON.parse(readFileSync(join(root, 'research', '2026-10-15_botox-academy-content.json'), 'utf8'));
const LESSON = new Map(content.courses.flatMap((c) => c.lessons.map((l) => [l.id, l])));
if (!existsSync(join(dist, 'index.html'))) { console.error('No build at ' + dist + '. Run node tools/build.mjs first.'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// Static server for dist/. The Firebase SDK files are swapped for the fake, so their SRI attributes are dropped.
const web = http((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (/\/vendor\/firebase\/[^/]+\/firebase-app-compat\.js$/.test(path)) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fake); }
  if (/\/vendor\/firebase\/[^/]+\/firebase-(auth|firestore)-compat\.js$/.test(path)) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('/* fake-firebase.js covers this */'); }
  const file = join(dist, path === '/' ? 'index.html' : path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  let body = readFileSync(file);
  if (file.endsWith('index.html')) body = body.toString().replace(/ integrity="[^"]*"/g, '');
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise((r) => web.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${web.address().port}/`;

const browser = await chromium.launch();
let failures = 0;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); if (!ok) failures++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One fake server per scenario, shared by every context in it (two devices on one account).
async function device(server, errors, label) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((lat) => { window.__FAKE_FB = { latency: lat }; }, LATENCY);
  await ctx.exposeBinding('__fakeServer', (_src, op) => server.handle(op));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  return { ctx, page };
}
const SETTINGS = 'users/u1/records/settings__settings';
const srvSettings = (server) => (server.get(SETTINGS) || {}).rec || {};
const gateVisible = (page) => page.locator('.gate').isVisible().catch(() => false);
async function open(page) { await page.goto(BASE); await page.waitForFunction(() => !!document.querySelector('.gate') || !!(window.BT && BT.account)); }
async function signIn(page) {
  await page.locator('.gate .gate-btn').click();
  await page.waitForFunction(() => !document.querySelector('.gate'), null, { timeout: 15000 });
}
// The log has loaded: BT.isLoaded() (this fix), or the first snapshot on builds before it.
const loadedText = (page) => page.waitForFunction(() => window.BT && (BT.isLoaded ? BT.isLoaded() : BT.sync && BT.sync.live), null, { timeout: 20000 });
const settle = (page) => page.evaluate(() => Promise.race([firebase.firestore().waitForPendingWrites(), new Promise((r) => setTimeout(r, 15000))]));
async function completeLesson(page, id) {
  await page.evaluate((id) => { document.querySelectorAll('.sheet-wrap').forEach((w) => w.remove()); BT.go('acad-lesson', id); }, id);
  const l = LESSON.get(id);
  for (let i = 0; i < l.quiz.length; i++) await page.locator(`[data-quiz] [data-q="${i}"][data-c="${l.quiz[i].answer}"]`).click();
  await page.waitForFunction((id) => !!(BT.data.settings.academy && BT.data.settings.academy.lessons[id] && BT.data.settings.academy.lessons[id].done), id);
}
const lessonsOnServer = (server) => Object.keys(((srvSettings(server).academy || {}).lessons) || {}).filter((k) => srvSettings(server).academy.lessons[k].done).sort();
async function waitFor(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200); } return false; }
function seed(server) {
  // An account with a history: one treatment, and settings that features other than the Academy own.
  const now = Date.now();
  server.seed('users/u1/records/injections__a1', { kind: 'injections', rec: { id: 'a1', at: now - 20 * 864e5, productId: 'botox', sites: [{ id: 'p1', siteId: 'procerus', x: 0, y: 0, units: 10 }], updatedAt: now } });
  server.seed(SETTINGS, { kind: 'settings', rec: { name: 'Bryce', intervalWeeks: 10, checkinDay: 3, customProducts: [{ id: 'c-test', name: 'Test Toxin', maker: 'Lab', vialUnits: 100, ratio: 1 }], rxNudge: { a1: 1 } } });
}
const OTHER = { name: 'Bryce', intervalWeeks: 10, checkinDay: 3 };
function otherSettingsKept(s) {
  const miss = Object.entries(OTHER).filter(([k, v]) => s[k] !== v).map(([k]) => k);
  if (!(s.customProducts || []).some((p) => p.id === 'c-test')) miss.push('customProducts');
  if (!(s.rxNudge && s.rxNudge.a1 === 1)) miss.push('rxNudge.a1');
  return miss;
}

const scenarios = {
  // Bryce's report: complete lessons, sign out, sign back in, and the Academy (and other settings) are gone.
  async repro() {
    console.log('\nrepro: complete lessons, sign out, sign in again (first snapshot after ' + LATENCY + ' ms)');
    const server = createServer(), errors = []; seed(server);
    const { ctx, page } = await device(server, errors, 'phone');
    await open(page); await signIn(page); await loadedText(page);
    await completeLesson(page, 'hnw-mechanism'); await completeLesson(page, 'hnw-uses-history');
    await settle(page);
    const before = lessonsOnServer(server);
    check('lessons saved to the server before sign-out', before.length === 2, before.join(', '));
    const achBefore = { ...((srvSettings(server).academy || {}).achievements || {}) };
    check('achievements saved to the server before sign-out', !!achBefore['first-lesson'] && !!achBefore['first-treatment'], Object.keys(achBefore).join(', '));
    await page.evaluate(() => BT_CLOUD.signOut());
    await page.waitForFunction(() => !!document.querySelector('.gate .gate-btn'), null, { timeout: 15000 });
    const writesBefore = server.log.length;
    await signIn(page);
    // A settings save as early as the app allows: the moment the sign-in screen is gone.
    await page.evaluate(() => BT.save('settings', { seenVersion: 'repro-early-save' }));
    await loadedText(page); await sleep(LATENCY * 2 + 1000); await settle(page); await sleep(500);
    const s = srvSettings(server), after = lessonsOnServer(server);
    const lost = before.filter((id) => !after.includes(id)), miss = otherSettingsKept(s);
    check('server keeps every completed lesson after signing back in', !lost.length, lost.length ? 'lost ' + lost.join(', ') : after.join(', '));
    check('server keeps the other settings (name, interval, check-in day, custom products, nudges)', !miss.length, miss.length ? 'lost ' + miss.join(', ') : '');
    check('the early save landed too', s.seenVersion === 'repro-early-save');
    const achAfter = (s.academy || {}).achievements || {};
    const moved = Object.keys(achBefore).filter((k) => achAfter[k] !== achBefore[k]);
    check('achievements and their unlock times unchanged', !moved.length, moved.length ? 'changed ' + moved.join(', ') : Object.keys(achAfter).length + ' kept');
    const local = await page.evaluate(() => Object.keys((BT.data.settings.academy || {}).lessons || {}).sort());
    check('the app shows the lessons after signing back in', before.every((id) => local.includes(id)), local.join(', '));
    const writes = server.log.slice(writesBefore).filter((l) => l.path === SETTINGS);
    console.log('    settings writes after re-sign-in: ' + writes.map((l) => (l.w.merge ? 'merge ' : 'REPLACE ') + JSON.stringify(l.w.data.rec).slice(0, 160)).join('; '));
    await ctx.close();
    return errors;
  },

  // Two devices complete different lessons at the same moment; the server ends with both.
  async merge() {
    console.log('\nmerge: two devices save different lessons at once');
    const server = createServer(), errors = []; seed(server);
    const A = await device(server, errors, 'A'), B = await device(server, errors, 'B');
    for (const d of [A, B]) { await open(d.page); await signIn(d.page); await loadedText(d.page); }
    await Promise.all([completeLesson(A.page, 'pu-six-products'), completeLesson(B.page, 'pu-units')]);
    await Promise.all([settle(A.page), settle(B.page)]); await sleep(1000);
    const l = lessonsOnServer(server);
    check('server has both lessons', l.includes('pu-six-products') && l.includes('pu-units'), l.join(', '));
    check('other settings untouched', !otherSettingsKept(srvSettings(server)).length);
    const ok = await waitFor(async () => (await Promise.all([A, B].map((d) => d.page.evaluate(() => Object.keys(BT.data.settings.academy.lessons))))).every((x) => x.includes('pu-six-products') && x.includes('pu-units')));
    check('both devices show both lessons', ok);
    await A.ctx.close(); await B.ctx.close();
    return errors;
  },

  // Sign out straight after finishing a lesson, with a connection: it waits for the write, no question asked.
  async signoutOnline() {
    console.log('\nsignout-online: sign out right after completing a lesson');
    const server = createServer(), errors = []; seed(server);
    const { ctx, page } = await device(server, errors, 'phone');
    await open(page); await signIn(page); await loadedText(page);
    await completeLesson(page, 'fa-danger-zones');
    const asked = page.waitForSelector('.sheet-wrap:has-text("not synced")', { timeout: 8000 }).then(() => true, () => false);
    await page.evaluate(() => { BT.go('settings'); document.querySelector('[data-signout]').click(); });
    await page.waitForFunction(() => !!document.querySelector('.gate .gate-btn'), null, { timeout: 15000 });
    check('no unsynced warning online', !(await asked));
    check('lesson reached the server before the wipe', lessonsOnServer(server).includes('fa-danger-zones'));
    check('local cache cleared', await page.evaluate(() => !localStorage.getItem('__fake_fs_cache')));
    await ctx.close();
    return errors;
  },

  // Offline with an unsynced change: sign-out asks first; Cancel keeps the session and the change syncs later.
  async signoutOffline() {
    console.log('\nsignout-offline: sign out offline with an unsynced lesson');
    const server = createServer(), errors = []; seed(server);
    const { ctx, page } = await device(server, errors, 'phone');
    await open(page); await signIn(page); await loadedText(page);
    await ctx.setOffline(true);
    await completeLesson(page, 'qi-vetting');
    await page.evaluate(() => { BT.go('settings'); document.querySelector('[data-signout]').click(); });
    const sheet = page.locator('.sheet-wrap', { hasText: 'Some changes have not synced yet. Sign out anyway?' });
    let shown = await sheet.waitFor({ timeout: 5000 }).then(() => true, () => false);
    check('in-app warning sheet shown', shown);
    if (shown) await sheet.locator('[data-n]').click();
    await sleep(500);
    check('Cancel keeps the session (no sign-in screen)', !(await gateVisible(page)));
    await ctx.setOffline(false);
    check('the change syncs once back online', await waitFor(() => lessonsOnServer(server).includes('qi-vetting')));
    // Sign out anyway, offline, discards only what the person agreed to discard.
    await ctx.setOffline(true);
    await completeLesson(page, 'td-appointment');
    await page.evaluate(() => { BT.go('settings'); document.querySelector('[data-signout]').click(); });
    shown = await sheet.waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (shown) await sheet.locator('[data-y]').click();
    await sleep(1500); // signs out, wipes, and reloads (the reload fails offline: no service worker in this test)
    await ctx.setOffline(false); await page.goto(BASE);
    await page.waitForSelector('.gate .gate-btn', { timeout: 10000 }).catch(() => {});
    check('Sign out anyway signs out and wipes', shown && (await page.evaluate(() => !localStorage.getItem('__fake_auth') && !localStorage.getItem('__fake_fs_cache'))));
    await ctx.close();
    return errors;
  },

  // The default is no automatic sign-out (#105): a long gap with no choice made in Settings keeps the session.
  async idleDefaultNever() {
    console.log('\nidle-default: no timeout chosen, long gap');
    const server = createServer(), errors = []; seed(server);
    const { ctx, page } = await device(server, errors, 'phone');
    await open(page); await signIn(page); await loadedText(page);
    await page.evaluate(() => { localStorage.removeItem('tt-idle-minutes'); localStorage.setItem('tt-last-active', String(Date.now() - 24 * 60 * 60000)); dispatchEvent(new Event('focus')); });
    await sleep(2500);
    check('still signed in after a day without use', !(await gateVisible(page)) && (await page.evaluate(() => !!localStorage.getItem('__fake_auth'))));
    check('Settings shows Never on this device', await page.evaluate(() => BT_CLOUD.idle.get() === 'never'));
    await page.reload(); await loadedText(page);
    check('a relaunch after the gap stays signed in', !(await gateVisible(page)));
    await ctx.close();
    return errors;
  },

  // The idle timeout while offline: the wipe waits until the queued change reaches the server.
  async idleOffline() {
    console.log('\nidle-offline: idle timeout with an unsynced lesson, offline');
    const server = createServer(), errors = []; seed(server);
    const { ctx, page } = await device(server, errors, 'phone');
    await open(page); await signIn(page); await loadedText(page);
    await ctx.setOffline(true);
    await completeLesson(page, 'gl-pattern');
    await page.evaluate(() => { localStorage.setItem('tt-idle-minutes', '30'); localStorage.setItem('tt-last-active', String(Date.now() - 31 * 60000)); dispatchEvent(new Event('focus')); });
    await page.waitForSelector('.gate', { timeout: 10000 });
    const held = await page.evaluate(() => ({ hold: localStorage.getItem('tt-wipe-after-sync'), queue: (JSON.parse(localStorage.getItem('__fake_fs_cache') || '{}').queue || []).length, view: document.getElementById('view').textContent.trim().length, mem: BT.data.injections.length, msg: document.querySelector('.gate-err').textContent }));
    check('app locked behind the sign-in screen', held.view === 0 && held.mem === 0 && /not synced yet/.test(held.msg));
    check('queued change kept on the device, not wiped', held.queue > 0 && held.hold === '1', `queue ${held.queue}`);
    await ctx.setOffline(false);
    const synced = await waitFor(() => lessonsOnServer(server).includes('gl-pattern'));
    check('change reaches the server once back online', synced);
    await page.waitForFunction(() => !!document.querySelector('.gate .gate-btn') && !document.querySelector('.gate .gate-btn').hidden, null, { timeout: 20000 }).catch(() => {});
    const done = await page.evaluate(() => ({ cache: !!localStorage.getItem('__fake_fs_cache'), auth: !!localStorage.getItem('__fake_auth'), hold: localStorage.getItem('tt-wipe-after-sync') }));
    check('then signed out and wiped', !done.cache && !done.auth && !done.hold, JSON.stringify(done));
    await ctx.close();
    return errors;
  },

  // The idle timeout when the server does not answer, then the app is closed and reopened before it does.
  async idleRelaunch() {
    console.log('\nidle-relaunch: idle timeout with the server unreachable, then a relaunch');
    const server = createServer(), errors = []; seed(server);
    const { ctx, page } = await device(server, errors, 'phone');
    await open(page); await signIn(page); await loadedText(page);
    await page.evaluate(() => localStorage.setItem('__fake_down', '1'));
    await completeLesson(page, 'cf-pattern');
    await page.evaluate(() => { localStorage.setItem('tt-idle-minutes', '30'); localStorage.setItem('tt-last-active', String(Date.now() - 31 * 60000)); dispatchEvent(new Event('focus')); });
    await page.waitForSelector('.gate', { timeout: 15000 });
    check('held after the 5 second wait', await page.evaluate(() => localStorage.getItem('tt-wipe-after-sync') === '1'));
    await page.reload();
    await page.waitForSelector('.gate', { timeout: 15000 }); await sleep(2500);
    const re = await page.evaluate(() => ({ hold: localStorage.getItem('tt-wipe-after-sync'), queue: (JSON.parse(localStorage.getItem('__fake_fs_cache') || '{}').queue || []).length, btn: !!document.querySelector('.gate .gate-btn:not([hidden])'), shown: !!(window.BT && BT.account) }));
    check('relaunch stays locked and keeps the queue', re.hold === '1' && re.queue > 0 && !re.btn && !re.shown, JSON.stringify(re));
    await page.evaluate(() => localStorage.removeItem('__fake_down'));
    check('change reaches the server when it answers again', await waitFor(() => lessonsOnServer(server).includes('cf-pattern'), 30000));
    const wiped = await waitFor(() => page.evaluate(() => !localStorage.getItem('__fake_fs_cache') && !localStorage.getItem('__fake_auth')).catch(() => false), 20000);
    check('then signed out and wiped', wiped);
    await ctx.close();
    return errors;
  },

  // Offline straight after signing in: the cache is cold, so settings saves wait for the server.
  async coldOffline() {
    console.log('\ncold-offline: signed in, connection drops before the first server snapshot');
    const server = createServer(), errors = []; seed(server);
    server.seed(SETTINGS, { kind: 'settings', rec: { ...srvSettings(server), academy: { lessons: { 'hnw-mechanism': { done: true, at: 1 } }, achievements: { 'first-lesson': 1 } } } });
    const { ctx, page } = await device(server, errors, 'phone');
    await open(page);
    await page.evaluate(() => localStorage.setItem('__fake_down', '1'));
    await page.locator('.gate .gate-btn').click();
    await page.waitForFunction(() => !document.querySelector('.gate'), null, { timeout: 15000 });
    await page.evaluate(() => BT.save('settings', { seenVersion: 'cold' }));
    await sleep(LATENCY * 2);
    const early = server.log.filter((l) => l.path === SETTINGS).length;
    check('no settings write while the server has not answered', early === 0);
    await page.evaluate(() => localStorage.removeItem('__fake_down'));
    await waitFor(() => srvSettings(server).seenVersion === 'cold');
    await settle(page); await sleep(800);
    const s = srvSettings(server);
    check('held save merged on top of the server values', s.seenVersion === 'cold' && !otherSettingsKept(s).length && lessonsOnServer(server).includes('hnw-mechanism') && s.academy.achievements['first-lesson'] === 1, JSON.stringify(Object.keys(s)));
    await ctx.close();
    return errors;
  },
};

const allErrors = [];
for (const [name, fn] of Object.entries(scenarios)) {
  if (only && !only.includes(name)) continue;
  try { allErrors.push(...(await fn())); } catch (e) { check(name + ' ran to the end', false, e.message.split('\n')[0]); }
}
console.log('');
check('no console errors', !allErrors.length, allErrors.slice(0, 5).join(' | '));
await browser.close(); web.close();
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
