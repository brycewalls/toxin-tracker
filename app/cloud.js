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
   and the in-memory log go, then the page reloads. Exports ask for a fresh sign-in (requireRecentAuth). */
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
  .gate-small { font-size: 12.5px; text-align: center; color: color-mix(in srgb, var(--hero-fg) 60%, transparent); }`;
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
  const NOTICES = { idle: 'Signed out after a while without use, and this phone\'s copy of your log was cleared.', denied: DENIED };
  let firstGate = notice && NOTICES[notice];

  firebase.initializeApp(config);
  const auth = firebase.auth();
  const db = firebase.firestore();
  // Offline cache. synchronizeTabs lets a Safari tab and the home-screen app share it. The default 40 MB size
  // is kept: garbage collection only drops documents no listener watches, and core.js watches every record.
  // It opens only once someone is signed in, so a signed-out device (after a wipe, or never signed in) holds
  // no Firestore database at all. A wipe that could not finish last time is completed first.
  const wipe = ls.get(WIPE) === '1';
  if (wipe) ls.del(WARM);
  const cleared = wipe ? db.clearPersistence().then(() => ls.del(WIPE)).catch(() => {}) : Promise.resolve();
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
     Export uses it now; 'Delete all my data' (#59) should call it the same way before it deletes anything. */
  cloud.requireRecentAuth = async () => {
    const user = auth.currentUser;
    if (!user) return false;
    try { const t = await user.getIdTokenResult(); if (Date.now() - Date.parse(t.authTime) < RECENT_MS) return true; } catch (e) {}
    if (!navigator.onLine) { window.BT && BT.toast('Connect to the internet to confirm it is you first.'); return false; }
    // The Continue tap is also the user gesture Safari needs before it lets a popup open.
    const ok = !window.BT || await new Promise((res) => {
      const s = BT.sheet({ title: 'Confirm it is you', onClose: () => res(false) });
      s.body.innerHTML = `<p class="muted" style="margin:0 0 20px">For privacy, sign in with Google again before exporting. This is needed once every 10 minutes.</p><div class="row gap"><button class="btn ghost grow" data-n>Cancel</button><button class="btn primary grow" data-y>Continue</button></div>`;
      s.body.querySelector('[data-n]').onclick = () => s.close();
      s.body.querySelector('[data-y]').onclick = () => { res(true); s.el.remove(); };
    });
    if (!ok) return false;
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account', login_hint: user.email || '' });
    try {
      if (standalone) { ss.set('tt-reauth', '1'); await user.reauthenticateWithRedirect(p); return false; }
      await user.reauthenticateWithPopup(p);
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
    if (ss.get('tt-reauth')) { ss.del('tt-reauth'); if (r && r.user) cloud.ready.then(() => setTimeout(() => window.BT && BT.toast('Confirmed. Tap Export CSV again.'), 600)); }
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
    if (gate) { gate.remove(); gate = null; }
    idle.start();
    resolveReady({ uid: user.uid, user: cloud.user, col: db.collection('users').doc(user.uid).collection('records') });
  });
})();
