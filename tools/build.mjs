// Builds the hosted web app into dist/ from the same app/ files the claude.ai artifact publishes.
// app/index.html is a page body (the artifact host adds the document shell), so this wraps it in a
// full document, adds the Firebase SDK and app/cloud.js before core.js, adds app/livecam.js after
// facemap.js, adds app/offline.js (service worker, update pill, offline banner), copies the scripts,
// and generates dist/sw.js: the offline app shell with a content-hash version stamp (#52).
// Run: node tools/build.mjs   (firebase deploy runs it as the hosting predeploy step)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app'), dist = join(root, 'dist');
const SDK = '10.14.1'; // Firebase compat SDK, matches the version used by the other Firebase projects here

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

let body = readFileSync(join(app, 'index.html'), 'utf8');
const title = (body.match(/<title>([^<]*)<\/title>/) || [, 'Toxin Tracker'])[1];
body = body.replace(/<title>[^<]*<\/title>\s*/, '');
const SDK_URLS = ['app', 'auth', 'firestore'].map((m) => `https://www.gstatic.com/firebasejs/${SDK}/firebase-${m}-compat.js`);
const firebase = SDK_URLS.map((u) => `<script src="${u}"></script>`).join('\n');
if (!body.includes('<script src="core.js"></script>')) throw new Error('app/index.html no longer loads core.js; update tools/build.mjs');
body = body.replace('<script src="core.js"></script>', `${firebase}\n<script src="core.js"></script>\n<script src="cloud.js"></script>\n<script src="offline.js"></script>`);
// Live camera face mapping (app/livecam.js) needs a camera, which the claude.ai artifact does not have.
if (!body.includes('<script src="facemap.js"></script>')) throw new Error('app/index.html no longer loads facemap.js; update tools/build.mjs');
body = body.replace('<script src="facemap.js"></script>', '<script src="facemap.js"></script>\n<script src="livecam.js"></script>');

const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="Track Botox and other neurotoxin treatments on a muscle map, with vials, reactions, aftercare timers and before and after photos.">
<meta name="theme-color" content="#1E3FCB">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${title}">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="icon" href="icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="manifest" href="manifest.webmanifest">
<style>
/* Same reset the claude.ai artifact shell applies, so the page renders identically in both. */
/* Top inset only. The bottom inset is already handled by .tabbar and #view; padding the root as well left a strip below the tab bar (#25). */
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); }
body { margin: 0; font: 14px system-ui, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
</head>
<body>
`;
writeFileSync(join(dist, 'index.html'), head + body + '\n</body>\n</html>\n');

for (const f of readdirSync(app)) if (f.endsWith('.js')) copyFileSync(join(app, f), join(dist, f));
for (const f of readdirSync(join(root, 'web'))) copyFileSync(join(root, 'web', f), join(dist, f));

// Service worker (#52). The version is a hash of every built file, so any change to the app ships a new
// worker, and the precache holds the whole shell from one build (no mix of old and new scripts).
// The page itself is precached as './' because Firebase Hosting's cleanUrls redirects /index.html.
const files = readdirSync(dist).filter((f) => f !== 'index.html' && f !== 'sw.js').sort();
const hash = createHash('sha256');
for (const f of ['index.html', ...files]) hash.update(f + '\0').update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);
const sw = readFileSync(join(root, 'tools', 'sw.template.js'), 'utf8')
  .replace("'__VERSION__'", JSON.stringify(version))
  .replace("'__SHELL__'", JSON.stringify(['./', ...files]))
  .replace("'__SDK__'", JSON.stringify(SDK_URLS));
if (sw.includes('__VERSION__') || sw.includes('__SHELL__') || sw.includes('__SDK__')) throw new Error('tools/sw.template.js placeholders changed; update tools/build.mjs');
writeFileSync(join(dist, 'sw.js'), sw);
console.log('Built dist/ version ' + version + ' (' + readdirSync(dist).join(', ') + ')');
