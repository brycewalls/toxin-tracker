/* Stock tab: vial inventory, styled after PepPedia's Inventory screen. */
(function () {
  if (!document.getElementById('stock-css')) {
    const st = document.createElement('style');
    st.id = 'stock-css';
    st.textContent = `
.stk-add { width: 44px; height: 44px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; flex: none; box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 35%, transparent); }
.stk-sum { display: grid; gap: 12px; }
.stk-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.stk-vial { cursor: pointer; display: grid; gap: 12px; padding: 16px; }
.stk-vial:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.stk-top { display: flex; gap: 14px; align-items: flex-start; }
.stk-thumb { width: 64px; height: 80px; border-radius: 16px; background: var(--card-2); display: grid; place-items: center; flex: none; border: 1px solid var(--line); }
.stk-info { min-width: 0; flex: 1; display: grid; gap: 2px; }
.stk-name { font-family: var(--font-display); font-size: 19px; font-weight: 500; letter-spacing: -.01em; }
.stk-menu { width: 40px; height: 40px; margin: -6px -8px 0 0; border-radius: 50%; display: grid; place-items: center; color: var(--muted); flex: none; }
.stk-menu:hover { background: var(--card-2); }
.stk-div { height: 1px; background: var(--line); }
.stk-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.stk-avail { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); min-width: 0; }
.stk-avail b { color: var(--fg); font-weight: 500; }
.stk-bar { height: 5px; border-radius: 3px; background: var(--card-2); overflow: hidden; }
.stk-bar > i { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
.stk-bar.low > i { background: var(--amber); }
.stk-bar.out > i { background: var(--red); }
.stk-exp { font-size: 12.5px; color: var(--muted); }
.stk-exp.amber { color: var(--amber); } .stk-exp.red { color: var(--red); }
.stk-err { color: var(--red); font-size: 12.5px; }
.stk-act { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 0 16px; border-radius: 14px; background: var(--card); border: 1px solid var(--line); font-size: 15px; text-align: left; }
.stk-act.danger { color: var(--red); }
.stk-hist { background: var(--card); border-radius: 16px; padding: 4px 14px; border: 1px solid var(--line); }
.stk-hist .li { cursor: pointer; min-height: 52px; }
.stk-cost { display: flex; align-items: center; }
.stk-cost span { position: absolute; padding-left: 14px; color: var(--muted); }
.stk-cost .input { padding-left: 28px; }
`;
    document.head.appendChild(st);
  }

  const day = () => BT.DAY;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function info(v) {
    const now = Date.now();
    const remaining = BT.vialRemaining(v);
    const total = v.unitsTotal || 0;
    const pct = total ? remaining / total : 0;
    const expired = !!v.expiresAt && v.expiresAt < now;
    const daysLeft = v.expiresAt ? Math.ceil((v.expiresAt - now) / day()) : null;
    return {
      remaining, total, used: Math.max(0, total - remaining), pct, expired, daysLeft,
      expSoon: !expired && daysLeft !== null && daysLeft <= 30,
      active: remaining > 0 && !expired,
      low: remaining > 0 && !expired && pct < 0.2,
      linked: BT.data.injections.some((i) => i.vialId === v.id),
    };
  }

  function vialSvg(p, pct, size) {
    const id = 'c' + BT.uid(), col = p.color;
    const h = 36 * Math.max(pct > 0 ? 0.05 : 0, Math.min(1, pct));
    return `<svg width="${size * 0.67}" height="${size}" viewBox="0 0 40 60" fill="none" aria-hidden="true">
      <defs><clipPath id="${id}"><rect x="7" y="16" width="26" height="40" rx="6"/></clipPath></defs>
      <rect x="13" y="11" width="14" height="7" fill="var(--card)" stroke="var(--faint)" stroke-width="1.2"/>
      <rect x="7" y="16" width="26" height="40" rx="6" fill="var(--card)" stroke="var(--faint)" stroke-width="1.2"/>
      <g clip-path="url(#${id})"><rect x="7" y="${(56 - h).toFixed(2)}" width="26" height="${h.toFixed(2)}" fill="${col}" fill-opacity=".38"/>
        ${h > 0 ? `<rect x="7" y="${(56 - h).toFixed(2)}" width="26" height="1.4" fill="${col}" fill-opacity=".7"/>` : ''}</g>
      <path d="M11 22v26" stroke="var(--faint)" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="11" y="2" width="18" height="8" rx="2.5" fill="${col}"/>
      <rect x="9" y="8" width="22" height="4" rx="1.5" fill="${col}" fill-opacity=".7"/>
    </svg>`;
  }

  function expiryLine(v, s) {
    if (!v.expiresAt) return '';
    if (s.expired) return `<div class="stk-exp red">Expired ${BT.fmt.date(v.expiresAt)}</div>`;
    if (s.expSoon) return `<div class="stk-exp amber">${s.daysLeft <= 0 ? 'Expires today' : 'Expires in ' + plural(s.daysLeft, 'day')}</div>`;
    return `<div class="stk-exp">Expires ${BT.fmt.date(v.expiresAt)}</div>`;
  }

  function openedLine(v, s) {
    if (!v.openedAt) return '';
    const d = Math.floor((Date.now() - v.openedAt) / day());
    const ago = d <= 0 ? 'today' : plural(d, 'day') + ' ago';
    return `<div class="stk-exp">Opened ${ago}</div>${s.remaining > 0 ? `<div class="tiny faint">Check your clinic's beyond-use date once opened</div>` : ''}`;
  }

  function card(v) {
    const p = BT.product(v.productId), s = info(v);
    const sub1 = `${v.unitsTotal}U vial${v.dilutionMl ? ` · ${v.dilutionMl} mL saline` : ''}`;
    const sub2 = [v.clinic, v.lot ? 'LOT ' + v.lot : ''].filter(Boolean).join(' · ');
    return `<article class="card stk-vial" data-id="${BT.esc(v.id)}" tabindex="0" role="button" aria-label="${BT.esc(p.name)} vial details">
      <div class="stk-top">
        <div class="stk-thumb">${vialSvg(p, s.pct, 62)}</div>
        <div class="stk-info">
          <div class="stk-name">${BT.esc(p.name)}${v.sample ? ' <span class="sample-tag">Sample</span>' : ''}</div>
          <div class="small muted">${BT.esc(sub1)}</div>
          ${sub2 ? `<div class="small muted" style="overflow-wrap:anywhere">${BT.esc(sub2)}</div>` : ''}
          ${expiryLine(v, s)}${openedLine(v, s)}
        </div>
        <button class="stk-menu" data-menu="${BT.esc(v.id)}" aria-label="Vial actions">${BT.icon('dots', 22)}</button>
      </div>
      <div class="stk-bar ${s.remaining <= 0 ? 'out' : s.low ? 'low' : ''}" aria-hidden="true"><i style="width:${Math.round(s.pct * 100)}%"></i></div>
      <div class="stk-div"></div>
      <div class="stk-foot">
        <div class="stk-avail">${BT.icon('syringe', 18)}<span><b class="num">${BT.fmt.units(s.remaining).replace('U', '')}</b> available · <span class="num">${BT.fmt.units(s.used).replace('U', '')}</span> used</span></div>
        ${s.linked ? '<span class="pill green">Linked</span>' : '<span class="pill">Not linked</span>'}
      </div>
    </article>`;
  }

  function sortVials(list) {
    return [...list].sort((a, b) => {
      const sa = info(a), sb = info(b);
      if (sa.active !== sb.active) return sa.active ? -1 : 1;
      return (a.expiresAt || Infinity) - (b.expiresAt || Infinity);
    });
  }

  function summary(vials) {
    const infos = vials.map((v) => ({ v, s: info(v) }));
    const act = infos.filter((x) => x.s.active);
    const units = act.reduce((a, x) => a + x.s.remaining, 0);
    const soon = act.filter((x) => x.s.expSoon).length;
    const expiredStock = infos.filter((x) => x.s.expired && x.s.remaining > 0).length;
    const low = act.filter((x) => x.s.low);
    const pills = [];
    if (expiredStock) pills.push(`<span class="pill red">${BT.icon('alert', 13)}${expiredStock} expired</span>`);
    if (soon) pills.push(`<span class="pill amber">${BT.icon('clock', 13)}${soon} expiring within 30 days</span>`);
    if (low.length) pills.push(`<span class="pill amber">${BT.icon('drop', 13)}Low stock</span>`);
    if (!pills.length && act.length) pills.push('<span class="pill green">All in date</span>');
    const lowNote = low.length
      ? `<div class="callout" style="background:var(--amber-soft);border-color:transparent;color:var(--amber)">Low stock: ${low.map((x) => `${BT.esc(BT.product(x.v.productId).name)} has ${BT.fmt.units(x.s.remaining)} left`).join('; ')}.</div>` : '';
    return `<section class="card stk-sum">
      <div class="eyebrow">Units on hand</div>
      <div class="row between" style="align-items:flex-end;gap:12px">
        <div class="big-num">${Math.round(units * 10) / 10}<small>U</small></div>
        <div class="small muted" style="text-align:right">${plural(act.length, 'active vial')}</div>
      </div>
      ${pills.length ? `<div class="stk-pills">${pills.join('')}</div>` : ''}${lowNote}
    </section>`;
  }

  /* ---------- actions ---------- */
  function openMenu(v) {
    const p = BT.product(v.productId);
    const sh = BT.sheet({ title: p.name + (v.lot ? ' · ' + v.lot : '') });
    sh.body.innerHTML = `<div class="stack-s">
      <button class="stk-act" data-a="edit">${BT.icon('edit', 20)}Edit</button>
      <button class="stk-act" data-a="open">${BT.icon('vial', 20)}${v.openedAt ? 'Mark unopened' : 'Mark opened'}</button>
      <button class="stk-act danger" data-a="del">${BT.icon('trash', 20)}Delete</button></div>`;
    sh.body.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'edit') { sh.close(); setTimeout(() => openForm(v), 120); }
      else if (a === 'open') {
        BT.save('vials', { ...v, openedAt: v.openedAt ? null : Date.now() });
        BT.toast(v.openedAt ? 'Marked unopened' : 'Marked opened'); sh.close();
      } else if (a === 'del') {
        sh.close();
        const n = BT.data.injections.filter((i) => i.vialId === v.id).length;
        setTimeout(() => BT.confirm(`Delete this ${p.name} vial?${n ? ` The ${plural(n, 'logged injection')} stay in your history but will no longer count against a vial.` : ''}`).then((ok) => { if (ok) { BT.remove('vials', v.id); BT.toast('Vial deleted'); } }), 300);
      }
    };
  }

  function openDetail(v) {
    const p = BT.product(v.productId), s = info(v);
    const inj = BT.data.injections.filter((i) => i.vialId === v.id).sort((a, b) => a.at - b.at);
    let cum = 0;
    const pts = inj.map((i) => ({ x: i.at, y: (cum += BT.injectionUnits(i)) }));
    if (pts.length) pts.unshift({ x: pts[0].x - 7 * day(), y: 0 });
    const hist = [...inj].reverse().map((i) => {
      const n = (i.sites || []).length;
      return `<div class="li" data-inj="${BT.esc(i.id)}" role="button" tabindex="0"><div class="grow"><div class="li-title">${BT.fmt.dateLong(i.at)}</div><div class="li-sub">${plural(n, 'site')} · ${BT.fmt.time(i.at)}</div></div><div class="num">${BT.fmt.units(BT.injectionUnits(i))}</div><span class="faint">${BT.icon('chevron', 18)}</span></div>`;
    }).join('');
    const sh = BT.sheet({ title: p.name + ' vial', action: { label: 'Edit', onClick: (close) => { close(); setTimeout(() => openForm(v), 120); } } });
    sh.body.innerHTML = `
      <div class="card">
        <div class="row gap" style="align-items:center">
          <div class="stk-thumb">${vialSvg(p, s.pct, 62)}</div>
          <div class="grow">
            <div class="big-num">${Math.round(s.remaining * 10) / 10}<small>of ${s.total}U left</small></div>
            <div class="small muted" style="margin-top:6px">${v.dilutionMl ? v.dilutionMl + ' mL saline' : ''}${v.clinic ? (v.dilutionMl ? ' · ' : '') + BT.esc(v.clinic) : ''}</div>
            ${expiryLine(v, s)}${openedLine(v, s)}
          </div>
        </div>
        ${v.cost ? `<div class="small muted" style="margin-top:10px">Cost $${BT.esc(v.cost)}${s.total && v.cost ? ` · about $${(v.cost / s.total).toFixed(2)} per unit` : ''}</div>` : ''}
        ${v.notes ? `<div class="small" style="margin-top:8px">${BT.esc(v.notes)}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-h"><h3>Usage over time</h3><span class="small muted">${BT.fmt.units(s.used)} used</span></div>
        ${pts.length ? BT.areaChart(pts, { w: 320, h: 96, yMax: Math.max(s.total, cum) }) : '<div class="small muted">No injections have drawn from this vial yet.</div>'}
      </div>
      ${inj.length ? `<div><div class="eyebrow" style="margin:0 4px 8px">Injections from this vial</div><div class="stk-hist">${hist}</div></div>` : ''}`;
    sh.body.onclick = (e) => {
      const r = e.target.closest('[data-inj]'); if (!r) return;
      sh.close(); BT.go('injection', r.dataset.inj);
    };
  }

  /* ---------- add / edit form ---------- */
  const dateStr = (t) => (t ? BT.toLocalInput(t).slice(0, 10) : '');
  const parseDate = (s, endOfDay) => (s ? new Date(s + (endOfDay ? 'T23:59:00' : 'T12:00:00')).getTime() : null);

  function openForm(v) {
    const edit = !!v;
    const p0 = BT.product(v ? v.productId : 'botox');
    const f = {
      productId: p0.id,
      units: v ? v.unitsTotal : p0.vialUnits,
      ml: v ? v.dilutionMl : 2.5,
      lot: v ? v.lot || '' : '',
      clinic: v ? v.clinic || '' : '',
      exp: v ? dateStr(v.expiresAt) : '',
      opened: !!(v && v.openedAt),
      openedOn: v && v.openedAt ? dateStr(v.openedAt) : '',
      cost: v && v.cost ? String(v.cost) : '',
      notes: v ? v.notes || '' : '',
    };
    let err = {};
    const used = edit ? BT.data.injections.filter((i) => i.vialId === v.id).reduce((a, i) => a + BT.injectionUnits(i), 0) : 0;
    const E = (k) => (err[k] ? `<div class="stk-err" role="alert">${BT.esc(err[k])}</div>` : '');

    function save(close) {
      err = {};
      const units = Math.round((+f.units) * 10) / 10, ml = +f.ml, cost = f.cost === '' ? 0 : +f.cost;
      if (!(units >= 1)) err.units = 'Enter the total units in the vial.';
      else if (edit && units < used) err.units = `${used}U has already been drawn from this vial.`;
      if (!(ml > 0)) err.ml = 'Choose how much saline was added.';
      if (!f.exp) err.exp = 'Enter the expiration date from the vial.';
      if (f.opened && !f.openedOn) err.openedOn = 'Enter the date you opened it.';
      else if (f.opened && parseDate(f.openedOn) > Date.now() + day()) err.openedOn = 'Opened date cannot be in the future.';
      if (!(cost >= 0)) err.cost = 'Enter a valid amount.';
      if (Object.keys(err).length) { draw(); const el = sh.body.querySelector('.stk-err'); el && el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      BT.save('vials', {
        ...(v || {}),
        productId: f.productId, unitsTotal: units, dilutionMl: ml,
        lot: f.lot.trim(), clinic: f.clinic.trim(),
        expiresAt: parseDate(f.exp, true),
        openedAt: f.opened ? parseDate(f.openedOn) : null,
        cost, notes: f.notes.trim(),
      });
      BT.toast(edit ? 'Vial updated' : 'Vial added');
      close();
    }

    const sh = BT.sheet({ title: edit ? 'Edit vial' : 'Add vial', action: { label: 'Save', onClick: save } });

    function draw() {
      const mls = [...new Set([1, 2, 2.5, 3, 4, ...(f.ml > 0 ? [+f.ml] : [])])].sort((a, b) => a - b);
      sh.body.innerHTML = `
        <div class="field"><label>Product</label><div class="chips">${BT.products.map((p) => `<button type="button" class="chip ${p.id === f.productId ? 'on' : ''}" data-prod="${p.id}">${BT.esc(p.name)}</button>`).join('')}</div></div>
        <div class="field"><label for="stk-u">Total units in vial</label>
          <div class="row gap"><div class="stepper"><button type="button" data-step="-10" aria-label="Minus 10">−</button><input id="stk-u" class="num" data-f="units" type="number" inputmode="decimal" min="1" value="${BT.esc(f.units)}"><button type="button" data-step="10" aria-label="Plus 10">+</button></div><span class="small muted">units</span></div>${E('units')}</div>
        <div class="field"><label>Saline added (mL)</label><div class="chips">${mls.map((m) => `<button type="button" class="chip ${+f.ml === m ? 'on' : ''}" data-ml="${m}">${m} mL</button>`).join('')}</div>${E('ml')}
          ${f.ml > 0 && f.units > 0 ? `<div class="tiny muted">${Math.round((f.units / f.ml) * 10) / 10} units per mL</div>` : ''}</div>
        <div class="grid-2">
          <div class="field"><label for="stk-lot">Lot number</label><input id="stk-lot" class="input" data-f="lot" value="${BT.esc(f.lot)}" autocomplete="off" autocapitalize="characters"></div>
          <div class="field"><label for="stk-clinic">Clinic or vendor</label><input id="stk-clinic" class="input" data-f="clinic" value="${BT.esc(f.clinic)}" autocomplete="off"></div>
        </div>
        <div class="field"><label for="stk-exp">Expiration date</label><input id="stk-exp" class="input" data-f="exp" type="date" value="${BT.esc(f.exp)}">${E('exp')}</div>
        <div class="field"><label>Status</label>
          <div class="seg full"><button type="button" class="seg-b ${f.opened ? '' : 'on'}" data-open="0">Unopened</button><button type="button" class="seg-b ${f.opened ? 'on' : ''}" data-open="1">Opened</button></div>
          ${f.opened ? `<input class="input" data-f="openedOn" type="date" aria-label="Date opened" value="${BT.esc(f.openedOn)}" style="margin-top:6px">${E('openedOn')}` : ''}</div>
        <div class="field"><label for="stk-cost">Cost (optional)</label><div class="stk-cost" style="position:relative"><span>$</span><input id="stk-cost" class="input" data-f="cost" type="number" inputmode="decimal" min="0" step="0.01" value="${BT.esc(f.cost)}"></div>${E('cost')}</div>
        <div class="field"><label for="stk-notes">Notes (optional)</label><textarea id="stk-notes" class="input" data-f="notes">${BT.esc(f.notes)}</textarea></div>`;
    }
    draw();

    sh.body.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.f; if (k) f[k] = e.target.value; });
    sh.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-prod],[data-ml],[data-step],[data-open]'); if (!t) return;
      if (t.dataset.prod) { f.productId = t.dataset.prod; f.units = BT.product(t.dataset.prod).vialUnits; err = {}; }
      else if (t.dataset.ml) { f.ml = +t.dataset.ml; delete err.ml; }
      else if (t.dataset.step) { f.units = Math.max(1, (+f.units || 0) + +t.dataset.step); delete err.units; }
      else if (t.dataset.open) { f.opened = t.dataset.open === '1'; if (f.opened && !f.openedOn) f.openedOn = dateStr(Date.now()); delete err.openedOn; }
      draw();
    });
  }

  /* ---------- screen ---------- */
  BT.screen('stock', {
    title: 'Stock',
    render(root) {
      const vials = sortVials(BT.data.vials);
      root.innerHTML = `<header class="page-h"><h1 class="title-xl">Inventory</h1><button class="stk-add" data-add aria-label="Add vial">${BT.icon('plus', 24)}</button></header>
        ${vials.length ? summary(vials) + vials.map(card).join('') : `<section class="card empty">${BT.icon('vial', 44)}<h3 style="color:var(--fg);margin-bottom:6px">No vials yet</h3><p class="small" style="margin:0 0 16px">Add a vial to track units remaining and expiry</p><button class="btn primary" data-add>${BT.icon('plus', 18)}Add vial</button></section>`}`;
      root.onclick = (e) => {
        if (e.target.closest('[data-add]')) return openForm();
        const m = e.target.closest('[data-menu]');
        if (m) { e.stopPropagation(); const v = BT.data.vials.find((x) => x.id === m.dataset.menu); return v && openMenu(v); }
        const c = e.target.closest('.stk-vial');
        if (c) { const v = BT.data.vials.find((x) => x.id === c.dataset.id); v && openDetail(v); }
      };
      root.onkeydown = (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('stk-vial')) { e.preventDefault(); e.target.click(); }
      };
    },
  });
})();
