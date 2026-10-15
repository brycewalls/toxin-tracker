/* History tab (treatments, reactions, photos) and the Before & After compare screen. */
(function () {
  const BT = window.BT;
  const E = BT.esc;

  /* ---------- styles ---------- */
  if (!document.getElementById('hist-css')) {
    const st = document.createElement('style');
    st.id = 'hist-css';
    st.textContent = `
.hist { display: grid; gap: 14px; min-width: 0; }
.hist-plus { width: 40px; height: 40px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; flex: none; box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 35%, transparent); }
.hist-stats { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; padding: 18px 8px; }
.hist-stat { display: grid; gap: 8px; justify-items: center; padding: 0 6px; }
.hist-stat + .hist-stat { border-left: 1px solid var(--line); }
.hist-stat .eyebrow { font-size: 10.5px; line-height: 1.3; letter-spacing: .06em; }
.hist-month { padding: 6px 4px 0; }
.hist-card { padding: 0 16px; }
.hist-row { cursor: pointer; width: 100%; text-align: left; min-height: 64px; }
.hist-row .grow { display: grid; gap: 2px; }
.hist-row .end { display: grid; justify-items: end; gap: 4px; flex: none; }
.hist-row .chev { color: var(--faint); }
.hist-ring { width: 32px; height: 32px; }
.hist-sum { display: grid; grid-template-columns: 1fr 1fr; }
.hist-sum > div { display: grid; gap: 4px; padding: 0 6px; }
.hist-sum > div + div { border-left: 1px solid var(--line); padding-left: 16px; }
.hist-sum .v { font-size: 20px; font-family: var(--font-display); letter-spacing: -.01em; }
.hist-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.hist-tile { position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: var(--card-2); display: block; width: 100%; }
.hist-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hist-tag { position: absolute; left: 6px; top: 6px; font-size: 10.5px; font-weight: 500; padding: 2px 8px; border-radius: 99px; background: color-mix(in srgb, var(--fg) 72%, transparent); color: var(--bg); letter-spacing: .02em; }
.hist-tile .hist-date { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 8px 5px; font-size: 11px; color: var(--bg); text-align: left; background: linear-gradient(transparent, color-mix(in srgb, var(--fg) 62%, transparent)); }
.hist-actions { display: grid; gap: 10px; }
.hist-actions .btn { width: 100%; }
.hist-view { display: grid; gap: 14px; }
.hist-view img.big { width: 100%; max-height: 56vh; object-fit: contain; border-radius: 16px; background: var(--card-2); display: block; }
.hist-kv { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 40px; }
.hist-strip { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: none; }
.hist-strip::-webkit-scrollbar { display: none; }
.hist-th { position: relative; flex: none; width: 62px; height: 78px; border-radius: 12px; overflow: hidden; border: 2px solid transparent; background: var(--card-2); }
.hist-th.on { border-color: var(--accent); }
.hist-th img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hist-th span { position: absolute; left: 0; right: 0; bottom: 0; font-size: 9.5px; text-align: center; padding: 8px 0 2px; color: var(--bg); background: linear-gradient(transparent, color-mix(in srgb, var(--fg) 65%, transparent)); }
.hist-stage { position: relative; aspect-ratio: 3 / 4; width: 100%; border-radius: 18px; overflow: hidden; background: var(--card-2); touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.hist-stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; -webkit-user-drag: none; }
.hist-after { position: absolute; inset: 0; }
.hist-handle { position: absolute; top: 0; bottom: 0; width: 44px; margin-left: -22px; display: grid; place-items: center; cursor: ew-resize; touch-action: none; }
.hist-handle::before { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; margin-left: -1px; background: var(--bg); box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 25%, transparent); }
.hist-knob { position: relative; width: 36px; height: 36px; border-radius: 50%; background: var(--bg); color: var(--fg); display: grid; place-items: center; box-shadow: 0 2px 10px color-mix(in srgb, var(--fg) 35%, transparent); font-size: 12px; letter-spacing: -2px; }
.hist-lab { position: absolute; top: 10px; font-size: 11px; font-weight: 500; letter-spacing: .08em; padding: 3px 9px; border-radius: 99px; background: color-mix(in srgb, var(--fg) 72%, transparent); color: var(--bg); pointer-events: none; }
.hist-side { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.hist-side .cell { display: grid; gap: 6px; min-width: 0; }
.hist-side .pic { position: relative; aspect-ratio: 3 / 4; border-radius: 14px; overflow: hidden; background: var(--card-2); }
.hist-side img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hist-cap { display: grid; gap: 2px; font-size: 12.5px; }
.hist-prev { width: 100%; max-height: 38vh; object-fit: contain; border-radius: 14px; background: var(--card-2); display: block; }
`;
    document.head.appendChild(st);
  }

  /* ---------- state ---------- */
  let tab = 'treatments';
  let rxFilter = 'all';
  let cmpMode = 'Slider';
  let sliderPos = 50;
  let cmp = { key: null, b: null, a: null };

  /* ---------- helpers ---------- */
  const injLabel = (inj) => `${BT.fmt.date(inj.at)} · ${BT.product(inj.productId).name}`;
  const photoKindLabel = (k) => (k === 'after' ? 'After' : 'Before');
  const rxCount = (id) => BT.data.reactions.filter((r) => r.injectionId === id).length;
  const sevInfo = (s) => (s <= 2 ? { cls: 'green', label: 'Mild' } : s === 3 ? { cls: 'amber', label: 'Moderate' } : { cls: 'red', label: 'Severe' });
  const dayWord = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const spanText = (ms) => {
    const h = ms / BT.HOUR;
    if (h < 24) { const n = Math.max(1, Math.round(h)); return `${n} ${n === 1 ? 'hour' : 'hours'}`; }
    return dayWord(Math.round(ms / BT.DAY));
  };
  const photosSorted = () => [...BT.data.photos].sort((a, b) => b.at - a.at);
  const refreshHere = () => { if (BT.route.name === 'history' || BT.route.name === 'compare') BT.render(); };

  function stats() {
    const yr = new Date().getFullYear();
    // Touch-ups (#18) add units but are not separate treatments, so they skip the count and the interval.
    const every = BT.sortedInjections(), all = every.filter((i) => !i.touchUpOf);
    const thisYear = all.filter((i) => new Date(i.at).getFullYear() === yr);
    const units = every.filter((i) => new Date(i.at).getFullYear() === yr).reduce((a, i) => a + BT.injectionUnits(i), 0);
    let avg = null;
    if (all.length > 1) {
      let sum = 0;
      for (let k = 0; k < all.length - 1; k++) sum += all[k].at - all[k + 1].at;
      avg = sum / (all.length - 1) / BT.DAY / 7;
    }
    return { count: thisYear.length, units, avg };
  }

  /* ---------- History screen ---------- */
  BT.screen('history', {
    title: 'History',
    render(root) {
      const st = stats();
      const wrap = document.createElement('div');
      wrap.className = 'hist';
      wrap.innerHTML = `
        <div class="page-h"><h1 class="title-xl">History</h1><button class="hist-plus" data-add aria-label="Log treatment">${BT.icon('plus', 22)}</button></div>
        <section class="card hist-stats" aria-label="This year">
          <div class="hist-stat"><div class="big-num">${st.count}</div><div class="eyebrow">Treatments<br>this year</div></div>
          <div class="hist-stat"><div class="big-num">${Math.round(st.units * 10) / 10}<small>U</small></div><div class="eyebrow">Units<br>this year</div></div>
          <div class="hist-stat"><div class="big-num">${st.avg == null ? '&ndash;' : (Math.round(st.avg * 10) / 10) + '<small>wk</small>'}</div><div class="eyebrow">Average<br>interval</div></div>
        </section>
        <div class="tabs-u" role="tablist">
          ${[['treatments', 'Treatments'], ['reactions', 'Reactions'], ['photos', 'Photos']].map(([v, l]) => `<button type="button" role="tab" data-t="${v}" class="${v === tab ? 'on' : ''}">${l}</button>`).join('')}
        </div>
        <div data-body class="hist"></div>`;
      root.appendChild(wrap);
      const body = wrap.querySelector('[data-body]');
      const draw = () => {
        if (tab === 'treatments') drawTreatments(body);
        else if (tab === 'reactions') drawReactions(body);
        else drawPhotos(body);
      };
      wrap.querySelector('[data-add]').onclick = () => BT.openLog && BT.openLog();
      wrap.querySelector('.tabs-u').onclick = (e) => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        tab = b.dataset.t;
        BT.$$('.tabs-u button', wrap).forEach((x) => x.classList.toggle('on', x === b));
        draw();
      };
      draw();
    },
  });

  function drawTreatments(body) {
    const all = BT.sortedInjections();
    if (!all.length) {
      body.innerHTML = `<div class="card empty">${BT.icon('syringe', 34)}<div style="margin-bottom:14px">No treatments logged yet.</div><button class="btn primary" data-log>Log your first treatment</button></div>`;
      body.querySelector('[data-log]').onclick = () => BT.openLog && BT.openLog();
      return;
    }
    const groups = [];
    all.forEach((inj) => {
      const d = new Date(inj.at);
      const key = d.getFullYear() * 12 + d.getMonth();
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), items: [] };
        groups.push(g);
      }
      g.items.push(inj);
    });
    body.innerHTML = groups.map((g) => `
      <div class="eyebrow hist-month">${E(g.label)}</div>
      <div class="card hist-card"><div class="list">${g.items.map((inj) => {
        const p = BT.product(inj.productId), n = (inj.sites || []).length, rc = rxCount(inj.id);
        const sub = `${BT.fmt.units(BT.injectionUnits(inj))} across ${n} ${n === 1 ? 'site' : 'sites'}${inj.provider ? ' · ' + E(inj.provider) : ''}`;
        return `<button type="button" class="li hist-row" data-inj="${E(inj.id)}">
          <span class="check-ring hist-ring" style="background:color-mix(in srgb, ${p.color} 14%, transparent);color:${p.color}">${BT.icon('check', 17)}</span>
          <span class="grow"><span class="li-title">${E(injLabel(inj))}</span><span class="li-sub">${sub}</span></span>
          <span class="end">${inj.touchUpOf ? '<span class="pill blue">Touch-up</span>' : ''}<span class="pill ${rc ? 'amber' : 'green'}">${rc ? rc + (rc === 1 ? ' reaction' : ' reactions') : 'No reactions'}</span></span>
          <span class="chev">${BT.icon('chevron', 18)}</span></button>`;
      }).join('')}</div></div>`).join('');
    body.onclick = (e) => { const r = e.target.closest('[data-inj]'); if (r) BT.go('injection', r.dataset.inj); };
  }

  function drawReactions(body) {
    const all = [...BT.data.reactions].sort((a, b) => b.at - a.at);
    const logBtn = `<button type="button" class="btn primary" data-rx>${BT.icon('plus', 18)} Log reaction</button>`;
    if (!all.length) {
      body.innerHTML = `<div class="card empty">${BT.icon('info', 34)}<div style="margin-bottom:14px">No reactions logged. If something comes up after a treatment, note it here.</div>${logBtn}</div>`;
      body.querySelector('[data-rx]').onclick = () => BT.openReaction && BT.openReaction();
      return;
    }
    const counts = {};
    all.forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const res = all.filter((r) => r.resolvedAt && r.resolvedAt >= r.at);
    const avg = res.length ? res.reduce((a, r) => a + (r.resolvedAt - r.at), 0) / res.length / BT.DAY : null;
    const list = all.filter((r) => rxFilter === 'all' || (rxFilter === 'open' ? !r.resolvedAt : !!r.resolvedAt));
    body.innerHTML = `
      <section class="card hist-sum">
        <div><span class="eyebrow">Most common</span><span class="v">${E(top[0])}</span><span class="tiny muted">${top[1]} ${top[1] === 1 ? 'time' : 'times'}</span></div>
        <div><span class="eyebrow">Avg. resolution</span><span class="v">${avg == null ? '&ndash;' : (avg < 1 ? '<1' : Math.round(avg * 10) / 10) + ' <small class="muted" style="font-size:13px">days</small>'}</span><span class="tiny muted">${res.length} resolved</span></div>
      </section>
      <div class="chips" data-chips>${[['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved']].map(([v, l]) => `<button type="button" class="chip ${v === rxFilter ? 'on' : ''}" data-f="${v}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="card hist-card"><div class="list">${list.map((r) => {
        const sv = sevInfo(r.severity), site = r.siteId ? BT.site(r.siteId).label : '';
        const status = r.resolvedAt ? `Resolved after ${spanText(r.resolvedAt - r.at)}` : 'Open';
        return `<button type="button" class="li hist-row" data-rx-id="${E(r.id)}">
          <span class="grow"><span class="li-title">${E(r.kind)}</span><span class="li-sub">${E([site, 'Onset ' + BT.fmt.date(r.at)].filter(Boolean).join(' · '))}</span><span class="li-sub" style="color:${r.resolvedAt ? 'var(--muted)' : 'var(--amber)'}">${status}</span></span>
          <span class="end"><span class="pill ${sv.cls}">${sv.label}</span></span>
          <span class="chev">${BT.icon('chevron', 18)}</span></button>`;
      }).join('')}</div></div>` : `<div class="card empty">Nothing ${rxFilter === 'open' ? 'open' : 'resolved'} right now.</div>`}
      ${logBtn}`;
    body.querySelector('[data-chips]').onclick = (e) => { const c = e.target.closest('[data-f]'); if (c) { rxFilter = c.dataset.f; drawReactions(body); } };
    body.querySelector('[data-rx]').onclick = () => BT.openReaction && BT.openReaction();
    body.onclick = (e) => { const r = e.target.closest('[data-rx-id]'); if (r && BT.openReaction) BT.openReaction({ id: r.dataset.rxId }); };
  }

  function drawPhotos(body) {
    const ph = photosSorted();
    const addBtn = `<button type="button" class="btn ${ph.length ? '' : 'primary'}" data-add>${BT.icon('camera', 18)} Add photo</button>`;
    if (!ph.length) {
      body.innerHTML = `<div class="card empty">${BT.icon('image', 34)}<div style="margin-bottom:14px">No photos yet. Add a before and an after photo to see your results side by side.</div>${addBtn}</div>`;
      body.querySelector('[data-add]').onclick = () => addPhoto();
      return;
    }
    body.innerHTML = `
      <div class="hist-actions">
        <button type="button" class="btn primary" data-cmp>${BT.icon('compare', 18)} Compare before and after</button>
        ${addBtn}
      </div>
      <div class="hist-grid">${ph.map((p) => `<button type="button" class="hist-tile" data-ph="${E(p.id)}" aria-label="${photoKindLabel(p.kind)} photo, ${BT.fmt.date(p.at)}"><img src="${E(p.src)}" alt="" loading="lazy"><span class="hist-tag">${photoKindLabel(p.kind)}</span><span class="hist-date">${BT.fmt.date(p.at)}</span></button>`).join('')}</div>`;
    body.querySelector('[data-cmp]').onclick = () => BT.go('compare');
    body.querySelector('[data-add]').onclick = () => addPhoto();
    body.onclick = (e) => { const t = e.target.closest('[data-ph]'); if (t) viewPhoto(t.dataset.ph); };
  }

  /* ---------- photo viewer ---------- */
  function viewPhoto(id) {
    const p = BT.data.photos.find((x) => x.id === id);
    if (!p) return;
    const inj = p.injectionId && BT.data.injections.find((i) => i.id === p.injectionId);
    const s = BT.sheet({ title: BT.fmt.date(p.at), onClose: refreshHere });
    s.body.innerHTML = `<div class="hist-view">
      <img class="big" src="${E(p.src)}" alt="${photoKindLabel(p.kind)} photo">
      <div class="card" style="padding:6px 16px">
        <div class="hist-kv"><span class="muted">Taken</span><span>${E(BT.fmt.dateLong(p.at))}</span></div>
        ${inj ? `<div class="hist-kv" style="border-top:1px solid var(--line)"><span class="muted">Treatment</span><button type="button" class="link-btn" data-inj>${E(injLabel(inj))}</button></div>` : ''}
        <div class="hist-kv" style="border-top:1px solid var(--line)"><span class="muted">Type</span><span data-seg></span></div>
      </div>
      <button type="button" class="btn danger" data-del>${BT.icon('trash', 18)} Delete photo</button></div>`;
    s.body.querySelector('[data-seg]').appendChild(BT.seg([['before', 'Before'], ['after', 'After']], p.kind === 'after' ? 'after' : 'before', (v) => { p.kind = v; BT.save('photos', p); }));
    const il = s.body.querySelector('[data-inj]');
    if (il) il.onclick = () => { s.close(); BT.go('injection', inj.id); };
    s.body.querySelector('[data-del]').onclick = async () => {
      if (await BT.confirm('This removes the photo from your history. It cannot be undone.')) {
        BT.remove('photos', p.id);
        s.close();
      }
    };
  }

  /* ---------- add photo ---------- */
  async function addPhoto(opts = {}) {
    const file = await BT.photo.pick();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const today = BT.toLocalInput(Date.now()).slice(0, 10);
    const injs = BT.sortedInjections();
    let kind = opts.kind || 'before';
    const s = BT.sheet({ title: 'Add photo', onClose: () => { URL.revokeObjectURL(url); refreshHere(); } });
    s.body.innerHTML = `<img class="hist-prev" src="${url}" alt="Selected photo">
      <div class="field"><label>Type</label><div data-seg></div></div>
      <div class="field"><label for="hp-date">Date taken</label><input id="hp-date" class="input" type="date" value="${today}" max="${today}"></div>
      <div class="field"><label for="hp-inj">Treatment (optional)</label><select id="hp-inj" class="input"><option value="">None</option>${injs.map((i) => `<option value="${E(i.id)}" ${i.id === opts.injectionId ? 'selected' : ''}>${E(injLabel(i))}</option>`).join('')}</select></div>
      <button type="button" class="btn primary" data-save>Save photo</button>`;
    s.body.querySelector('[data-seg]').appendChild(BT.seg([['before', 'Before'], ['after', 'After']], kind, (v) => (kind = v)));
    const save = s.body.querySelector('[data-save]');
    save.onclick = async () => {
      save.disabled = true; save.textContent = 'Saving…';
      try {
        const src = await BT.photo.store(file);
        const dv = s.body.querySelector('#hp-date').value;
        const at = !dv || dv === today ? Date.now() : new Date(dv + 'T12:00:00').getTime();
        BT.save('photos', { kind, at, src, injectionId: s.body.querySelector('#hp-inj').value || null });
        BT.toast('Photo saved');
        s.close();
      } catch (e) {
        console.error(e);
        save.disabled = false; save.textContent = 'Save photo';
        BT.toast('Could not save that photo');
      }
    };
  }

  /* ---------- compare screen ---------- */
  function pickDefaults(injectionId) {
    const ph = photosSorted();
    const latest = (kind, linked) => ph.find((p) => p.kind === kind && (!linked || p.injectionId === linked));
    let b = (injectionId && latest('before', injectionId)) || latest('before');
    // A treatment's own check-in after photo (#15) wins over any other after photo.
    const inj = injectionId && BT.checkin && BT.data.injections.find((i) => i.id === injectionId);
    let a = (inj && BT.checkin.after(inj)) || (injectionId && latest('after', injectionId)) || latest('after');
    if (!b) b = [...ph].reverse().find((p) => !a || p.id !== a.id);
    if (!a) a = ph.find((p) => !b || p.id !== b.id);
    if (b && a && b.id === a.id) a = ph.find((p) => p.id !== b.id) || a;
    return { b: b && b.id, a: a && a.id };
  }

  BT.screen('compare', {
    title: 'Before & After',
    render(root, injectionId) {
      const wrap = document.createElement('div');
      wrap.className = 'hist';
      root.appendChild(wrap);
      const ph = photosSorted();
      if (ph.length < 2) {
        wrap.innerHTML = `${BT.navHeader('Before & After')}
          <div class="card empty">${BT.icon('compare', 34)}<div style="margin-bottom:14px">Comparing needs at least two photos. You have ${ph.length}. Add a before photo and an after photo, ideally in the same light and angle.</div><button type="button" class="btn primary" data-add>${BT.icon('camera', 18)} Add photo</button></div>`;
        wrap.querySelector('[data-add]').onclick = () => addPhoto({ injectionId, kind: ph.length ? 'after' : 'before' });
        return;
      }
      const key = injectionId || '';
      const ids = new Set(ph.map((p) => p.id));
      if (cmp.key !== key || !ids.has(cmp.b) || !ids.has(cmp.a)) cmp = { key, ...pickDefaults(injectionId) };

      wrap.innerHTML = `${BT.navHeader('Before & After')}
        <section class="card stack"><div class="stack-s"><span class="eyebrow">Before photo</span><div class="hist-strip" data-strip="b"></div></div>
        <div class="stack-s"><span class="eyebrow">After photo</span><div class="hist-strip" data-strip="a"></div></div></section>
        <div class="row" style="justify-content:center" data-mode></div>
        <div data-view class="stack"></div>
        <button type="button" class="btn" data-add>${BT.icon('camera', 18)} Add photo</button>`;
      wrap.querySelector('[data-mode]').appendChild(BT.seg(['Slider', 'Side by side'], cmpMode, (v) => { cmpMode = v; drawView(); }));
      wrap.querySelector('[data-add]').onclick = () => addPhoto({ injectionId });

      const byId = (id) => ph.find((p) => p.id === id);
      const drawStrips = () => {
        ['b', 'a'].forEach((w) => {
          const el = wrap.querySelector(`[data-strip="${w}"]`);
          el.innerHTML = ph.map((p) => `<button type="button" class="hist-th ${p.id === cmp[w] ? 'on' : ''}" data-id="${E(p.id)}" aria-label="${photoKindLabel(p.kind)} ${BT.fmt.date(p.at)}"><img src="${E(p.src)}" alt=""><span>${BT.fmt.date(p.at)}</span></button>`).join('');
          el.onclick = (e) => { const t = e.target.closest('[data-id]'); if (!t) return; cmp[w] = t.dataset.id; drawStrips(); drawView(); };
        });
      };
      const dayText = (a) => {
        const inj = a.injectionId && BT.data.injections.find((i) => i.id === a.injectionId);
        return inj ? `Day ${Math.max(0, Math.round((a.at - inj.at) / BT.DAY))} after treatment` : '';
      };
      const drawView = () => {
        const b = byId(cmp.b), a = byId(cmp.a), view = wrap.querySelector('[data-view]');
        if (!b || !a) return;
        const dt = dayText(a);
        const caption = `<div class="hist-side">
          <div class="hist-cap"><span class="eyebrow">Before</span><span>${E(BT.fmt.dateLong(b.at))}</span></div>
          <div class="hist-cap"><span class="eyebrow">After</span><span>${E(BT.fmt.dateLong(a.at))}</span>${dt ? `<span class="pill blue" style="justify-self:start">${E(dt)}</span>` : ''}</div></div>`;
        if (cmpMode === 'Slider') {
          view.innerHTML = `<div class="hist-stage" data-stage>
            <img src="${E(b.src)}" alt="Before">
            <div class="hist-after" data-after><img src="${E(a.src)}" alt="After"></div>
            <span class="hist-lab" style="left:10px">BEFORE</span><span class="hist-lab" style="right:10px">AFTER</span>
            <div class="hist-handle" data-handle role="slider" tabindex="0" aria-label="Comparison divider" aria-valuemin="0" aria-valuemax="100"><span class="hist-knob">&lsaquo;&rsaquo;</span></div></div>${caption}`;
          const stage = view.querySelector('[data-stage]'), after = view.querySelector('[data-after]'), handle = view.querySelector('[data-handle]');
          const set = (pct) => {
            sliderPos = Math.max(0, Math.min(100, pct));
            after.style.clipPath = `inset(0 0 0 ${sliderPos}%)`;
            handle.style.left = sliderPos + '%';
            handle.setAttribute('aria-valuenow', Math.round(sliderPos));
          };
          set(sliderPos);
          let drag = false;
          const move = (e) => { const r = stage.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
          stage.addEventListener('pointerdown', (e) => { drag = true; try { stage.setPointerCapture(e.pointerId); } catch (x) {} move(e); });
          stage.addEventListener('pointermove', (e) => { if (drag) move(e); });
          const end = () => { drag = false; };
          stage.addEventListener('pointerup', end);
          stage.addEventListener('pointercancel', end);
          handle.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { set(sliderPos - 4); e.preventDefault(); }
            if (e.key === 'ArrowRight') { set(sliderPos + 4); e.preventDefault(); }
          });
        } else {
          view.innerHTML = `<div class="hist-side">
            <div class="cell"><div class="pic"><img src="${E(b.src)}" alt="Before"><span class="hist-lab" style="left:8px">BEFORE</span></div></div>
            <div class="cell"><div class="pic"><img src="${E(a.src)}" alt="After"><span class="hist-lab" style="left:8px">AFTER</span></div></div></div>${caption}`;
        }
      };
      drawStrips();
      drawView();
    },
  });
})();
