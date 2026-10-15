// Vendored third-party code (#55). The Firebase SDK, the MediaPipe tasks-vision bundle and wasm, and the face
// model are served from our own host, never from a CDN. tools/vendor.lock.json pins every file: where it came
// from (url), where it is served (path, under /vendor/), its SHA-256 and its size.
//
//   node tools/vendor.mjs            check: fetch anything missing from .vendor-cache/, verify every file
//   node tools/vendor.mjs --update   refetch every url, print what changed, rewrite the lock (deliberate only)
//
// tools/build.mjs calls copyVendor(), which does the same check and copies the files into dist/vendor/.
// A file whose hash or size does not match the lock fails the build, whether it came from the network or was
// already in the cache. Downloads happen once: with a warm cache the build needs no network.
// To add or bump a file: edit url/path in the lock (sha256 "" for a new one), run --update, review the diff.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, normalize, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK = join(root, 'tools', 'vendor.lock.json');
export const CACHE = join(root, '.vendor-cache');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const sri384 = (buf) => 'sha384-' + createHash('sha384').update(buf).digest('base64');

class VendorError extends Error {}

export function readLock() {
  if (!existsSync(LOCK)) throw new VendorError(`${LOCK} is missing; vendored files cannot be verified`);
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  if (!Array.isArray(lock.files) || !lock.files.length) throw new VendorError('tools/vendor.lock.json has no files');
  for (const f of lock.files) {
    if (!f.url || !f.url.startsWith('https://')) throw new VendorError(`vendor.lock.json: ${f.path}: url must be https`);
    if (!f.path || isAbsolute(f.path) || normalize(f.path).startsWith('..')) throw new VendorError(`vendor.lock.json: bad path ${f.path}`);
  }
  return lock;
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new VendorError(`${url} answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function writeCache(path, buf) {
  const file = join(CACHE, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + '.part', buf);
  renameSync(file + '.part', file);
}

function check(f, buf, where) {
  const got = sha256(buf);
  if (got !== f.sha256 || buf.length !== f.bytes) {
    throw new VendorError(`${f.path} (${where}) does not match tools/vendor.lock.json\n` +
      `  expected sha256 ${f.sha256}, ${f.bytes} bytes\n` +
      `  got      sha256 ${got}, ${buf.length} bytes\n` +
      `  If the cache is damaged, delete .vendor-cache/${f.path} and build again. If the upstream file really\n` +
      `  changed, that is a supply-chain event: review it, then run node tools/vendor.mjs --update on purpose.`);
  }
}

// Every pinned file, verified. Returns [{...entry, file, buf}]. `need` lists paths the caller cannot do without.
export async function loadVendor(need = []) {
  const lock = readLock();
  const byPath = new Map(lock.files.map((f) => [f.path, f]));
  for (const p of need) if (!byPath.has(p)) throw new VendorError(`tools/vendor.lock.json has no entry for ${p}`);
  const out = [];
  for (const f of lock.files) {
    if (!/^[0-9a-f]{64}$/.test(f.sha256 || '') || !Number.isInteger(f.bytes)) throw new VendorError(`${f.path} has no recorded sha256/bytes; run node tools/vendor.mjs --update`);
    const file = join(CACHE, f.path);
    let buf;
    if (existsSync(file)) { buf = readFileSync(file); check(f, buf, 'cache'); }
    else {
      console.log(`vendor: fetching ${f.url}`);
      try { buf = await download(f.url); } catch (e) {
        throw new VendorError(`could not fetch ${f.url} (${e.message}) and .vendor-cache/${f.path} is not there yet`);
      }
      check(f, buf, 'download'); // verified before it is written, so a bad download never lands in the cache
      writeCache(f.path, buf);
    }
    out.push({ ...f, file, buf });
  }
  return out;
}

// Copy the verified files into <dist>/vendor/<path>. Returns the loaded entries.
export async function copyVendor(dist, need = []) {
  const files = await loadVendor(need);
  for (const f of files) {
    const to = join(dist, 'vendor', f.path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(f.file, to);
  }
  return files;
}

async function update() {
  const lock = readLock();
  let changed = 0;
  for (const f of lock.files) {
    const buf = await download(f.url);
    const sha = sha256(buf);
    if (sha !== f.sha256 || buf.length !== f.bytes) {
      changed++;
      console.log(`~ ${f.path}\n    sha256 ${f.sha256 || '(none)'} -> ${sha}\n    bytes  ${f.bytes ?? '(none)'} -> ${buf.length}`);
      f.sha256 = sha; f.bytes = buf.length;
    } else console.log(`= ${f.path}`);
    writeCache(f.path, buf);
  }
  if (changed) {
    writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
    console.log(`\n${changed} entr${changed === 1 ? 'y' : 'ies'} changed; tools/vendor.lock.json rewritten. Review the diff before committing.`);
  } else console.log('\nNo changes; tools/vendor.lock.json left as it was.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.includes('--update')) await update();
    else { const files = await loadVendor(); console.log(`vendor: ${files.length} files verified against tools/vendor.lock.json`); }
  } catch (e) {
    console.error(`\nVENDOR CHECK FAILED: ${e.message}\n`);
    process.exit(1);
  }
}
