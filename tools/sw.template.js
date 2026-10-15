/* Toxin Tracker service worker (#52). tools/build.mjs fills in the three placeholders and writes dist/sw.js;
   do not edit dist/sw.js by hand.

   What it caches, and nothing else:
   - SHELL (tt-shell-<version>): the page, every script, icons and manifest from one build, plus the pinned
     Firebase SDK scripts from gstatic. Precached on install and served cache-first, so the app opens with no
     connection and never mixes files from two builds. A new deploy changes the version, which installs a new
     worker; the page shows 'Update ready' (app/offline.js) and this worker swaps in when asked.
   - LIB (tt-lib-1): pinned third-party code fetched later (the MediaPipe bundle and wasm loader for the Live
     view), cache-first once fetched. The wasm binary and the face model are stored by app/livecam.js in its own
     bt-live-* cache; this worker reads that cache but does not copy those files a second time.
   Never cached, never touched: Firestore, Auth (identitytoolkit, securetoken, accounts.google.com, apis.google.com),
   Firebase's /__/ paths, and any other host. Requests not on the allowlist go straight to the network.
   No record, photo or account data passes through Cache Storage. Nothing here logs URLs or request contents. */
const VERSION = '__VERSION__';
const SHELL_FILES = '__SHELL__';
const SDK_FILES = '__SDK__';
const SHELL = 'tt-shell-' + VERSION;
const LIB = 'tt-lib-1';

// Third-party hosts this worker may cache, each limited to the pinned, versioned paths the app uses.
const LIB_PATHS = {
  'www.gstatic.com': /^\/firebasejs\/\d+\.\d+\.\d+\//,
  'cdn.jsdelivr.net': /^\/npm\/@mediapipe\/tasks-vision@\d+\.\d+\.\d+\//,
  'storage.googleapis.com': /^\/mediapipe-models\//,
};
// Large binaries app/livecam.js caches itself (bt-live-*); served from there, not stored again here.
const SELF_CACHED = /\.(wasm|task)$/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // cache: 'reload' skips the HTTP cache so the precache is exactly this build.
    await cache.addAll(SHELL_FILES.map((f) => new Request(f, { cache: 'reload' })));
    for (const url of SDK_FILES) {
      let res;
      try { res = await fetch(new Request(url, { mode: 'cors', credentials: 'omit', cache: 'reload' })); } catch (e) { res = null; }
      if (!res || !res.ok) res = await fetch(new Request(url, { mode: 'no-cors', credentials: 'omit' })); // still an offline copy
      await cache.put(url, res);
    }
  })());
  // No skipWaiting here: a new version waits until the page asks (Reload on the pill, or the next launch).
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete this worker's old caches. bt-live-* belongs to app/livecam.js and is left alone.
    for (const key of await caches.keys()) if (key.startsWith('tt-') && key !== SHELL && key !== LIB) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'skip-waiting') self.skipWaiting();
  else if (type === 'version' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/__/')) return; // Firebase Auth handler and reserved URLs: network only
    if (req.mode === 'navigate') return event.respondWith(shell(req));
    return event.respondWith(fromShell(req));
  }
  const allowed = LIB_PATHS[url.hostname];
  if (allowed && allowed.test(url.pathname)) return event.respondWith(lib(req, url));
  // Everything else (Firestore, Auth, Google APIs, profile photos) is not handled: the browser fetches it as usual.
});

// Any navigation inside the app gets the precached page; the app has one page and routes in JavaScript.
async function shell(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match('./');
  if (hit) return hit;
  return fetch(req);
}

async function fromShell(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  return hit || fetch(req);
}

async function lib(req, url) {
  const hit = await caches.match(req, { ignoreVary: true }); // all caches: shell, lib and bt-live-*
  if (hit) return hit;
  const res = await fetch(req);
  if ((res.ok || res.type === 'opaque') && !SELF_CACHED.test(url.pathname)) {
    const copy = res.clone();
    caches.open(LIB).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}
