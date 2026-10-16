/* Firebase backend for the hosted web app (toxin-tracker-bw.web.app).
   Loaded only by the hosted build (tools/build.mjs), never by the claude.ai artifact.
   Shows a sign-in screen, then resolves BT_CLOUD.ready with {uid, user, col}, where col is
   the Firestore collection users/{uid}/records. core.js reads it with onSnapshot and writes it
   with doc().set() / delete(), the same calls it uses for the artifact db capability.
   Offline (#52): a returning user's cached session opens the app with no connection; Firestore's
   offline cache holds the log and queues changes.
   Privacy (#53, #54): no account address ships in this file. Who may use the app lives only in
   firebase/firestore.rules; after sign-in a one-document read of the person's own records asks the server,
   and permission-denied turns the account away. Sign-out, the idle timeout and a denied account all end in
   endSession(), which signs out of Auth and runs wipeLocal(): Firestore's offline cache, the runtime caches
   and the in-memory log go, then the page reloads. Exports ask for a fresh sign-in (requireRecentAuth).
   End-to-end encryption (#66), behind ENCRYPTION below: records are sealed on the phone with a 256-bit AES-GCM data
   key before they are written. The data key is stored only wrapped, in users/{uid}/meta/keys: once with a key derived
   from the person's passphrase (PBKDF2-SHA256, 600,000 iterations, random 16-byte salt) and once with a recovery key
   shown at setup. Neither the passphrase nor the recovery key leaves the phone. After one unlock per device the key
   lives in this device's IndexedDB (tt-keys) as a non-extractable CryptoKey; wipeLocal() deletes it with everything
   else. BT_CLOUD.ready resolves once the key is unlocked (or the account is still unencrypted), with
   {uid, user, col, db, audit, device, encrypted, seal, open, isSealed, sealLeaf, openLeaf}. */
(function () {
  const config = {
    apiKey: 'AIzaSyD7Gau0dd-D2UqsQlzZAOcc3k1ZqUmJadk',
    // Firebase Hosting serves /__/auth on every hosting domain, so sign-in stays same-origin
    // (Safari blocks the cross-site storage a firebaseapp.com handler would need).
    authDomain: /\.(web\.app|firebaseapp\.com)$/.test(location.hostname) ? location.hostname : 'toxin-tracker-bw.firebaseapp.com',
    projectId: 'toxin-tracker-bw',
    storageBucket: 'toxin-tracker-bw.firebasestorage.app',
    messagingSenderId: '752573115739',
    appId: '1:752573115739:web:6eda4d7ed2fa9911373e7e',
  };

  // Two-step rollout of encryption (#66, PR #79). 'off': an account with no meta/keys stays unencrypted and is
  // never asked to set it up; an account that already has keys (set up on another device) is unlocked as usual, so
  // this build can always read an encrypted log. 'on': an account with no keys gets the setup screen on its next
  // start and its records are encrypted in place after it. Step 1 ships 'off'; step 2 is a PR that sets 'on'.
  // tools/build.mjs --encryption on|off overrides it for one build (tests).
  const ENCRYPTION = 'off';
  // Local tests only: tools/build.mjs --emulators points the app at the Auth and Firestore emulators of a demo-
  // project. Never set in a deployed build.
  const EMULATORS = null;
  // App Check (#60), off until a reCAPTCHA v3 site key is registered in the Firebase console (see README).
  // Turning it on also needs the app-check compat SDK vendored next to the others (tools/vendor.lock.json, build.mjs).
  const APP_CHECK_SITE_KEY = '';

  const WIPE = 'tt-wipe-pending'; // a flag only, never data: a sign-out's local wipe has not finished yet
  const WARM = 'tt-cache-synced'; // a flag only: the offline cache has had a full server snapshot since the last wipe (#83)
  const HOLD = 'tt-wipe-after-sync'; // a flag only: an idle sign-out is waiting for unsynced changes to reach the server (#83)
  const SYNC_WAIT_MS = 5000;
  const NOTICE = 'tt-notice'; // sessionStorage, a reason code only ('idle' or 'denied'), shown on the sign-in screen after the reload
  const IDLE_KEY = 'tt-idle-minutes', ACTIVE_KEY = 'tt-last-active'; // localStorage: this device's choice, and a timestamp
  const IDLE_DEFAULT = 30, WARN_MS = 60 * 1000, RECENT_MS = 10 * 60 * 1000;
  const DENIED = 'This app is private. This Google account does not have access.';
  const OFFLINE_GATE = 'You need a connection once to sign in. After that, the app opens without one.';

  let resolveReady;
  const cloud = (window.BT_CLOUD = { ready: new Promise((r) => (resolveReady = r)), user: null });
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { sessionStorage.removeItem(k); } catch (e) {} } };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };

  // This device's unlocked key, one per account, in its own IndexedDB database so the wipe can delete it whole.
  const keyStore = {
    db() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('tt-keys', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('k');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async run(mode, fn) {
      const d = await this.db();
      return new Promise((res, rej) => {
        const tx = d.transaction('k', mode), q = fn(tx.objectStore('k'));
        tx.oncomplete = () => { d.close(); res(q && q.result); };
        tx.onerror = tx.onabort = () => { d.close(); rej(tx.error); };
      });
    },
    get(uid) { return this.run('readonly', (s) => s.get(uid)).catch(() => null); },
    put(uid, key) { return this.run('readwrite', (s) => s.put(key, uid)).catch((e) => console.warn('key not kept on this device:', e && e.name)); },
    drop() {
      return new Promise((res) => {
        try { const r = indexedDB.deleteDatabase('tt-keys'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); }
      });
    },
  };
  const MESSAGES = {
    'auth/operation-not-allowed': 'Google sign-in is not turned on for this app yet.',
    'auth/unauthorized-domain': 'This web address is not allowed to sign in yet.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Trying a full-page sign-in instead.',
  };

  const css = `
  .gate { position: fixed; inset: 0; z-index: 100; display: grid; grid-template-rows: 1fr auto; color: var(--hero-fg);
    background: radial-gradient(120% 70% at 85% 0%, var(--hero-2) 0%, transparent 60%), linear-gradient(170deg, var(--hero-1), color-mix(in srgb, var(--hero-1) 55%, #000));
    padding: calc(env(safe-area-inset-top, 0px) + 48px) 24px calc(env(safe-area-inset-bottom, 0px) + 32px); }
  .gate-in { max-width: 420px; width: 100%; margin: 0 auto; display: grid; align-content: center; gap: 14px; }
  .gate-mark { width: 76px; height: 76px; border-radius: 17px; overflow: hidden; box-shadow: 0 0 0 1px color-mix(in srgb, var(--hero-fg) 30%, transparent), 0 10px 28px rgba(0, 0, 0, .28); }
  .gate-mark img { display: block; width: 100%; height: 100%; }
  .gate h1 { font-size: 34px; font-weight: 500; letter-spacing: -.02em; margin-top: 10px; }
  .gate p { margin: 0; color: color-mix(in srgb, var(--hero-fg) 75%, transparent); font-size: 16px; line-height: 1.5; }
  .gate-foot { max-width: 420px; width: 100%; margin: 0 auto; display: grid; gap: 14px; }
  .gate-btn { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 54px; border-radius: 16px; background: #fff; color: #1F1F1F; font-weight: 500; font-size: 16px; }
  .gate-btn:disabled { opacity: .6; }
  .gate-err { background: rgba(255,255,255,.12); border-radius: 12px; padding: 10px 12px; font-size: 14px; }
  .gate-small { font-size: 12.5px; text-align: center; color: color-mix(in srgb, var(--hero-fg) 60%, transparent); }
  .gate-f { display: grid; gap: 6px; }
  .gate-f label { font-size: 13px; color: color-mix(in srgb, var(--hero-fg) 75%, transparent); }
  .gate-in input[type=password], .gate-in input[type=text] { min-height: 50px; border-radius: 14px; padding: 0 14px; font-size: 16px; width: 100%; box-sizing: border-box;
    color: #1F1F1F; background: #fff; border: 0; }
  .gate-in .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; }
  .gate-warn { background: rgba(0,0,0,.22); border-radius: 12px; padding: 10px 12px; font-size: 14px; line-height: 1.45; }
  .gate-key { white-space: pre-line; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 21px; letter-spacing: .06em; line-height: 1.6; text-align: center;
    background: #fff; color: #1F1F1F; border-radius: 14px; padding: 14px 10px; word-spacing: .2em; user-select: all; -webkit-user-select: all; }
  .gate-check { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; }
  .gate-check input { width: 22px; height: 22px; margin: 0; flex: none; }
  .gate-link { background: none; color: inherit; text-decoration: underline; text-underline-offset: 3px; font-size: 14px; min-height: 44px; }
  .gate-ghost { background: color-mix(in srgb, var(--hero-fg) 14%, transparent); color: inherit; }
  .gate-scroll { overflow-y: auto; }`;
  const G = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';

  let gate = null, onSignIn = null;
  function showGate(msg, noButton) {
    if (!document.getElementById('gate-css')) { const s = document.createElement('style'); s.id = 'gate-css'; s.textContent = css; document.head.appendChild(s); }
    if (!gate) {
      gate = document.createElement('section');
      gate.className = 'gate';
      gate.setAttribute('aria-label', 'Sign in');
      gate.innerHTML = `<div class="gate-in"><div class="gate-mark"><img src="icon.svg" alt="" width="76" height="76"></div>
        <h1>Toxin Tracker</h1>
        <p>Log every treatment on a muscle map, keep your vials and reactions in one place, and know when you can work out again.</p></div>
        <div class="gate-foot"><div class="gate-err" role="status" hidden></div>
        <button class="gate-btn" type="button">${G}<span>Continue with Google</span></button>
        <div class="gate-small">Private app. Approved Google accounts only.</div></div>`;
      gate.querySelector('.gate-btn').addEventListener('click', () => onSignIn && onSignIn());
      document.body.appendChild(gate);
    }
    const err = gate.querySelector('.gate-err');
    err.hidden = !msg; err.textContent = msg || '';
    const btn = gate.querySelector('.gate-btn');
    btn.disabled = false; btn.hidden = !!noButton;
  }

  // Everything this app keeps on the device for an account: Firestore's offline cache (the log, photos and any
  // queued changes), the runtime caches in Cache Storage and the log held in memory. Firebase Auth's own
  // session is removed by auth.signOut() before this runs. If another tab still holds the Firestore cache,
  // clearPersistence fails; WIPE stays set and the next start clears it before the cache is opened.
  // Callers reload the page afterwards (endSession), so nothing read before the wipe stays on screen.
  cloud.wipeLocal = async () => {
    ls.set(WIPE, '1');
    if (typeof firebase !== 'undefined') {
      try {
        const db = firebase.firestore();
        await db.terminate();
        await db.clearPersistence();
        ls.del(WIPE);
      } catch (e) { console.warn('local cache clear deferred to next start', e && e.code); }
    }
    // Every cache except the tt-shell-* precache goes (tt-lib-*, bt-live-* and anything added later: vendor
    // code and the face model, refetched on next use). The shell is this build's static page and scripts, the
    // same for every account, and without it the app could not open offline again until the next deploy.
    try { for (const key of await caches.keys()) if (!key.startsWith('tt-shell-')) await caches.delete(key); } catch (e) {}
    await keyStore.drop(); // the unlocked encryption key (#66)
    if (window.BT && BT.data) for (const k of Object.keys(BT.data)) BT.data[k] = Array.isArray(BT.data[k]) ? [] : {};
    ls.del(ACTIVE_KEY); ls.del(WARM); ls.del(HOLD);
  };
  // Read by core.js (#83): whether a snapshot from the offline cache is the whole log for this account.
  cloud.cacheWarm = () => ls.get(WARM) === '1';
  cloud.markWarm = () => ls.set(WARM, '1');
  cloud.deleteField = () => firebase.firestore.FieldValue.delete();

  // The SDK comes from gstatic. The service worker keeps a copy (#52), so this only fails on a first visit with
  // no connection (or a worker that could not store it). Say so instead of leaving 'Loading your log' up.
  if (typeof firebase === 'undefined') {
    const show = () => showGate(navigator.onLine ? 'Could not load sign-in. Check your connection and try again.' : OFFLINE_GATE, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else setTimeout(show);
    window.addEventListener('online', () => location.reload(), { once: true });
    return;
  }

  // A sign-out that reloaded the page left a reason to show on the sign-in screen (a code, never an address).
  const notice = ss.get(NOTICE); ss.del(NOTICE);
  const NOTICES = { idle: 'Signed out after a while without use, and this phone\'s copy of your log was cleared.', denied: DENIED,
    deleted: 'Your data and your account were deleted.',
    'deleted-data': 'Your data was deleted. The account itself could not be removed; sign in and delete again to remove it.' };
  let firstGate = notice && NOTICES[notice];

  if (EMULATORS) config.projectId = EMULATORS.projectId;
  firebase.initializeApp(config);
  if (APP_CHECK_SITE_KEY) {
    try { firebase.appCheck().activate(new firebase.appCheck.ReCaptchaV3Provider(APP_CHECK_SITE_KEY), true); }
    catch (e) { console.warn('App Check not started:', (e && e.code) || 'app-check SDK missing'); }
  }
  const auth = firebase.auth();
  const db = firebase.firestore();
  if (EMULATORS) { auth.useEmulator(EMULATORS.auth, { disableWarnings: true }); db.useEmulator(EMULATORS.firestore[0], EMULATORS.firestore[1]); }
  // Offline cache. synchronizeTabs lets a Safari tab and the home-screen app share it. The default 40 MB size
  // is kept: garbage collection only drops documents no listener watches, and core.js watches every record.
  // It opens only once someone is signed in, so a signed-out device (after a wipe, or never signed in) holds
  // no Firestore database at all. A wipe that could not finish last time is completed first.
  const wipe = ls.get(WIPE) === '1';
  if (wipe) ls.del(WARM);
  const cleared = wipe ? Promise.all([keyStore.drop(), db.clearPersistence()]).then(() => ls.del(WIPE)).catch(() => {}) : Promise.resolve();
  let dbReady = null;
  const openDb = () => dbReady || (dbReady = cleared.then(() => db.enablePersistence({ synchronizeTabs: true }).catch(() => {}))); // fails harmlessly in private windows

  // Home-screen apps on iOS cannot open popups, so they use the redirect flow.
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  onSignIn = async function signIn() {
    if (!navigator.onLine) return showGate(OFFLINE_GATE);
    const btn = gate && gate.querySelector('.gate-btn');
    if (btn) btn.disabled = true;
    try {
      if (standalone) return await auth.signInWithRedirect(provider);
      await auth.signInWithPopup(provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked') { showGate(MESSAGES[e.code]); return auth.signInWithRedirect(provider); }
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return showGate('');
      showGate(MESSAGES[e.code] || 'Sign-in did not finish. Try again.');
    }
  };

  /* ---------- unsynced changes at sign-out (#83) ----------
     The wipe deletes Firestore's offline cache, which is the only copy of any change the server has not
     confirmed yet. drain(ms) resolves true once there is none: settings changes core.js is still holding for
     the first load have been handed to Firestore, then Firestore's own queue is empty (waitForPendingWrites).
     It resolves false if that has not happened within ms. Offline, a short wait is enough to tell: with nothing
     queued, waitForPendingWrites resolves at once. */
  const later = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
  async function drain(ms) {
    const all = (async () => {
      if (window.BT && BT.whenLoaded) await BT.whenLoaded();
      await db.waitForPendingWrites();
      return true;
    })().catch(() => false);
    return Promise.race([all, later(ms, false)]);
  }
  const waitMs = () => (navigator.onLine ? SYNC_WAIT_MS : 800);

  let signingOut = false, holding = false;
  // The one way a session ends (#54): sign-out, the idle timeout and a denied account all come here.
  async function endSession(reason) {
    if (signingOut) return;
    signingOut = true; cloud.signingOut = true;
    idle.stop();
    if (reason) ss.set(NOTICE, reason);
    // Idle: changes the server has not confirmed must not be wiped. Wait for them; if they cannot sync now
    // (offline, or the server does not answer in time), lock the app and wipe once they have (holdForSync).
    if (reason === 'idle' && !(await drain(waitMs()))) return holdForSync();
    try { await auth.signOut(); } catch (e) {}
    await cloud.wipeLocal();
    location.reload();
  }
  cloud.endSession = endSession;
  cloud.denyAccess = () => endSession('denied');

  /* An idle timeout with unsynced changes. Signing out of Auth now would make Firestore's queued writes fail
     on the server (they need the session), and the wipe would delete them, so the session stays signed in to
     Firebase but the app is locked: the sign-in screen covers it with no button, the records listener stops,
     the log leaves memory and the screen under the gate is cleared. Firestore keeps sending the queued writes;
     once they are confirmed (checked on 'online' and every 15 seconds) the usual sign-out and wipe run and the
     page reloads to the sign-in screen. HOLD survives a relaunch, so closing the app in the meantime brings
     back the lock, not the log. */
  const HOLD_MSG = 'Signed out after a while without use. Some changes have not synced yet; this phone\'s copy of your log will be cleared as soon as they reach the server. Connect to the internet to finish.';
  function holdForSync() {
    if (holding) return; holding = true;
    signingOut = true; cloud.signingOut = true; idle.stop();
    ls.set(HOLD, '1'); ss.set(NOTICE, 'idle');
    document.querySelectorAll('.sheet-wrap').forEach((w) => w.remove());
    if (window.BT) { if (BT.stopSync) BT.stopSync(); if (BT.data) for (const k of Object.keys(BT.data)) BT.data[k] = Array.isArray(BT.data[k]) ? [] : {}; }
    const view = document.getElementById('view'); if (view) view.innerHTML = '';
    showGate(HOLD_MSG, true);
    let trying = false;
    const retry = async () => {
      if (trying || !navigator.onLine) return; trying = true;
      const ok = await drain(SYNC_WAIT_MS);
      trying = false;
      if (!ok) return;
      try { await auth.signOut(); } catch (e) {}
      await cloud.wipeLocal();
      location.reload();
    };
    addEventListener('online', retry);
    setInterval(retry, 15000);
    retry();
  }

  // Sign-out from Settings or the 'Still there?' sheet. Online, it waits up to 5 seconds for unsynced changes to
  // reach the server. If some are still waiting (offline, or a slow server), it asks before wiping them.
  let leaving = false;
  cloud.signOut = async () => {
    if (leaving || signingOut) return;
    leaving = true;
    try {
      const note = setTimeout(() => window.BT && BT.toast('Syncing your last changes…'), 400);
      const synced = await drain(waitMs());
      clearTimeout(note);
      if (!synced && !(await BT.confirm('Some changes have not synced yet. Sign out anyway?', 'Sign out'))) return;
      await endSession('');
    } finally { leaving = false; }
  };

  /* ---------- idle timeout (#54) ----------
     Signs out and wipes after N minutes with no pointer or key use, with a 60-second 'Still there?' warning
     first. Timers stop while iOS has the app frozen in the background, so every check compares the clock with
     a stored last-active time instead of counting down; a return after the limit signs out at once, and so
     does a relaunch. The choice is per device (localStorage), not synced: 'Never' suits your own phone only. */
  const idle = (() => {
    let timer = null, warnSheet = null, lastWrite = 0, running = false;
    const minutes = () => { const v = ls.get(IDLE_KEY); if (v === 'never') return 0; const n = +v; return [15, 30, 60].includes(n) ? n : IDLE_DEFAULT; };
    const last = () => +ls.get(ACTIVE_KEY) || 0;
    const mark = (force) => {
      const now = Date.now();
      if (!force && now - lastWrite < 5000) return;
      lastWrite = now; ls.set(ACTIVE_KEY, String(now));
      if (warnSheet) closeWarn();
    };
    const onUse = () => { if (running && !signingOut) mark(); };
    function closeWarn() { const s = warnSheet; warnSheet = null; if (s) { s.keep = true; s.close(); } }
    function warn(left) {
      if (!window.BT || !BT.sheet) return;
      const secs = Math.max(0, Math.ceil(left / 1000));
      const text = `For privacy, you will be signed out in ${secs} second${secs === 1 ? '' : 's'} and this phone's copy of your log will be cleared.`;
      if (warnSheet) { warnSheet.body.querySelector('[data-left]').textContent = text; return; }
      const s = BT.sheet({ title: 'Still there?', onClose: () => { if (!s.keep && warnSheet === s) { warnSheet = null; mark(true); } } });
      warnSheet = s;
      s.el.classList.add('idle-warn');
      s.body.innerHTML = `<p class="muted" style="margin:0 0 20px" data-left></p><div class="row gap"><button class="btn ghost grow" data-out>Sign out now</button><button class="btn primary grow" data-stay>Stay signed in</button></div>`;
      s.body.querySelector('[data-left]').textContent = text;
      s.body.querySelector('[data-stay]').onclick = () => { closeWarn(); mark(true); };
      s.body.querySelector('[data-out]').onclick = () => { closeWarn(); cloud.signOut(); };
    }
    function check() {
      if (!running || signingOut) return;
      const m = minutes();
      if (!m) { if (warnSheet) closeWarn(); return; }
      const left = last() + m * 60000 - Date.now();
      if (left <= 0) { closeWarn(); return endSession('idle'); }
      if (left <= WARN_MS) warn(left); else if (warnSheet) closeWarn();
    }
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    return {
      minutes,
      // True when this device's last use is already past the limit (a relaunch after a long gap).
      expired: () => { const m = minutes(); return !!m && !!last() && Date.now() - last() >= m * 60000; },
      start() {
        if (running) return; running = true;
        if (!last()) mark(true);
        ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => addEventListener(t, onUse, { capture: true, passive: true }));
        document.addEventListener('visibilitychange', onVis);
        addEventListener('pageshow', check); addEventListener('focus', check);
        timer = setInterval(check, 1000);
        check();
      },
      stop() { running = false; clearInterval(timer); closeWarn(); },
      set(v) { ls.set(IDLE_KEY, v === 'never' ? 'never' : String(v)); mark(true); check(); },
    };
  })();
  cloud.idle = {
    options: [['15', 'After 15 minutes'], ['30', 'After 30 minutes'], ['60', 'After 60 minutes'], ['never', 'Never on this device']],
    get: () => (idle.minutes() ? String(idle.minutes()) : 'never'),
    set: (v) => idle.set(v),
  };

  /* ---------- fresh sign-in for exports and destructive actions (#54) ----------
     requireRecentAuth() resolves true when the last Google sign-in is under 10 minutes old, or after the person
     confirms with Google again. Uses the ID token's auth_time, which reauthentication updates. A home-screen
     app cannot open a popup, so it reauthenticates by redirect and the action is tapped again on return.
     Exports, the encryption settings and 'Delete all my data' (#59, with a 4-minute limit, since Firebase deletes an
     account only soon after a sign-in) all call it first. The rules check the same auth_time for key and erase writes. */
  cloud.requireRecentAuth = async (maxAge = RECENT_MS, what = 'exporting') => {
    const user = auth.currentUser;
    if (!user) return false;
    try { const t = await user.getIdTokenResult(); if (Date.now() - Date.parse(t.authTime) < maxAge) return true; } catch (e) {}
    if (!navigator.onLine) { window.BT && BT.toast('Connect to the internet to confirm it is you first.'); return false; }
    // The Continue tap is also the user gesture Safari needs before it lets a popup open.
    const ok = !window.BT || await new Promise((res) => {
      const s = BT.sheet({ title: 'Confirm it is you', onClose: () => res(false) });
      s.body.innerHTML = `<p class="muted" style="margin:0 0 20px">For privacy, sign in with Google again before ${what}. This is needed once every 10 minutes.</p><div class="row gap"><button class="btn ghost grow" data-n>Cancel</button><button class="btn primary grow" data-y>Continue</button></div>`;
      s.body.querySelector('[data-n]').onclick = () => s.close();
      s.body.querySelector('[data-y]').onclick = () => { res(true); s.el.remove(); };
    });
    if (!ok) return false;
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account', login_hint: user.email || '' });
    try {
      if (standalone) { ss.set('tt-reauth', '1'); await user.reauthenticateWithRedirect(p); return false; }
      await user.reauthenticateWithPopup(p);
      await user.getIdToken(true); // the rules read auth_time from the token, so send the fresh one
      return true;
    } catch (e) {
      const code = e && e.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false;
      if (code === 'auth/popup-blocked') { ss.set('tt-reauth', '1'); await user.reauthenticateWithRedirect(p).catch(() => {}); return false; }
      window.BT && BT.toast(code === 'auth/user-mismatch' ? 'Use the same Google account you are signed in with.' : 'Could not confirm. Try again.');
      return false;
    }
  };

  // Offline, a returning user has no pending redirect, so a network error here is not a sign-in failure.
  auth.getRedirectResult().then((r) => {
    if (ss.get('tt-reauth')) { ss.del('tt-reauth'); if (r && r.user) cloud.ready.then(() => setTimeout(() => window.BT && BT.toast('Confirmed. Tap it again to continue.'), 600)); }
  }).catch((e) => {
    if (started) return;
    if (e.code === 'auth/network-request-failed' && !navigator.onLine) return showGate(OFFLINE_GATE);
    showGate(MESSAGES[e.code] || 'Sign-in did not finish. Try again.');
  });
  window.addEventListener('online', () => { if (gate && !started) showGate(''); });

  // Access check (#53): ask the server for one of this person's own records. The rules answer permission-denied
  // for any account not on the list, and an approved account with no records gets an empty result, which passes.
  // Offline, or when the server does not answer in time, the result is unknown and the cached session opens:
  // the rules still guard every server read and write, and core.js turns a later permission-denied into a wipe.
  async function probe(uid) {
    if (!navigator.onLine) return 'unknown';
    const read = db.collection('users').doc(uid).collection('records').limit(1).get({ source: 'server' })
      .then(() => 'ok', (e) => (e && e.code === 'permission-denied' ? 'denied' : 'unknown'));
    return Promise.race([read, new Promise((r) => setTimeout(() => r('unknown'), 10000))]);
  }

  let started = false;
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      if (!started) { showGate(firstGate || (navigator.onLine ? '' : OFFLINE_GATE)); firstGate = null; }
      else if (!signingOut) location.reload();
      return;
    }
    if (started || signingOut) return;
    started = true;
    await openDb();
    // A session that sat unused past the limit while the app was closed ends before anything is shown, and so
    // does one whose idle sign-out was still waiting for changes to sync when the app closed (HOLD).
    if (ls.get(HOLD) === '1' || idle.expired()) return endSession('idle');
    if ((await probe(user.uid)) === 'denied') return endSession('denied');
    cloud.user = { uid: user.uid, name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' };
    idle.start();
    const unlocked = await unlockFlow(user.uid);
    if (!unlocked) return; // signing out
    const key = unlocked.key || null;
    if (gate) { gate.remove(); gate = null; }
    cloud.keys = key ? keysApi : null; // Settings shows the encryption card only when the log is encrypted
    const udoc = db.collection('users').doc(user.uid);
    resolveReady({ uid: user.uid, user: cloud.user, col: udoc.collection('records'), audit: udoc.collection('audit'), db,
      device: deviceId(), encrypted: !!key, isSealed,
      seal: (id, obj) => (key ? seal(key, id, obj) : Promise.resolve(JSON.parse(JSON.stringify(obj)))),
      open: (id, enc) => (isSealed(enc) ? (key ? unseal(key, id, enc) : Promise.reject(Object.assign(new Error('locked'), { code: 'tt-locked' }))) : Promise.resolve(enc)),
      sealLeaf: (aad, v) => (key ? sealLeaf(key, aad, v) : Promise.resolve(v)),
      openLeaf: (aad, s) => (key ? openLeaf(key, aad, s) : Promise.reject(Object.assign(new Error('locked'), { code: 'tt-locked' }))) });
  });

  /* ---------- end-to-end encryption (#66) ---------- */
  const te = new TextEncoder(), td = new TextDecoder(), subtle = crypto.subtle;
  const ITER = 600000, CHECK_AAD = 'tt-keys-check', CHECK = 'tt-check-v1';
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const isSealed = (r) => !!r && r.v === 1 && typeof r.iv === 'string' && typeof r.ct === 'string' && Object.keys(r).length === 3;
  // Each record is bound to its document id (additional data), so ciphertext cannot be moved to another record.
  async function seal(key, id, obj) {
    const iv = rand(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(id) }, key, te.encode(JSON.stringify(obj)));
    return { v: 1, iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }
  async function unseal(key, id, enc) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv), additionalData: te.encode(id) }, key, unb64(enc.ct));
    return JSON.parse(td.decode(pt));
  }
  async function kek(secret, salt, iter) {
    const base = await subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
  }
  async function wrapWith(dataKey, secret, salt, iter) {
    const k = await kek(secret, salt, iter), iv = rand(12);
    const w = new Uint8Array(await subtle.wrapKey('raw', dataKey, k, { name: 'AES-GCM', iv }));
    const out = new Uint8Array(12 + w.length); out.set(iv); out.set(w, 12);
    return b64(out);
  }
  // Throws (OperationError) when the secret is wrong: AES-GCM's tag does not verify.
  async function unwrapWith(wrapped, secret, salt, iter, extractable) {
    const k = await kek(secret, salt, iter), u = unb64(wrapped);
    return subtle.unwrapKey('raw', u.subarray(12), k, { name: 'AES-GCM', iv: u.subarray(0, 12) }, { name: 'AES-GCM' }, !!extractable, ['encrypt', 'decrypt']);
  }
  // Recovery key: 24 characters of Crockford base32 (120 random bits), shown as six groups of four.
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const newRecovery = () => Array.from(rand(24), (b) => ALPHA[b & 31]).join('');
  const groups = (r) => r.match(/.{4}/g).join('-');
  const normRecovery = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  const normPass = (s) => String(s || '').normalize('NFC');
  const nonExtractable = async (k) => {
    const raw = new Uint8Array(await subtle.exportKey('raw', k));
    try { return await subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); } finally { raw.fill(0); }
  };
  // Settings are merged field by field (#83), so they cannot be one ciphertext: each leaf value is sealed on its own
  // as a string 'tt-e1:<iv>:<ct>', bound to the field's path, and the map keys above it (field names, lesson and
  // achievement ids) stay plain field names, so two devices' merges still combine.
  const LEAF = 'tt-e1:';
  async function sealLeaf(key, aad, v) {
    const iv = rand(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, te.encode(JSON.stringify(v === undefined ? null : v)));
    return LEAF + b64(iv) + ':' + b64(new Uint8Array(ct));
  }
  async function openLeaf(key, aad, s) {
    const [iv, ct] = s.slice(LEAF.length).split(':');
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: te.encode(aad) }, key, unb64(ct));
    return JSON.parse(td.decode(pt));
  }
  const checkKey = async (key, keys) => { try { return (await unseal(key, CHECK_AAD, keys.check)).c === CHECK; } catch (e) { return false; } };

  // A random id for this browser's writes (the rules let a device build on its own last write, #58). Not personal.
  function deviceId() {
    let id = ls.get('tt-device');
    if (!id || id.length < 8) { id = b64(rand(12)).replace(/[^A-Za-z0-9]/g, '').slice(0, 16).padEnd(12, 'x'); ls.set('tt-device', id); }
    return id;
  }

  // Wrong passphrases are rate-limited on this device: after 5 misses, a pause that doubles each time, up to 15 minutes.
  const FAILS = 'tt-unlock-fails';
  const fails = {
    get() { try { return JSON.parse(ls.get(FAILS) || '{}'); } catch (e) { return {}; } },
    wait() { const f = this.get(); return Math.max(0, (f.until || 0) - Date.now()); },
    miss() { const f = this.get(), n = (f.n || 0) + 1; const until = n >= 5 ? Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (n - 5)) : 0; ls.set(FAILS, JSON.stringify({ n, until })); },
    clear() { ls.del(FAILS); },
  };

  let panel = null;
  function showPanel(html) {
    if (!document.getElementById('gate-css')) { const s = document.createElement('style'); s.id = 'gate-css'; s.textContent = css; document.head.appendChild(s); }
    if (gate) { gate.remove(); gate = null; }
    if (!panel) { panel = document.createElement('section'); panel.className = 'gate gate-scroll'; document.body.appendChild(panel); }
    panel.setAttribute('aria-label', 'Encryption');
    panel.innerHTML = html;
    return panel;
  }
  const closePanel = () => { if (panel) { panel.remove(); panel = null; } };
  const panelErr = (msg) => { const e = panel && panel.querySelector('.gate-err'); if (e) { e.hidden = !msg; e.textContent = msg || ''; } };
  const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (label) btn.querySelector('span').textContent = label; };
  const mark = () => `<div class="gate-mark">${window.BT ? BT.icon('lock', 30) : ''}</div>`;
  const LOSS = 'If you lose both your passphrase and your recovery key, nobody can open your log again. Not you, not the app\'s owner, not Google.';

  // Reads meta/keys: this device's cache first (so unlock works offline), then the server.
  // Resolves {keys} | {none: true} (the server says there is none) | {unknown: true} (offline with no cached copy).
  async function readKeys(ref) {
    try { const c = await ref.get({ source: 'cache' }); if (c.exists) return { keys: c.data() }; } catch (e) {}
    if (!navigator.onLine) return { unknown: true };
    try { const s = await ref.get({ source: 'server' }); return s.exists ? { keys: s.data() } : { none: true }; }
    catch (e) { if (e && e.code === 'permission-denied') { endSession('denied'); return { unknown: true, stop: true }; } return { unknown: true }; }
  }

  // Resolves {key} (unlocked), {plain: true} (no encryption on this account and ENCRYPTION is 'off'), or null when
  // the session ends instead.
  async function unlockFlow(uid) {
    const k = await keyFlow(uid);
    return k === null ? null : k === 'plain' ? { plain: true } : { key: k };
  }
  async function keyFlow(uid) {
    const ref = db.collection('users').doc(uid).collection('meta').doc('keys');
    const held = await keyStore.get(uid);
    for (;;) {
      const r = await readKeys(ref);
      if (r.stop || signingOut) return null;
      if (r.keys) {
        if (held && (await checkKey(held, r.keys))) return held;
        if (held) await keyStore.drop(); // a key from before a reset on another device
        const key = await unlockScreen(uid, r.keys);
        if (key) return key;
        return null;
      }
      if (r.none) {
        if (held) await keyStore.drop();
        if (ENCRYPTION !== 'on') return 'plain';
        const key = await setupScreen(uid, ref);
        if (key === 'exists') continue; // another device finished setup first: unlock with its passphrase
        return key;
      }
      // Offline and this device has never seen the keys: a key already unlocked here still opens the log.
      if (held) return held;
      // Step 1 of the rollout: an account that may well have no keys opens unencrypted. If it does have them, its
      // records show once this device has been online (core.js says so if it meets one it cannot open).
      if (ENCRYPTION !== 'on') return 'plain';
      await new Promise((res) => {
        const p = showPanel(`<div class="gate-in">${mark()}<h1>Connect once</h1><p>Your log is encrypted. Connect to the internet once to unlock it on this device. After that, it opens without a connection.</p></div>
          <div class="gate-foot"><button class="gate-btn" type="button" data-retry><span>Try again</span></button><button class="gate-link" type="button" data-out>Sign out</button></div>`);
        p.querySelector('[data-retry]').onclick = res;
        p.querySelector('[data-out]').onclick = () => endSession('');
        window.addEventListener('online', res, { once: true });
      });
    }
  }

  function setupScreen(uid, ref) {
    return new Promise((resolve) => {
      const p = showPanel(`<div class="gate-in">${mark()}<h1>Lock your log</h1>
        <p>Your records and photos are encrypted on this phone before they are saved, with a passphrase only you know. You enter it once on each device.</p>
        <div class="gate-warn">${BT.esc(LOSS)}</div>
        <form class="gate-in" data-f style="gap:12px;margin:6px 0 0">
          <input type="text" name="username" autocomplete="username" value="Toxin Tracker encryption" hidden>
          <div class="gate-f"><label for="k-p1">Passphrase (at least 10 characters)</label><input id="k-p1" type="password" autocomplete="new-password" minlength="10" required></div>
          <div class="gate-f"><label for="k-p2">Type it again</label><input id="k-p2" type="password" autocomplete="new-password" required></div>
        </form></div>
        <div class="gate-foot"><div class="gate-err" role="status" hidden></div><button class="gate-btn" type="button" data-go><span>Continue</span></button>
        <button class="gate-link" type="button" data-out>Sign out</button></div>`);
      const go = p.querySelector('[data-go]');
      p.querySelector('[data-out]').onclick = () => { resolve(null); endSession(''); };
      p.querySelector('[data-f]').onsubmit = (e) => { e.preventDefault(); go.click(); };
      go.onclick = async () => {
        const a = normPass(p.querySelector('#k-p1').value), b = normPass(p.querySelector('#k-p2').value);
        if (a.length < 10) return panelErr('Use at least 10 characters. A few unrelated words work well.');
        if (a !== b) return panelErr('The two passphrases do not match.');
        panelErr(''); busy(go, true, 'Setting up…');
        try {
          const dataKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
          const recovery = newRecovery(), salt = rand(16), rsalt = rand(16);
          const [wrapped, rwrapped] = await Promise.all([wrapWith(dataKey, a, salt, ITER), wrapWith(dataKey, recovery, rsalt, ITER)]);
          const keys = { v: 1, iter: ITER, salt: b64(salt), wrapped, rsalt: b64(rsalt), rwrapped, check: await seal(dataKey, CHECK_AAD, { c: CHECK }) };
          resolve(await recoveryScreen(uid, ref, keys, dataKey, recovery));
        } catch (e) { console.warn('setup failed:', (e && e.name) || 'unknown'); busy(go, false, 'Continue'); panelErr('Could not set up encryption on this browser.'); }
      };
    });
  }

  // Shown once. The keys document is written only after the person confirms, so a closed app never leaves an
  // account locked with a recovery key nobody saw.
  function recoveryScreen(uid, ref, keys, dataKey, recovery) {
    return new Promise((resolve) => {
      const p = showPanel(`<div class="gate-in">${mark()}<h1>Save your recovery key</h1>
        <p>If you forget your passphrase, this key unlocks your log on any device. It is shown only this once. Write it down or keep it in your password manager.</p>
        <div class="gate-key" data-key aria-label="Recovery key"></div>
        <button class="gate-btn gate-ghost" type="button" data-copy><span>Copy recovery key</span></button>
        <div class="gate-warn">${BT.esc(LOSS)}</div>
        <label class="gate-check"><input type="checkbox" data-ok><span>I saved my recovery key somewhere safe.</span></label></div>
        <div class="gate-foot"><div class="gate-err" role="status" hidden></div><button class="gate-btn" type="button" data-done disabled><span>Finish</span></button></div>`);
      p.querySelector('[data-key]').textContent = groups(recovery).replace(/^((?:.{4}-){2}.{4})-/, '$1\n'); // three groups a line
      const done = p.querySelector('[data-done]');
      p.querySelector('[data-ok]').onchange = (e) => (done.disabled = !e.target.checked);
      p.querySelector('[data-copy]').onclick = async () => {
        try { await navigator.clipboard.writeText(groups(recovery)); BT.toast('Copied'); }
        catch (e) { const sel = getSelection(), r = document.createRange(); r.selectNodeContents(p.querySelector('[data-key]')); sel.removeAllRanges(); sel.addRange(r); BT.toast('Selected. Copy it from here.'); }
      };
      done.onclick = async () => {
        if (!navigator.onLine) return panelErr('Connect to the internet to finish setting up.');
        busy(done, true, 'Saving…'); panelErr('');
        try {
          const made = await db.runTransaction(async (tx) => {
            const s = await tx.get(ref);
            if (s.exists) return false;
            tx.set(ref, { ...keys, at: firebase.firestore.FieldValue.serverTimestamp() });
            return true;
          });
          if (!made) { closePanel(); BT.toast('Encryption was already set up on another device. Unlock with that passphrase.'); return resolve('exists'); }
          const key = await nonExtractable(dataKey);
          await keyStore.put(uid, key);
          closePanel();
          resolve(key);
        } catch (e) {
          console.warn('keys not saved:', (e && e.code) || (e && e.name) || 'unknown');
          busy(done, false, 'Finish');
          panelErr('Could not save. Check your connection and try again.');
        }
      };
    });
  }

  // Passphrase or recovery key. Works offline when the keys document is in this device's cache.
  function unlockScreen(uid, keys) {
    return new Promise((resolve) => {
      let useRecovery = false;
      const p = showPanel(`<div class="gate-in">${mark()}<h1>Unlock your log</h1>
        <p data-hint></p>
        <form class="gate-in" data-f style="gap:12px;margin:6px 0 0">
          <input type="text" name="username" autocomplete="username" value="Toxin Tracker encryption" hidden>
          <div class="gate-f"><label for="k-in" data-label></label><input id="k-in" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false"></div>
        </form></div>
        <div class="gate-foot"><div class="gate-err" role="status" hidden></div><button class="gate-btn" type="button" data-go><span>Unlock</span></button>
        <div class="row" style="display:flex;justify-content:space-between;gap:12px"><button class="gate-link" type="button" data-mode></button><button class="gate-link" type="button" data-out>Sign out</button></div></div>`);
      const inp = p.querySelector('#k-in'), go = p.querySelector('[data-go]');
      const mode = () => {
        p.querySelector('[data-hint]').textContent = useRecovery ? 'Enter the recovery key you saved when you set up encryption. Dashes and spaces are optional.' : 'Enter the encryption passphrase you chose when you set up the app. This is needed once on each device.';
        p.querySelector('[data-label]').textContent = useRecovery ? 'Recovery key' : 'Passphrase';
        p.querySelector('[data-mode]').textContent = useRecovery ? 'Use passphrase instead' : 'Use recovery key instead';
        inp.type = useRecovery ? 'text' : 'password';
        inp.classList.toggle('mono', useRecovery);
        inp.autocomplete = useRecovery ? 'off' : 'current-password';
        inp.value = ''; panelErr('');
      };
      mode();
      p.querySelector('[data-mode]').onclick = () => { useRecovery = !useRecovery; mode(); inp.focus(); };
      p.querySelector('[data-out]').onclick = () => { resolve(null); endSession(''); };
      p.querySelector('[data-f]').onsubmit = (e) => { e.preventDefault(); go.click(); };
      go.onclick = async () => {
        const wait = fails.wait();
        if (wait) return panelErr(`Too many tries. Wait ${Math.ceil(wait / 1000)} seconds, then try again.`);
        const secret = useRecovery ? normRecovery(inp.value) : normPass(inp.value);
        if (!secret) return panelErr(useRecovery ? 'Enter your recovery key.' : 'Enter your passphrase.');
        busy(go, true, 'Unlocking…'); panelErr('');
        try {
          const key = useRecovery
            ? await unwrapWith(keys.rwrapped, secret, unb64(keys.rsalt), keys.iter)
            : await unwrapWith(keys.wrapped, secret, unb64(keys.salt), keys.iter);
          if (!(await checkKey(key, keys))) throw new Error('check');
          fails.clear();
          await keyStore.put(uid, key);
          closePanel();
          resolve(key);
        } catch (e) {
          fails.miss();
          busy(go, false, 'Unlock');
          const w = fails.wait();
          panelErr((useRecovery ? 'That recovery key does not match.' : 'That passphrase is not right.') + (w ? ` Wait ${Math.ceil(w / 1000)} seconds before the next try.` : ' Try again.'));
        }
      };
    });
  }

  // Settings (#66): rewrap the same data key with a new passphrase, or replace the recovery key. Both need the
  // current passphrase (or recovery key) and a Google sign-in from the last 10 minutes (the rules check it).
  async function rewrap(current, change) {
    const user = auth.currentUser;
    const ref = db.collection('users').doc(user.uid).collection('meta').doc('keys');
    const snap = await ref.get({ source: 'server' });
    if (!snap.exists) throw Object.assign(new Error('no keys'), { code: 'tt-no-keys' });
    const keys = snap.data(), rec = normRecovery(current);
    let dataKey = null;
    try { dataKey = await unwrapWith(keys.wrapped, normPass(current), unb64(keys.salt), keys.iter, true); } catch (e) {}
    if (!dataKey && rec.length === 24) { try { dataKey = await unwrapWith(keys.rwrapped, rec, unb64(keys.rsalt), keys.iter, true); } catch (e) {} }
    if (!dataKey) { fails.miss(); throw Object.assign(new Error('wrong'), { code: 'tt-wrong' }); }
    fails.clear();
    const next = { v: 1, iter: keys.iter, salt: keys.salt, wrapped: keys.wrapped, rsalt: keys.rsalt, rwrapped: keys.rwrapped, check: keys.check };
    await change(next, dataKey);
    await ref.set({ ...next, at: firebase.firestore.FieldValue.serverTimestamp() });
  }
  const keysApi = {
    groups,
    waitMs: () => fails.wait(),
    async changePassphrase(current, nextPass) {
      nextPass = normPass(nextPass);
      if (nextPass.length < 10) throw Object.assign(new Error('short'), { code: 'tt-short' });
      await rewrap(current, async (next, dataKey) => { const salt = rand(16); next.salt = b64(salt); next.wrapped = await wrapWith(dataKey, nextPass, salt, ITER); next.iter = ITER; });
    },
    // Returns the new recovery key, to show once. The old one stops working.
    async newRecoveryKey(current) {
      const recovery = newRecovery();
      await rewrap(current, async (next, dataKey) => {
        if (next.iter !== ITER) throw Object.assign(new Error('iter'), { code: 'tt-iter' });
        const rsalt = rand(16); next.rsalt = b64(rsalt); next.rwrapped = await wrapWith(dataKey, recovery, rsalt, ITER);
      });
      return groups(recovery);
    },
  };

  /* ---------- delete all my data and the account (#59) ----------
     Needs a connection and a Google sign-in from the last few minutes (the caller asks with requireRecentAuth).
     meta/erase first (the rules allow audit entries to be deleted only while it exists), then every record, every
     audit entry and the keys, then meta/erase itself; then a check that nothing is left, this device's wipe, and
     the Auth account. onStep(text) reports progress. Resolves only by reloading the page. */
  cloud.deleteEverything = async (onStep = () => {}) => {
    const user = auth.currentUser;
    if (!user || !navigator.onLine) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    // Changes still on their way would land after the deletes and leave records behind.
    if (!(await drain(SYNC_WAIT_MS))) throw Object.assign(new Error('unsynced'), { code: 'unavailable' });
    if (window.BT && BT.stopSync) BT.stopSync();
    const u = db.collection('users').doc(user.uid), meta = u.collection('meta');
    const FV = firebase.firestore.FieldValue;
    onStep('Starting');
    await meta.doc('erase').set({ at: FV.serverTimestamp() });
    const sweep = async (colRef, per, label) => {
      for (let round = 0; round < 1000; round++) {
        const snap = await colRef.limit(per * 5).get({ source: 'server' });
        if (snap.empty) return;
        onStep(label);
        const docs = snap.docs, jobs = [];
        for (let i = 0; i < docs.length; i += per) { const b = db.batch(); docs.slice(i, i + per).forEach((d) => b.delete(d.ref)); jobs.push(b.commit()); }
        await Promise.all(jobs);
      }
    };
    await sweep(u.collection('records'), 100, 'Deleting records and photos');
    // Small batches: each audit delete is checked against meta/erase by the rules.
    await sweep(u.collection('audit'), 10, 'Deleting the change history');
    await meta.doc('keys').delete();
    await meta.doc('erase').delete();
    onStep('Checking');
    const left = await Promise.all(['records', 'audit', 'meta'].map((c) => u.collection(c).limit(1).get({ source: 'server' })));
    if (left.some((s) => !s.empty)) throw Object.assign(new Error('left'), { code: 'tt-left' });
    onStep('Removing your account');
    signingOut = true; cloud.signingOut = true; idle.stop();
    await cloud.wipeLocal();
    let gone = true;
    try { await user.delete(); } catch (e) { gone = false; console.warn('account not deleted:', e && e.code); }
    try { await auth.signOut(); } catch (e) {}
    ss.set(NOTICE, gone ? 'deleted' : 'deleted-data');
    location.reload();
  };
})();
