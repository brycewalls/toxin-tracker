/* Today tab + pushed screens: effect timeline, dilution calculator, settings. */
(function () {
  // Apply remembered theme as early as possible.
  const applyTheme = (v) => {
    const r = document.documentElement;
    if (v === 'light' || v === 'dark') r.dataset.theme = v; else delete r.dataset.theme;
  };
  const getTheme = () => { try { return localStorage.getItem('bt-theme') || 'system'; } catch (e) { return 'system'; } };
  applyTheme(getTheme());

  /* ---------- styles ---------- */
  if (!document.getElementById('today-css')) {
    const st = document.createElement('style');
    st.id = 'today-css';
    st.textContent = `
.t-hero-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:20px; }
.t-date { font-size:13px; letter-spacing:.02em; }
.t-greet { font-family:var(--font-display); font-size:30px; font-weight:300; letter-spacing:-.02em; line-height:1.1; margin-top:4px; }
.t-gear { width:40px; height:40px; border-radius:50%; display:grid; place-items:center; background:color-mix(in srgb, var(--hero-fg) 14%, transparent); color:var(--hero-fg); flex:none; }
.t-ring-l { color:color-mix(in srgb, var(--hero-fg) 78%, transparent); text-align:center; line-height:1.2; max-width:72px; }
.ring-c { display:flex; align-items:baseline; justify-content:center; gap:1px; } .ring-c .u { font-size:11px; opacity:.75; }
.t-bar { height:8px; border-radius:99px; background:var(--card-2); border:1px solid var(--line); overflow:hidden; }
.t-bar > i { display:block; height:100%; border-radius:99px; background:var(--accent); }
.t-bar.green > i { background:var(--green); }
.t-ex { border-radius:16px; padding:14px 16px; background:var(--accent-soft); border:1px solid var(--accent-line); display:flex; align-items:center; gap:14px; margin-bottom:6px; }
.t-ex.clear { background:var(--green-soft); border-color:transparent; }
.t-ex-ic { width:44px; height:44px; border-radius:50%; display:grid; place-items:center; background:var(--card); color:var(--accent); flex:none; }
.t-ex.clear .t-ex-ic { color:var(--green); }
.t-ex-big { font-family:var(--font-display); font-size:28px; font-weight:400; letter-spacing:-.02em; line-height:1.05; font-variant-numeric:tabular-nums; color:var(--accent); }
.t-ex.clear .t-ex-big { color:var(--green); }
.t-ac-ic { width:36px; height:36px; border-radius:50%; background:var(--card-2); color:var(--muted); display:grid; place-items:center; flex:none; }
.t-time { font-variant-numeric:tabular-nums; font-weight:500; color:var(--accent); white-space:nowrap; }
.t-days { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.t-day { display:grid; justify-items:center; gap:6px; padding:8px 0 6px; border-radius:14px; min-height:76px; align-content:start; color:var(--muted); }
.t-day .wd { font-size:11px; letter-spacing:.04em; text-transform:uppercase; }
.t-day .dn { font-size:13px; font-variant-numeric:tabular-nums; }
.t-day.today { background:var(--accent-soft); color:var(--accent); }
.t-day.today .dn { font-weight:600; }
.t-face { width:30px; height:30px; display:grid; place-items:center; color:var(--faint); }
.t-face.s1 { color:var(--red); } .t-face.s2 { color:var(--amber); } .t-face.s3 { color:var(--muted); } .t-face.s4 { color:var(--accent); } .t-face.s5 { color:var(--green); }
.t-face.empty-f { opacity:.55; }
.t-moods { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
.t-mood { display:grid; justify-items:center; gap:6px; padding:12px 0; border-radius:14px; border:1px solid var(--line); background:var(--card); min-height:64px; font-size:11px; color:var(--muted); }
.t-mood.on { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
.t-short { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.t-short button { display:grid; justify-items:center; gap:8px; padding:14px 6px; min-height:84px; text-align:center; font-size:12.5px; border-radius:var(--r); background:var(--card); border:1px solid color-mix(in srgb, var(--line) 50%, transparent); box-shadow:var(--shadow); }
.t-short .ic { color:var(--accent); }
.t-banner { display:flex; align-items:center; gap:10px; justify-content:space-between; background:var(--amber-soft); color:var(--amber); border-radius:14px; padding:10px 12px 10px 14px; font-size:13.5px; }
.t-card-tap { cursor:pointer; text-align:left; width:100%; display:block; }
.t-svg text { font-family:var(--font); }
.t-leg-dot { width:10px; height:10px; border-radius:50%; flex:none; }
.t-step { display:flex; gap:12px; align-items:flex-start; }
.t-step > div:last-child { flex:1; min-width:0; }
.t-out { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.t-out .cell { background:var(--card-2); border-radius:14px; padding:12px 14px; }
.t-out .cell .big-num { font-size:28px; margin-top:4px; }
.t-csv { width:100%; min-height:200px; font-family:var(--mono); font-size:12px; border:1px solid var(--line); border-radius:14px; padding:12px; background:var(--card); resize:vertical; }
.t-set-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:48px; }
`;
    document.head.appendChild(st);
  }

  /* ---------- helpers ---------- */
  const WEEK = 7 * BT.DAY;
  const pad = (n) => String(n).padStart(2, '0');
  const localKey = (d) => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const utcKey = (d) => new Date(d).toISOString().slice(0, 10);
  const moodFor = (day) => {
    const keys = [localKey(day), utcKey(day)];
    for (const k of keys) { const m = BT.data.moods.find((x) => x.date === k); if (m) return m; }
    return null;
  };
  const maxAftercareH = () => Math.max(...BT.aftercare.map((a) => a.hours));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const intervalWeeks = () => BT.data.settings.intervalWeeks || 12;
  const effectMax = (t) => BT.data.injections.reduce((m, i) => Math.max(m, BT.effectAt(i, t)), 0);
  const moodLabels = ['Rough', 'Low', 'Okay', 'Good', 'Great'];

  function intervalStepper(onChange) {
    const el = BT.h(`<div class="stepper"><button type="button" data-d="-1" aria-label="Fewer weeks">&minus;</button><input type="number" inputmode="numeric" min="4" max="52" value="${intervalWeeks()}" aria-label="Interval in weeks"><button type="button" data-d="1" aria-label="More weeks">+</button></div>`);
    const inp = el.querySelector('input');
    const set = (v) => { v = clamp(Math.round(+v) || 12, 4, 52); inp.value = v; onChange(v); };
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => set(+inp.value + +b.dataset.d)));
    inp.onchange = () => set(inp.value);
    return el;
  }

  /* ---------- TODAY ---------- */
  BT.screen('today', {
    title: 'Today',
    render(root) {
      const now = Date.now(), d = BT.data, last = BT.lastInjection(), s = d.settings;
      const hr = new Date().getHours();
      const greet = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';
      const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const due = BT.nextDue();

      const daysSince = last ? Math.max(0, Math.floor((now - last.at) / BT.DAY)) : null;
      const lastUnits = last ? BT.injectionUnits(last) : null;
      const weeksLeft = due ? Math.round((due - now) / WEEK) : null;
      const activeVials = d.vials.filter((v) => BT.vialRemaining(v) > 0 && (!v.expiresAt || v.expiresAt > now)).length;
      const openReactions = d.reactions.filter((r) => !r.resolvedAt).length;
      const ring = (val, label, unit) => `<div class="ring"><div class="ring-c num">${val}${unit ? `<span class="u">${unit}</span>` : ''}</div><div class="t-ring-l">${label}</div></div>`;

      let h = `<section class="hero">
        <div class="t-hero-top"><div><div class="muted t-date">${BT.esc(dateLine)}</div><div class="t-greet">${greet}${(s.name || (BT.account?.name || '').split(' ')[0]) ? ', ' + BT.esc(s.name || BT.account.name.split(' ')[0]) : ''}</div></div>
        <button class="t-gear" data-go="settings" aria-label="Settings">${BT.icon('gear', 20)}</button></div>
        <div class="rings">
          ${ring(daysSince ?? '--', 'Days since treatment', daysSince === null ? '' : 'd')}
          ${ring(lastUnits ?? '--', 'Units last session', lastUnits === null ? '' : 'U')}
          ${ring(weeksLeft === null ? '--' : weeksLeft <= 0 ? 'Due' : weeksLeft, 'Weeks until next', weeksLeft > 0 ? 'w' : '')}
          ${ring(activeVials, 'Active vials')}
          ${ring(openReactions, 'Open reactions')}
        </div></section>`;

      // Aftercare
      const maxH = maxAftercareH();
      if (last && now < last.at + maxH * BT.HOUR) {
        const ex = BT.aftercare.find((a) => a.id === 'exercise') || BT.aftercare[0];
        const exEnd = last.at + ex.hours * BT.HOUR, exLeft = exEnd - now;
        const pct = clamp(((now - last.at) / (maxH * BT.HOUR)) * 100, 0, 100);
        const rows = BT.aftercare.filter((a) => a.id !== ex.id).map((a) => {
          const end = last.at + a.hours * BT.HOUR, clear = now >= end;
          return `<div class="li"><div class="t-ac-ic">${BT.icon(a.icon, 18)}</div><div class="grow"><div class="li-title">${BT.esc(a.label)}</div><div class="li-sub">${BT.esc(a.detail)}</div></div>
            ${clear ? `<span class="pill green">${BT.icon('check', 12)} Clear</span>` : `<span class="t-time" data-until="${end}">${BT.fmt.countdown(end - now)}</span>`}</div>`;
        }).join('');
        h += `<section class="card"><div class="card-h"><h3>Aftercare</h3><span class="pill blue">Treated ${BT.esc(BT.fmt.ago(last.at))}</span></div>
          <div class="t-ex ${exLeft <= 0 ? 'clear' : ''}"><div class="t-ex-ic">${BT.icon(ex.icon, 24)}</div><div class="grow">
            <div class="small muted">${exLeft <= 0 ? 'You can exercise again' : 'Exercise again in'}</div>
            ${exLeft <= 0 ? `<div class="t-ex-big">Clear</div>` : `<div class="t-ex-big" data-until="${exEnd}">${BT.fmt.countdown(exLeft)}</div>`}
            <div class="tiny muted">${BT.esc(ex.detail)}</div></div></div>
          <div class="list">${rows}</div>
          <div class="t-bar" style="margin-top:10px" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
          <div class="tiny muted" style="margin-top:6px">${Math.round(pct)}% through the first ${maxH} hours</div></section>`;
      } else {
        const sub = last ? `The last window ended ${BT.fmt.ago(last.at + maxH * BT.HOUR)}.` : 'Log a treatment to start the aftercare timers.';
        h += `<section class="card"><div class="row gap"><div class="check-ring">${BT.icon('check', 16)}</div><div class="grow"><div class="li-title">All clear. No aftercare windows running.</div><div class="li-sub">${BT.esc(sub)}</div></div></div></section>`;
      }

      // Mood
      let days = '';
      const todayKey = localKey(now);
      for (let k = 6; k >= 0; k--) {
        const day = now - k * BT.DAY, m = moodFor(day), isT = localKey(day) === todayKey;
        days += `<button class="t-day ${isT ? 'today' : ''}" data-mood="${localKey(day)}" aria-label="Mood for ${BT.esc(BT.fmt.date(day))}">
          <span class="wd">${BT.esc(new Date(day).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3))}</span>
          <span class="t-face ${m ? 's' + m.score : 'empty-f'}">${BT.moodFace(m ? m.score : 3, 28)}</span>
          <span class="dn">${new Date(day).getDate()}</span></button>`;
      }
      h += `<section class="card"><div class="card-h"><h3>How are you?</h3><span class="tiny muted">Tap a day</span></div><div class="t-days">${days}</div></section>`;

      // Effect
      if (last) {
        const cur = Math.round(BT.effectAt(last, now) * 100), p = BT.product(last.productId);
        const pts = []; for (let k = 120; k >= 0; k--) pts.push({ x: 120 - k, y: effectMax(now - k * BT.DAY) });
        h += `<button class="card t-card-tap" data-go="effect"><div class="card-h"><span class="eyebrow">Effect level</span>${BT.icon('chevron', 18)}</div>
          <div class="row between" style="align-items:flex-end;gap:12px"><div><div class="big-num">${cur}<small>%</small></div><div class="small muted" style="margin-top:6px">${BT.esc(p.name)}, estimated</div></div>
          <div style="width:58%">${BT.areaChart(pts, { w: 200, h: 70, yMax: 1 })}</div></div>
          <div class="tiny faint" style="margin-top:8px">Last 120 days</div></button>`;
      }

      // Next treatment
      if (last && due) {
        const total = intervalWeeks() * WEEK, pct = clamp(((now - last.at) / total) * 100, 0, 100);
        const wl = Math.ceil((due - now) / WEEK);
        h += `<section class="card"><div class="card-h"><h3>Next treatment</h3>${due <= now ? '<span class="pill amber">Due now</span>' : `<span class="pill blue">${wl} wk${wl === 1 ? '' : 's'} left</span>`}</div>
          <div class="big-num" style="font-size:26px">${BT.esc(BT.fmt.dateLong(due))}</div>
          <div class="t-bar" style="margin:14px 0 6px"><i style="width:${pct}%"></i></div>
          <div class="row between tiny muted"><span>${BT.esc(BT.fmt.date(last.at))}</span><span>${Math.round(pct)}%</span><span>${BT.esc(BT.fmt.date(due))}</span></div>
          <div class="row between" style="margin-top:14px"><div><div class="li-title">Interval</div><div class="li-sub">Weeks between treatments</div></div><span data-step></span></div></section>`;
      } else {
        h += `<section class="card"><div class="card-h"><h3>Next treatment</h3></div><div class="small muted">Your due date shows up after your first logged treatment.</div>
          <div class="row between" style="margin-top:14px"><div><div class="li-title">Interval</div><div class="li-sub">Weeks between treatments</div></div><span data-step></span></div></section>`;
      }

      // Recent
      const recent = BT.sortedInjections().slice(0, 3);
      h += `<section class="card"><div class="card-h"><h3>Recent</h3></div>${recent.length ? `<div class="list">${recent.map((i) => {
        const p = BT.product(i.productId);
        return `<button class="li" style="width:100%;text-align:left" data-inj="${BT.esc(i.id)}"><span class="dot" style="background:${p.color}"></span><div class="grow"><div class="li-title">${BT.esc(BT.fmt.dateLong(i.at))}</div><div class="li-sub">${BT.esc(p.name)} · ${BT.fmt.units(BT.injectionUnits(i))} · ${(i.sites || []).length} site${(i.sites || []).length === 1 ? '' : 's'}</div></div><span class="muted">${BT.icon('chevron', 18)}</span></button>`;
      }).join('')}</div>` : '<div class="empty" style="padding:16px">No treatments logged yet. Tap the plus button to add one.</div>'}</section>`;

      // Shortcuts
      h += `<div class="t-short"><button data-go="calculator">${BT.icon('calc', 24)}<span>Dilution Calculator</span></button><button data-go="compare">${BT.icon('compare', 24)}<span>Before / After</span></button><button data-go="settings">${BT.icon('gear', 24)}<span>Settings</span></button></div>`;

      if (BT.hasSample()) h += `<div class="t-banner"><span>You are looking at sample data</span><button class="btn sm" data-clear>Clear sample</button></div>`;
      h += `<p class="disclaimer">For personal tracking only. Not medical advice.</p>`;

      root.innerHTML = h;
      root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => BT.go(b.dataset.go)));
      root.querySelectorAll('[data-inj]').forEach((b) => (b.onclick = () => BT.go('injection', b.dataset.inj)));
      root.querySelectorAll('[data-mood]').forEach((b) => (b.onclick = () => moodSheet(b.dataset.mood)));
      const clr = root.querySelector('[data-clear]'); if (clr) clr.onclick = () => BT.clearSample();
      const stp = root.querySelector('[data-step]'); if (stp) stp.replaceWith(intervalStepper((v) => BT.save('settings', { intervalWeeks: v })));
    },
  });

  function moodSheet(key) {
    const [y, m, dd] = key.split('-').map(Number);
    const dayDate = new Date(y, m - 1, dd, 12);
    const existing = BT.data.moods.find((x) => x.date === key) || moodFor(dayDate);
    const sh = BT.sheet({ title: dayDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) });
    sh.body.innerHTML = `<div class="small muted">How are you feeling?</div><div class="t-moods">${[1, 2, 3, 4, 5].map((n) => `<button class="t-mood ${existing && existing.score === n ? 'on' : ''}" data-n="${n}" aria-label="${moodLabels[n - 1]}"><span class="t-face s${n}">${BT.moodFace(n, 30)}</span>${moodLabels[n - 1]}</button>`).join('')}</div>${existing ? '<button class="btn ghost" data-rm>Clear this day</button>' : ''}`;
    sh.body.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => {
      const rec = existing ? { ...existing } : {};
      rec.date = key; rec.score = +b.dataset.n; delete rec.sample;
      BT.save('moods', rec); sh.close(); setTimeout(() => BT.render(), 40);
    }));
    const rm = sh.body.querySelector('[data-rm]');
    if (rm) rm.onclick = () => { BT.remove('moods', existing.id); sh.close(); setTimeout(() => BT.render(), 40); };
  }

  /* ---------- EFFECT TIMELINE ---------- */
  let effRange = '90';
  BT.screen('effect', {
    title: 'Effect Timeline',
    render(root) {
      const ranges = [['30', '30d'], ['90', '90d'], ['182', '6m'], ['365', '1y']];
      root.innerHTML = `${BT.navHeader('Effect Timeline')}
        <div class="chips" data-r>${ranges.map(([v, l]) => `<button class="chip ${v === effRange ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
        <section class="card"><div data-chart></div><p class="tiny muted" style="margin:10px 0 0">Curve is an illustrative estimate based on typical onset, peak and duration.</p></section>
        <section class="card"><div class="card-h"><h3>Treatments</h3></div><div class="list" data-leg></div></section>
        <p class="disclaimer">For personal tracking only. Not medical advice.</p>`;
      const draw = () => {
        const days = +effRange, now = Date.now(), start = now - days * BT.DAY, end = now + days * 0.2 * BT.DAY;
        const W = 340, H = 230, L = 36, R = 10, T = 14, B = 28, pw = W - L - R, ph = H - T - B;
        const sx = (t) => L + ((t - start) / (end - start)) * pw, sy = (v) => T + (1 - v) * ph;
        const N = 160, pts = [];
        for (let k = 0; k <= N; k++) { const t = start + ((end - start) * k) / N; pts.push([sx(t), sy(effectMax(t))]); }
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        const area = `${line} L${pts[N][0].toFixed(1)},${T + ph} L${pts[0][0].toFixed(1)},${T + ph} Z`;
        let svg = `<svg class="t-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Estimated effect over time"><defs><linearGradient id="effg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>`;
        [0, 0.5, 1].forEach((v) => { svg += `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="10" fill="var(--faint)">${v * 100}%</text>`; });
        svg += `<path d="${area}" fill="url(#effg)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
        BT.data.injections.filter((i) => i.at >= start && i.at <= end).forEach((i) => {
          const p = BT.product(i.productId), x = sx(i.at);
          svg += `<line x1="${x}" x2="${x}" y1="${T}" y2="${T + ph}" stroke="${p.color}" stroke-width="1.2" stroke-dasharray="3 3"/><circle cx="${x}" cy="${T + ph}" r="3.5" fill="${p.color}" stroke="var(--card)" stroke-width="1.5"/>`;
        });
        const tx = sx(now);
        svg += `<line x1="${tx}" x2="${tx}" y1="${T}" y2="${T + ph}" stroke="var(--fg)" stroke-width="1.2"/><text x="${tx}" y="${T - 3}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--fg)">Today</text>`;
        const ticks = 4;
        for (let k = 0; k <= ticks; k++) {
          const t = start + ((end - start) * k) / ticks, anchor = k === 0 ? 'start' : k === ticks ? 'end' : 'middle';
          svg += `<text x="${sx(t)}" y="${H - 8}" text-anchor="${anchor}" font-size="10" fill="var(--muted)">${BT.esc(new Date(t).toLocaleDateString(undefined, days > 200 ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' }))}</text>`;
        }
        root.querySelector('[data-chart]').innerHTML = svg + '</svg>';
        const items = BT.sortedInjections().filter((i) => i.at <= end && i.at + BT.product(i.productId).wearWeeks * WEEK >= start);
        root.querySelector('[data-leg]').innerHTML = items.length ? items.map((i) => {
          const p = BT.product(i.productId), off = i.at + p.wearWeeks * WEEK;
          return `<div class="li"><span class="t-leg-dot" style="background:${p.color}"></span><div class="grow"><div class="li-title">${BT.esc(p.name)} · ${BT.esc(BT.fmt.dateLong(i.at))}</div><div class="li-sub">${BT.fmt.units(BT.injectionUnits(i))} · Wears off ~${BT.esc(BT.fmt.date(off))}</div></div></div>`;
        }).join('') : '<div class="empty" style="padding:16px">No treatments in this range.</div>';
      };
      root.querySelector('[data-r]').onclick = (e) => {
        const b = e.target.closest('.chip'); if (!b) return;
        effRange = b.dataset.v; root.querySelectorAll('[data-r] .chip').forEach((c) => c.classList.toggle('on', c === b)); draw();
      };
      draw();
    },
  });

  /* ---------- CALCULATOR ---------- */
  const calc = { productId: 'botox', vial: 100, custom: false, customVal: 100, ml: 2.5, dose: 4 };
  BT.screen('calculator', {
    title: 'Dilution Calculator',
    render(root) {
      const vialOpts = [50, 100, 200, 300];
      root.innerHTML = `${BT.navHeader('Dilution Calculator')}
        <section class="card stack">
          <div class="t-step"><span class="step-n">1</span><div class="stack">
            <div class="li-title">What's in your vial?</div>
            <div class="field"><label for="c-prod">Product</label><select id="c-prod" class="input">${BT.products.map((p) => `<option value="${p.id}" ${p.id === calc.productId ? 'selected' : ''}>${BT.esc(p.name)}</option>`).join('')}</select></div>
            <div class="chips" data-vial>${vialOpts.map((u) => `<button class="chip ${!calc.custom && calc.vial === u ? 'on' : ''}" data-u="${u}">${u} U</button>`).join('')}<button class="chip ${calc.custom ? 'on' : ''}" data-u="custom">Custom</button></div>
            <div class="field" data-cust ${calc.custom ? '' : 'hidden'}><label for="c-cust">Vial units</label><input id="c-cust" class="input" type="number" inputmode="decimal" min="1" value="${calc.customVal}"></div>
          </div></div>
          <div class="t-step"><span class="step-n">2</span><div class="stack">
            <div class="li-title">How much saline?</div>
            <div class="chips" data-ml>${[1, 2, 2.5, 4].map((m) => `<button class="chip ${calc.ml === m ? 'on' : ''}" data-m="${m}">${m} mL</button>`).join('')}</div>
          </div></div>
          <div class="t-step"><span class="step-n">3</span><div class="stack">
            <div class="li-title">Dose per point</div>
            <div class="field"><label for="c-dose">Units per injection point</label><input id="c-dose" class="input" type="number" inputmode="decimal" min="0" step="0.5" value="${calc.dose}"></div>
          </div></div>
        </section>
        <section class="card" data-out></section>
        <p class="disclaimer">For personal tracking only. Not medical advice. Confirm every dose with your provider.</p>`;
      const out = root.querySelector('[data-out]');
      const vialUnits = () => (calc.custom ? +calc.customVal : calc.vial) || 0;
      const update = () => {
        const v = vialUnits(), perMl = calc.ml ? v / calc.ml : 0, per01 = perMl / 10, dose = +calc.dose || 0;
        const ticks = perMl ? (dose / perMl) * 100 : 0, vol = perMl ? dose / perMl : 0;
        const points = dose > 0 ? Math.floor(v / dose) : 0;
        const dys = BT.product('dysport').ratio, fmt = (n) => (Math.round(n * 100) / 100).toString();
        out.innerHTML = `<div class="card-h"><h3>Your numbers</h3></div>
          <div class="t-out">
            <div class="cell"><div class="eyebrow">Units per 0.1 mL</div><div class="big-num">${fmt(per01)}<small>U</small></div></div>
            <div class="cell"><div class="eyebrow">Units per mL</div><div class="big-num">${fmt(perMl)}<small>U</small></div></div>
            <div class="cell"><div class="eyebrow">Per dose, U-100 syringe</div><div class="big-num">${fmt(ticks)}<small>ticks</small></div></div>
            <div class="cell"><div class="eyebrow">Points from this vial</div><div class="big-num">${points}</div></div>
          </div>
          <div class="callout" style="margin-top:12px">${fmt(dose)} U in this dilution is ${fmt(vol)} mL. A U-100 insulin syringe has 100 ticks per mL.</div>
          <div class="li" style="margin-top:8px;border-bottom:0"><div class="grow"><div class="li-title">Dysport equivalent</div><div class="li-sub">${fmt(dose)} Botox U x ${dys} conversion</div></div><div class="big-num" style="font-size:24px">${fmt(dose * dys)}<small>U</small></div></div>`;
      };
      root.querySelector('#c-prod').onchange = (e) => {
        calc.productId = e.target.value; const p = BT.product(calc.productId);
        if ([50, 100, 200, 300].includes(p.vialUnits)) { calc.vial = p.vialUnits; calc.custom = false; }
        BT.render();
      };
      root.querySelector('[data-vial]').onclick = (e) => {
        const b = e.target.closest('.chip'); if (!b) return;
        calc.custom = b.dataset.u === 'custom'; if (!calc.custom) calc.vial = +b.dataset.u;
        root.querySelectorAll('[data-vial] .chip').forEach((c) => c.classList.toggle('on', c === b));
        root.querySelector('[data-cust]').hidden = !calc.custom; update();
      };
      root.querySelector('[data-ml]').onclick = (e) => {
        const b = e.target.closest('.chip'); if (!b) return; calc.ml = +b.dataset.m;
        root.querySelectorAll('[data-ml] .chip').forEach((c) => c.classList.toggle('on', c === b)); update();
      };
      root.querySelector('#c-cust').oninput = (e) => { calc.customVal = e.target.value; update(); };
      root.querySelector('#c-dose').oninput = (e) => { calc.dose = e.target.value; update(); };
      update();
    },
  });

  /* ---------- SETTINGS ---------- */
  const csvCell = (v) => { v = String(v ?? '').replace(/\r?\n/g, ' '); return /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const buildCsv = () => {
    const rows = [['date', 'product', 'site', 'units', 'provider', 'notes']];
    BT.sortedInjections().forEach((i) => {
      const p = BT.product(i.productId), dt = BT.toLocalInput(i.at).replace('T', ' ');
      const sites = i.sites && i.sites.length ? i.sites : [{ siteId: '', units: 0 }];
      sites.forEach((s) => rows.push([dt, p.name, s.siteId ? BT.site(s.siteId).label : '', s.units, i.provider || '', i.notes || '']));
    });
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  };

  BT.screen('settings', {
    title: 'Settings',
    render(root) {
      const s = BT.data.settings, theme = getTheme(), cloud = BT.storage !== 'device', sample = BT.hasSample(), acct = BT.account;
      const where = BT.storage === 'firebase' ? 'Synced to your Google account' : cloud ? 'Synced to your Claude account' : 'Saved on this device';
      root.innerHTML = `${BT.navHeader('Settings')}
        <section class="card stack">
          <div class="field"><label for="s-name">Your name</label><input id="s-name" class="input" type="text" autocomplete="given-name" placeholder="Used in your greeting" value="${BT.esc(s.name || '')}"></div>
          <div class="t-set-row"><div><div class="li-title">Default interval</div><div class="li-sub">Weeks between treatments</div></div><span data-step></span></div>
          <div class="stack-s"><div class="li-title">Theme</div><span data-theme></span></div>
        </section>
        <section class="card stack">
          <div class="row gap"><span class="t-ac-ic">${BT.icon(cloud ? 'check' : 'info', 18)}</span><div class="grow"><div class="li-title">Storage</div><div class="li-sub">${where}</div></div></div>
          ${acct ? `<div class="row gap"><span class="t-ac-ic">${BT.icon('person', 18)}</span><div class="grow"><div class="li-title">${BT.esc(acct.name || 'Signed in')}</div><div class="li-sub">${BT.esc(acct.email)}</div></div><button class="btn sm" data-signout>Sign out</button></div>` : ''}
          <div class="row gap wrap">${sample ? '<button class="btn grow" data-clear>Clear sample data</button>' : '<button class="btn grow" data-load>Load sample data</button>'}<button class="btn grow" data-export>${BT.icon('edit', 16)} Export CSV</button></div>
        </section>
        <p class="disclaimer">For personal tracking only. Not medical advice.</p>`;
      const so = root.querySelector('[data-signout]'); if (so) so.onclick = () => window.BT_CLOUD.signOut();
      if (!s.name && acct && acct.name) root.querySelector('#s-name').placeholder = acct.name.split(' ')[0];
      root.querySelector('#s-name').onchange = (e) => BT.save('settings', { name: e.target.value.trim() });
      root.querySelector('[data-step]').replaceWith(intervalStepper((v) => BT.save('settings', { intervalWeeks: v })));
      root.querySelector('[data-theme]').replaceWith(BT.seg([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], theme, (v) => {
        applyTheme(v); try { if (v === 'system') localStorage.removeItem('bt-theme'); else localStorage.setItem('bt-theme', v); } catch (e) {}
      }));
      const ld = root.querySelector('[data-load]'); if (ld) ld.onclick = () => { BT.loadSample(); BT.toast('Sample data loaded'); };
      const cl = root.querySelector('[data-clear]'); if (cl) cl.onclick = () => { BT.clearSample(); BT.toast('Sample data cleared'); };
      root.querySelector('[data-export]').onclick = () => {
        const csv = buildCsv(), sh = BT.sheet({ title: 'Export CSV' });
        sh.body.innerHTML = `<p class="small muted" style="margin:0">${BT.data.injections.length} treatment${BT.data.injections.length === 1 ? '' : 's'}. Copy this into a spreadsheet or a note.</p><textarea class="t-csv" readonly></textarea><button class="btn primary" data-copy>Copy</button>`;
        const ta = sh.body.querySelector('textarea'); ta.value = csv;
        sh.body.querySelector('[data-copy]').onclick = () => {
          const fallback = () => { ta.focus(); ta.select(); try { document.execCommand('copy'); } catch (e) {} BT.toast('Text selected. Press copy if needed.'); };
          try { navigator.clipboard.writeText(csv).then(() => BT.toast('Copied'), fallback); } catch (e) { fallback(); }
        };
      };
    },
  });
})();
