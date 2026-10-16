// Builds firebase/.firestore.rules.deploy from firebase/firestore.rules by replacing
// __ALLOWED_EMAILS__ with the addresses in firebase/allowlist.local (git-ignored, one per line).
// The repo is public, so the approved accounts are kept out of it. Run by tools/deploy.sh.
// Usage: node tools/rules.mjs [--allowlist path] [--out path]   (tests pass their own list and output file)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--allowlist');
const listPath = i > 0 ? process.argv[i + 1] : join(root, 'firebase', 'allowlist.local');
const o = process.argv.indexOf('--out');
const outPath = o > 0 ? process.argv[o + 1] : join(root, 'firebase', '.firestore.rules.deploy');
if (!existsSync(listPath)) {
  console.error(`Missing ${listPath}. Create it with one approved Google address per line (it is git-ignored).`);
  process.exit(1);
}
const emails = readFileSync(listPath, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#'));
if (!emails.length || emails.some((e) => !/^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/.test(e))) {
  console.error('allowlist.local must hold one valid address per line.');
  process.exit(1);
}
const tpl = readFileSync(join(root, 'firebase', 'firestore.rules'), 'utf8');
if (!tpl.includes('__ALLOWED_EMAILS__')) { console.error('firestore.rules has no __ALLOWED_EMAILS__ placeholder.'); process.exit(1); }
const out = tpl.replace(/__ALLOWED_EMAILS__/g, (m, off) => (tpl.lastIndexOf('//', off) > tpl.lastIndexOf('\n', off) ? m : '[' + emails.map((e) => `'${e}'`).join(', ') + ']'));
writeFileSync(outPath, out);
console.log(`Built ${o > 0 ? outPath : 'firebase/.firestore.rules.deploy'} for ${emails.length} approved account(s).`);
