// Firestore security rules tests (#58, #59, #60, #66, PR #79), against the local emulator. No dependencies: it speaks
// the emulator's REST API with unsigned test tokens, the same tokens @firebase/rules-unit-testing makes.
// Run from the repo root (needs Java and the Firebase CLI):
//   bash tools/emulator_test.sh rules
// It builds the rules from the template with tools/rules.mjs and its own throwaway example.invalid accounts (never
// the real allowlist), loads them into the emulator, and tests both rollout modes: plainAllowed() true (step 1 and
// 2: plain records from app 0.14 and 0.15 still accepted) and false (step 3: ciphertext only). A demo- project never
// touches the live one. Exits 1 if any expectation fails.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('FIRESTORE_EMULATOR_HOST is not set. Run this through firebase emulators:exec (see the top of this file).'); process.exit(2); }
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-toxin-tracker';
const DB = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `http://${HOST}/v1/${DB}`;

const ME = { uid: 'uA', email: 'owner@example.invalid' }, OTHER = { uid: 'uB', email: 'second@example.invalid' }, STRANGER = { uid: 'uX', email: 'someone@example.invalid' };

// The rules under test, built from the template exactly as deploy does, with throwaway addresses.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'tt-rules-'));
writeFileSync(join(tmp, 'allowlist'), ME.email + '\n' + OTHER.email + '\n');
execFileSync(process.execPath, [join(root, 'tools', 'rules.mjs'), '--allowlist', join(tmp, 'allowlist'), '--out', join(tmp, 'rules')], { stdio: 'ignore' });
const RULES = readFileSync(join(tmp, 'rules'), 'utf8');
rmSync(tmp, { recursive: true, force: true });
const STRICT = RULES.replace(/function plainAllowed\(\) \{\s*return true;/, 'function plainAllowed() {\n      return false;');
if (STRICT === RULES) { console.error('firestore.rules: plainAllowed() not found'); process.exit(2); }
async function loadRules(content) {
  const r = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }) });
  if (r.status !== 200) { console.error('could not load rules into the emulator:', r.status, await r.text()); process.exit(2); }
}
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(u, { authAgeSec = 0 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return [b64url({ alg: 'none', kid: 'fakekid', typ: 'JWT' }), b64url({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, iat: now, exp: now + 3600,
    auth_time: now - authAgeSec, sub: u.uid, user_id: u.uid, email: u.email, email_verified: true, firebase: { sign_in_provider: 'google.com', identities: {} } }), ''].join('.');
}
const OWNER = 'owner'; // the emulator's admin bypass

// JS value -> Firestore REST value. {ts: '...'} is a timestamp.
function val(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  if (typeof v === 'number') return { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v.ts) return { timestampValue: v.ts };
  return { mapValue: { fields: fields(v) } };
}
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, val(x)]));
const SERVER = Symbol('serverTimestamp');
// A write: {path, data} (fields equal to SERVER become request.time) or {path, del: true}. merge: true writes only
// the leaves given, like set(..., {merge: true}) in the SDK (an update mask of every leaf path).
const leafPaths = (o, pre = []) => Object.entries(o).flatMap(([k, x]) => (x && typeof x === 'object' && !Array.isArray(x) && !x.ts && x !== SERVER && Object.keys(x).length ? leafPaths(x, [...pre, k]) : [[...pre, k]]));
const fieldPath = (parts) => parts.map((p) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(p) ? p : '`' + p.replace(/[`\\]/g, '\\$&') + '`')).join('.');
function write(w) {
  const name = `${DB}/${w.path}`;
  if (w.del) return { delete: name };
  const data = { ...w.data }, ts = [];
  for (const [k, x] of Object.entries(data)) if (x === SERVER) { ts.push(k); delete data[k]; }
  return { update: { name, fields: fields(data) }, ...(w.merge ? { updateMask: { fieldPaths: leafPaths(data).map(fieldPath) } } : {}),
    ...(ts.length ? { updateTransforms: ts.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) } : {}) };
}
async function commit(auth, writes) {
  const r = await fetch(`${BASE}:commit`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + auth }, body: JSON.stringify({ writes: writes.map(write) }) });
  await r.text();
  return r.status === 200;
}
async function read(auth, path) {
  const r = await fetch(`${BASE}/${path}`, { headers: { authorization: 'Bearer ' + auth } });
  return { ok: r.status === 200, doc: r.status === 200 ? await r.json() : (await r.text(), null) };
}
async function reset() { await fetch(`http://${HOST}/emulator/v1/${DB}`, { method: 'DELETE' }); }

let pass = 0, fail = 0;
async function expect(name, wanted, p) {
  const got = await p;
  if (got === wanted) { pass++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name} (expected ${wanted ? 'allow' : 'deny'})`); }
}

// Shapes the app writes.
const iv = 'AAECAwQFBgcICQoL'; // 12 bytes, base64
const sealed = (n = 64) => ({ v: 1, iv, ct: 'Q'.repeat(n) });
let seq = 0;
const aid = () => 'audit' + String(++seq).padStart(15, '0');
const rec = (uid, kind, id, extra = {}) => {
  const a = aid();
  return [
    { path: `users/${uid}/records/${kind}__${id}`, data: { kind, rec: sealed(), updatedAt: SERVER, base: null, by: 'deviceAAAA', aid: a, ...extra } },
    { path: `users/${uid}/audit/${a}`, data: { kind, recordId: id, action: extra.base ? 'update' : 'create', at: SERVER } },
  ];
};
 // A settings merge as the app writes it: only the changed leaves of rec, plus updatedAt, base, by and aid.
const settingsWrite = (uid, leaves, over = {}) => {
  const a = aid();
  return [
    { path: `users/${uid}/records/settings__settings`, merge: true, data: { kind: 'settings', rec: leaves, updatedAt: SERVER, base: null, by: 'deviceAAAA', aid: a, ...over } },
    { path: `users/${uid}/audit/${a}`, data: { kind: 'settings', recordId: 'settings', action: 'update', at: SERVER } },
  ];
};
const keysDoc = (over = {}) => ({ v: 1, iter: 600000, salt: 'A'.repeat(22) + '==', wrapped: 'B'.repeat(80), rsalt: 'C'.repeat(22) + '==', rwrapped: 'D'.repeat(80),
  check: { v: 1, iv, ct: 'E'.repeat(36) }, at: SERVER, ...over });
const updatedAt = async (path) => ({ ts: (await read(OWNER, path)).doc.fields.updatedAt.timestampValue });

await reset();
await loadRules(RULES);
const me = token(ME), other = token(OTHER), stranger = token(STRANGER), stale = token(ME, { authAgeSec: 3600 });
const U = ME.uid;

console.log('records (#60, #66)');
await expect('create: sealed record with its audit entry', true, commit(me, rec(U, 'vials', 'v1')));
await expect('create: record without an audit entry', false, commit(me, [rec(U, 'vials', 'v2')[0]]));
await expect('create: audit entry without a record change', false, commit(me, [rec(U, 'vials', 'v3')[1]]));
{ const [r, a] = rec(U, 'vials', 'v4'); r.data.rec = { id: 'v4', lot: 'L1' }; await expect('create: plain rec with its audit entry (encryption off, 0.15)', true, commit(me, [r, a])); }
{ const [r, a] = rec(U, 'photos', 'p1'); r.data.rec = sealed(900000); await expect('create: photo ciphertext under the 1,000,000 cap', true, commit(me, [r, a])); }
{ const [r, a] = rec(U, 'vials', 'v9'); r.path = `users/${U}/records/injections__v9`; a.data.kind = 'vials'; await expect('create: document id prefix differs from kind', false, commit(me, [r, a])); }
{ const [r, a] = settingsWrite(U, { name: 'Test', academy: { lessons: { l1: { done: true } } } }); await expect('create: settings__settings, plain leaves (encryption off)', true, commit(me, [r, a])); }
{ const [r, a] = rec(U, 'settings', 'other'); await expect('create: settings under another id', false, commit(me, [r, a])); }
{ const [r, a] = rec(U, 'notes', 'n1'); await expect('create: unknown kind', false, commit(me, [r, a])); }
{ const [r, a] = rec(U, 'vials', 'v10'); r.data.updatedAt = { ts: '2020-01-01T00:00:00Z' }; await expect('create: client-set updatedAt', false, commit(me, [r, a])); }
{ const [r, a] = rec(U, 'vials', 'v11'); r.data.secret = 'x'; await expect('create: extra top-level field', false, commit(me, [r, a])); }
{ const [r, a] = rec(U, 'vials', 'v12'); a.data.recordId = 'v1'; await expect('create: audit entry names another record', false, commit(me, [r, a])); }
await expect('create: another person\'s records', false, commit(me, rec(OTHER.uid, 'vials', 'x1')));
await expect('create: unlisted account', false, commit(stranger, rec(STRANGER.uid, 'vials', 'x2')));
await expect('read: own record', true, read(me, `users/${U}/records/vials__v1`).then((r) => r.ok));
await expect('read: another person\'s record', false, read(other, `users/${U}/records/vials__v1`).then((r) => r.ok));

console.log('stale updates (#58)');
{
  const first = await updatedAt(`users/${U}/records/vials__v1`);
  const [r, a] = rec(U, 'vials', 'v1', { base: first }); a.data.action = 'update';
  await expect('update: same device on the current version', true, commit(me, [r, a]));
  const [r2, a2] = rec(U, 'vials', 'v1', { base: first }); a2.data.action = 'update';
  await expect('update: same device on an older version (its own queued edits)', true, commit(me, [r2, a2]));
  const [r3, a3] = rec(U, 'vials', 'v1', { base: first, by: 'deviceBBBB' }); a3.data.action = 'update';
  await expect('update: other device on an older version is refused', false, commit(me, [r3, a3]));
  const cur = await updatedAt(`users/${U}/records/vials__v1`);
  const [r4, a4] = rec(U, 'vials', 'v1', { base: cur, by: 'deviceBBBB' }); a4.data.action = 'update'; a4.data.conflict = true;
  await expect('update: other device on the current version', true, commit(me, [r4, a4]));
  const [r5, a5] = rec(U, 'vials', 'v1', { base: null }); a5.data.action = 'update';
  await expect('update: first device, base null, after the other device wrote', false, commit(me, [r5, a5]));
}
await commit(OWNER, [{ path: `users/${U}/records/injections__old`, data: { kind: 'injections', rec: { id: 'old', notes: 'plain' } } }]);
{ const [r, a] = rec(U, 'injections', 'old'); a.data.action = 'update'; await expect('migration: a plain record from before #66 can be sealed in place', true, commit(me, [r, a])); }

console.log('settings: field-level merges (#83)');
{
  const leaf = 'tt-e1:' + iv + ':' + 'Q'.repeat(40);
  const [r, a] = settingsWrite(U, { academy: { lessons: { l2: { done: true } } } }, { by: 'deviceBBBB', base: null });
  await expect('merge: another device adds a lesson (no stale check on settings)', true, commit(me, [r, a]));
  const s = (await read(OWNER, `users/${U}/records/settings__settings`)).doc.fields.rec.mapValue.fields;
  await expect('merge: both lessons and the name are kept', true, Promise.resolve(!!s.name && Object.keys(s.academy.mapValue.fields.lessons.mapValue.fields).sort().join() === 'l1,l2'));
  const [r2, a2] = settingsWrite(U, { name: leaf, academy: { lessons: { l3: { done: leaf } } } });
  await expect('merge: sealed leaves', true, commit(me, [r2, a2]));
  const [r3, a3] = settingsWrite(U, { name: 'x' }); delete r3.data.aid;
  await expect('merge: without an audit entry id', false, commit(me, [r3]));
  const [r4, a4] = settingsWrite(U, { name: 'x' }); r4.path = `users/${U}/records/settings__other`;
  await expect('merge: settings under another id', false, commit(me, [r4, a4]));
}

console.log('app 0.14, live before this change (#79 rollout)');
await expect('legacy: create {kind, rec} with no audit entry', true, commit(me, [{ path: `users/${U}/records/moods__m1`, data: { kind: 'moods', rec: { id: 'm1', score: 3 } } }]));
await expect('legacy: replace a record a newer build wrote', true, commit(me, [{ path: `users/${U}/records/injections__old`, data: { kind: 'injections', rec: { id: 'old', notes: 'again' } } }]));
await expect('legacy: settings merge onto a document a newer build wrote', true, commit(me, [{ path: `users/${U}/records/settings__settings`, merge: true, data: { kind: 'settings', rec: { academy: { lessons: { l9: { done: true } } } } } }]));
await expect('legacy: an extra field', false, commit(me, [{ path: `users/${U}/records/moods__m2`, data: { kind: 'moods', rec: { id: 'm2' }, extra: 1 } }]));
await expect('legacy: document id does not match the kind', false, commit(me, [{ path: `users/${U}/records/vials__m3`, data: { kind: 'moods', rec: { id: 'm3' } } }]));
await expect('legacy: rec is not a map', false, commit(me, [{ path: `users/${U}/records/moods__m4`, data: { kind: 'moods', rec: 'x' } }]));
await expect('legacy: a merge that also changes by', false, commit(me, [{ path: `users/${U}/records/settings__settings`, merge: true, data: { kind: 'settings', rec: { name: 'y' }, by: 'deviceZZZZ' } }]));
await expect('legacy: delete', true, commit(me, [{ path: `users/${U}/records/moods__m1`, del: true }]));

console.log('audit (#58, #59)');
{
  const a = aid();
  await expect('delete: record with its delete audit entry', true, commit(me, [{ path: `users/${U}/records/vials__v1`, del: true }, { path: `users/${U}/audit/${a}`, data: { kind: 'vials', recordId: 'v1', action: 'delete', at: SERVER } }]));
  await expect('audit: delete entry for a record that still exists', false, commit(me, [{ path: `users/${U}/audit/${aid()}`, data: { kind: 'photos', recordId: 'p1', action: 'delete', at: SERVER } }]));
  await expect('audit: update an entry', false, commit(me, [{ path: `users/${U}/audit/${a}`, data: { kind: 'vials', recordId: 'v1', action: 'create', at: SERVER } }]));
  await expect('audit: delete an entry', false, commit(me, [{ path: `users/${U}/audit/${a}`, del: true }]));
  await expect('audit: read own entries', true, read(me, `users/${U}/audit/${a}`).then((r) => r.ok));
  await expect('erase marker without a recent sign-in', false, commit(stale, [{ path: `users/${U}/meta/erase`, data: { at: SERVER } }]));
  await expect('erase marker with a recent sign-in', true, commit(me, [{ path: `users/${U}/meta/erase`, data: { at: SERVER } }]));
  await expect('audit: delete during erase, without a recent sign-in', false, commit(stale, [{ path: `users/${U}/audit/${a}`, del: true }]));
  await expect('audit: delete during erase, with a recent sign-in', true, commit(me, [{ path: `users/${U}/audit/${a}`, del: true }]));
  await expect('erase marker removed', true, commit(me, [{ path: `users/${U}/meta/erase`, del: true }]));
}

console.log('keys (#66)');
await expect('keys: create', true, commit(me, [{ path: `users/${U}/meta/keys`, data: keysDoc() }]));
await expect('keys: fewer than 600,000 iterations', false, commit(other, [{ path: `users/${OTHER.uid}/meta/keys`, data: keysDoc({ iter: 1000 }) }]));
await expect('keys: missing recovery copy', false, commit(other, [{ path: `users/${OTHER.uid}/meta/keys`, data: (({ rwrapped, ...k }) => k)(keysDoc()) }]));
await expect('keys: rewrap with the same check and a recent sign-in', true, commit(me, [{ path: `users/${U}/meta/keys`, data: keysDoc({ wrapped: 'F'.repeat(80) }) }]));
await expect('keys: rewrap without a recent sign-in', false, commit(stale, [{ path: `users/${U}/meta/keys`, data: keysDoc({ wrapped: 'G'.repeat(80) }) }]));
await expect('keys: replace the data key (new check)', false, commit(me, [{ path: `users/${U}/meta/keys`, data: keysDoc({ check: { v: 1, iv, ct: 'H'.repeat(36) } }) }]));
await expect('keys: read own', true, read(me, `users/${U}/meta/keys`).then((r) => r.ok));
await expect('keys: read another person\'s', false, read(other, `users/${U}/meta/keys`).then((r) => r.ok));
await expect('keys: delete without a recent sign-in', false, commit(stale, [{ path: `users/${U}/meta/keys`, del: true }]));
await expect('meta: any other document', false, commit(me, [{ path: `users/${U}/meta/other`, data: { at: SERVER } }]));
await expect('keys: delete with a recent sign-in', true, commit(me, [{ path: `users/${U}/meta/keys`, del: true }]));
await expect('anything outside users/{uid}', false, commit(me, [{ path: 'public/x', data: { a: 1 } }]));

console.log('step 3: plainAllowed() false, ciphertext only');
await loadRules(STRICT);
{
  const leaf = 'tt-e1:' + iv + ':' + 'Q'.repeat(40);
  await expect('strict: sealed record', true, commit(me, rec(U, 'vials', 's1')));
  { const [r, a] = rec(U, 'vials', 's2'); r.data.rec = { id: 's2', lot: 'L1' }; await expect('strict: plain record refused', false, commit(me, [r, a])); }
  { const [r, a] = rec(U, 'vials', 's3'); r.data.rec = { ...sealed(), extra: 1 }; await expect('strict: rec with extra keys', false, commit(me, [r, a])); }
  { const [r, a] = rec(U, 'vials', 's4'); r.data.rec = { v: 2, iv, ct: 'Q'.repeat(64) }; await expect('strict: rec version other than 1', false, commit(me, [r, a])); }
  { const [r, a] = rec(U, 'vials', 's5'); r.data.rec = { v: 1, iv: 'short', ct: 'Q'.repeat(64) }; await expect('strict: bad iv', false, commit(me, [r, a])); }
  { const [r, a] = rec(U, 'vials', 's6'); r.data.rec = sealed(150001); await expect('strict: vial ciphertext over the 150,000 cap', false, commit(me, [r, a])); }
  await expect('strict: app 0.14 write refused', false, commit(me, [{ path: `users/${U}/records/moods__s7`, data: { kind: 'moods', rec: { id: 's7' } } }]));
  await expect('strict: settings with a plain name refused', false, commit(me, settingsWrite(U, { name: 'plain' })));
  await expect('strict: settings with sealed leaves', true, commit(me, settingsWrite(U, { name: leaf, intervalWeeks: leaf, academy: { lessons: { l4: { done: leaf } } } })));
  await expect('strict: app 0.14 settings merge refused', false, commit(me, [{ path: `users/${U}/records/settings__settings`, merge: true, data: { kind: 'settings', rec: { name: 'plain' } } }]));
}
await loadRules(RULES); // back to the rollout rules for whatever runs next on this emulator

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
