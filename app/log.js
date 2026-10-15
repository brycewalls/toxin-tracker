/* Botox Tracker: log flow. Provides BT.openLog, BT.openReaction and the 'injection' detail screen. */
(function () {
  const BT = window.BT;
  if (!BT) return;

  /* ---------- styles ---------- */
  if (!document.getElementById('log-css')) {
    const st = document.createElement('style');
    st.id = 'log-css';
    st.textContent = `
.lg-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.lg-h h3{font-size:16px}
.lg-sheet .card{display:grid;gap:12px}
.lg-sheet .card .lg-h{margin-bottom:0}
.lg-sheet .stepper button{width:40px;height:40px}
.lg-sheet .stepper input{height:40px;width:56px}
.lg-sheet select.input{appearance:auto;-webkit-appearance:menulist}
.lg-dot{width:10px;height:10px;border-radius:50%;flex:none}
.lg-chip{display:inline-flex;align-items:center;gap:8px}
.lg-site{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);min-width:0}
.lg-site:last-child{border-bottom:0}
.lg-site .grow{min-width:0}
.lg-total{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-top:4px}
.lg-err{color:var(--red);font-size:13px;background:var(--red-soft);border-radius:12px;padding:10px 12px}
.lg-ph-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.lg-ph{position:relative;aspect-ratio:3/4;width:100%;border-radius:14px;border:1px dashed var(--accent-line);background:var(--card-2);color:var(--accent);display:grid;place-items:center;align-content:center;gap:6px;overflow:hidden;font-size:13px;text-align:center;padding:8px}
.lg-ph.has{border-style:solid;border-color:var(--line);padding:0}
.lg-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.lg-ph .lg-tag{position:absolute;left:8px;top:8px;z-index:1;background:var(--card);color:var(--fg);font-size:11.5px;padding:3px 9px;border-radius:99px}
.lg-ph-x{position:absolute;right:6px;top:6px;z-index:1;width:40px;height:40px;border-radius:50%;background:var(--card);color:var(--fg);display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.lg-ph-ro{cursor:pointer}
.lg-sw-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:46px;text-align:left}
.lg-sw{width:52px;height:32px;border-radius:99px;background:var(--line);position:relative;transition:background .2s;flex:none}
.lg-sw::after{content:'';position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
.lg-sw-row[aria-checked="true"] .lg-sw{background:var(--green)}
.lg-sw-row[aria-checked="true"] .lg-sw::after{transform:translateX(20px)}
.lg-sev .seg-b{padding:6px 2px;font-size:12px;min-height:40px}
.lg-kinds .chip{padding:9px 12px;font-size:13.5px}
.lg-tbl-r{display:grid;grid-template-columns:minmax(0,1fr) 52px 104px;gap:10px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line)}
.lg-tbl-r:last-child{border-bottom:0}
.lg-tbl-r.head{padding:0 0 8px}
.lg-tbl-r .n{text-align:right;font-variant-numeric:tabular-nums}
.lg-tbl-r .r{text-align:right;color:var(--muted);font-size:12.5px}
.lg-rx{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);width:100%;text-align:left;min-height:48px}
.lg-rx:last-child{border-bottom:0}
.lg-thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.lg-th{position:relative;aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:var(--card-2);border:1px solid var(--line)}
.lg-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.lg-th span{position:absolute;left:6px;bottom:6px;background:var(--card);font-size:11px;padding:2px 8px;border-radius:99px}
.lg-hero-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`;
    document.head.appendChild(st);
  }

  /* ---------- helpers ---------- */
  const esc = BT.esc;
  const fmtN = (n) => String(Math.round((+n || 0) * 10) / 10);
  const rangeOf = (siteId, prod) => {
    const s = BT.site(siteId);
    if (!s.range || !s.range[1]) return null;
    const k = prod ? prod.ratio : 1;
    return [Math.round(s.range[0] * k), Math.round(s.range[1] * k)];
  };
  const rangeText = (siteId, prod) => { const r = rangeOf(siteId, prod); return r ? `Common ${r[0]} to ${r[1]} U` : ''; };
  const defaultUnits = (siteId, prod) => { const s = BT.site(siteId); const m = ((s.range[0] + s.range[1]) / 2) * (prod ? prod.ratio : 1); return Math.max(1, Math.round(m)); };
  const money = (c) => '$' + (+c).toFixed(+c % 1 ? 2 : 0);
  const injLabel = (i) => `${BT.fmt.date(i.at)} · ${BT.product(i.productId).name} · ${fmtN(BT.injectionUnits(i))}U`;
  const sevLabels = ['Mild', 'Minor', 'Moderate', 'Strong', 'Severe'];
  const sevColor = (n) => (n <= 2 ? 'green' : n === 3 ? 'amber' : 'red');
  const parseLocal = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : null; };
  const stepHeader = (n, title, sub = '') => `<div class="lg-h"><span class="step-n">${n}</span><h3>${esc(title)}</h3>${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}</div>`;

  /* =====================================================
     1) Log an injection
     ===================================================== */
  BT.openLog = function (prefill = {}) {
    const editing = prefill.injectionId ? BT.data.injections.find((i) => i.id === prefill.injectionId) : null;
    const urls = {};
    const st = { at: Date.now(), provider: '', productId: 'botox', vialId: '', sites: {}, files: { before: null, after: null }, existing: { before: null, after: null }, notes: '', cost: '', busy: false };

    const adjRemaining = (v) => BT.vialRemaining(v) + (editing && editing.vialId === v.id ? BT.injectionUnits(editing) : 0);
    const pickVial = (productId) => {
      const vs = BT.data.vials.filter((v) => v.productId === productId && adjRemaining(v) > 0);
      vs.sort((a, b) => (b.openedAt ? 1 : 0) - (a.openedAt ? 1 : 0) || (a.expiresAt || 1e15) - (b.expiresAt || 1e15));
      return vs[0] ? vs[0].id : '';
    };

    if (editing) {
      st.at = editing.at; st.provider = editing.provider || ''; st.productId = editing.productId; st.vialId = editing.vialId || '';
      (editing.sites || []).forEach((s) => { st.sites[s.siteId] = +s.units || 0; });
      st.notes = editing.notes || ''; st.cost = editing.cost != null && editing.cost !== '' ? String(editing.cost) : '';
      BT.data.photos.filter((p) => p.injectionId === editing.id).forEach((p) => { if (p.kind === 'before' || p.kind === 'after') st.existing[p.kind] = p; });
    } else {
      const l = BT.lastInjection();
      if (l) st.productId = l.productId;
      st.vialId = pickVial(st.productId);
    }
    if (Array.isArray(prefill.sites) && prefill.sites.length) {
      st.sites = {};
      prefill.sites.forEach((s) => { st.sites[s.siteId] = +s.units || defaultUnits(s.siteId, BT.product(st.productId)); });
    }
    if (prefill.photoFile) { st.files.before = prefill.photoFile; urls.before = URL.createObjectURL(prefill.photoFile); }

    const prod = () => BT.product(st.productId);
    const providers = (() => {
      const seen = new Set(), out = [];
      BT.sortedInjections().forEach((i) => { const p = (i.provider || '').trim(); if (p && !seen.has(p.toLowerCase())) { seen.add(p.toLowerCase()); out.push(p); } });
      return out.slice(0, 6);
    })();

    const sheet = BT.sheet({
      title: editing ? 'Edit Injection' : 'Log Injection',
      action: { label: 'Save', onClick: (close) => save(close) },
      onClose: () => Object.values(urls).forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} }),
    });
    sheet.el.classList.add('lg-sheet');
    const body = sheet.body;
    body.innerHTML = `
      <section class="card" data-sec="when">
        ${stepHeader(1, 'When')}
        <div class="field"><label for="lg-at">Date and time</label><input class="input" id="lg-at" type="datetime-local" data-at></div>
        <div class="field"><label for="lg-prov">Provider / clinic</label><input class="input" id="lg-prov" type="text" placeholder="Who did the treatment" autocomplete="off" data-prov>
          <div class="chips" data-provchips></div></div>
        <div class="lg-err" data-err-when hidden></div>
      </section>
      <section class="card" data-sec="product">
        ${stepHeader(2, 'Product')}
        <div class="chips" data-products></div>
        <div class="field"><label for="lg-vial">From vial</label><select class="input" id="lg-vial" data-vial></select></div>
      </section>
      <section class="card" data-sec="where">
        ${stepHeader(3, 'Where')}
        <div data-map></div>
        <div class="row gap wrap"><button class="btn sm" type="button" data-same>${BT.icon('flip', 16)} Same as last time</button></div>
        <div data-sites></div>
        <div class="lg-total"><span class="muted">Total units</span><span class="big-num num" data-total>0<small>U</small></span></div>
        <div class="callout" data-warn hidden style="background:var(--amber-soft);border-color:var(--amber);color:var(--amber)"></div>
        <div class="lg-err" data-err-sites hidden></div>
      </section>
      <section class="card" data-sec="photos">
        ${stepHeader(4, 'Photos', 'Optional')}
        <div class="lg-ph-grid" data-photos></div>
      </section>
      <section class="card" data-sec="notes">
        ${stepHeader(5, 'Notes')}
        <div class="field"><label for="lg-notes">Notes</label><textarea class="input" id="lg-notes" rows="3" placeholder="Anything worth remembering" data-notes></textarea></div>
        <div class="field"><label for="lg-cost">Cost (optional)</label><input class="input" id="lg-cost" type="number" inputmode="decimal" min="0" step="0.01" placeholder="$" data-cost></div>
      </section>`;
    const $ = (s) => body.querySelector(s);

    $('[data-at]').value = BT.toLocalInput(st.at);
    $('[data-prov]').value = st.provider;
    $('[data-notes]').value = st.notes;
    $('[data-cost]').value = st.cost;

    /* --- step 1 --- */
    const renderProvChips = () => {
      const cur = $('[data-prov]').value.trim().toLowerCase();
      $('[data-provchips]').innerHTML = providers.map((p) => `<button type="button" class="chip ${p.toLowerCase() === cur ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('');
    };
    renderProvChips();
    $('[data-provchips]').onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; $('[data-prov]').value = b.dataset.p; renderProvChips(); };
    $('[data-prov]').oninput = renderProvChips;

    /* --- step 2 --- */
    const renderProducts = () => {
      $('[data-products]').innerHTML = BT.products.map((p) => `<button type="button" class="chip lg-chip ${p.id === st.productId ? 'on' : ''}" data-id="${p.id}"><span class="lg-dot" style="background:${p.color}"></span>${esc(p.name)}</button>`).join('');
    };
    const renderVials = () => {
      const vs = BT.data.vials.filter((v) => v.productId === st.productId && (adjRemaining(v) > 0 || v.id === st.vialId));
      const opts = [`<option value="">None</option>`].concat(vs.map((v) => {
        const rem = adjRemaining(v);
        const name = (v.lot ? 'Lot ' + v.lot : 'Vial') + (v.clinic ? ' · ' + v.clinic : '') + (v.openedAt ? '' : ' · unopened');
        return `<option value="${esc(v.id)}">${esc(name)} · ${fmtN(rem)}U left</option>`;
      }));
      const sel = $('[data-vial]');
      sel.innerHTML = opts.join('');
      sel.value = vs.some((v) => v.id === st.vialId) ? st.vialId : '';
      st.vialId = sel.value;
    };
    $('[data-products]').onclick = (e) => {
      const b = e.target.closest('[data-id]'); if (!b || b.dataset.id === st.productId) return;
      st.productId = b.dataset.id; st.vialId = pickVial(st.productId);
      renderProducts(); renderVials(); renderSites(); updateTotals();
    };
    $('[data-vial]').onchange = (e) => { st.vialId = e.target.value; updateTotals(); };
    renderProducts(); renderVials();

    /* --- step 3 --- */
    let map = null, fallback = false;
    const pushMap = () => { if (map && map.setSelected) { try { map.setSelected({ ...st.sites }); } catch (e) {} } };
    const renderChips = () => {
      if (!fallback) return;
      $('[data-map]').innerHTML = `<div class="chips">${BT.sites.map((s) => `<button type="button" class="chip ${s.id in st.sites ? 'on' : ''}" data-s="${s.id}">${esc(s.label)}</button>`).join('')}</div>`;
    };
    function mountMap() {
      const holder = $('[data-map]');
      if (BT.faceMap && BT.faceMap.mount) {
        try {
          map = BT.faceMap.mount(holder, {
            mode: 'select',
            selected: { ...st.sites },
            onChange: (m) => {
              const next = {};
              Object.keys(m || {}).forEach((id) => { const mu = +m[id]; next[id] = id in st.sites ? st.sites[id] : (mu > 0 ? mu : defaultUnits(id, prod())); });
              st.sites = next; renderSites(); updateTotals();
            },
          });
          return;
        } catch (e) { console.warn('faceMap unavailable', e); map = null; }
      }
      fallback = true; renderChips();
    }
    $('[data-map]').addEventListener('click', (e) => {
      if (!fallback) return;
      const b = e.target.closest('[data-s]'); if (!b) return;
      const id = b.dataset.s;
      if (id in st.sites) delete st.sites[id]; else st.sites[id] = defaultUnits(id, prod());
      renderChips(); renderSites(); updateTotals();
    });

    function renderSites() {
      const ids = Object.keys(st.sites);
      const box = $('[data-sites]');
      if (!ids.length) { box.innerHTML = `<p class="muted small" style="margin:4px 0">${fallback ? 'Pick one or more sites above.' : 'Tap the face to choose sites.'}</p>`; return; }
      box.innerHTML = ids.map((id) => {
        const s = BT.site(id), hint = rangeText(id, prod());
        return `<div class="lg-site" data-site="${esc(id)}">
          <div class="grow"><div class="li-title">${esc(s.label)}</div>${s.muscle ? `<div class="li-sub">${esc(s.muscle)}</div>` : ''}${hint ? `<div class="tiny muted">${esc(hint)}</div>` : ''}</div>
          <div class="stepper"><button type="button" data-dec aria-label="Fewer units for ${esc(s.label)}">-</button><input type="number" inputmode="decimal" step="0.5" min="0" value="${esc(fmtN(st.sites[id]))}" aria-label="Units for ${esc(s.label)}"><button type="button" data-inc aria-label="More units for ${esc(s.label)}">+</button></div>
          <button type="button" class="icon-btn" data-rm aria-label="Remove ${esc(s.label)}">${BT.icon('close', 18)}</button></div>`;
      }).join('');
    }
    const setUnits = (row, v) => {
      const id = row.dataset.site;
      st.sites[id] = Math.max(0, Math.round(v * 2) / 2);
      pushMap(); updateTotals();
    };
    $('[data-sites]').addEventListener('click', (e) => {
      const row = e.target.closest('[data-site]'); if (!row) return;
      const id = row.dataset.site, inp = row.querySelector('input');
      if (e.target.closest('[data-inc]')) { setUnits(row, (+st.sites[id] || 0) + 1); inp.value = fmtN(st.sites[id]); }
      else if (e.target.closest('[data-dec]')) { setUnits(row, (+st.sites[id] || 0) - 1); inp.value = fmtN(st.sites[id]); }
      else if (e.target.closest('[data-rm]')) { delete st.sites[id]; renderSites(); renderChips(); pushMap(); updateTotals(); }
    });
    $('[data-sites]').addEventListener('input', (e) => {
      const inp = e.target.closest('input'); if (!inp) return;
      const row = inp.closest('[data-site]'); if (!row) return;
      st.sites[row.dataset.site] = Math.max(0, +inp.value || 0); pushMap(); updateTotals();
    });
    $('[data-sites]').addEventListener('change', (e) => {
      const inp = e.target.closest('input'); if (!inp) return;
      const row = inp.closest('[data-site]'); if (!row) return;
      setUnits(row, +inp.value || 0); inp.value = fmtN(st.sites[row.dataset.site]);
    });
    $('[data-same]').onclick = () => {
      const l = BT.sortedInjections().find((i) => !editing || i.id !== editing.id);
      if (!l || !(l.sites || []).length) { BT.toast('No earlier treatment to copy'); return; }
      st.sites = {};
      l.sites.forEach((s) => { st.sites[s.siteId] = +s.units || 0; });
      renderSites(); renderChips(); pushMap(); updateTotals();
    };
    function updateTotals() {
      const total = Object.values(st.sites).reduce((a, u) => a + (+u || 0), 0);
      $('[data-total]').innerHTML = `${esc(fmtN(total))}<small>U</small>`;
      const v = BT.data.vials.find((x) => x.id === st.vialId), w = $('[data-warn]');
      if (v && total > adjRemaining(v) + 1e-9) {
        w.hidden = false;
        w.textContent = `This is ${fmtN(total - adjRemaining(v))}U more than the ${fmtN(adjRemaining(v))}U left in the selected vial.`;
      } else w.hidden = true;
      if (total > 0) $('[data-err-sites]').hidden = true;
    }
    renderSites(); mountMap(); updateTotals();

    /* --- step 4 --- */
    const renderPhotos = () => {
      $('[data-photos]').innerHTML = ['before', 'after'].map((k) => {
        const cap = k[0].toUpperCase() + k.slice(1);
        const src = urls[k] || (st.existing[k] && st.existing[k].src);
        if (src && (st.files[k] || st.existing[k])) {
          return `<div class="lg-ph has" data-ph="${k}"><img src="${esc(src)}" alt="${cap} photo"><span class="lg-tag">${cap}</span>${st.files[k] ? `<button type="button" class="lg-ph-x" data-rmph="${k}" aria-label="Remove ${k} photo">${BT.icon('close', 18)}</button>` : ''}<button type="button" class="btn sm" data-pick="${k}" style="position:absolute;left:8px;bottom:8px;z-index:1">Replace</button></div>`;
        }
        return `<button type="button" class="lg-ph" data-pick="${k}">${BT.icon('camera', 24)}<span>Add ${k} photo</span></button>`;
      }).join('');
    };
    renderPhotos();
    $('[data-photos]').addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rmph]');
      if (rm) { const k = rm.dataset.rmph; if (urls[k]) { URL.revokeObjectURL(urls[k]); delete urls[k]; } st.files[k] = null; renderPhotos(); return; }
      const b = e.target.closest('[data-pick]'); if (!b) return;
      const k = b.dataset.pick;
      let f = null;
      try { f = await BT.photo.pick({ capture: 'user' }); } catch (err) { console.warn(err); }
      if (!f) return;
      if (urls[k]) URL.revokeObjectURL(urls[k]);
      st.files[k] = f; urls[k] = URL.createObjectURL(f); renderPhotos();
    });

    /* --- save --- */
    const showErr = (sel, msg) => { const el = $(sel); el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    async function save(close) {
      if (st.busy) return;
      $('[data-err-when]').hidden = true; $('[data-err-sites]').hidden = true;
      const at = parseLocal($('[data-at]').value);
      if (at == null) { showErr('[data-err-when]', 'Enter a valid date and time.'); return; }
      const sites = Object.entries(st.sites).map(([siteId, u]) => ({ siteId, units: Number(u) })).filter((s) => s.units > 0);
      if (!sites.length) { showErr('[data-err-sites]', 'Add at least one site with units above 0.'); return; }
      const act = sheet.el.querySelector('[data-act]');
      st.busy = true; if (act) { act.disabled = true; act.textContent = 'Saving'; }
      try {
        const costRaw = $('[data-cost]').value.trim();
        const cost = costRaw === '' || !Number.isFinite(+costRaw) ? null : +costRaw;
        const base = editing ? { ...editing } : {};
        const rec = BT.save('injections', Object.assign(base, {
          at, productId: st.productId, vialId: st.vialId || null, sites,
          provider: $('[data-prov]').value.trim(), notes: $('[data-notes]').value.trim(), cost,
        }));
        const vial = st.vialId ? BT.data.vials.find((v) => v.id === st.vialId) : null;
        if (vial && !vial.openedAt) { vial.openedAt = at; BT.save('vials', vial); }
        let photoFail = false;
        for (const k of ['before', 'after']) {
          if (!st.files[k]) continue;
          try {
            const src = await BT.photo.store(st.files[k]);
            if (st.existing[k]) BT.remove('photos', st.existing[k].id);
            BT.save('photos', { kind: k, at, src, injectionId: rec.id });
          } catch (err) { console.error('photo store failed', err); photoFail = true; }
        }
        close();
        if (photoFail) BT.toast('Saved, but a photo could not be stored');
        else BT.toast(editing ? 'Treatment updated.' : 'Injection logged. Aftercare timers started.');
        if (editing) BT.render(); else BT.go('today');
      } catch (err) {
        console.error(err);
        st.busy = false; if (act) { act.disabled = false; act.textContent = 'Save'; }
        showErr('[data-err-sites]', 'Could not save. Try again.');
      }
    }
    return sheet;
  };

  /* =====================================================
     2) Log a reaction
     ===================================================== */
  BT.openReaction = function (prefill = {}) {
    const editing = prefill.id ? BT.data.reactions.find((r) => r.id === prefill.id) : null;
    const injs = BT.sortedInjections().slice(0, 20);
    const want = editing ? editing.injectionId : prefill.injectionId;
    if (want && !injs.some((i) => i.id === want)) { const x = BT.data.injections.find((i) => i.id === want); if (x) injs.push(x); }
    if (!injs.length) { BT.toast('Log an injection first'); return null; }
    const st = {
      injectionId: want || injs[0].id,
      kind: editing ? editing.kind : BT.reactionKinds[0],
      severity: editing ? editing.severity : 1,
      siteId: editing ? editing.siteId || '' : prefill.siteId || '',
      at: editing ? editing.at : Date.now(),
      resolved: !!(editing && editing.resolvedAt),
      resolvedAt: editing && editing.resolvedAt ? editing.resolvedAt : Date.now(),
      notes: editing ? editing.notes || '' : '',
    };
    const sheet = BT.sheet({ title: editing ? 'Edit Reaction' : 'Log Reaction', action: { label: 'Save', onClick: (close) => save(close) } });
    sheet.el.classList.add('lg-sheet');
    const body = sheet.body;
    body.innerHTML = `
      <section class="card">
        <div class="field"><label for="rx-inj">Treatment</label><select class="input" id="rx-inj" data-inj>${injs.map((i) => `<option value="${esc(i.id)}">${esc(injLabel(i))}</option>`).join('')}</select></div>
        <div class="field"><label>What happened</label><div class="chips lg-kinds" data-kinds></div></div>
        <div class="field"><label>Severity</label><div data-sev></div><div class="tiny muted" data-sevtxt></div></div>
        <div class="field"><label for="rx-site">Where</label><select class="input" id="rx-site" data-site></select></div>
      </section>
      <section class="card">
        <div class="field"><label for="rx-at">Onset</label><input class="input" id="rx-at" type="datetime-local" data-at></div>
        <button type="button" class="lg-sw-row" role="switch" aria-checked="false" data-sw><span>Resolved</span><span class="lg-sw"></span></button>
        <div class="field" data-resfield hidden><label for="rx-res">Resolved at</label><input class="input" id="rx-res" type="datetime-local" data-res></div>
        <div class="field"><label for="rx-notes">Notes</label><textarea class="input" id="rx-notes" rows="3" placeholder="Details, what helped" data-notes></textarea></div>
        <div class="lg-err" data-err hidden></div>
      </section>
      ${editing ? `<button type="button" class="btn danger" data-del>${BT.icon('trash', 18)} Delete reaction</button>` : ''}`;
    const $ = (s) => body.querySelector(s);

    $('[data-inj]').value = st.injectionId;
    $('[data-at]').value = BT.toLocalInput(st.at);
    $('[data-res]').value = BT.toLocalInput(st.resolvedAt);
    $('[data-notes]').value = st.notes;

    const renderKinds = () => {
      $('[data-kinds]').innerHTML = BT.reactionKinds.map((k) => `<button type="button" class="chip ${k === st.kind ? 'on' : ''}" data-k="${esc(k)}">${esc(k)}</button>`).join('');
    };
    renderKinds();
    $('[data-kinds]').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; st.kind = b.dataset.k; renderKinds(); };

    const sev = BT.seg(sevLabels.map((l, i) => [String(i + 1), l]), String(st.severity), (v) => { st.severity = +v; $('[data-sevtxt]').textContent = `${v} of 5`; });
    sev.classList.add('full', 'lg-sev');
    $('[data-sev]').appendChild(sev);
    $('[data-sevtxt]').textContent = `${st.severity} of 5`;

    const renderSiteOpts = () => {
      const inj = BT.data.injections.find((i) => i.id === st.injectionId);
      const ids = inj ? (inj.sites || []).map((s) => s.siteId) : [];
      const sel = $('[data-site]');
      sel.innerHTML = `<option value="">General</option>` + ids.map((id) => `<option value="${esc(id)}">${esc(BT.site(id).label)}</option>`).join('');
      sel.value = ids.includes(st.siteId) ? st.siteId : '';
      st.siteId = sel.value;
    };
    renderSiteOpts();
    $('[data-inj]').onchange = (e) => { st.injectionId = e.target.value; renderSiteOpts(); };
    $('[data-site]').onchange = (e) => { st.siteId = e.target.value; };

    const sw = $('[data-sw]');
    const paintSw = () => { sw.setAttribute('aria-checked', String(st.resolved)); $('[data-resfield]').hidden = !st.resolved; };
    sw.onclick = () => { st.resolved = !st.resolved; paintSw(); };
    paintSw();

    if (editing) {
      $('[data-del]').onclick = async () => {
        const ok = await BT.confirm('Delete this reaction? This cannot be undone.');
        if (!ok) return;
        BT.remove('reactions', editing.id);
        sheet.el.remove();
        BT.toast('Reaction deleted');
        BT.render();
      };
    }

    function save(close) {
      const err = $('[data-err]'); err.hidden = true;
      const at = parseLocal($('[data-at]').value);
      if (at == null) { err.textContent = 'Enter a valid onset time.'; err.hidden = false; return; }
      let resolvedAt = null;
      if (st.resolved) {
        resolvedAt = parseLocal($('[data-res]').value);
        if (resolvedAt == null) { err.textContent = 'Enter a valid resolved time.'; err.hidden = false; return; }
        if (resolvedAt < at) { err.textContent = 'Resolved time must be after the onset.'; err.hidden = false; return; }
      }
      BT.save('reactions', Object.assign(editing ? { ...editing } : {}, {
        injectionId: st.injectionId, kind: st.kind, severity: st.severity, siteId: st.siteId || null,
        at, resolvedAt, notes: $('[data-notes]').value.trim(),
      }));
      close();
      BT.toast(editing ? 'Reaction updated' : 'Reaction logged');
      BT.render();
    }
    return sheet;
  };

  /* =====================================================
     3) Treatment detail screen
     ===================================================== */
  let detailMap = null;
  BT.screen('injection', {
    title: 'Treatment',
    render(root, id) {
      if (detailMap && detailMap.destroy) { try { detailMap.destroy(); } catch (e) {} }
      detailMap = null;
      const inj = BT.data.injections.find((i) => i.id === id);
      if (!inj) {
        root.innerHTML = BT.navHeader('Treatment') + `<div class="card"><div class="empty">${BT.icon('info', 28)}<div>This treatment could not be found. It may have been deleted.</div><div style="margin-top:14px"><button class="btn" data-back>Go back</button></div></div></div>`;
        root.querySelector('[data-back]').onclick = () => BT.back();
        return;
      }
      const prod = BT.product(inj.productId), total = BT.injectionUnits(inj);
      const vial = inj.vialId ? BT.data.vials.find((v) => v.id === inj.vialId) : null;
      const sel = {}; (inj.sites || []).forEach((s) => { sel[s.siteId] = +s.units || 0; });
      const rxs = BT.data.reactions.filter((r) => r.injectionId === inj.id).sort((a, b) => a.at - b.at);
      const photos = BT.data.photos.filter((p) => p.injectionId === inj.id).sort((a, b) => (a.kind === 'before' ? -1 : 1) - (b.kind === 'before' ? -1 : 1) || a.at - b.at);

      root.innerHTML = BT.navHeader('Treatment', `<button class="icon-btn" data-edit aria-label="Edit treatment">${BT.icon('edit', 20)}</button>`) + `
        <section class="card">
          <div class="eyebrow">${esc(BT.fmt.dateLong(inj.at))} · ${esc(BT.fmt.time(inj.at))}</div>
          <div class="row between" style="margin-top:10px;align-items:flex-end">
            <div class="grow">
              <div class="lg-hero-top"><span class="lg-dot" style="background:${prod.color}"></span><h2 style="font-size:20px">${esc(prod.name)}</h2>${inj.sample ? '<span class="sample-tag">Sample</span>' : ''}</div>
              <div class="muted small">${esc(prod.generic)} · ${esc(prod.maker)}</div>
            </div>
            <div class="big-num num">${esc(fmtN(total))}<small>U</small></div>
          </div>
          <div class="list" style="margin-top:10px">
            ${inj.provider ? `<div class="li"><span class="muted grow">Provider</span><span>${esc(inj.provider)}</span></div>` : ''}
            ${vial ? `<div class="li"><span class="muted grow">Vial</span><span>${esc(vial.lot ? 'Lot ' + vial.lot : 'Vial')}</span></div>` : ''}
            ${inj.cost != null && inj.cost !== '' ? `<div class="li"><span class="muted grow">Cost</span><span class="num">${esc(money(inj.cost))}</span></div>` : ''}
          </div>
        </section>
        <section class="card">
          <div class="card-h"><h3>Injection sites</h3><span class="pill blue">${(inj.sites || []).length} sites</span></div>
          <div data-map></div>
        </section>
        <section class="card">
          <div class="card-h"><h3>Units by site</h3></div>
          <div>
            <div class="lg-tbl-r head eyebrow"><span>Site</span><span class="n">Units</span><span class="r">Common range</span></div>
            ${(inj.sites || []).map((s) => { const r = rangeOf(s.siteId, prod); return `<div class="lg-tbl-r"><span>${esc(BT.site(s.siteId).label)}</span><span class="n">${esc(fmtN(s.units))}</span><span class="r">${r ? `${r[0]} to ${r[1]} U` : ''}</span></div>`; }).join('')}
            <div class="lg-tbl-r"><span class="li-title">Total</span><span class="n li-title">${esc(fmtN(total))}</span><span class="r"></span></div>
          </div>
        </section>
        <section class="card">
          <div class="card-h"><h3>Reactions</h3><button class="btn sm" data-addrx>+ Add</button></div>
          ${rxs.length ? rxs.map((r) => `<button class="lg-rx" data-rx="${esc(r.id)}"><div class="grow"><div class="li-title">${esc(r.kind)}</div><div class="li-sub">${esc(r.siteId ? BT.site(r.siteId).label : 'General')} · ${esc(BT.fmt.date(r.at))}${r.resolvedAt ? ' · cleared in ' + esc(durText(r.resolvedAt - r.at)) : ''}</div></div>
            <span class="pill ${sevColor(r.severity)}">${esc(sevLabels[(r.severity || 1) - 1] || '')}</span><span class="pill ${r.resolvedAt ? 'green' : 'amber'}">${r.resolvedAt ? 'Resolved' : 'Ongoing'}</span></button>`).join('') : '<p class="muted small" style="margin:0">No reactions logged for this treatment.</p>'}
        </section>
        <section class="card">
          <div class="card-h"><h3>Photos</h3>${photos.length ? '<button class="btn sm" data-compare>Compare</button>' : ''}</div>
          ${photos.length ? `<div class="lg-thumbs">${photos.map((p) => `<button class="lg-th" data-ph="${esc(p.id)}" aria-label="View ${esc(p.kind)} photo"><img src="${esc(p.src)}" alt="${esc(p.kind)} photo"><span>${esc(p.kind === 'after' ? 'After' : 'Before')}</span></button>`).join('')}</div>` : '<p class="muted small" style="margin:0">No photos yet. Use edit to add before and after photos.</p>'}
        </section>
        ${inj.notes ? `<section class="card"><div class="card-h"><h3>Notes</h3></div><p style="margin:0;white-space:pre-wrap">${esc(inj.notes)}</p></section>` : ''}
        <button class="btn danger" data-del>${BT.icon('trash', 18)} Delete treatment</button>`;

      const q = (s) => root.querySelector(s);
      q('[data-edit]').onclick = () => BT.openLog({ injectionId: id });
      q('[data-addrx]').onclick = () => BT.openReaction({ injectionId: id });
      root.querySelectorAll('[data-rx]').forEach((b) => { b.onclick = () => BT.openReaction({ id: b.dataset.rx }); });
      const cmp = q('[data-compare]'); if (cmp) cmp.onclick = () => BT.go('compare', id);
      root.querySelectorAll('[data-ph]').forEach((b) => {
        b.onclick = () => {
          const p = photos.find((x) => x.id === b.dataset.ph); if (!p) return;
          const s = BT.sheet({ title: (p.kind === 'after' ? 'After' : 'Before') + ' · ' + BT.fmt.date(p.at) });
          s.body.innerHTML = `<img src="${esc(p.src)}" alt="${esc(p.kind)} photo" style="width:100%;border-radius:14px;display:block">`;
        };
      });
      q('[data-del]').onclick = async () => {
        const ok = await BT.confirm('Delete this treatment along with its reactions and photos? This cannot be undone.');
        if (!ok) return;
        BT.data.reactions.filter((r) => r.injectionId === id).forEach((r) => BT.remove('reactions', r.id));
        BT.data.photos.filter((p) => p.injectionId === id).forEach((p) => BT.remove('photos', p.id));
        BT.remove('injections', id);
        BT.toast('Treatment deleted');
        BT.back();
      };

      const holder = q('[data-map]');
      if (BT.faceMap && BT.faceMap.mount) {
        try { detailMap = BT.faceMap.mount(holder, { mode: 'display', selected: sel, labels: true }); }
        catch (e) { console.warn('faceMap unavailable', e); detailMap = null; }
      }
      if (!detailMap) {
        holder.innerHTML = `<div class="chips">${(inj.sites || []).map((s) => `<span class="pill blue">${esc(BT.site(s.siteId).label)} ${esc(fmtN(s.units))}U</span>`).join('')}</div>`;
      }
    },
  });

  function durText(ms) {
    const h = ms / BT.HOUR;
    if (h < 1) return Math.max(1, Math.round(ms / 60e3)) + ' min';
    if (h < 48) return Math.round(h) + ' h';
    return Math.round(h / 24) + ' days';
  }
})();
