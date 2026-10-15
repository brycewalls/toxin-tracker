/* Botox Tracker core: data, store, UI kit, router.
   Every screen module registers itself with BT.screen(name, {title, render(root)}).
   Shared contract for all modules lives here; keep it stable. */
(function () {
  const BT = (window.BT = {});

  /* ---------- reference data ---------- */
  // Educational reference only. Duration values are typical published ranges, not advice.
  BT.products = [
    { id: 'botox', name: 'Botox', generic: 'onabotulinumtoxinA', maker: 'Allergan', vialUnits: 100, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#2F55E4' },
    { id: 'dysport', name: 'Dysport', generic: 'abobotulinumtoxinA', maker: 'Galderma', vialUnits: 300, ratio: 2.5, onsetDays: 2, peakDays: 14, wearWeeks: 14, color: '#7A5AF8' },
    { id: 'xeomin', name: 'Xeomin', generic: 'incobotulinumtoxinA', maker: 'Merz', vialUnits: 100, ratio: 1, onsetDays: 4, peakDays: 14, wearWeeks: 13, color: '#0E9384' },
    { id: 'jeuveau', name: 'Jeuveau', generic: 'prabotulinumtoxinA', maker: 'Evolus', vialUnits: 100, ratio: 1, onsetDays: 2, peakDays: 14, wearWeeks: 13, color: '#DD2590' },
    { id: 'daxxify', name: 'Daxxify', generic: 'daxibotulinumtoxinA', maker: 'Revance', vialUnits: 100, ratio: 2, onsetDays: 2, peakDays: 14, wearWeeks: 24, color: '#F79009' },
    { id: 'letybo', name: 'Letybo', generic: 'letibotulinumtoxinA', maker: 'Hugel', vialUnits: 50, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#155EEF', aka: 'Botulax in Korea' },
    // Korean toxins (#20). Unit ratio to Botox is about 1:1 for each; reference only.
    { id: 'botulax', origin: 'Korea', name: 'Botulax', generic: 'letibotulinumtoxinA', maker: 'Hugel', vialUnits: 100, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#0B8A6F', aka: 'Letybo in the US' },
    { id: 'nabota', origin: 'Korea', name: 'Nabota', generic: 'prabotulinumtoxinA', maker: 'Daewoong', vialUnits: 100, ratio: 1, onsetDays: 2, peakDays: 14, wearWeeks: 13, color: '#C11574', aka: 'Jeuveau in the US' },
    { id: 'meditoxin', origin: 'Korea', name: 'Meditoxin', generic: 'botulinum toxin type A', maker: 'Medytox', vialUnits: 100, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#4E5BA6', aka: 'Neuronox outside Korea' },
    { id: 'innotox', origin: 'Korea', name: 'Innotox', generic: 'botulinum toxin type A (liquid)', maker: 'Medytox', vialUnits: 50, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#6172F3', aka: 'Premixed liquid, no saline' },
    { id: 'coretox', origin: 'Korea', name: 'Coretox', generic: 'botulinum toxin type A', maker: 'Medytox', vialUnits: 100, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#3E4784' },
    { id: 'liztox', origin: 'Korea', name: 'Liztox (Hutox)', generic: 'botulinum toxin type A', maker: 'Huons', vialUnits: 100, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#93370D', aka: 'Sold as Hutox outside Korea' },
    { id: 'wondertox', origin: 'Korea', name: 'Wondertox', generic: 'botulinum toxin type A', maker: 'Chong Kun Dang', vialUnits: 100, ratio: 1, onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#B54708', aka: 'Made by Huons, 100U and 200U vials' },
  ];
  BT.products.forEach((p) => (p.origin ||= 'US'));
  const BASE_PRODUCTS = BT.products.slice();
  // Products the user created ("Other" in Add Vial) live in settings.customProducts and are merged in
  // place, so every module that reads BT.products sees them.
  BT.refreshProducts = () => {
    const custom = (BT.data && BT.data.settings && BT.data.settings.customProducts) || [];
    BT.products.splice(0, BT.products.length, ...BASE_PRODUCTS, ...custom.map((c) => ({ onsetDays: 3, peakDays: 14, wearWeeks: 13, color: '#667085', generic: 'botulinum toxin', ...c, origin: 'Custom' })));
  };
  BT.addCustomProduct = ({ name, maker, vialUnits, ratio }) => {
    const p = { id: 'c-' + BT.uid(), name: String(name).trim(), maker: String(maker || '').trim(), vialUnits: +vialUnits || 100, ratio: +ratio || 1 };
    BT.save('settings', { customProducts: [...(BT.data.settings.customProducts || []), p] });
    return BT.product(p.id);
  };
  BT.product = (id) => BT.products.find((p) => p.id === (id === 'hutox' ? 'liztox' : id)) || BT.products[0];

  // Treatable muscles. Injection points are freeform: each point is {id, siteId: muscleId, x, y, units}
  // where x,y are in the face drawing's viewBox (facemap.js) and siteId is the muscle the point landed on.
  // range = common Botox-equivalent units for that muscle on one side (or total for midline). Reference only.
  // side: 'l' | 'r' | 'c' (patient's left/right, or midline). treats = the concern people know it by.
  BT.muscles = [
    { id: 'frontalis-l', label: 'Left Frontalis', muscle: 'Frontalis', treats: 'Forehead lines', group: 'Upper face', side: 'l', range: [4, 10], points: '2 to 4', caution: 'Stay 1.5 to 2 cm above the brow to avoid brow drop.' },
    { id: 'frontalis-r', label: 'Right Frontalis', muscle: 'Frontalis', treats: 'Forehead lines', group: 'Upper face', side: 'r', range: [4, 10], points: '2 to 4', caution: 'Stay 1.5 to 2 cm above the brow to avoid brow drop.' },
    { id: 'procerus', label: 'Procerus', muscle: 'Procerus', treats: 'Horizontal line at the bridge (glabella)', group: 'Upper face', side: 'c', range: [4, 8], points: '1', caution: '' },
    { id: 'corrugator-l', label: 'Left Corrugator', muscle: 'Corrugator supercilii', treats: '11 lines (glabella)', group: 'Upper face', side: 'l', range: [4, 10], points: '1 to 2', caution: 'Keep 1 cm above the orbital rim at the midpupil line to avoid eyelid droop.' },
    { id: 'corrugator-r', label: 'Right Corrugator', muscle: 'Corrugator supercilii', treats: '11 lines (glabella)', group: 'Upper face', side: 'r', range: [4, 10], points: '1 to 2', caution: 'Keep 1 cm above the orbital rim at the midpupil line to avoid eyelid droop.' },
    { id: 'browtail-l', label: 'Left Brow Tail', muscle: 'Orbicularis oculi (superolateral)', treats: 'Brow lift', group: 'Upper face', side: 'l', range: [1, 4], points: '1 to 2', caution: '' },
    { id: 'browtail-r', label: 'Right Brow Tail', muscle: 'Orbicularis oculi (superolateral)', treats: 'Brow lift', group: 'Upper face', side: 'r', range: [1, 4], points: '1 to 2', caution: '' },
    { id: 'oculi-l', label: "Left Crow's Feet", muscle: 'Orbicularis oculi (lateral)', treats: "Crow's feet", group: 'Upper face', side: 'l', range: [6, 15], points: '2 to 4', caution: 'First point 1.5 to 2 cm outside the eye corner, 1 cm from the orbital rim. Too low can affect the smile.' },
    { id: 'oculi-r', label: "Right Crow's Feet", muscle: 'Orbicularis oculi (lateral)', treats: "Crow's feet", group: 'Upper face', side: 'r', range: [6, 15], points: '2 to 4', caution: 'First point 1.5 to 2 cm outside the eye corner, 1 cm from the orbital rim. Too low can affect the smile.' },
    { id: 'pretarsal-l', label: 'Left Under-Eye', muscle: 'Orbicularis oculi (pretarsal)', treats: 'Under-eye crepe, jelly roll', group: 'Upper face', side: 'l', range: [1, 2], points: '1', caution: 'Advanced. Can worsen under-eye bags.' },
    { id: 'pretarsal-r', label: 'Right Under-Eye', muscle: 'Orbicularis oculi (pretarsal)', treats: 'Under-eye crepe, jelly roll', group: 'Upper face', side: 'r', range: [1, 2], points: '1', caution: 'Advanced. Can worsen under-eye bags.' },
    { id: 'temporalis-l', label: 'Left Temporalis', muscle: 'Temporalis', treats: 'Clenching, tension headaches', group: 'Upper face', side: 'l', range: [10, 25], points: '3 to 4', caution: '' },
    { id: 'temporalis-r', label: 'Right Temporalis', muscle: 'Temporalis', treats: 'Clenching, tension headaches', group: 'Upper face', side: 'r', range: [10, 25], points: '3 to 4', caution: '' },
    { id: 'nasalis', label: 'Nasalis', muscle: 'Nasalis', treats: 'Bunny lines', group: 'Mid face', side: 'c', range: [2, 8], points: '1 per side', caution: 'Too low can affect the upper lip.' },
    { id: 'dsn', label: 'Depressor Septi', muscle: 'Depressor septi nasi', treats: 'Nasal tip droop on smiling', group: 'Mid face', side: 'c', range: [2, 4], points: '1', caution: '' },
    { id: 'llsan-l', label: 'Left Gummy Smile', muscle: 'Levator labii superioris alaeque nasi', treats: 'Gummy smile', group: 'Mid face', side: 'l', range: [1, 3], points: '1', caution: 'Small doses. Too much flattens the smile.' },
    { id: 'llsan-r', label: 'Right Gummy Smile', muscle: 'Levator labii superioris alaeque nasi', treats: 'Gummy smile', group: 'Mid face', side: 'r', range: [1, 3], points: '1', caution: 'Small doses. Too much flattens the smile.' },
    { id: 'oris', label: 'Lip Flip', muscle: 'Orbicularis oris', treats: 'Lip flip, smoker lines', group: 'Lower face', side: 'c', range: [4, 6], points: '4 to 6', caution: 'Very superficial. Can make straws and whistling harder for a few weeks.' },
    { id: 'dao-l', label: 'Left DAO', muscle: 'Depressor anguli oris', treats: 'Downturned mouth corners', group: 'Lower face', side: 'l', range: [1, 4], points: '1', caution: 'Too medial reaches the lower lip depressor.' },
    { id: 'dao-r', label: 'Right DAO', muscle: 'Depressor anguli oris', treats: 'Downturned mouth corners', group: 'Lower face', side: 'r', range: [1, 4], points: '1', caution: 'Too medial reaches the lower lip depressor.' },
    { id: 'mentalis', label: 'Mentalis', muscle: 'Mentalis', treats: 'Pebbled chin, mental crease', group: 'Lower face', side: 'c', range: [4, 10], points: '1 to 2', caution: '' },
    { id: 'masseter-l', label: 'Left Masseter', muscle: 'Masseter', treats: 'Jaw slimming, clenching', group: 'Lower face', side: 'l', range: [10, 30], points: '3 to 5', caution: 'Stay in the lower half and behind the front border to protect the smile.' },
    { id: 'masseter-r', label: 'Right Masseter', muscle: 'Masseter', treats: 'Jaw slimming, clenching', group: 'Lower face', side: 'r', range: [10, 30], points: '3 to 5', caution: 'Stay in the lower half and behind the front border to protect the smile.' },
    { id: 'platysma-l', label: 'Left Platysma', muscle: 'Platysma', treats: 'Neck bands, jawline', group: 'Neck', side: 'l', range: [8, 18], points: '4 to 9', caution: 'Large doses can affect swallowing.' },
    { id: 'platysma-r', label: 'Right Platysma', muscle: 'Platysma', treats: 'Neck bands, jawline', group: 'Neck', side: 'r', range: [8, 18], points: '4 to 9', caution: 'Large doses can affect swallowing.' },
  ];
  // Muscles usually avoided. Shown as caution zones on the face map.
  BT.cautionZones = [
    { id: 'zygomaticus', label: 'Zygomaticus', note: 'Lifts the smile. Toxin here can cause a lopsided smile.' },
    { id: 'levator-palpebrae', label: 'Upper eyelid', note: 'Toxin spreading here can cause eyelid droop.' },
    { id: 'risorius', label: 'Risorius', note: 'Widens the smile. Usually avoided.' },
  ];
  BT.sites = BT.muscles; // older modules read BT.sites
  // Ids from the first prototype, kept so older records still resolve.
  const ALIAS = { frontalis: 'frontalis-l', glabella: 'procerus', 'brow-l': 'browtail-l', 'brow-r': 'browtail-r', 'crows-l': 'oculi-l', 'crows-r': 'oculi-r', bunny: 'nasalis', lipflip: 'oris', gummy: 'llsan-l', platysma: 'platysma-l' };
  BT.site = (id) => BT.muscles.find((s) => s.id === (ALIAS[id] || id)) || { id, label: id || 'General', muscle: '', treats: '', range: [0, 0], side: 'c' };
  BT.muscle = BT.site;
  // Group an injection's points by muscle: [{muscle, units, points:[...]}]
  BT.byMuscle = (inj) => {
    const m = new Map();
    (inj.sites || []).forEach((p) => { const k = BT.site(p.siteId).id; const e = m.get(k) || { muscle: BT.site(k), units: 0, points: [] }; e.units += +p.units || 0; e.points.push(p); m.set(k, e); });
    return [...m.values()];
  };

  // Aftercare windows, counted from the injection time.
  BT.aftercare = [
    { id: 'upright', label: 'Stay upright', detail: 'No lying down or bending over', hours: 4, icon: 'person' },
    { id: 'touch', label: 'Hands off', detail: 'No rubbing, massage, or facials', hours: 24, icon: 'hand' },
    { id: 'exercise', label: 'Exercise', detail: 'No strenuous workouts or hot yoga', hours: 24, icon: 'run' },
    { id: 'heat', label: 'Heat & sauna', detail: 'Skip saunas, steam, and hot tubs', hours: 24, icon: 'flame' },
    { id: 'alcohol', label: 'Alcohol', detail: 'Can increase bruising', hours: 24, icon: 'glass' },
  ];

  BT.reactionKinds = ['Bruising', 'Swelling', 'Redness', 'Headache', 'Tenderness', 'Brow heaviness', 'Eyelid droop', 'Asymmetry', 'Flu-like', 'Other'];

  /* ---------- helpers ---------- */
  BT.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  BT.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  BT.$ = (sel, root = document) => root.querySelector(sel);
  BT.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  BT.h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  BT.HOUR = 3600e3; BT.DAY = 86400e3;
  BT.fmt = {
    date: (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    dateLong: (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    weekday: (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short' }),
    time: (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    ago: (t) => {
      const d = Date.now() - t, m = Math.round(d / 60e3);
      if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
      const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
      const days = Math.round(h / 24); if (days < 14) return days + 'd ago';
      return Math.round(days / 7) + 'w ago';
    },
    countdown: (ms) => {
      if (ms <= 0) return 'Clear';
      const h = Math.floor(ms / BT.HOUR), m = Math.floor((ms % BT.HOUR) / 60e3), s = Math.floor((ms % 60e3) / 1e3);
      return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
    },
    units: (n) => (Math.round(n * 10) / 10) + 'U',
  };
  BT.toLocalInput = (t) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  /* ---------- derived data ---------- */
  BT.injectionUnits = (inj) => (inj.sites || []).reduce((a, s) => a + (+s.units || 0), 0);
  BT.sortedInjections = () => [...BT.data.injections].sort((a, b) => b.at - a.at);
  BT.lastInjection = () => BT.sortedInjections().find((i) => !i.touchUpOf) || null; // touch-ups (#18) never reset the countdown
  BT.vialRemaining = (v) => Math.max(0, (v.unitsTotal || 0) - BT.data.injections.filter((i) => i.vialId === v.id).reduce((a, i) => a + BT.injectionUnits(i), 0));
  // Relative effect 0..1 for an injection at time t (simple onset ramp, plateau, linear wear-off). Illustrative only.
  BT.effectAt = (inj, t) => {
    const p = BT.product(inj.productId), d = (t - inj.at) / BT.DAY, wear = p.wearWeeks * 7;
    if (d < 0) return 0;
    if (d < p.peakDays) return Math.min(1, d / p.peakDays) ** 0.7;
    if (d < wear * 0.55) return 1;
    return Math.max(0, 1 - (d - wear * 0.55) / (wear * 0.45));
  };
  BT.nextDue = () => { const l = BT.lastInjection(); return l ? l.at + (BT.data.settings.intervalWeeks || 12) * 7 * BT.DAY : null; };

  /* ---------- store ----------
     BT.data = { injections, vials, reactions, photos, moods, settings }
     The hosted app keeps records in Firestore users/{uid}/records (app/cloud.js); app/preview.html keeps them in
     localStorage. API: BT.save(kind, record, {replaces}) upserts and returns record; BT.remove(kind, id);
     BT.on('change', fn); BT.unsaved() lists changes the server refused.
     Hosted writes (#57, #58, #66): each change is one WriteBatch of the record, sealed on the phone ({v, iv, ct}),
     plus an append-only audit entry {kind, recordId, action, at} that never holds record contents. Batches are
     issued in order but never awaited for the UI, because offline a commit resolves only when the connection
     returns; Firestore's cache has the change at once. Each commit's promise is still tracked: a refusal by the
     rules shows an error and keeps the record on screen marked Not saved, with Retry and Discard. */
  const KINDS = ['injections', 'vials', 'reactions', 'photos', 'moods'];
  BT.data = { injections: [], vials: [], reactions: [], photos: [], moods: [], settings: { intervalWeeks: 12, name: '' } };
  const listeners = {};
  BT.on = (ev, fn) => ((listeners[ev] ||= []).push(fn), () => (listeners[ev] = listeners[ev].filter((f) => f !== fn)));
  BT.emit = (ev, arg) => (listeners[ev] || []).forEach((f) => { try { f(arg); } catch (e) { console.error(e); } });

  let col = null; // db collection for this user, or null
  let cloud = null; // hosted app: {db, audit, device, seal, open, isSealed} from BT_CLOUD.ready
  let stopped = false, unsub = null;
  const LS = 'bt-v1';
  // The hosted app keeps no localStorage copy: Firestore's own offline cache covers it, and a
  // shared device must never carry one account's log into another's.
  const lsWrite = () => { if (window.BT_CLOUD) return; try { localStorage.setItem(LS, JSON.stringify(BT.data)); } catch (e) {} };
  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } };
  const docId = (kind, id) => kind + '__' + id;
  const SETTINGS = docId('settings', 'settings');

  const inflight = new Map(); // docId -> commits not settled yet; the listener leaves these documents alone
  const failed = new Map(); // docId -> {kind, id, op: 'save' | 'delete'}: refused by the server, kept on screen
  const confirmed = new Map(); // docId -> {updatedAt, by}: the last version the server confirmed (the stale check's base)
  const mineIv = new Map(); // docId -> iv of this device's latest sealed write, so its own echo is not decrypted again
  const dirty = new Set(); // settings fields changed here since the server last confirmed settings
  let queue = Promise.resolve();
  const unsavedMark = (rec, on) => { if (rec && typeof rec === 'object') Object.defineProperty(rec, '_unsaved', { value: on, configurable: true, enumerable: false, writable: true }); };

  BT.save = (kind, rec, opts = {}) => {
    rec.id ||= BT.uid();
    rec.updatedAt = Date.now();
    if (kind === 'settings') {
      Object.keys(rec).forEach((k) => k !== 'id' && k !== 'updatedAt' && dirty.add(k));
      const action = confirmed.has(SETTINGS) || failed.has(SETTINGS) ? 'update' : 'create';
      BT.data.settings = { ...BT.data.settings, ...rec };
      persist([{ kind: 'settings', id: 'settings', rec: BT.data.settings, action }]);
      BT.refreshProducts();
    } else {
      const arr = BT.data[kind], i = arr.findIndex((r) => r.id === rec.id);
      const action = i >= 0 ? 'update' : 'create';
      i >= 0 ? (arr[i] = rec) : arr.push(rec);
      const ops = [{ kind, id: rec.id, rec, action }];
      // Replacing (a new photo for an old one): both in one commit, so the old one is never gone without the new.
      if (opts.replaces && opts.replaces !== rec.id) {
        const j = arr.findIndex((r) => r.id === opts.replaces);
        if (j >= 0) { arr.splice(j, 1); ops.push({ kind, id: opts.replaces, del: true, action: 'delete' }); }
      }
      persist(ops);
    }
    BT.emit('change', kind);
    return rec;
  };
  BT.remove = (kind, id) => {
    BT.data[kind] = BT.data[kind].filter((r) => r.id !== id);
    if (cloud) {
      const d = docId(kind, id);
      // Never reached the server (a refused create): removing it here is the whole job.
      if (failed.has(d) && !confirmed.has(d)) { failed.delete(d); renderUnsaved(); }
      else persist([{ kind, id, del: true, action: 'delete' }]);
    } else {
      lsWrite();
      if (col) col.doc(docId(kind, id)).delete().catch(writeFailed);
    }
    BT.emit('change', kind);
  };

  // One commit for a list of ops. The claude.ai db path (retired) and preview.html write as before.
  function persist(ops, extra = {}) {
    lsWrite();
    if (!col || stopped) return;
    if (!cloud) {
      ops.forEach((o) => (o.del ? col.doc(docId(o.kind, o.id)).delete() : col.doc(docId(o.kind, o.id)).set({ kind: o.kind, rec: JSON.parse(JSON.stringify(o.rec)) })).catch(writeFailed));
      return;
    }
    const ids = ops.map((o) => docId(o.kind, o.id));
    ids.forEach((d) => { inflight.set(d, (inflight.get(d) || 0) + 1); if (failed.has(d)) { failed.delete(d); unsavedMark(findRec(d), false); } });
    renderUnsaved();
    // Plain copies now: the record may change again before this one is sealed.
    const plain = ops.map((o) => (o.del ? null : JSON.parse(JSON.stringify(o.rec))));
    const step = queue.then(async () => {
      if (stopped) return null;
      const FV = firebase.firestore.FieldValue, b = cloud.db.batch();
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i], d = ids[i], aref = cloud.audit.doc(), ref = col.doc(d);
        const entry = { kind: o.kind, recordId: o.id, action: o.action, at: FV.serverTimestamp() };
        if (extra.conflict) entry.conflict = true;
        if (o.del) b.delete(ref);
        else {
          const rec = await cloud.seal(d, plain[i]);
          const base = confirmed.has(d) ? confirmed.get(d).updatedAt || null : null;
          b.set(ref, { kind: o.kind, rec, updatedAt: FV.serverTimestamp(), base, by: cloud.device, aid: aref.id });
          mineIv.set(d, rec.iv);
        }
        b.set(aref, entry);
      }
      return { commit: b.commit() }; // wrapped, so the queue waits for sealing only, never for the server
    });
    queue = step.then(() => {}, () => {});
    step.then((r) => r && r.commit).then(
      () => settle(ids, null),
      (e) => settle(ids, e, ops, extra));
  }
  // Only a refusal is a real failure. 'unavailable' is a dropped connection (Firestore retries) and
  // 'failed-precondition' / 'cancelled' cover writes cut off by sign-out's wipe. Logs the error code only, never the record.
  const ignorable = (code) => code === 'unavailable' || code === 'failed-precondition' || code === 'cancelled' || stopped || (window.BT_CLOUD && BT_CLOUD.signingOut);
  function writeFailed(e) {
    const code = (e && e.code) || 'unknown';
    console.warn('db write failed:', code);
    if (ignorable(code)) return;
    BT.toast(code === 'permission-denied' ? 'Could not save. This account does not have access.' : 'Could not save that change. Try again.');
  }
  async function settle(ids, err, ops, extra = {}) {
    ids.forEach((d) => { const n = (inflight.get(d) || 1) - 1; n ? inflight.set(d, n) : inflight.delete(d); });
    if (!err) {
      if (ids.includes(SETTINGS) && !inflight.has(SETTINGS)) dirty.clear();
      // The listener skipped these documents while the commit was open; catch up with what the cache holds now.
      for (const d of ids) if (!inflight.has(d) && !failed.has(d)) await resync(d);
      return;
    }
    const code = (err && err.code) || (err && err.name) || 'unknown';
    console.warn('db write refused:', code);
    if (ignorable(code)) return;
    // Settings are one document both devices touch: merge this device's changed fields onto the server copy and
    // try once more before calling it a failure.
    if (ids.length === 1 && ids[0] === SETTINGS && !extra.retried && !inflight.has(SETTINGS)) {
      const server = await cachedPlain(SETTINGS);
      const mine = {}; dirty.forEach((k) => (mine[k] = BT.data.settings[k]));
      BT.data.settings = { ...BT.data.settings, ...(server || {}), ...mine };
      BT.refreshProducts(); BT.emit('change', 'sync');
      return persist([{ kind: 'settings', id: 'settings', rec: BT.data.settings, action: server ? 'update' : 'create' }], { retried: true, conflict: true });
    }
    let saves = 0, dels = 0;
    for (const o of ops) {
      const d = docId(o.kind, o.id);
      if (inflight.has(d)) continue; // a newer write for the same record is on its way
      if (o.del) {
        // The record is still on the server (the cache now holds it again): put it back on screen.
        const back = await cachedPlain(d);
        if (!back) continue; // already gone
        restore(o.kind, back);
        failed.set(d, { kind: o.kind, id: o.id, op: 'delete' });
        dels++;
      } else {
        failed.set(d, { kind: o.kind, id: o.id, op: 'save' });
        unsavedMark(findRec(d), true);
        saves++;
      }
    }
    if (!saves && !dels) return;
    BT.toast(saves ? 'Not saved. The server refused this change. Tap Retry at the top.' : 'Could not delete that. It is still saved. Tap Retry at the top.');
    renderUnsaved();
    BT.emit('change', 'sync');
  }
  function findRec(d) {
    if (d === SETTINGS) return BT.data.settings;
    const [kind, ...rest] = d.split('__'), id = rest.join('__');
    return (BT.data[kind] || []).find((r) => r.id === id) || null;
  }
  function restore(kind, rec) {
    if (kind === 'settings') { BT.data.settings = { ...BT.data.settings, ...rec }; BT.refreshProducts(); return; }
    const arr = BT.data[kind], i = arr.findIndex((r) => r.id === rec.id);
    i >= 0 ? (arr[i] = rec) : arr.push(rec);
  }
  // The decrypted record in this device's Firestore cache, or null.
  async function cachedPlain(d) {
    try {
      const s = await col.doc(d).get({ source: 'cache' });
      if (!s.exists) return null;
      const v = s.data();
      return v && v.rec ? await openRec(d, v.rec) : null;
    } catch (e) { return null; }
  }
  async function resync(d) {
    try {
      const s = await col.doc(d).get({ source: 'cache' });
      if (await applyItem({ type: s.exists ? 'modified' : 'removed', id: d, data: s.exists ? s.data() : null, pending: s.metadata && s.metadata.hasPendingWrites })) BT.emit('change', 'sync');
    } catch (e) {}
  }

  // Changes the server refused, for the Not saved bar: [{kind, id, op}].
  BT.unsaved = () => [...failed.values()];
  BT.retryUnsaved = () => {
    const list = [...failed.values()];
    list.forEach((f) => {
      const d = docId(f.kind, f.id), c = confirmed.get(d);
      // Retry is the person choosing this device's version, so it builds on whatever the server has now.
      const conflict = !!(c && c.by && c.by !== cloud.device);
      if (f.op === 'delete') { BT.data[f.kind] = BT.data[f.kind].filter((r) => r.id !== f.id); persist([{ kind: f.kind, id: f.id, del: true, action: 'delete' }], { conflict }); }
      else {
        const rec = findRec(d);
        if (!rec) { failed.delete(d); return; }
        persist([{ kind: f.kind, id: f.id, rec, action: confirmed.has(d) ? 'update' : 'create' }], { conflict });
      }
    });
    BT.emit('change', 'sync');
  };
  BT.discardUnsaved = async () => {
    const list = [...failed.entries()];
    failed.clear();
    for (const [d, f] of list) {
      const server = await cachedPlain(d);
      if (f.kind === 'settings') { dirty.clear(); if (server) { BT.data.settings = { ...BT.data.settings, ...server }; BT.refreshProducts(); } continue; }
      BT.data[f.kind] = BT.data[f.kind].filter((r) => r.id !== f.id);
      if (server) BT.data[f.kind].push(server);
    }
    renderUnsaved();
    BT.emit('change', 'sync');
  };
  const NAMES = { injections: ['treatment', 'treatments'], vials: ['vial', 'vials'], reactions: ['reaction', 'reactions'], photos: ['photo', 'photos'], moods: ['check-in', 'check-ins'], settings: ['setting', 'settings'] };
  let bar = null;
  function renderUnsaved() {
    const list = BT.unsaved();
    if (!list.length) { if (bar) { bar.remove(); bar = null; } return; }
    if (!document.getElementById('bt-unsaved-css')) {
      const st = document.createElement('style'); st.id = 'bt-unsaved-css';
      st.textContent = `.bt-unsaved { position: fixed; z-index: 90; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 10px); width: min(448px, calc(100% - 32px));
        display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: 16px; background: var(--card, #fff); color: var(--fg, #111);
        border: 1px solid color-mix(in srgb, var(--red, #D93A3A) 45%, transparent); box-shadow: var(--shadow, 0 8px 24px rgba(0,0,0,.15)); font-size: 13.5px; line-height: 1.35; }
        .bt-unsaved .ic { color: var(--red, #D93A3A); flex: none; } .bt-unsaved span { flex: 1; min-width: 0; }
        .bt-unsaved button { min-height: 36px; padding: 0 12px; border-radius: 99px; font-weight: 500; font-size: 13.5px; }
        .bt-unsaved [data-retry] { background: var(--accent, #2F55E4); color: var(--accent-ink, #fff); } .bt-unsaved [data-discard] { background: transparent; color: inherit; }`;
      document.head.appendChild(st);
    }
    const counts = {};
    list.forEach((f) => (counts[f.kind] = (counts[f.kind] || 0) + 1));
    const what = Object.entries(counts).map(([k, n]) => `${n} ${NAMES[k][n === 1 ? 0 : 1]}`).join(', ');
    const dels = list.every((f) => f.op === 'delete');
    if (!bar) {
      bar = BT.h(`<div class="bt-unsaved" role="alert">${BT.icon('alert', 18)}<span data-t></span><button type="button" data-discard>Discard</button><button type="button" data-retry>Retry</button></div>`);
      bar.querySelector('[data-retry]').onclick = () => BT.retryUnsaved();
      bar.querySelector('[data-discard]').onclick = () => BT.discardUnsaved();
      document.body.appendChild(bar);
    }
    bar.querySelector('[data-t]').textContent = dels ? `Not deleted: ${what}. It is still saved.` : `Not saved: ${what}. It may have changed on another device.`;
    bar.querySelector('[data-discard]').textContent = dels ? 'Keep' : 'Discard';
  }

  BT.storage = 'device';
  // Load every record of one user's collection into BT.data (claude.ai db path).
  const loadAll = (snap) => {
    const fresh = { injections: [], vials: [], reactions: [], photos: [], moods: [] };
    snap.docs.forEach((d) => { const v = d.data(); if (!v) return; if (v.kind === 'settings') BT.data.settings = { ...BT.data.settings, ...v.rec }; else if (fresh[v.kind]) fresh[v.kind].push(v.rec); });
    Object.assign(BT.data, fresh);
  };
  /* Live sync (#52). One onSnapshot listener on the records collection does the first load and then keeps
     BT.data current: the other device's edits, and the server's copy once offline changes sync, appear
     without a reload. With persistence on, the first snapshot comes from the offline cache at once, so an
     offline launch does not wait for get()'s server timeout. Each later snapshot merges only docChanges()
     and emits 'change' only when a record really differs, so this phone's own writes (already in BT.data)
     and metadata-only snapshots cost no render. The change listener in index.html defers renders while a
     sheet is open. BT.sync = {pending, fromCache} comes from snapshot metadata; 'status' fires when it moves.
     Records arrive sealed (#66): each snapshot's records are decrypted in parallel, and snapshots are applied in
     order. Records still in plain form (from before #66, or from a device on an older build) are read as they
     are and encrypted in place by migrate(). */
  BT.sync = { pending: false, fromCache: false, live: false };
  const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => ((o[key] = x[key]), o), {}) : x));
  const same = (a, b) => !!a && !!b && (a.updatedAt && a.updatedAt === b.updatedAt ? true : stable(a) === stable(b));
  let openFails = 0;
  const openRec = async (d, rec) => (cloud && cloud.isSealed(rec) ? cloud.open(d, rec) : rec);
  const plainSeen = new Set(); // documents still in plain form, for migrate()
  // One document change into BT.data. Returns true when something on screen changed.
  async function applyItem(it) {
    const d = it.id, [kind] = d.split('__');
    if (!it.pending) {
      if (it.type === 'removed' || !it.data) confirmed.delete(d);
      else confirmed.set(d, { updatedAt: it.data.updatedAt || null, by: it.data.by || null });
    }
    if (it.pending || inflight.has(d) || failed.has(d)) return false; // this device's version wins until it settles
    const v = it.type === 'removed' ? null : it.data;
    if (v && v.rec && cloud && cloud.isSealed(v.rec) && mineIv.get(d) === v.rec.iv) return false; // our own write, confirmed
    let rec = null;
    if (v && v.rec) {
      try { rec = await openRec(d, v.rec); } catch (e) { openFails++; return false; }
      if (cloud && !cloud.isSealed(v.rec)) plainSeen.add(d); else plainSeen.delete(d);
    }
    if (kind === 'settings') {
      if (!rec) return false;
      const next = { ...BT.data.settings, ...rec };
      if (stable(next) === stable(BT.data.settings)) return false;
      BT.data.settings = next; BT.refreshProducts(); return true;
    }
    const k = (v && v.kind) || kind;
    if (!KINDS.includes(k)) return false;
    const id = d.slice(k.length + 2);
    const arr = BT.data[k], i = arr.findIndex((r) => r.id === ((rec && rec.id) || id));
    if (!v) { if (i < 0) return false; arr.splice(i, 1); return true; }
    if (!rec) return false;
    if (i >= 0) { if (same(arr[i], rec)) return false; arr[i] = rec; } else arr.push(rec);
    return true;
  }
  function listen() {
    return new Promise((resolve) => {
      let first = true, seen = false, chain = Promise.resolve();
      const done = () => { if (first) { first = false; resolve(); } };
      unsub = col.onSnapshot({ includeMetadataChanges: true }, (snap) => {
        const initial = !seen;
        seen = true;
        // Captured now; applied in order once decrypted.
        const items = (initial ? snap.docs.map((doc) => ({ type: 'added', doc })) : snap.docChanges())
          .map((ch) => ({ type: ch.type, id: ch.doc.id, pending: ch.doc.metadata.hasPendingWrites, data: ch.type === 'removed' ? null : ch.doc.data() }));
        chain = chain.then(async () => {
          if (stopped) return;
          if (initial) {
            // First load: everything in the cache, this device's queued changes included.
            const fresh = { injections: [], vials: [], reactions: [], photos: [], moods: [] };
            const opened = await Promise.all(items.map(async (it) => {
              if (!it.pending && it.data) confirmed.set(it.id, { updatedAt: it.data.updatedAt || null, by: it.data.by || null });
              if (!it.data || !it.data.rec) return null;
              if (cloud && !cloud.isSealed(it.data.rec) && !it.pending) plainSeen.add(it.id);
              try { return { it, rec: await openRec(it.id, it.data.rec) }; } catch (e) { openFails++; return null; }
            }));
            opened.forEach((o) => {
              if (!o) return;
              if (o.it.data.kind === 'settings') BT.data.settings = { ...BT.data.settings, ...o.rec };
              else if (fresh[o.it.data.kind]) fresh[o.it.data.kind].push(o.rec);
            });
            Object.assign(BT.data, fresh);
            done();
          } else {
            const results = await Promise.all(items.map((it) => applyItem(it)));
            if (results.some(Boolean)) BT.emit('change', 'sync');
          }
          if (openFails) { console.warn('records not decrypted:', openFails); BT.toast('Some records could not be unlocked on this device.'); openFails = 0; }
          if (plainSeen.size) migrate();
        });
        const m = snap.metadata, next = { pending: !!m.hasPendingWrites, fromCache: !!m.fromCache, live: true };
        if (next.pending !== BT.sync.pending || next.fromCache !== BT.sync.fromCache || !BT.sync.live) { BT.sync = next; BT.emit('status', BT.sync); }
      }, (e) => {
        console.warn('records listener stopped:', (e && e.code) || 'unknown');
        // Access removed in the rules while signed in (#53): sign out and clear this device's copy.
        if (e && e.code === 'permission-denied' && window.BT_CLOUD && BT_CLOUD.denyAccess) { BT_CLOUD.denyAccess(); return; }
        if (!(window.BT_CLOUD && BT_CLOUD.signingOut)) BT.toast('Could not load your log. Check your connection.');
        done();
      });
    });
  }
  // Encrypt in place every record still stored in plain form (#66), a few per commit with their audit entries.
  // Runs after the first load and whenever a plain record shows up (a device still on an older build).
  let migrating = false;
  async function migrate() {
    if (migrating || !cloud || stopped) return;
    migrating = true;
    try {
      while (plainSeen.size && !stopped) {
        const ids = [...plainSeen].filter((d) => !inflight.has(d) && !failed.has(d)).slice(0, 5);
        if (!ids.length) break;
        const ops = [];
        for (const d of ids) {
          plainSeen.delete(d);
          const [kind] = d.split('__'), rec = findRec(d);
          if (rec) ops.push({ kind, id: kind === 'settings' ? 'settings' : d.slice(kind.length + 2), rec, action: 'update' });
        }
        if (ops.length) persist(ops);
        await queue;
      }
    } finally { migrating = false; }
  }
  BT.stopSync = () => { stopped = true; if (unsub) { try { unsub(); } catch (e) {} unsub = null; } };

  BT.init = async function () {
    // Hosted web app: Firebase Auth + Firestore users/{uid}/records (app/cloud.js).
    if (window.BT_CLOUD) {
      const c = await window.BT_CLOUD.ready;
      col = c.col; cloud = c; BT.account = c.user; BT.storage = 'firebase';
      await listen();
      BT.refreshProducts();
      BT.emit('change', 'all');
      return;
    }
    const local = lsRead();
    if (local) Object.assign(BT.data, local);
    try {
      const [db, user] = await Promise.all([window.claude?.use?.('db'), window.claude?.use?.('user')]);
      const uid = db && user ? await user.id() : null;
      if (db && uid) {
        col = db.collection('data/users/' + uid);
        const snap = await col.get();
        if (!snap.empty) {
          loadAll(snap); lsWrite();
        } else if (local) {
          // first sign-in on this device: push local records up
          for (const k of KINDS) for (const r of BT.data[k]) persist([{ kind: k, id: r.id, rec: r }]);
          persist([{ kind: 'settings', id: 'settings', rec: BT.data.settings }]);
        }
        BT.storage = 'cloud';
      }
    } catch (e) { console.warn('db unavailable', e); }
    BT.refreshProducts();
    BT.emit('change', 'all');
  };

  /* ---------- photos ----------
     BT.photo.pick({capture}) -> Promise<File|null>; BT.photo.store(file) -> Promise<src string>
     Uses the assets capability when granted, else a downscaled JPEG data URL (always on the
     hosted app, where the photo lives inside its Firestore record; Storage needs the Blaze plan). */
  BT.photo = {
    pick({ capture } = {}) {
      return new Promise((res) => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        if (capture) inp.setAttribute('capture', capture === true ? 'user' : capture);
        inp.onchange = () => res(inp.files[0] || null);
        inp.click();
      });
    },
    async downscale(file, max = 900) {
      const url = URL.createObjectURL(file);
      const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; });
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      return c;
    },
    async store(file) {
      const canvas = await this.downscale(file, 1400);
      try {
        const assets = window.BT_CLOUD ? null : await window.claude?.use?.('assets');
        if (assets) {
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
          const up = await assets.upload(blob);
          return up.url;
        }
      } catch (e) { console.warn('asset upload failed', e); }
      const small = await this.downscale(file, 720);
      return small.toDataURL('image/jpeg', 0.72);
    },
  };

  /* ---------- icons (thin outline, 24 grid) ---------- */
  const P = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    face: 'M12 3c-4 0-7 3.2-7 8 0 5 3.4 10 7 10s7-5 7-10c0-4.8-3-8-7-8zM9 10.5h.01M15 10.5h.01M9.5 15.5c1.4 1 3.6 1 5 0',
    plus: 'M12 5v14M5 12h14',
    box: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7',
    check: 'M5 12.5 10 17l9-10',
    chevron: 'm9 6 6 6-6 6',
    back: 'm15 6-6 6 6 6',
    close: 'M6 6l12 12M18 6 6 18',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8.5h.01',
    syringe: 'm18 2 4 4M17 7l3-3M19 9 9 19l-4 1 1-4L16 6zM12 9l3 3M9 12l3 3M2 22l4-4',
    vial: 'M9 3h6M10 3v4l-3 4v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-9l-3-4V3M7 14h10',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    run: 'M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 21l3-6 3 2v5M6 12l3-4 4 1 3 4 3 1M10 15l1-6',
    person: 'M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 9v7M8 22l4-6 4 6M7 12h10',
    hand: 'M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.6 16a1.5 1.5 0 0 1 2.3-2L8 16',
    flame: 'M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7-.4 2-1.5 3-2.5 3 0-3-1-6-4-9 0 4-5 6.5-5 13 0 4.3 3.6 7 8 7z',
    glass: 'M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v7M8 21h8',
    calc: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 6h8v3H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01',
    dots: 'M12 6h.01M12 12h.01M12 18h.01',
    trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
    calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
    drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
    compare: 'M12 3v18M4 6h5v12H4zM15 6h5v12h-5z',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    flip: 'M7 4 3 8l4 4M3 8h13a5 5 0 0 1 0 10h-3',
    // Academy (#69)
    cap: 'M2 9.5 12 5l10 4.5L12 14zM6 11.5V16c3.5 2.5 8.5 2.5 12 0v-4.5M22 9.5V15',
    book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7h8',
    award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.6 13.9 7 22l5-3 5 3-1.6-8.1',
    lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 16 16',
    play: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5v7l6-3.5z',
    doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  };
  BT.icon = (name, size = 20, cls = '') => `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || P.info}"/></svg>`;
  // Mood faces 1..5 (1 = rough, 5 = great)
  BT.moodFace = (score, size = 22) => {
    const mouth = ['M8.5 16.5c1.5-2 5.5-2 7 0', 'M8.5 16c1.5-1 5.5-1 7 0', 'M9 15.5h6', 'M8.5 14.5c1.5 1.3 5.5 1.3 7 0', 'M8 14c1.5 2.2 6.5 2.2 8 0'][Math.max(0, Math.min(4, score - 1))];
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="${mouth}"/></svg>`;
  };

  /* ---------- UI kit ----------
     Markup classes (styled in index.html): .card .card-h .eyebrow .pill(.green .blue .amber .red .grey) .seg>.seg-b(.on)
     .row .btn(.primary .ghost .danger .sm) .field>label+input .chips>.chip(.on) .list>.li .stat-ring .empty
     JS helpers below. */
  BT.toast = (msg) => {
    const el = BT.h(`<div class="toast" role="status">${BT.esc(msg)}</div>`);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, 2200);
  };
  BT.sheetOpen = () => !!document.querySelector('.sheet-wrap:not([data-closing])');
  BT.flushAfterSheet = () => { if (BT._stale && !BT.sheetOpen()) { BT._stale = false; BT.render(); } };
  // Bottom sheet. Returns {el, body, close}. opts: {title, action:{label, onClick}} ; onClose callback.
  BT.sheet = (opts = {}) => {
    const wrap = BT.h(`<div class="sheet-wrap"><div class="sheet-scrim"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${BT.esc(opts.title || '')}">
      <div class="sheet-grab"></div>
      <header class="sheet-h"><button class="icon-btn" data-x aria-label="Close">${BT.icon('close')}</button><h2>${BT.esc(opts.title || '')}</h2>${opts.action ? `<button class="link-btn" data-act>${BT.esc(opts.action.label)}</button>` : '<span style="width:36px"></span>'}</header>
      <div class="sheet-b"></div></section></div>`);
    document.body.appendChild(wrap);
    // A closing wrap stays in the DOM for its 280ms animation but no longer counts as open. If a change
    // landed while any sheet was open, the screen under it is stale: render once the last sheet is closing.
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.dataset.closing = '1'; wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 280);
      opts.onClose && opts.onClose();
      BT.flushAfterSheet();
    };
    wrap.querySelector('[data-x]').onclick = close;
    wrap.querySelector('.sheet-scrim').onclick = close;
    if (opts.action) wrap.querySelector('[data-act]').onclick = () => opts.action.onClick(close);
    requestAnimationFrame(() => wrap.classList.add('in'));
    return { el: wrap, body: wrap.querySelector('.sheet-b'), close };
  };
  // In-page confirm (window.confirm is disabled in artifacts). Resolves true/false.
  BT.confirm = (msg, okLabel = 'Delete') => new Promise((res) => {
    const s = BT.sheet({ title: 'Are you sure?', onClose: () => res(false) });
    s.body.innerHTML = `<p class="muted" style="margin:0 0 20px">${BT.esc(msg)}</p><div class="row gap"><button class="btn ghost grow" data-n>Cancel</button><button class="btn danger grow" data-y>${BT.esc(okLabel)}</button></div>`;
    s.body.querySelector('[data-n]').onclick = () => s.close();
    s.body.querySelector('[data-y]').onclick = () => { res(true); s.el.remove(); };
  });
  // Segmented control: BT.seg(['Front','Left'], 'Front', onChange) -> element
  BT.seg = (options, value, onChange) => {
    const el = BT.h(`<div class="seg" role="tablist">${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<button class="seg-b ${v === value ? 'on' : ''}" data-v="${BT.esc(v)}" role="tab">${BT.esc(l)}</button>`; }).join('')}</div>`);
    el.onclick = (e) => { const b = e.target.closest('.seg-b'); if (!b) return; BT.$$('.seg-b', el).forEach((x) => x.classList.toggle('on', x === b)); onChange && onChange(b.dataset.v); };
    return el;
  };
  // Sparkline/area chart SVG string. points: [{x, y}] in data space.
  BT.areaChart = (points, { w = 160, h = 64, color = 'var(--accent)', yMax, dot = true } = {}) => {
    if (!points.length) return '';
    const xs = points.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs) || 1;
    const ym = yMax ?? Math.max(...points.map((p) => p.y), 1);
    const sx = (x) => ((x - x0) / (x1 - x0 || 1)) * (w - 8) + 4, sy = (y) => h - 6 - (y / ym) * (h - 14);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const id = 'g' + BT.uid();
    const last = points[points.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" class="area"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${sx(last.x)},${h} L${sx(points[0].x)},${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
      ${dot ? `<circle cx="${sx(last.x)}" cy="${sy(last.y)}" r="3.5" fill="${color}" stroke="var(--card)" stroke-width="2"/>` : ''}</svg>`;
  };

  /* ---------- router ----------
     Tabs: today, history, academy, log (opens sheet), stock, face. Extra pushed screens: BT.go('calculator'), BT.go('injection', id), BT.go('compare'), BT.go('settings').
     A screen module: BT.screen('today', { title: 'Today', render(root, param) { ... } }). render may be called again on data change. */
  BT.screens = {};
  BT.screen = (name, def) => (BT.screens[name] = def);
  BT.tabs = ['today', 'history', 'academy', 'log', 'stock', 'face'];
  BT.route = { name: 'today', param: null };
  const stack = [];
  BT.go = (name, param, { replace } = {}) => {
    if (name === 'log') return BT.openLog && BT.openLog();
    if (!replace && !BT.tabs.includes(name)) stack.push({ ...BT.route });
    if (BT.tabs.includes(name)) stack.length = 0;
    BT.route = { name, param };
    BT.render();
    document.getElementById('view').scrollTop = 0;
    window.scrollTo(0, 0);
  };
  BT.back = () => { const prev = stack.pop() || { name: 'today' }; BT.route = prev; BT.render(); };
  BT.render = () => {
    BT._stale = false;
    const root = document.getElementById('view'), s = BT.screens[BT.route.name];
    BT.$$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === BT.route.name));
    root.dataset.screen = BT.route.name;
    if (!s) { root.innerHTML = `<div class="empty">Loading ${BT.esc(BT.route.name)}…</div>`; return; }
    try { root.innerHTML = ''; s.render(root, BT.route.param); }
    catch (e) { console.error(e); root.innerHTML = `<div class="empty">Something went wrong on this screen.<br><small>${BT.esc(e.message)}</small></div>`; }
  };
  // Standard pushed-screen header: BT.navHeader('Title', rightHtml)
  BT.navHeader = (title, right = '') => `<header class="nav-h"><button class="icon-btn" onclick="BT.back()" aria-label="Back">${BT.icon('back', 22)}</button><h1>${BT.esc(title)}</h1><div class="nav-r">${right}</div></header>`;

  /* ---------- sample data (clearly marked) ---------- */
  BT.loadSample = () => {
    const now = Date.now(), d = BT.DAY;
    const v1 = BT.save('vials', { productId: 'botox', unitsTotal: 100, dilutionMl: 2.5, lot: 'C6123C3', clinic: 'Glow Med Spa', expiresAt: now + 120 * d, openedAt: now - 100 * d, cost: 520, sample: true });
    const v2 = BT.save('vials', { productId: 'dysport', unitsTotal: 300, dilutionMl: 3, lot: 'D-2210K', clinic: 'Glow Med Spa', expiresAt: now + 200 * d, openedAt: null, cost: 0, sample: true });
    const mk = (daysAgo, productId, vialId, sites, provider, extra = {}) => BT.save('injections', { at: now - daysAgo * d - 3 * BT.HOUR, productId, vialId, sites, provider, sample: true, ...extra });
    // Points without x,y are placed on the muscle's typical pattern by facemap.js.
    const pts = (spec) => spec.flatMap(([siteId, n, units]) => Array.from({ length: n }, () => ({ id: BT.uid(), siteId, units })));
    const i1 = mk(98, 'botox', v1.id, pts([['procerus', 1, 4], ['corrugator-l', 2, 4], ['corrugator-r', 2, 4], ['frontalis-l', 2, 2.5], ['frontalis-r', 2, 2.5]]), 'Dr. Patel', { notes: 'First full treatment.', cost: 280 });
    const i2 = mk(9, 'botox', v1.id, pts([['procerus', 1, 4], ['corrugator-l', 2, 4], ['corrugator-r', 2, 4], ['frontalis-l', 3, 2], ['frontalis-r', 3, 2], ['oculi-l', 3, 4], ['oculi-r', 3, 4]]), 'Dr. Patel', { notes: 'Added crow\'s feet this round. Lighter on the forehead.', cost: 400 });
    BT.save('reactions', { injectionId: i2.id, at: i2.at + 6 * BT.HOUR, kind: 'Bruising', severity: 2, siteId: 'oculi-l', resolvedAt: i2.at + 4 * d, notes: 'Small bruise, gone in 4 days', sample: true });
    BT.save('reactions', { injectionId: i2.id, at: i2.at + 20 * BT.HOUR, kind: 'Headache', severity: 1, siteId: 'frontalis-l', resolvedAt: i2.at + 1.5 * d, notes: '', sample: true });
    BT.save('reactions', { injectionId: i1.id, at: i1.at + 2 * BT.HOUR, kind: 'Redness', severity: 1, siteId: 'procerus', resolvedAt: i1.at + 5 * BT.HOUR, notes: '', sample: true });
    for (let k = 0; k < 7; k++) BT.save('moods', { date: ((t) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'))(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() - k, 12)), score: [4, 5, 4, 3, 4, 2, 3][k], sample: true });
    BT.save('settings', { sampleLoaded: true });
  };
  BT.clearSample = () => { for (const k of KINDS) BT.data[k].filter((r) => r.sample).forEach((r) => BT.remove(k, r.id)); BT.save('settings', { sampleLoaded: false, sampleCleared: true }); };
  BT.hasSample = () => KINDS.some((k) => BT.data[k].some((r) => r.sample));
})();
