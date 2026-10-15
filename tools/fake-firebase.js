/* Fake Firebase compat SDK for sync tests (#83). Never shipped: tools/sync_test.mjs serves it in place of
   dist/vendor/firebase/<ver>/firebase-app-compat.js (and empty files for auth and firestore) in Playwright.

   It models the parts of the real SDK that decide whether data survives a sign-out and sign-in:
   - Server latency (window.__FAKE_FB.latency, default 1500 ms) on every read and write.
   - A persistent offline cache (localStorage, survives reloads) holding documents and a queue of pending writes.
     clearPersistence() deletes it and is refused until terminate().
   - onSnapshot raises a first snapshot from the cache at once only when the cache has documents for the
     query, has had a full server result for it before, or the client is offline (the real SDK's rule,
     firestore EventManager shouldRaiseInitialEvent). get({source: 'server'}) stores what it reads in the cache.
   - Writes apply locally at once (hasPendingWrites) and are sent in order; set() resolves on the server ack.
     waitForPendingWrites() resolves when the queue is empty. set(..., {merge: true}) deep-merges maps,
     FieldValue.delete() removes a field, merging {} replaces a map with an empty one (as Firestore does).
   - 'Offline' is navigator.onLine false (Playwright context.setOffline), or a server that does not answer while
     the browser reports a connection: window.__fakeDown = true, or localStorage '__fake_down' = '1' (survives a reload).
   - Auth: one fake Google account (window.__FAKE_FB.uid, default 'u1'), kept in localStorage like a session.
   The server is shared by every page and browser context in a run: the test exposes window.__fakeServer(op),
   backed by createServer() below (Node). */
(function (root) {
  const DEL = { __fv: 'delete' };
  const isDel = (v) => !!v && typeof v === 'object' && v.__fv === 'delete';
  const plain = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && !isDel(x);
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  function deepMerge(target, src) {
    for (const [k, v] of Object.entries(src)) {
      if (isDel(v)) delete target[k];
      else if (plain(v) && Object.keys(v).length) target[k] = deepMerge(plain(target[k]) ? target[k] : {}, v);
      else target[k] = clone(v);
    }
    return target;
  }
  function noDeletes(v) { if (isDel(v)) throw Object.assign(new Error('FieldValue.delete() needs merge'), { code: 'invalid-argument' }); if (plain(v)) Object.values(v).forEach(noDeletes); }
  // One write against a document's data (null when missing). Same code on the client cache and the server.
  function applyWrite(data, w) {
    if (w.type === 'delete') return null;
    if (w.type === 'set' && !w.merge) { noDeletes(w.data); return clone(w.data); }
    if (w.type === 'set') return deepMerge(data ? clone(data) : {}, w.data);
    if (w.type === 'update') {
      if (!data) throw Object.assign(new Error('No document to update'), { code: 'not-found' });
      const d = clone(data);
      for (const [path, v] of Object.entries(w.data)) {
        const parts = path.split('.'); let o = d;
        for (const p of parts.slice(0, -1)) o = plain(o[p]) ? o[p] : (o[p] = {});
        const last = parts[parts.length - 1];
        if (isDel(v)) delete o[last]; else o[last] = clone(v);
      }
      return d;
    }
    throw new Error('unknown write ' + w.type);
  }

  // ---------- Node: the shared server ----------
  function createServer({ allowed = ['u1'] } = {}) {
    const docs = new Map(); // full path -> data
    const log = [];
    const ok = (uid, path) => allowed.includes(uid) && path.startsWith('users/' + uid + '/');
    return {
      docs, log,
      seed(path, data) { docs.set(path, clone(data)); },
      get(path) { return clone(docs.get(path)); },
      handle(op) {
        if (!ok(op.uid, op.path)) return { error: 'permission-denied' };
        if (op.type === 'query') {
          const pre = op.path + '/';
          let out = [...docs.entries()].filter(([p]) => p.startsWith(pre) && !p.slice(pre.length).includes('/'))
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([p, d]) => ({ id: p.slice(pre.length), data: clone(d) }));
          if (op.limit) out = out.slice(0, op.limit);
          return { docs: out };
        }
        if (op.type === 'write') {
          try {
            const next = applyWrite(docs.get(op.path) || null, op.w);
            if (next === null) docs.delete(op.path); else docs.set(op.path, next);
            log.push({ at: Date.now(), path: op.path, w: op.w, client: op.client });
            return { data: clone(next) };
          } catch (e) { return { error: e.code || 'internal' }; }
        }
        return { error: 'invalid-argument' };
      },
    };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { createServer, applyWrite, DEL }; return; }

  // ---------- Browser: the compat SDK surface the app uses ----------
  const cfg = Object.assign({ latency: 1500, uid: 'u1', pollMs: 400 }, root.__FAKE_FB || {});
  const CLIENT = Math.random().toString(36).slice(2, 8);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const net = () => navigator.onLine && !root.__fakeDown && localStorage.getItem('__fake_down') !== '1';
  const err = (code) => Object.assign(new Error(code), { code });
  const LS_CACHE = '__fake_fs_cache', LS_AUTH = '__fake_auth';
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ---------- auth ----------
  let currentUid = lsGet(LS_AUTH);
  const authListeners = [];
  const mkUser = (uid) => uid && {
    uid, displayName: 'Test Person', email: '', photoURL: '',
    getIdTokenResult: async () => ({ authTime: new Date().toUTCString() }),
    reauthenticateWithPopup: async () => ({}), reauthenticateWithRedirect: async () => {},
  };
  const auth = {
    get currentUser() { return mkUser(currentUid); },
    onAuthStateChanged(cb) { authListeners.push(cb); setTimeout(() => cb(mkUser(currentUid)), 0); return () => {}; },
    async signInWithPopup() { if (!navigator.onLine) throw err('auth/network-request-failed'); await sleep(50); currentUid = cfg.uid; lsSet(LS_AUTH, currentUid); authListeners.forEach((f) => f(mkUser(currentUid))); return { user: mkUser(currentUid) }; },
    async signInWithRedirect() { return auth.signInWithPopup(); },
    getRedirectResult: () => Promise.resolve(null),
    async signOut() { currentUid = null; lsSet(LS_AUTH, null); authListeners.forEach((f) => f(null)); },
  };
  class GoogleAuthProvider { setCustomParameters() {} }

  // ---------- firestore ----------
  // cache = {docs: {path: data}, synced: {queryPath: true}, queue: [{bid, path, w}], nextBid}
  const load = () => lsGet(LS_CACHE) || { docs: {}, synced: {}, queue: [], nextBid: 1 };
  let cache = load();
  const save = () => lsSet(LS_CACHE, cache);
  let terminated = false, pumping = false;
  const acks = new Map(), drainWaiters = [];
  const listeners = new Set();

  async function server(op) {
    await sleep(cfg.latency / 2);
    if (!net() || terminated) throw err('unavailable');
    const r = await root.__fakeServer({ ...op, uid: currentUid, client: CLIENT });
    await sleep(cfg.latency / 2);
    if (!net() || terminated) throw err('unavailable');
    if (r && r.error) throw err(r.error);
    return r;
  }
  // The local view of a document: cached server data with pending writes applied in order.
  function localDoc(path) {
    let d = path in cache.docs ? cache.docs[path] : null, pending = false;
    for (const m of cache.queue) if (m.path === path) { d = applyWrite(d, m.w); pending = true; }
    return { data: d, pending };
  }
  function pathsUnder(col) {
    const pre = col + '/', set = new Set();
    for (const p of Object.keys(cache.docs)) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) set.add(p);
    for (const m of cache.queue) if (m.path.startsWith(pre) && !m.path.slice(pre.length).includes('/')) set.add(m.path);
    return [...set].sort();
  }
  const mkDocSnap = (path, data, pending, fromCache) => ({
    id: path.split('/').pop(), exists: data != null, data: () => clone(data == null ? undefined : data), metadata: { hasPendingWrites: pending, fromCache },
  });

  function pump() {
    if (pumping || terminated || !net() || !cache.queue.length) return;
    pumping = true;
    (async () => {
      try {
        while (cache.queue.length && net() && !terminated) {
          const m = cache.queue[0];
          let r;
          try { r = await server({ type: 'write', path: m.path, w: m.w }); }
          catch (e) {
            if (e.code === 'unavailable') break;
            cache.queue = cache.queue.filter((x) => x.bid !== m.bid); save(); // rejected by the server
            const a = acks.get(m.bid); if (a) { acks.delete(m.bid); a.rej(e); }
            emitAll(); continue;
          }
          if (terminated) break;
          if (r.data == null) delete cache.docs[m.path]; else cache.docs[m.path] = r.data;
          cache.queue = cache.queue.filter((x) => x.bid !== m.bid); save();
          const a = acks.get(m.bid); if (a) { acks.delete(m.bid); a.res(); }
          emitAll();
        }
      } finally {
        pumping = false;
        if (!cache.queue.length) drainWaiters.splice(0).forEach((f) => f());
      }
    })();
  }
  function write(path, w) {
    if (terminated) return Promise.reject(err('failed-precondition'));
    try { applyWrite(localDoc(path).data, w); } catch (e) { return Promise.reject(e); }
    const bid = cache.nextBid++;
    cache.queue.push({ bid, path, w: clone(w) }); save();
    const p = new Promise((res, rej) => acks.set(bid, { res, rej }));
    setTimeout(() => { emitAll(); pump(); }, 0);
    return p;
  }
  // FieldValue.delete() must survive JSON (the cache and the server binding), so it is a marker object.
  const wireData = (v) => (isDel(v) ? DEL : plain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wireData(x)])) : v === undefined ? null : v);

  class Listener {
    constructor(col, opts, next, error) {
      Object.assign(this, { col, meta: !!(opts && opts.includeMetadataChanges), next, error, last: null, raised: false, fromCache: true, dead: false, timer: null });
      listeners.add(this);
      const view = pathsUnder(col);
      if (view.length || cache.synced[col] || !net()) setTimeout(() => this.raise(), 0);
      this.fetch();
      this.timer = setInterval(() => this.poll(), cfg.pollMs);
    }
    async fetch() {
      if (this.dead || this.fetching || !net()) return;
      this.fetching = true;
      try {
        const r = await server({ type: 'query', path: this.col });
        if (this.dead) return;
        this.absorb(r.docs); this.fromCache = false; this.raise();
      } catch (e) {
        if (this.dead) return;
        if (e.code === 'permission-denied') { this.stop(); this.error(e); return; }
        if (!this.raised) this.raise(); // offline now: the SDK raises what the cache has
      } finally { this.fetching = false; }
    }
    absorb(docs) {
      const pre = this.col + '/';
      for (const p of Object.keys(cache.docs)) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) delete cache.docs[p];
      for (const d of docs) cache.docs[pre + d.id] = d.data;
      cache.synced[this.col] = true; save();
    }
    async poll() {
      if (this.dead || this.fetching || !this.raised) return;
      if (!net()) { if (!this.fromCache) { this.fromCache = true; this.raise(); } return; }
      if (this.fromCache) return this.fetch();
      this.fetching = true;
      try {
        const r = await root.__fakeServer({ type: 'query', path: this.col, uid: currentUid, client: CLIENT });
        if (this.dead || !r || r.error) return;
        this.absorb(r.docs); this.raise();
      } finally { this.fetching = false; }
    }
    raise() {
      if (this.dead) return;
      const paths = pathsUnder(this.col), cur = new Map();
      for (const p of paths) { const l = localDoc(p); if (l.data != null) cur.set(p, l); }
      const prev = this.last || new Map(), changes = [];
      for (const [p, l] of cur) {
        const o = prev.get(p);
        if (!o) changes.push({ type: 'added', p, l });
        else if (JSON.stringify(o.data) !== JSON.stringify(l.data) || o.pending !== l.pending) changes.push({ type: 'modified', p, l });
      }
      for (const [p, o] of prev) if (!cur.has(p)) changes.push({ type: 'removed', p, l: o });
      const pending = [...cur.values()].some((l) => l.pending);
      const metaChanged = !this.raised || this.lastFromCache !== this.fromCache || this.lastPending !== pending;
      const dataChanged = changes.some((c) => c.type !== 'modified' || JSON.stringify(prev.get(c.p).data) !== JSON.stringify(c.l.data));
      if (this.raised && !dataChanged && !(this.meta && metaChanged)) return;
      this.last = cur; this.raised = true; this.lastFromCache = this.fromCache; this.lastPending = pending;
      const fc = this.fromCache;
      const docs = [...cur].map(([p, l]) => mkDocSnap(p, l.data, l.pending, fc));
      const ch = changes.map((c) => ({ type: c.type, doc: mkDocSnap(c.p, c.l.data, c.l.pending, fc) }));
      try { this.next({ docs, size: docs.length, empty: !docs.length, metadata: { hasPendingWrites: pending, fromCache: fc }, docChanges: () => ch }); }
      catch (e) { console.error(e); }
    }
    stop() { this.dead = true; clearInterval(this.timer); listeners.delete(this); }
  }
  function emitAll() { for (const l of listeners) if (l.raised) l.raise(); }
  addEventListener('online', () => { pump(); for (const l of listeners) l.fetch(); });
  addEventListener('offline', () => { for (const l of listeners) if (!l.fromCache) { l.fromCache = true; l.raise(); } });

  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    collection: (name) => colRef(path + '/' + name),
    set: (data, opts) => write(path, { type: 'set', data: wireData(data), merge: !!(opts && opts.merge) }),
    update: (data) => write(path, { type: 'update', data: wireData(data) }),
    delete: () => write(path, { type: 'delete' }),
  });
  const colRef = (path, limit) => ({
    path,
    doc: (id) => docRef(path + '/' + id),
    limit: (n) => colRef(path, n),
    onSnapshot(opts, next, error) {
      if (typeof opts === 'function') { error = next; next = opts; opts = {}; }
      if (terminated) throw err('failed-precondition');
      const l = new Listener(path, opts, next, error || (() => {}));
      return () => l.stop();
    },
    async get(o) {
      if (o && o.source === 'server') {
        if (!net()) throw err('unavailable');
        const r = await server({ type: 'query', path, limit });
        for (const d of r.docs) cache.docs[path + '/' + d.id] = d.data; // the SDK keeps what it read
        save();
        return { docs: r.docs.map((d) => mkDocSnap(path + '/' + d.id, d.data, false, false)), empty: !r.docs.length, size: r.docs.length };
      }
      const docs = pathsUnder(path).map((p) => ({ p, l: localDoc(p) })).filter((x) => x.l.data != null).slice(0, limit || Infinity);
      return { docs: docs.map((x) => mkDocSnap(x.p, x.l.data, x.l.pending, true)), empty: !docs.length, size: docs.length };
    },
  });
  const db = {
    enablePersistence: async () => { cache = load(); setTimeout(pump, 0); },
    collection: (name) => colRef(name),
    waitForPendingWrites() {
      if (terminated) return Promise.reject(err('failed-precondition'));
      if (!cache.queue.length) return Promise.resolve();
      pump();
      return new Promise((r) => drainWaiters.push(r));
    },
    async terminate() { terminated = true; for (const l of [...listeners]) l.stop(); },
    async clearPersistence() { if (!terminated && listeners.size) throw err('failed-precondition'); lsSet(LS_CACHE, null); cache = { docs: {}, synced: {}, queue: [], nextBid: 1 }; },
  };
  const firestore = () => db;
  firestore.FieldValue = { delete: () => DEL };
  const authFn = () => auth;
  authFn.GoogleAuthProvider = GoogleAuthProvider;
  root.firebase = { initializeApp: () => ({}), auth: authFn, firestore };
  root.__fakeFirestore = { cache: () => cache, listeners: () => listeners.size };
})(typeof window !== 'undefined' ? window : globalThis);
