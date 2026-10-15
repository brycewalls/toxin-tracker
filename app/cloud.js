/* Firebase backend for the hosted web app (toxin-tracker-bw.web.app).
   Loaded only by the hosted build (tools/build.mjs), never by the claude.ai artifact.
   Shows a sign-in screen, then resolves BT_CLOUD.ready with {uid, user, col}, where col is
   the Firestore collection users/{uid}/records. core.js reads it with onSnapshot and writes it
   with doc().set() / delete(), the same calls it uses for the artifact db capability.
   Offline (#52): a returning user's cached session opens the app with no connection; Firestore's
   offline cache holds the log and queues changes. BT_CLOUD.wipeLocal() removes everything this
   app keeps on the device (used by sign-out). */
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

  // Only these Google accounts may use the app (#22). Firestore rules enforce the same list;
  // this check only gives everyone else a clear message instead of an empty, failing app.
  const ALLOWED = ['owner@example.invalid', 'second-user@example.invalid'];
  const WIPE = 'tt-wipe-pending'; // a flag only, never data: a sign-out's local wipe has not finished yet
  const OFFLINE_GATE = 'You need a connection once to sign in. After that, the app opens without one.';

  let resolveReady;
  const cloud = (window.BT_CLOUD = { ready: new Promise((r) => (resolveReady = r)), user: null });

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
  .gate-mark { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: color-mix(in srgb, var(--hero-fg) 14%, transparent); border: 1px solid color-mix(in srgb, var(--hero-fg) 25%, transparent); }
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
      gate.innerHTML = `<div class="gate-in"><div class="gate-mark">${window.BT ? BT.icon('syringe', 30) : ''}</div>
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

  // Everything this app keeps on the device for an account: Firestore's offline cache (the log and any queued
  // changes) and the runtime caches in Cache Storage (none hold user data; the service worker never caches
  // Firestore or Auth traffic). Firebase Auth's own session is removed by auth.signOut() before this runs.
  // If another tab still holds the Firestore cache, clearPersistence fails; WIPE stays set and the next start
  // clears it before the cache is opened. Reusable by a future idle timeout.
  cloud.wipeLocal = async () => {
    try { localStorage.setItem(WIPE, '1'); } catch (e) {}
    if (typeof firebase !== 'undefined') {
      try {
        const db = firebase.firestore();
        await db.terminate();
        await db.clearPersistence();
        try { localStorage.removeItem(WIPE); } catch (e) {}
      } catch (e) { console.warn('local cache clear deferred to next start', e && e.code); }
    }
    // Runtime caches go (tt-lib-*, bt-live-*: vendor code and the face model, refetched on next use). The
    // tt-shell-* precache stays: it is this build's static page and scripts, the same for every account, and
    // without it the app could not open offline again until the next deploy.
    try { for (const key of await caches.keys()) if (/^(tt-lib-|bt-live-)/.test(key)) await caches.delete(key); } catch (e) {}
  };

  // The SDK comes from gstatic. The service worker keeps a copy (#52), so this only fails on a first visit with
  // no connection (or a worker that could not store it). Say so instead of leaving 'Loading your log' up.
  if (typeof firebase === 'undefined') {
    const show = () => showGate(navigator.onLine ? 'Could not load sign-in. Check your connection and try again.' : OFFLINE_GATE, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else setTimeout(show);
    window.addEventListener('online', () => location.reload(), { once: true });
    return;
  }

  firebase.initializeApp(config);
  const auth = firebase.auth();
  const db = firebase.firestore();
  // Offline cache. synchronizeTabs lets a Safari tab and the home-screen app share it. The default 40 MB size
  // is kept: garbage collection only drops documents no listener watches, and core.js watches every record.
  let wipe = false;
  try { wipe = localStorage.getItem(WIPE) === '1'; } catch (e) {}
  const dbReady = (wipe ? db.clearPersistence().then(() => { try { localStorage.removeItem(WIPE); } catch (e) {} }).catch(() => {}) : Promise.resolve())
    .then(() => db.enablePersistence({ synchronizeTabs: true }).catch(() => {})); // fails harmlessly in private windows

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

  let signingOut = false;
  cloud.signOut = async () => {
    // Changes made offline that have not reached the server live only in the cache the wipe removes.
    if (window.BT && BT.sync && BT.sync.pending &&
      !(await BT.confirm('Some changes have not synced yet. Signing out now removes them from this phone.', 'Sign out'))) return;
    signingOut = true; cloud.signingOut = true;
    try { await auth.signOut(); } catch (e) {}
    await cloud.wipeLocal();
    location.reload();
  };

  // Offline, a returning user has no pending redirect, so a network error here is not a sign-in failure.
  auth.getRedirectResult().catch((e) => {
    if (started) return;
    if (e.code === 'auth/network-request-failed' && !navigator.onLine) return showGate(OFFLINE_GATE);
    showGate(MESSAGES[e.code] || 'Sign-in did not finish. Try again.');
  });
  window.addEventListener('online', () => { if (gate && !started) showGate(''); });

  let started = false, denied = false;
  auth.onAuthStateChanged((user) => {
    if (!user) { if (!started && !denied) showGate(navigator.onLine ? '' : OFFLINE_GATE); else if (started && !signingOut) location.reload(); return; }
    if (!ALLOWED.includes((user.email || '').toLowerCase()) || !user.emailVerified) {
      denied = true;
      showGate(`This app is private. ${user.email || 'That account'} does not have access. Sign in with an approved Google account.`);
      auth.signOut().catch(() => {});
      return;
    }
    denied = false;
    if (started) return;
    started = true;
    cloud.user = { uid: user.uid, name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' };
    if (gate) { gate.remove(); gate = null; }
    dbReady.then(() => resolveReady({ uid: user.uid, user: cloud.user, col: db.collection('users').doc(user.uid).collection('records') }));
  });
})();
