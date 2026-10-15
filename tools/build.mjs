// Builds the hosted web app into dist/ from the same app/ files the claude.ai artifact publishes.
// app/index.html is a page body (the artifact host adds the document shell), so this wraps it in a
// full document, adds the Firebase SDK and app/cloud.js before core.js, adds app/livecam.js after
// facemap.js, and copies the scripts.
// Run: node tools/build.mjs   (firebase deploy runs it as the hosting predeploy step)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
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
const firebase = ['app', 'auth', 'firestore'].map((m) => `<script src="https://www.gstatic.com/firebasejs/${SDK}/firebase-${m}-compat.js"></script>`).join('\n');
if (!body.includes('<script src="core.js"></script>')) throw new Error('app/index.html no longer loads core.js; update tools/build.mjs');
body = body.replace('<script src="core.js"></script>', `${firebase}\n<script src="core.js"></script>\n<script src="cloud.js"></script>`);
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
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
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
console.log('Built dist/ (' + readdirSync(dist).join(', ') + ')');
