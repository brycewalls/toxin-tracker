// End-to-end tests of the hosted build against the real Firestore and Auth emulators (PR #79): headless Chromium,
// fake Google accounts from the Auth emulator, the rules from firebase/firestore.rules. Run through
//   bash tools/emulator_test.sh e2e
// which builds two test copies of the app (tools/build.mjs --emulators, encryption off and on), starts the emulators
// for the demo-toxin-tracker project with throwaway example.invalid accounts, and runs this. Exits 1 on any failure.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DIST = { off: resolve(arg('--off') || ''), on: resolve(arg('--on') || '') };
for (const d of Object.values(DIST)) if (!existsSync(join(d, 'index.html'))) { console.error('No build at ' + d + '. Run through tools/emulator_test.sh.'); process.exit(2); }
const FS = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080', AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const PROJECT = 'demo-toxin-tracker', DOCS = `http://${FS}/v1/projects/${PROJECT}/databases/(default)/documents`;
const A = { sub: 'owner-sub', email: 'owner@example.invalid' }, B = { sub: 'second-sub', email: 'second@example.invalid' }, X = { sub: 'stranger-sub', email: 'someone@example.invalid' };
const PASS = 'correct horse battery staple';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
async function serve(dir) {
  const s = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = join(dir, p === '/' ? 'index.html' : p);
    if (!f.startsWith(dir) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${s.address().port}/`, close: () => s.close() };
}

// ---------- emulator admin (bypasses the rules) ----------
const admin = { authorization: 'Bearer owner' };
const fromValue = (v) => {
  if ('stringValue' in v) return v.stringValue; if ('integerValue' in v) return +v.integerValue; if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue; if ('nullValue' in v) return null; if ('timestampValue' in v) return { ts: v.timestampValue };
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  return v;
};
const toValue = (v) => (v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v }
  : Number.isInteger(v) ? { integerValue: String(v) } : typeof v === 'number' ? { doubleValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(toValue) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } });
async function list(path) {
  const r = await fetch(`${DOCS}/${path}?pageSize=1000`, { headers: admin });
  const j = await r.json();
  return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...fromValue({ mapValue: { fields: d.fields || {} } }) }));
}
async function getDoc(path) { const r = await fetch(`${DOCS}/${path}`, { headers: admin }); return r.status === 200 ? fromValue({ mapValue: { fields: (await r.json()).fields || {} } }) : null; }
async function putDoc(path, data) { const r = await fetch(`${DOCS}/${path}`, { method: 'PATCH', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ fields: toValue(data).mapValue.fields }) }); if (r.status !== 200) throw new Error('seed ' + r.status); }
async function reset() {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}
async function authAccounts() {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: '{}' });
  return ((await r.json()).userInfo || []).map((u) => u.email);
}

// ---------- checks ----------
let failures = 0, passes = 0;
const check = (name, ok, detail = '') => { ok ? passes++ : failures++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t > ms) return false; await sleep(250); } }
const isSealed = (r) => !!r && r.v === 1 && typeof r.iv === 'string' && typeof r.ct === 'string' && Object.keys(r).length === 3;
const leaves = (o, out = []) => { for (const v of Object.values(o || {})) (v && typeof v === 'object' && !Array.isArray(v) ? leaves(v, out) : out.push(v)); return out; };
const allSealedLeaves = (rec) => leaves(rec).every((v) => typeof v === 'string' && v.startsWith('tt-e1:'));

// ---------- the app ----------
const browser = await chromium.launch();
const errors = [];
// Messages a refused write is expected to log (the SDK warns about it; the app logs the code only).
const EXPECTED = [/PERMISSION_DENIED|permission-denied|Missing or insufficient permissions/i, /Failed to load resource: the server responded with a status of 400/, /net::ERR_INTERNET_DISCONNECTED/, /Could not reach Cloud Firestore backend/];
async function device(build, label) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED.some((r) => r.test(m.text()))) errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto(build.url);
  await page.waitForSelector('.gate .gate-btn', { timeout: 20000 });
  return { ctx, page, label };
}
async function signIn(d, who) {
  await d.page.evaluate((u) => firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: u.sub, email: u.email, email_verified: true }))), who);
}
const loaded = (d) => d.page.waitForFunction(() => window.BT && BT.isLoaded && BT.isLoaded() && !document.querySelector('.gate'), null, { timeout: 30000 });
const uidOf = (d) => d.page.evaluate(() => firebase.auth().currentUser.uid);
const panelTitle = (d) => d.page.evaluate(() => { const h = document.querySelector('.gate h1'); return h ? h.textContent : ''; });
const settle = (d) => d.page.evaluate(() => Promise.race([BT.whenLoaded().then(() => firebase.firestore().waitForPendingWrites()), new Promise((r) => setTimeout(r, 15000))]));
const toastSeen = (d, re) => d.page.waitForFunction((src) => [...document.querySelectorAll('.toast')].some((t) => new RegExp(src).test(t.textContent)), re.source, { timeout: 10000 }).then(() => true, () => false);
async function setup(d) {
  await d.page.waitForSelector('#k-p1', { timeout: 20000 });
  await d.page.fill('#k-p1', PASS); await d.page.fill('#k-p2', PASS);
  await d.page.click('.gate [data-go]');
  await d.page.waitForSelector('.gate [data-key]', { timeout: 30000 });
  const key = (await d.page.textContent('.gate [data-key]')).replace(/\s+/g, '-');
  await d.page.check('.gate [data-ok]'); await d.page.click('.gate [data-done]');
  return key;
}
async function unlock(d, secret, recovery) {
  await d.page.waitForSelector('#k-in', { timeout: 20000 });
  if (recovery) await d.page.click('.gate [data-mode]');
  await d.page.fill('#k-in', secret); await d.page.click('.gate [data-go]');
}
async function download(d, selector) {
  const [dl] = await Promise.all([d.page.waitForEvent('download', { timeout: 15000 }), d.page.click(selector)]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') };
}
const audit = async (uid) => (await list(`users/${uid}/audit`)).filter((a) => a.kind !== 'settings');
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('not really a jpeg, just bytes for the round trip').toString('base64');

const off = await serve(DIST.off), on = await serve(DIST.on);
const builds = { off, on };

// ---------- encryption off (step 1) ----------
await reset();
console.log('\nplain mode (encryption off): saves, audit, real outcomes');
{
  const d = await device(builds.off, 'A-plain');
  await signIn(d, A); await loaded(d);
  const uid = await uidOf(d);
  check('no encryption setup screen, app opens', !(await d.page.$('.gate')) && !(await d.page.$('#k-p1')));
  check('Settings shows no encryption card', await d.page.evaluate(() => { BT.go('settings'); return !document.querySelector('[data-pass]'); }));
  await d.page.evaluate(() => { BT.go('today'); BT.save('vials', { id: 'v1', productId: 'botox', unitsTotal: 100, lot: 'L1' }); });
  await settle(d);
  const v = await getDoc(`users/${uid}/records/vials__v1`);
  check('record stored {kind, rec, updatedAt, base, by, aid}, rec plain', !!v && Object.keys(v).sort().join() === 'aid,base,by,kind,rec,updatedAt' && v.rec.lot === 'L1' && !!v.updatedAt.ts && v.base === null, v ? Object.keys(v).join() : 'missing');
  let au = await audit(uid);
  check('create: one audit entry {kind, recordId, action, at}, no contents', au.length === 1 && au[0].action === 'create' && au[0].recordId === 'v1' && Object.keys(au[0]).sort().join() === 'action,at,id,kind,recordId');
  check('audit entry id is the record\'s aid', au[0].id === v.aid);
  await d.page.evaluate(() => BT.save('vials', { ...BT.data.vials.find((x) => x.id === 'v1'), lot: 'L2' }));
  await settle(d);
  const v2 = await getDoc(`users/${uid}/records/vials__v1`);
  au = await audit(uid);
  check('edit: audit entry action update', au.some((a) => a.action === 'update' && a.recordId === 'v1'));
  check('edit carried base = the stored updatedAt it was built on', v2.base && v2.base.ts === v.updatedAt.ts && v2.rec.lot === 'L2');
  await d.page.evaluate(() => BT.remove('vials', 'v1'));
  await settle(d);
  au = await audit(uid);
  check('delete: record gone, audit entry action delete', !(await getDoc(`users/${uid}/records/vials__v1`)) && au.some((a) => a.action === 'delete' && a.recordId === 'v1'));
  await d.page.evaluate(() => BT.save('settings', { name: 'Tester', rxNudge: { r1: 5 } }));
  await settle(d);
  const s = await getDoc(`users/${uid}/records/settings__settings`);
  check('settings: field-level merge, plain leaves', s && s.rec.name === 'Tester' && s.rec.rxNudge.r1 === 5 && s.rec.intervalWeeks === undefined, s ? JSON.stringify(s.rec).slice(0, 80) : 'missing');
  check('no meta/keys written', !(await getDoc(`users/${uid}/meta/keys`)));
  check('no error toasts on normal saves', !(await d.page.$('.toast')) || !(await d.page.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => /Not saved|Could not/.test(t.textContent)))));

  console.log('\nrefused writes');
  await d.page.evaluate(() => BT.save('vials', { id: 'x'.repeat(130), productId: 'botox', unitsTotal: 100 })); // the rules cap the document id
  check('refused write: error toast', await toastSeen(d, /Not saved/));
  check('refused write: Not saved bar names it', await d.page.waitForFunction(() => /Not saved: 1 vial/.test((document.querySelector('.bt-unsaved') || {}).textContent || ''), null, { timeout: 10000 }).then(() => true, () => false));
  check('refused record stays on screen, marked _unsaved', await d.page.evaluate(() => { const r = BT.data.vials.find((x) => x.id.length === 130); return !!r && r._unsaved === true && BT.unsaved().length === 1; }));
  await d.page.click('.bt-unsaved [data-discard]');
  check('Discard removes it and clears the bar', await d.page.waitForFunction(() => !document.querySelector('.bt-unsaved') && !BT.data.vials.some((x) => x.id.length === 130), null, { timeout: 10000 }).then(() => true, () => false));

  // Stale edit across devices (#58): B edits offline on an old version while A saves a newer one.
  await d.page.evaluate(() => BT.save('vials', { id: 'v9', productId: 'botox', unitsTotal: 100, lot: 'A1' }));
  await settle(d);
  const b = await device(builds.off, 'A-plain-2');
  await signIn(b, A); await loaded(b);
  await until(() => b.page.evaluate(() => BT.data.vials.some((x) => x.id === 'v9')));
  await b.ctx.setOffline(true);
  await b.page.evaluate(() => BT.save('vials', { ...BT.data.vials.find((x) => x.id === 'v9'), lot: 'B-offline' }));
  await sleep(500);
  check('offline: no error toast, no Not saved bar', !(await b.page.$('.bt-unsaved')) && !(await b.page.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => /Not saved|Could not/.test(t.textContent)))));
  await d.page.evaluate(() => BT.save('vials', { ...BT.data.vials.find((x) => x.id === 'v9'), lot: 'A2' }));
  await settle(d);
  await b.ctx.setOffline(false);
  check('stale edit from the other device refused: Not saved bar', await b.page.waitForSelector('.bt-unsaved', { timeout: 20000 }).then(() => true, () => false));
  check('server kept the newer version', (await getDoc(`users/${uid}/records/vials__v9`)).rec.lot === 'A2');
  await b.page.click('.bt-unsaved [data-retry]');
  check('Retry saves this device\'s version by choice', await until(async () => (await getDoc(`users/${uid}/records/vials__v9`)).rec.lot === 'B-offline'));
  check('Retry\'s audit entry is marked conflict', await until(async () => (await audit(uid)).some((a) => a.recordId === 'v9' && a.conflict === true)));
  check('bar clears after Retry', await b.page.waitForFunction(() => !document.querySelector('.bt-unsaved'), null, { timeout: 10000 }).then(() => true, () => false));

  console.log('\noffline save');
  await b.ctx.setOffline(true);
  await b.page.evaluate(() => BT.save('moods', { id: 'm1', date: '2026-10-16', score: 4 }));
  await sleep(800);
  check('offline: change waits on the device, nothing on the server yet', !(await getDoc(`users/${uid}/records/moods__m1`)) && (await b.page.evaluate(() => BT.unsynced() > 0)));
  await b.ctx.setOffline(false);
  check('back online: queued change and its audit entry reach the server', await until(async () => !!(await getDoc(`users/${uid}/records/moods__m1`)) && (await audit(uid)).some((a) => a.recordId === 'm1')));
  await b.ctx.close();

  console.log('\nexport');
  await d.page.evaluate(() => BT.save('injections', { id: 'i1', at: Date.now() - 864e5, productId: 'botox', sites: [{ id: 'p1', siteId: 'procerus', x: 1, y: 2, units: 4 }], provider: 'Clinic', notes: '=HYPERLINK("x")' }));
  await d.page.evaluate((src) => BT.save('photos', { id: 'ph1', kind: 'before', at: Date.now(), src, injectionId: 'i1' }), PHOTO);
  await settle(d);
  await d.page.evaluate(() => BT.go('settings'));
  const json = await download(d, '[data-json]');
  const exp = JSON.parse(json.text), mem = await d.page.evaluate(() => JSON.parse(JSON.stringify(BT.data)));
  const same = ['injections', 'vials', 'reactions', 'photos', 'moods'].every((k) => JSON.stringify(exp.data[k]) === JSON.stringify(mem[k]));
  check('JSON export round-trips every record', same && JSON.stringify(exp.data.settings) === JSON.stringify(mem.settings), `${Object.values(exp.data).flat().length} items`);
  check('export holds the photos', exp.data.photos.some((p) => p.src === PHOTO));
  check('JSON file name carries no personal data', /^toxin-tracker-export-\d{4}-\d{2}-\d{2}\.json$/.test(json.name), json.name);
  const csv = await download(d, '[data-export]');
  check('CSV downloaded, formula cell neutralized', /^toxin-tracker-treatments-\d{4}-\d{2}-\d{2}\.csv$/.test(csv.name) && csv.text.includes(`"'=HYPERLINK(""x"")"`), csv.name);

  console.log('\nApp 0.14 records (live shape) next to the new ones');
  await putDoc(`users/${uid}/records/reactions__old1`, { kind: 'reactions', rec: { id: 'old1', kind: 'Bruising', severity: 1, at: Date.now(), injectionId: 'i1' } });
  check('a record written by 0.14 ({kind, rec}) shows up', await until(() => d.page.evaluate(() => BT.data.reactions.some((r) => r.id === 'old1'))));
  await d.page.evaluate(() => BT.save('reactions', { ...BT.data.reactions.find((r) => r.id === 'old1'), severity: 2 }));
  await settle(d);
  check('and can be edited (the next write adds updatedAt, by and aid)', (await getDoc(`users/${uid}/records/reactions__old1`)).rec.severity === 2);

  console.log('\ndelete all my data');
  await d.page.evaluate(() => BT.go('settings'));
  await d.page.click('[data-delall]');
  await d.page.fill('#d-type', 'DELET');
  check('needs DELETE typed exactly', await d.page.isDisabled('.sheet [data-go]'));
  await d.page.fill('#d-type', 'DELETE');
  await d.page.click('.sheet [data-go]');
  await d.page.waitForSelector('.gate .gate-err:not([hidden])', { timeout: 30000 });
  check('notice after the reload', /data and your account were deleted/.test(await d.page.textContent('.gate .gate-err')));
  const left = await Promise.all(['records', 'audit', 'meta'].map((c) => list(`users/${uid}/${c}`)));
  check('nothing left under users/{uid} (records, audit, meta)', left.every((x) => !x.length), left.map((x) => x.length).join('/'));
  check('Auth account deleted', !(await authAccounts()).includes(A.email));
  await d.ctx.close();
}

console.log('\ndenied account');
{
  const d = await device(builds.off, 'X');
  await signIn(d, X);
  await d.page.waitForFunction(() => /does not have access/.test((document.querySelector('.gate .gate-err') || {}).textContent || ''), null, { timeout: 20000 });
  check('unlisted account is turned away before any key screen', !(await d.page.$('#k-p1')) && !(await d.page.$('#k-in')));
  await d.ctx.close();
}

// ---------- encryption on (step 2) ----------
await reset();
console.log('\nencryption on: setup and migration of plain records');
let recovery = '';
{
  // An account as it stands after step 1: records from 0.14 and 0.15, settings with plain leaves.
  const d0 = await device(builds.off, 'A-step1');
  await signIn(d0, A); await loaded(d0);
  var uid = await uidOf(d0);
  await d0.page.evaluate((src) => {
    BT.save('injections', { id: 'i1', at: Date.now() - 864e5, productId: 'botox', sites: [{ id: 'p1', siteId: 'procerus', x: 1, y: 2, units: 4 }], notes: 'secret note' });
    BT.save('vials', { id: 'v1', productId: 'botox', unitsTotal: 100, lot: 'LOT-1' });
    BT.save('photos', { id: 'ph1', kind: 'before', at: Date.now(), src, injectionId: 'i1' });
    BT.save('settings', { name: 'Private Name', intervalWeeks: 10, academy: { lessons: { 'hnw-mechanism': { done: true, at: 1 } }, achievements: { 'first-lesson': 1 } } });
  }, PHOTO);
  await settle(d0);
  await putDoc(`users/${uid}/records/moods__legacy`, { kind: 'moods', rec: { id: 'legacy', date: '2026-10-01', score: 3 } });
  await d0.ctx.close();
  const before = await list(`users/${uid}/records`);
  check('before: records plain on the server', before.length === 5 && before.every((r) => !isSealed(r.rec)), String(before.length));

  const d = await device(builds.on, 'A1');
  await signIn(d, A);
  check('first run shows the encryption setup screen', /Lock your log/.test(await d.page.waitForSelector('#k-p1').then(() => panelTitle(d))));
  await d.page.fill('#k-p1', PASS); await d.page.fill('#k-p2', PASS + 'x'); await d.page.click('.gate [data-go]');
  check('mismatched passphrases are refused', /do not match/.test(await d.page.textContent('.gate-err')));
  recovery = await setup(d);
  check('recovery key shown once as six groups of four', /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/.test(recovery), recovery.replace(/[0-9A-Z]/g, 'x'));
  await loaded(d);
  const keys = await getDoc(`users/${uid}/meta/keys`);
  check('meta/keys holds {v, iter: 600000, salt, wrapped, rsalt, rwrapped, check, at}', keys && keys.iter === 600000 && Object.keys(keys).sort().join() === 'at,check,iter,rsalt,rwrapped,salt,v,wrapped');
  const migrated = await until(async () => { const r = await list(`users/${uid}/records`); return r.length === 5 && r.every((x) => (x.kind === 'settings' ? allSealedLeaves(x.rec) : isSealed(x.rec))) && r; }, 30000);
  check('migration: every record is now ciphertext, settings leaf by leaf', !!migrated);
  const raw = JSON.stringify(await list(`users/${uid}/records`));
  check('no plain record content left on the server', !/secret note|LOT-1|Private Name|not really a jpeg/.test(raw) && !raw.includes(PHOTO.slice(30, 60)));
  const set = migrated && migrated.find((x) => x.kind === 'settings');
  check('settings map keys stay plain (lesson and achievement ids), values sealed', !!set && !!set.rec.academy.lessons['hnw-mechanism'] && typeof set.rec.academy.lessons['hnw-mechanism'].done === 'string');
  const au = await list(`users/${uid}/audit`);
  check('migration wrote an audit entry per record', ['injections', 'vials', 'photos', 'moods', 'settings'].every((k) => au.some((a) => a.kind === k && a.action === 'update')));
  const mem = await d.page.evaluate(() => ({ n: BT.data.injections[0] && BT.data.injections[0].notes, lot: BT.data.vials[0] && BT.data.vials[0].lot, name: BT.data.settings.name, lesson: !!BT.data.settings.academy.lessons['hnw-mechanism'], photo: BT.data.photos.length, mood: BT.data.moods.length }));
  check('migrated records still read correctly on the device', mem.n === 'secret note' && mem.lot === 'LOT-1' && mem.name === 'Private Name' && mem.lesson && mem.photo === 1 && mem.mood === 1, JSON.stringify(mem));
  check('unlocked key kept in IndexedDB as a non-extractable CryptoKey', await d.page.evaluate(() => new Promise((res) => { const r = indexedDB.open('tt-keys'); r.onsuccess = () => { const q = r.result.transaction('k').objectStore('k').getAll(); q.onsuccess = () => res(q.result.length === 1 && q.result[0] instanceof CryptoKey && q.result[0].extractable === false); q.onerror = () => res(false); }; r.onerror = () => res(false); })));
  check('Settings shows the encryption card', await d.page.evaluate(() => { BT.go('settings'); return !!document.querySelector('[data-pass]'); }));
  await d.page.evaluate(() => BT.go('today'));

  console.log('\nencryption on: a new record, a 0.14 write, offline');
  await d.page.evaluate(() => BT.save('reactions', { id: 'r1', kind: 'Swelling', severity: 1, at: Date.now(), injectionId: 'i1', notes: 'swollen' }));
  await settle(d);
  const r1 = await getDoc(`users/${uid}/records/reactions__r1`);
  check('new record stored sealed, with its audit entry', isSealed(r1.rec) && (await list(`users/${uid}/audit`)).some((a) => a.recordId === 'r1' && a.action === 'create'));
  await putDoc(`users/${uid}/records/moods__late`, { kind: 'moods', rec: { id: 'late', date: '2026-10-02', score: 2 } });
  check('a plain record from a device on 0.14 shows up and is sealed in place', await until(async () => isSealed((await getDoc(`users/${uid}/records/moods__late`)).rec) && (await d.page.evaluate(() => BT.data.moods.some((m) => m.id === 'late')))));
  await d.ctx.setOffline(true);
  await d.page.evaluate(() => BT.save('vials', { id: 'v2', productId: 'dysport', unitsTotal: 300, lot: 'OFFLINE' }));
  await sleep(500);
  check('offline: no error, change waits', !(await d.page.$('.bt-unsaved')) && !(await getDoc(`users/${uid}/records/vials__v2`)));
  await d.ctx.setOffline(false);
  check('back online: the queued change arrives sealed', await until(async () => { const v = await getDoc(`users/${uid}/records/vials__v2`); return v && isSealed(v.rec); }));

  console.log('\nencryption on: second device, recovery key');
  const d2 = await device(builds.on, 'A2');
  await signIn(d2, A);
  check('second device asks to unlock (no setup)', /Unlock your log/.test(await d2.page.waitForSelector('#k-in').then(() => panelTitle(d2))));
  await unlock(d2, 'WRONG-WRONG-WRONG-WRONG-WRONG-WRONG', true);
  check('a wrong recovery key is refused', await d2.page.waitForFunction(() => /does not match/.test(document.querySelector('.gate-err').textContent), null, { timeout: 30000 }).then(() => true, () => false));
  await d2.page.fill('#k-in', recovery.toLowerCase().replace(/-/g, ' ')); await d2.page.click('.gate [data-go]');
  await loaded(d2);
  const m2 = await d2.page.evaluate(() => ({ n: BT.data.injections[0] && BT.data.injections[0].notes, name: BT.data.settings.name, r: BT.data.reactions.length }));
  check('recovery key (lower case, spaces) unlocks; the log reads on the second device', m2.n === 'secret note' && m2.name === 'Private Name' && m2.r === 1, JSON.stringify(m2));

  console.log('\nencryption on: settings merge across two devices');
  const lesson = (id) => { const a = JSON.parse(JSON.stringify(BT.data.settings.academy || { lessons: {}, achievements: {} })); a.lessons[id] = { done: true, at: Date.now() }; BT.save('settings', { academy: a }); };
  await Promise.all([d.page.evaluate(lesson, 'pu-units'), d2.page.evaluate(lesson, 'pu-six-products')]);
  await Promise.all([settle(d), settle(d2)]);
  const srv = await getDoc(`users/${uid}/records/settings__settings`);
  const ids = Object.keys(srv.rec.academy.lessons).sort();
  check('server has both lessons, each leaf sealed', ids.includes('pu-units') && ids.includes('pu-six-products') && allSealedLeaves(srv.rec), ids.join(', '));
  check('other settings untouched', await d2.page.evaluate(() => BT.data.settings.name === 'Private Name' && BT.data.settings.intervalWeeks === 10));
  const both = await until(async () => (await Promise.all([d, d2].map((x) => x.page.evaluate(() => Object.keys(BT.data.settings.academy.lessons))))).every((l) => l.includes('pu-units') && l.includes('pu-six-products')));
  check('both devices show both lessons', !!both);

  console.log('\nencryption on: step-1 build on an encrypted account, passphrase unlock');
  const d3 = await device(builds.off, 'A3-step1-build');
  await signIn(d3, A);
  check('the encryption-off build still asks to unlock an encrypted account', /Unlock your log/.test(await d3.page.waitForSelector('#k-in').then(() => panelTitle(d3))));
  await unlock(d3, 'not the passphrase');
  check('a wrong passphrase is refused', await d3.page.waitForFunction(() => /not right/.test(document.querySelector('.gate-err').textContent), null, { timeout: 30000 }).then(() => true, () => false));
  await d3.page.fill('#k-in', PASS); await d3.page.click('.gate [data-go]');
  await loaded(d3);
  check('passphrase unlocks; the log reads', await d3.page.evaluate(() => BT.data.settings.name === 'Private Name' && BT.data.vials.length === 2));
  await d3.page.evaluate(() => BT.save('moods', { id: 'm3', date: '2026-10-03', score: 5 }));
  await settle(d3);
  check('and its saves are sealed too', isSealed((await getDoc(`users/${uid}/records/moods__m3`)).rec));
  await d3.ctx.close();

  console.log('\nencryption on: sign-out wipes the key');
  await d2.page.evaluate(() => { BT.go('settings'); document.querySelector('[data-signout]').click(); });
  await d2.page.waitForSelector('.gate .gate-btn:not([hidden])', { timeout: 20000 });
  const gone = await d2.page.evaluate(async () => { const dbs = (await indexedDB.databases()).map((x) => x.name); return { keys: dbs.includes('tt-keys'), fs: dbs.some((n) => /firestore/i.test(n || '')), dbs }; });
  check('after sign-out, tt-keys IndexedDB and the Firestore cache are gone', !gone.keys && !gone.fs, gone.dbs.join(', '));
  await signIn(d2, A);
  check('signing in again needs the passphrase again', /Unlock your log/.test(await d2.page.waitForSelector('#k-in').then(() => panelTitle(d2))));
  await d2.ctx.close();

  console.log('\nencryption on: delete all my data');
  await d.page.evaluate(() => BT.go('settings'));
  await d.page.click('[data-delall]');
  await d.page.fill('#d-type', 'DELETE');
  await d.page.click('.sheet [data-go]');
  await d.page.waitForSelector('.gate .gate-err:not([hidden])', { timeout: 30000 });
  const left = await Promise.all(['records', 'audit', 'meta'].map((c) => list(`users/${uid}/${c}`)));
  check('records, audit and meta/keys all deleted', left.every((x) => !x.length), left.map((x) => x.length).join('/'));
  check('key wiped from the device', await d.page.evaluate(async () => !(await indexedDB.databases()).some((x) => x.name === 'tt-keys')));
  await d.ctx.close();
}

console.log('');
check('no unexpected console errors', !errors.length, errors.slice(0, 4).join(' | '));
await browser.close(); off.close(); on.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
