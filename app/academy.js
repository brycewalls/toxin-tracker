/* Botox Academy (#69): courses, lessons, quizzes, a resources library, achievements and a certificate.
   Content: academy.json (built from research/2026-10-15_botox-academy-content.json by tools/build.mjs and
   precached by the service worker). app/preview.html reads the research file directly.
   Progress lives in settings so it syncs like every other setting:
     settings.academy = { lessons: {id: {done, at, firstTryPerfect, tries}}, achievements: {id: at},
                          certificate: {at, name} | null, liveAt }
   Screens: academy (tab), acad-course (id), acad-lesson (id), acad-badges, acad-cert, acad-resources.
   Education only: lessons explain how qualified injectors plan and treat, and point to accredited training. */
(function () {
  /* ---------- styles ---------- */
  if (!document.getElementById('academy-css')) {
    const st = document.createElement('style');
    st.id = 'academy-css';
    st.textContent = `
.ac-top { display:grid; grid-template-columns:auto minmax(0,1fr); gap:16px; align-items:center; }
.ac-ring { position:relative; width:92px; height:92px; flex:none; }
.ac-ring svg { display:block; transform:rotate(-90deg); }
.ac-ring .tr { stroke:var(--card-2); } .ac-ring .fg { stroke:var(--accent); transition:stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1); }
.ac-ring b { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font:400 24px/1 var(--font-display); letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
.ac-ring b small { font-size:12px; color:var(--muted); margin-left:1px; }
.ac-ring.sm { width:52px; height:52px; } .ac-ring.sm b { font-size:14px; } .ac-ring.sm b small { font-size:9px; }
.ac-miles { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:14px; }
.ac-mile { display:grid; justify-items:center; gap:4px; font-size:11px; color:var(--faint); }
.ac-mile i { width:100%; height:6px; border-radius:99px; background:var(--card-2); border:1px solid var(--line); display:block; overflow:hidden; }
.ac-mile i b { display:block; height:100%; background:var(--accent); border-radius:99px; }
.ac-mile.on { color:var(--accent); font-weight:500; }
.ac-bar { height:6px; border-radius:99px; background:var(--card-2); border:1px solid var(--line); overflow:hidden; }
.ac-bar > i { display:block; height:100%; border-radius:99px; background:var(--accent); }
.ac-bar.done > i { background:var(--green); }
.ac-grp { display:flex; align-items:baseline; justify-content:space-between; gap:10px; padding:10px 2px 0; }
.ac-grp h2 { font-size:20px; }
.ac-course { display:grid; gap:10px; text-align:left; width:100%; }
.ac-course .card-h { margin-bottom:0; align-items:flex-start; }
.ac-course h3 { font-size:16px; }
.ac-strip { display:flex; gap:10px; overflow-x:auto; scrollbar-width:none; margin:0 -18px; padding:0 18px 2px; }
.ac-strip::-webkit-scrollbar { display:none; }
.ac-badge { flex:none; width:84px; display:grid; justify-items:center; gap:6px; text-align:center; font-size:11.5px; line-height:1.25; color:var(--muted); }
.ac-medal { width:52px; height:52px; border-radius:50%; display:grid; place-items:center; background:var(--card-2); color:var(--faint); border:1px dashed var(--line); }
.ac-badge.on .ac-medal, .ac-bcell.on .ac-medal { background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent-line); }
.ac-badge.on { color:var(--fg); }
.ac-bgrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.ac-bcell { display:grid; gap:8px; align-content:start; padding:16px; }
.ac-bcell .li-title { font-size:14.5px; } .ac-bcell.off .li-title { color:var(--muted); }
.ac-lesson { width:100%; text-align:left; }
.ac-n { width:30px; height:30px; border-radius:50%; display:grid; place-items:center; background:var(--card-2); color:var(--muted); font-size:13px; flex:none; font-variant-numeric:tabular-nums; }
.ac-prose { display:grid; gap:12px; font-size:15.5px; line-height:1.6; }
.ac-prose p { margin:0; }
.ac-prose ul { margin:0; padding-left:20px; display:grid; gap:8px; }
.ac-prose li::marker { color:var(--accent); }
.ac-callout { display:flex; gap:10px; align-items:flex-start; border-radius:14px; padding:12px 14px; font-size:14px; line-height:1.5; background:var(--accent-soft); border:1px solid var(--accent-line); color:var(--fg); }
.ac-callout .ic { color:var(--accent); margin-top:1px; }
.ac-callout.caution { background:var(--amber-soft); border-color:color-mix(in srgb, var(--amber) 35%, transparent); }
.ac-callout.caution .ic { color:var(--amber); }
.ac-pat { display:grid; gap:10px; }
.ac-pat dl { margin:0; display:grid; gap:10px; }
.ac-pat dt { font-size:12px; color:var(--muted); } .ac-pat dd { margin:2px 0 0; font-size:14.5px; }
.ac-pat .note { font-size:12.5px; color:var(--amber); background:var(--amber-soft); border-radius:10px; padding:8px 10px; }
.ac-map { max-width:240px; margin:0 auto; }
.ac-map .fm-hn { display:none; }
.ac-res { display:flex; gap:12px; align-items:flex-start; padding:14px 0; border-bottom:1px solid var(--line); text-decoration:none; color:inherit; min-width:0; }
.ac-res:last-child { border-bottom:0; }
.ac-res .ic-w { width:36px; height:36px; border-radius:10px; display:grid; place-items:center; background:var(--accent-soft); color:var(--accent); flex:none; }
.ac-res .t { font-weight:500; color:var(--accent); overflow-wrap:anywhere; }
.ac-res .s { font-size:12.5px; color:var(--muted); margin-top:2px; overflow-wrap:anywhere; }
.ac-res .w { font-size:13px; margin-top:4px; }
.ac-res .t .ic { display:inline-block; vertical-align:-1px; }
.ac-q { display:grid; gap:10px; padding-top:14px; border-top:1px solid var(--line); }
.ac-q:first-of-type { border-top:0; padding-top:0; }
.ac-q .qn { font-size:12px; color:var(--muted); }
.ac-q .qq { font-weight:500; font-size:15.5px; line-height:1.4; }
.ac-ch { display:flex; gap:10px; align-items:center; text-align:left; width:100%; padding:11px 14px; min-height:46px; border-radius:12px; border:1px solid var(--line); background:var(--card); font-size:14.5px; line-height:1.35; }
.ac-ch:disabled { cursor:default; }
.ac-ch .k { width:24px; height:24px; border-radius:50%; display:grid; place-items:center; flex:none; font-size:12px; background:var(--card-2); color:var(--muted); }
.ac-ch.right { border-color:var(--green); background:var(--green-soft); }
.ac-ch.right .k { background:var(--green); color:var(--card); }
.ac-ch.wrong { border-color:var(--red); background:var(--red-soft); }
.ac-ch.wrong .k { background:var(--red); color:var(--card); }
.ac-ex { font-size:13.5px; line-height:1.5; border-radius:12px; padding:10px 12px; background:var(--card-2); }
.ac-ex b { font-weight:600; } .ac-ex.ok b { color:var(--green); } .ac-ex.no b { color:var(--red); }
.ac-result { display:grid; gap:10px; justify-items:start; padding:14px; border-radius:14px; background:var(--card-2); }
.ac-result.pass { background:var(--green-soft); }
.ac-result.pass .li-title { color:var(--green); }
.ac-cert-img { display:block; width:100%; height:auto; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.12), 0 10px 30px rgba(0,0,0,.08); background:#fff; }
.ac-lock { display:flex; gap:12px; align-items:center; }
.ac-filters { display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; margin:0 -16px; padding:0 16px 2px; }
.ac-filters::-webkit-scrollbar { display:none; }
.ac-filters .chip { flex:none; padding:7px 12px; min-height:36px; font-size:13.5px; }
.ac-search { position:relative; }
.ac-search .ic { position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--faint); pointer-events:none; }
.ac-search .input { padding-left:40px; }
.ac-note { font-size:12px; color:var(--muted); line-height:1.45; }
`;
    document.head.appendChild(st);
  }

  /* ---------- content ---------- */
  // Hosted app and claude.ai artifact: academy.json next to the page. The repo preview reads the research file.
  const SRC = window.BT_ACADEMY_URL || (/\/app\/preview\.html$/.test(location.pathname) ? '../research/2026-10-15_botox-academy-content.json' : 'academy.json');
  let C = null, loadErr = false, ALL = [], LESSON = new Map(), COURSE = new Map();
  const loading = fetch(SRC).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((d) => {
    C = d;
    d.courses.forEach((c) => { COURSE.set(c.id, c); c.lessons.forEach((l, i) => { const x = { ...l, course: c, index: i }; ALL.push(x); LESSON.set(l.id, x); }); });
    check();
    if (/^acad|^academy$|^today$/.test(BT.route.name) && !BT.sheetOpen()) BT.render();
  }).catch((e) => { loadErr = true; console.warn('academy content unavailable:', e.message); if (/^acad/.test(BT.route.name)) BT.render(); });

  const GROUPS = ['Foundations', 'Treatments', 'Safety'];
  const TYPES = [['video', 'Video', 'play'], ['article', 'Article', 'doc'], ['label', 'Label', 'vial'], ['paper', 'Paper', 'book'], ['course', 'Course', 'cap']];
  const typeOf = (t) => TYPES.find((x) => x[0] === t) || ['article', 'Link', 'doc'];

  /* ---------- progress ---------- */
  const state = () => {
    const a = (BT.data.settings && BT.data.settings.academy) || {};
    return { lessons: { ...(a.lessons || {}) }, achievements: { ...(a.achievements || {}) }, certificate: a.certificate || null, liveAt: a.liveAt || null };
  };
  const put = (a) => BT.save('settings', { academy: a });
  const isDone = (a, id) => !!(a.lessons[id] && a.lessons[id].done);
  const courseDone = (a, c) => c.lessons.every((l) => isDone(a, l.id));
  const stats = (a = state()) => {
    const done = ALL.filter((l) => isDone(a, l.id)).length;
    return { done, total: ALL.length, pct: ALL.length ? Math.floor((done / ALL.length) * 100) : 0 };
  };
  const nextLesson = (a = state()) => ALL.find((l) => !isDone(a, l.id)) || null;

  // Tracking counts for the tracking achievements. Sample records never count.
  const mine = (arr) => arr.filter((r) => !r.sample);
  const treatmentsCount = () => mine(BT.data.injections).filter((i) => !i.touchUpOf).length;
  const checkinsCount = () => mine(BT.data.injections).filter((i) => !i.touchUpOf && (
    (i.checkin && i.checkin.touchUp) || BT.data.injections.some((t) => t.touchUpOf === i.id) || BT.data.photos.some((p) => p.injectionId === i.id && p.checkin))).length;
  const recordsSpan365 = () => { const t = mine(BT.data.injections).map((i) => i.at); return t.length > 0 && Date.now() - Math.min(...t) >= 365 * BT.DAY; };

  function ruleMet(rule, a) {
    const m = /^([a-z_0-9]+)(?:\s*>=\s*(\d+))?$/.exec(String(rule || '').trim());
    if (!m) return false;
    const n = m[2] ? +m[2] : 1, grp = (g) => C.courses.filter((c) => c.group === g).every((c) => courseDone(a, c));
    switch (m[1]) {
      case 'lessons': return stats(a).done >= n;
      case 'courses': return C.courses.filter((c) => courseDone(a, c)).length >= n;
      case 'quiz_perfect': return Object.values(a.lessons).filter((l) => l.done && l.firstTryPerfect).length >= n;
      case 'foundations_done': return grp('Foundations');
      case 'treatments_done': return grp('Treatments');
      case 'safety_done': return grp('Safety');
      case 'all_done': return ALL.length > 0 && stats(a).done === ALL.length;
      case 'treatments': return treatmentsCount() >= n;
      case 'checkins': return checkinsCount() >= n;
      case 'live_used': return !!a.liveAt;
      case 'records_365d': return recordsSpan365();
      default: return false;
    }
  }

  // Unlock toasts queue up, so two achievements from one quiz never overlap.
  const queue = []; let showing = false;
  const announce = (msg) => { queue.push(msg); if (!showing) pump(); };
  function pump() { const m = queue.shift(); if (!m) { showing = false; return; } showing = true; BT.toast(m); setTimeout(pump, 2600); }

  // Checks every rule against the current state; saves and announces anything newly unlocked.
  // Runs after the log has loaded (the first 'change' from BT.init) and whenever data changes.
  let ready = false;
  function check(a = state(), extraMsgs = []) {
    if (!C || !ready) return a;
    let changed = false;
    const now = Date.now(), fresh = [];
    for (const ach of C.achievements) if (!a.achievements[ach.id] && ruleMet(ach.rule, a)) { a.achievements[ach.id] = now; fresh.push(ach); changed = true; }
    if (stats(a).done === ALL.length && ALL.length && !a.certificate) { a.certificate = { at: now, name: certName() }; changed = true; }
    if (changed || extraMsgs.length) {
      if (changed) put(a);
      extraMsgs.forEach(announce);
      fresh.forEach((x) => announce('Achievement unlocked: ' + x.title));
    }
    return a;
  }
  let ct;
  BT.on('change', (kind) => {
    if (kind === 'all') ready = true;
    if (kind === 'settings') return; // our own saves; lesson completion runs check() directly
    clearTimeout(ct); ct = setTimeout(() => check(), 60);
  });

  function completeLesson(id, perfectFirst) {
    const a = state(), before = stats(a).pct;
    a.lessons[id] = { ...(a.lessons[id] || {}), done: true, at: Date.now(), firstTryPerfect: !!perfectFirst };
    const after = stats(a).pct, msgs = [];
    for (const m of [25, 50, 75, 100]) if (before < m && after >= m) msgs.push(m === 100 ? 'Milestone: Academy complete. Your certificate is ready.' : `Milestone: ${m}% of the Academy complete`);
    put(a);
    check(a, msgs);
  }

  const certName = () => { const s = BT.data.settings || {}; return (s.name || (BT.account && BT.account.name) || '').trim(); };

  /* ---------- small pieces ---------- */
  const esc = BT.esc;
  const ring = (pct, cls = '') => {
    const r = cls ? 22 : 40, w = cls ? 52 : 92, sw = cls ? 5 : 8, c = 2 * Math.PI * r;
    return `<div class="ac-ring ${cls}" role="img" aria-label="${pct}% complete"><svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}"><circle class="tr" cx="${w / 2}" cy="${w / 2}" r="${r}" fill="none" stroke-width="${sw}"/><circle class="fg" cx="${w / 2}" cy="${w / 2}" r="${r}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}"/></svg><b>${pct}<small>%</small></b></div>`;
  };
  const bar = (n, d) => `<div class="ac-bar ${n >= d ? 'done' : ''}" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${d}"><i style="width:${d ? (n / d) * 100 : 0}%"></i></div>`;
  const link = (r, inner, cls = '') => `<a class="${cls}" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  const resRow = (r, from) => link(r, `<span class="ic-w">${BT.icon(typeOf(r.type)[2], 18)}</span><span class="grow"><span class="row gap-s wrap" style="margin-bottom:3px"><span class="pill blue">${esc(typeOf(r.type)[1])}</span></span><span class="t" style="display:block">${esc(r.title)} ${BT.icon('external', 13, 'ac-ext')}</span><span class="s" style="display:block">${esc(r.source)}</span>${r.why ? `<span class="w" style="display:block">${esc(r.why)}</span>` : ''}${from ? `<span class="s" style="display:block">From: ${esc(from)}</span>` : ''}</span>`, 'ac-res');
  const loadingView = (root, title) => {
    root.innerHTML = `${title ? BT.navHeader(title) : '<header class="page-h"><h1 class="title-xl">Academy</h1><span></span></header>'}
      <div class="empty">${loadErr ? 'The Academy could not load. Check your connection and open it again.' : 'Loading the Academy'}</div>`;
  };
  const safety = '<p class="disclaimer">Education only, not medical advice. Injecting is a licensed medical procedure; technique training goes through accredited professional courses.</p>';

  /* ---------- Today card ---------- */
  BT.academyCard = () => {
    if (!C) return '';
    const a = state(), s = stats(a), nx = nextLesson(a);
    const sub = nx ? `Continue: ${esc(nx.title)}` : 'Every course done. View your certificate.';
    return `<button class="card t-card-tap" data-acad-today><div class="card-h"><span class="eyebrow">Learn</span>${BT.icon('chevron', 18)}</div>
      <div class="row gap">${ring(s.pct, 'sm')}<div class="grow"><div class="li-title">Botox Academy, ${s.pct}% complete</div><div class="li-sub">${sub}</div></div></div></button>`;
  };
  BT.bindAcademyCard = (root) => {
    const b = root.querySelector('[data-acad-today]'); if (!b) return;
    b.onclick = () => { const nx = nextLesson(); nx ? BT.go('acad-lesson', nx.id) : BT.go('acad-cert'); };
  };

  /* ---------- HOME ---------- */
  BT.screen('academy', {
    title: 'Academy',
    render(root) {
      if (!C) return loadingView(root);
      const a = state(), s = stats(a), nx = nextLesson(a);
      const unlocked = C.achievements.filter((x) => a.achievements[x.id]).length;
      const miles = [25, 50, 75, 100].map((m, i) => {
        const lo = i * 25, fill = Math.max(0, Math.min(1, (s.pct - lo) / 25));
        return `<div class="ac-mile ${s.pct >= m ? 'on' : ''}"><i><b style="width:${fill * 100}%"></b></i><span>${m}%</span></div>`;
      }).join('');
      let h = `<header class="page-h"><h1 class="title-xl">Academy</h1><span></span></header>
        <section class="card"><div class="ac-top">${ring(s.pct)}<div class="stack-s">
          <div class="eyebrow">Botox Academy</div>
          <div class="li-title" style="font-size:17px">${s.done} of ${s.total} lessons</div>
          <div class="li-sub">${C.courses.filter((c) => courseDone(a, c)).length} of ${C.courses.length} courses complete</div></div></div>
          <div class="ac-miles" aria-label="Milestones">${miles}</div>
          ${nx ? `<button class="btn primary" style="width:100%;margin-top:16px" data-cont>Continue: ${esc(nx.title)}</button>`
            : `<button class="btn primary" style="width:100%;margin-top:16px" data-go="acad-cert">${BT.icon('award', 18)} View certificate</button>`}
        </section>`;
      // Achievements strip, unlocked first.
      const sorted = [...C.achievements].sort((x, y) => (a.achievements[y.id] ? 1 : 0) - (a.achievements[x.id] ? 1 : 0));
      h += `<section class="card"><div class="card-h"><h3>Achievements</h3><button class="link-btn" data-go="acad-badges">${unlocked} of ${C.achievements.length}</button></div>
        <div class="ac-strip">${sorted.map((x) => `<button class="ac-badge ${a.achievements[x.id] ? 'on' : ''}" data-go="acad-badges"><span class="ac-medal">${BT.icon(a.achievements[x.id] ? 'award' : 'lock', 22)}</span><span>${esc(x.title)}</span></button>`).join('')}</div></section>`;
      // Certificate and resources.
      h += `<button class="card t-card-tap" data-go="acad-cert"><div class="ac-lock"><span class="ac-medal" ${a.certificate ? 'style="background:var(--green-soft);color:var(--green);border:0"' : ''}>${BT.icon(a.certificate ? 'award' : 'lock', 22)}</span>
          <div class="grow"><div class="li-title">Certificate of completion</div><div class="li-sub">${a.certificate ? 'Earned ' + esc(BT.fmt.dateLong(a.certificate.at)) : `Unlocks at 100%. ${s.total - s.done} lesson${s.total - s.done === 1 ? '' : 's'} to go.`}</div></div>${BT.icon('chevron', 18)}</div></button>
        <button class="card t-card-tap" data-go="acad-resources"><div class="ac-lock"><span class="ac-medal" style="background:var(--accent-soft);color:var(--accent);border:0">${BT.icon('book', 22)}</span>
          <div class="grow"><div class="li-title">Resources library</div><div class="li-sub">Videos, labels, papers and articles from every lesson</div></div>${BT.icon('chevron', 18)}</div></button>`;
      // Courses by group.
      for (const g of GROUPS) {
        const cs = C.courses.filter((c) => c.group === g);
        if (!cs.length) continue;
        const gd = cs.filter((c) => courseDone(a, c)).length;
        h += `<div class="ac-grp"><h2>${esc(g)}</h2><span class="small muted">${gd} of ${cs.length} done</span></div>`;
        h += cs.map((c) => {
          const n = c.lessons.filter((l) => isDone(a, l.id)).length, d = c.lessons.length;
          return `<button class="card ac-course" data-course="${esc(c.id)}"><div class="card-h"><h3>${esc(c.title)}</h3>${n >= d ? `<span class="pill green">${BT.icon('check', 12)} Done</span>` : `<span class="pill">${d} lesson${d === 1 ? '' : 's'}</span>`}</div>
            <div class="small muted">${esc(c.summary)}</div>${bar(n, d)}<div class="tiny muted">${n} of ${d} complete</div></button>`;
        }).join('');
      }
      h += safety;
      root.innerHTML = h;
      root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => BT.go(b.dataset.go)));
      root.querySelectorAll('[data-course]').forEach((b) => (b.onclick = () => BT.go('acad-course', b.dataset.course)));
      const cb = root.querySelector('[data-cont]'); if (cb) cb.onclick = () => BT.go('acad-lesson', nx.id);
    },
  });

  /* ---------- COURSE ---------- */
  BT.screen('acad-course', {
    title: 'Course',
    render(root, id) {
      if (!C) return loadingView(root, 'Course');
      const c = COURSE.get(id); if (!c) { root.innerHTML = BT.navHeader('Course') + '<div class="empty">That course is not in this version of the Academy.</div>'; return; }
      const a = state(), n = c.lessons.filter((l) => isDone(a, l.id)).length;
      const next = c.lessons.find((l) => !isDone(a, l.id));
      root.innerHTML = `${BT.navHeader(c.group)}
        <section class="card stack"><div><div class="eyebrow">${esc(c.group)}</div><h2 style="font-size:24px;margin-top:4px">${esc(c.title)}</h2></div>
          <div class="muted">${esc(c.summary)}</div>${bar(n, c.lessons.length)}<div class="tiny muted">${n} of ${c.lessons.length} lessons complete</div>
          ${next ? `<button class="btn primary" data-l="${esc(next.id)}">${n ? 'Continue' : 'Start'}: ${esc(next.title)}</button>` : `<div class="row gap"><span class="check-ring">${BT.icon('check', 16)}</span><div class="li-title">Course complete</div></div>`}</section>
        <section class="card"><div class="card-h"><h3>Lessons</h3></div><div class="list">${c.lessons.map((l, i) => {
          const done = isDone(a, l.id);
          return `<button class="li ac-lesson" data-l="${esc(l.id)}">${done ? `<span class="check-ring">${BT.icon('check', 16)}</span>` : `<span class="ac-n">${i + 1}</span>`}<div class="grow"><div class="li-title">${esc(l.title)}</div><div class="li-sub">${l.minutes} min read, ${l.quiz.length} question quiz${done && a.lessons[l.id].firstTryPerfect ? ', perfect first try' : ''}</div></div>${BT.icon('chevron', 18)}</button>`;
        }).join('')}</div></section>${safety}`;
      root.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => BT.go('acad-lesson', b.dataset.l)));
    },
  });

  /* ---------- LESSON ---------- */
  const quiz = {}; // lessonId -> {picks: [], practice} in memory, so re-renders keep the answers
  let fm = null;
  const block = (b) => {
    if (typeof b === 'string') return `<p>${esc(b)}</p>`;
    if (b.type === 'list') return `<ul>${(b.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (b.type === 'callout') return `<div class="ac-callout ${b.tone === 'caution' ? 'caution' : ''}">${BT.icon(b.tone === 'caution' ? 'alert' : 'info', 18)}<div>${esc(b.text)}</div></div>`;
    return b.text ? `<p>${esc(b.text)}</p>` : '';
  };

  function quizHtml(l, a) {
    const q = (quiz[l.id] ||= { picks: [] }), rec = a.lessons[l.id] || {}, done = !!rec.done;
    if (done && !q.practice) {
      return `<div class="ac-result pass"><div class="row gap"><span class="check-ring">${BT.icon('check', 16)}</span><div><div class="li-title">Quiz passed</div><div class="li-sub">${rec.firstTryPerfect ? 'Perfect on the first try.' : 'All answers right.'} Completed ${esc(BT.fmt.date(rec.at))}.</div></div></div>
        <button class="btn sm" data-practice>Practice again</button></div>`;
    }
    const answered = q.picks.filter((p) => p != null).length, total = l.quiz.length;
    const items = l.quiz.map((qq, i) => {
      const pick = q.picks[i];
      const choices = qq.choices.map((c, j) => {
        const cls = pick == null ? '' : j === qq.answer ? 'right' : j === pick ? 'wrong' : '';
        return `<button class="ac-ch ${cls}" data-q="${i}" data-c="${j}" ${pick != null ? 'disabled' : ''} aria-pressed="${pick === j}"><span class="k">${pick != null && j === qq.answer ? BT.icon('check', 13) : 'ABCDEF'[j]}</span><span>${esc(c)}</span></button>`;
      }).join('');
      const ex = pick == null ? '' : `<div class="ac-ex ${pick === qq.answer ? 'ok' : 'no'}" role="status"><b>${pick === qq.answer ? 'Correct.' : 'Not quite.'}</b> ${esc(qq.explain)}</div>`;
      return `<div class="ac-q"><div class="qn">Question ${i + 1} of ${total}</div><div class="qq">${esc(qq.q)}</div>${choices}${ex}</div>`;
    }).join('');
    let foot = '';
    if (answered === total) {
      const right = l.quiz.filter((qq, i) => q.picks[i] === qq.answer).length;
      foot = right === total
        ? `<div class="ac-result pass"><div class="li-title">${total} of ${total} right</div><div class="li-sub">${q.practice ? 'Nice work on the practice round.' : 'Lesson complete.'}</div></div>`
        : `<div class="ac-result"><div class="li-title">${right} of ${total} right</div><div class="li-sub">Get every answer right to complete the lesson. Read the explanations, then try again.</div><button class="btn primary sm" data-retry>Try again</button></div>`;
    }
    return items + foot;
  }

  function nextAfter(l) { const i = ALL.indexOf(LESSON.get(l.id)); return ALL[i + 1] || null; }

  BT.screen('acad-lesson', {
    title: 'Lesson',
    render(root, id) {
      if (fm) { try { fm.destroy(); } catch (e) {} fm = null; }
      if (!C) return loadingView(root, 'Lesson');
      const l = LESSON.get(id); if (!l) { root.innerHTML = BT.navHeader('Lesson') + '<div class="empty">That lesson is not in this version of the Academy.</div>'; return; }
      const c = l.course, a = state(), done = isDone(a, l.id), nx = nextAfter(l);
      const mapIds = (c.muscleIds || []).filter((m) => BT.muscles.some((x) => x.id === m));
      const avoid = (c.muscleIds || []).map((m) => BT.cautionZones.find((z) => z.id === m)).filter(Boolean);
      const names = [...new Set(mapIds.map((m) => BT.site(m).muscle))];
      let h = `${BT.navHeader(c.title)}
        <section class="card stack"><div class="row gap-s wrap"><span class="pill blue">${esc(c.group)}</span><span class="pill">Lesson ${l.index + 1} of ${c.lessons.length}</span><span class="pill">${l.minutes} min</span>${done ? `<span class="pill green">${BT.icon('check', 12)} Done</span>` : ''}</div>
          <h2 style="font-size:24px">${esc(l.title)}</h2>
          <div class="ac-prose">${l.body.map(block).join('')}</div></section>`;
      if (mapIds.length) {
        h += `<section class="card"><div class="card-h"><h3>Muscles in this lesson</h3></div><div class="ac-map" data-map></div>
          <div class="chips" style="margin-top:10px">${names.map((n) => `<span class="pill blue">${esc(n)}</span>`).join('')}</div>
          ${avoid.length ? `<div class="ac-note" style="margin-top:10px"><b>Usually avoided:</b> ${avoid.map((z) => esc(z.label + '. ' + z.note)).join(' ')}</div>` : ''}</section>`;
      }
      if (l.pattern) {
        const p = l.pattern;
        h += `<section class="card ac-pat"><div class="card-h" style="margin-bottom:0"><h3>Reference pattern</h3>${BT.icon('info', 18)}</div>
          <div class="note">Reference from published labeling or consensus, not a plan. Your injector decides placement and dose.</div>
          <dl>${p.points != null ? `<div><dt>Injection points</dt><dd class="num">${esc(p.points)}</dd></div>` : ''}${p.unitsTotal ? `<div><dt>Units</dt><dd>${esc(p.unitsTotal)}</dd></div>` : ''}${p.notes ? `<div><dt>Notes</dt><dd>${esc(p.notes)}</dd></div>` : ''}</dl></section>`;
      }
      if (l.resources && l.resources.length) h += `<section class="card"><div class="card-h"><h3>Watch and read</h3><span class="tiny muted">Opens in a new tab</span></div><div class="list">${l.resources.map((r) => resRow(r)).join('')}</div></section>`;
      h += `<section class="card"><div class="card-h"><h3>Quiz</h3><span class="tiny muted">${l.quiz.length} questions</span></div><div class="stack" data-quiz>${quizHtml(l, a)}</div></section>`;
      h += `<div class="row gap" data-nav>${done ? (nx ? `<button class="btn primary grow" data-next="${esc(nx.id)}">Next: ${esc(nx.title)}</button>` : `<button class="btn primary grow" data-go="acad-cert">${BT.icon('award', 18)} View certificate</button>`) : ''}</div>${safety}`;
      root.innerHTML = h;

      const mapEl = root.querySelector('[data-map]');
      if (mapEl && BT.faceMap) {
        const heat = {}; mapIds.forEach((m) => (heat[m] = 1));
        try { fm = BT.faceMap.mount(mapEl, { mode: 'display', heat, maxWidth: 240, zoom: false, caption: false, toggle: false }); } catch (e) { console.warn('face map', e); }
      }
      root.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => BT.go(b.dataset.go)));
      root.querySelectorAll('[data-next]').forEach((b) => (b.onclick = () => BT.go('acad-lesson', b.dataset.next, { replace: true })));
      bindQuiz(root, l);
    },
  });

  function bindQuiz(root, l) {
    const box = root.querySelector('[data-quiz]');
    const redraw = () => { box.innerHTML = quizHtml(l, state()); bindQuiz(root, l); };
    box.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => {
      const q = (quiz[l.id] ||= { picks: [] }), i = +b.dataset.q;
      if (q.picks[i] != null) return;
      q.picks[i] = +b.dataset.c;
      const total = l.quiz.length, answered = q.picks.filter((p) => p != null).length;
      if (answered < total) return redraw();
      const allRight = l.quiz.every((qq, k) => q.picks[k] === qq.answer);
      const a = state(), rec = a.lessons[l.id] || {};
      if (q.practice) return redraw();
      if (allRight) { redraw(); completeLesson(l.id, !(rec.tries > 0)); }
      else { a.lessons[l.id] = { ...rec, done: false, tries: (rec.tries || 0) + 1 }; redraw(); put(a); }
    }));
    const rt = box.querySelector('[data-retry]'); if (rt) rt.onclick = () => { quiz[l.id] = { picks: [], practice: quiz[l.id] && quiz[l.id].practice }; redraw(); box.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    const pr = box.querySelector('[data-practice]'); if (pr) pr.onclick = () => { quiz[l.id] = { picks: [], practice: true }; redraw(); };
  }

  /* ---------- ACHIEVEMENTS ---------- */
  const TRACKING = /^(treatments(\s*>=|$)|checkins|live_used|records_365d)/;
  BT.screen('acad-badges', {
    title: 'Achievements',
    render(root) {
      if (!C) return loadingView(root, 'Achievements');
      const a = state(), s = stats(a);
      const cell = (x) => {
        const at = a.achievements[x.id];
        return `<div class="card ac-bcell ${at ? 'on' : 'off'}"><span class="ac-medal">${BT.icon(at ? 'award' : 'lock', 22)}</span><div class="li-title">${esc(x.title)}</div><div class="li-sub">${esc(x.description)}</div><div class="tiny ${at ? '' : 'faint'}" style="${at ? 'color:var(--green)' : ''}">${at ? 'Unlocked ' + esc(BT.fmt.date(at)) : 'Locked'}</div></div>`;
      };
      const miles = [25, 50, 75, 100].map((m) => `<div class="li"><span class="${s.pct >= m ? 'check-ring' : 'ac-n'}">${s.pct >= m ? BT.icon('check', 16) : ''}</span><div class="grow"><div class="li-title">${m}% complete</div><div class="li-sub">${Math.ceil((m / 100) * s.total)} lessons${m === 100 ? ', unlocks the certificate' : ''}</div></div>${s.pct >= m ? '<span class="pill green">Reached</span>' : ''}</div>`).join('');
      root.innerHTML = `${BT.navHeader('Achievements')}
        <section class="card"><div class="card-h"><h3>Milestones</h3><span class="pill blue">${s.pct}%</span></div><div class="list">${miles}</div></section>
        <div class="ac-grp"><h2>Learning</h2></div><div class="ac-bgrid">${C.achievements.filter((x) => !TRACKING.test(x.rule)).map(cell).join('')}</div>
        <div class="ac-grp"><h2>Tracking</h2></div><div class="ac-bgrid">${C.achievements.filter((x) => TRACKING.test(x.rule)).map(cell).join('')}</div>
        <p class="disclaimer">Sample data does not count toward tracking achievements.</p>`;
    },
  });

  /* ---------- CERTIFICATE ---------- */
  const COLORS = { bg: '#FFFFFF', paper: '#F7F8FC', ink: '#111318', muted: '#5E6475', accent: '#2F55E4', soft: '#EAF0FF', line: '#D5DCF5', green: '#1F9D55' };
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  // Always drawn on a light background, whatever the app theme.
  function drawCertificate(cert) {
    const W = 1240, H = 1754, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), sans = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif', serif = 'Georgia, "Times New Roman", serif';
    x.fillStyle = COLORS.bg; x.fillRect(0, 0, W, H);
    x.fillStyle = COLORS.paper; x.fillRect(40, 40, W - 80, H - 80);
    x.strokeStyle = COLORS.accent; x.lineWidth = 6; x.strokeRect(60, 60, W - 120, H - 120);
    x.strokeStyle = COLORS.line; x.lineWidth = 2; x.strokeRect(80, 80, W - 160, H - 160);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    // Seal
    x.beginPath(); x.arc(W / 2, 230, 70, 0, Math.PI * 2); x.fillStyle = COLORS.accent; x.fill();
    x.beginPath(); x.arc(W / 2, 230, 58, 0, Math.PI * 2); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#fff'; x.font = `600 19px ${sans}`; x.fillText('BOTOX', W / 2, 225); x.fillText('ACADEMY', W / 2, 250);
    x.fillStyle = COLORS.accent; x.font = `600 22px ${sans}`;
    if ('letterSpacing' in x) x.letterSpacing = '6px';
    x.fillText('EDUCATIONAL CERTIFICATE', W / 2, 360);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
    x.fillStyle = COLORS.ink; x.font = `400 66px ${serif}`; x.fillText('Certificate of Completion', W / 2, 450);
    x.fillStyle = COLORS.muted; x.font = `400 28px ${sans}`; x.fillText('This certifies that', W / 2, 530);
    const name = (cert.name || 'Academy learner').slice(0, 60);
    let fs = 76; x.font = `italic 400 ${fs}px ${serif}`; while (x.measureText(name).width > W - 280 && fs > 36) { fs -= 4; x.font = `italic 400 ${fs}px ${serif}`; }
    x.fillStyle = COLORS.ink; x.fillText(name, W / 2, 628);
    x.strokeStyle = COLORS.line; x.lineWidth = 2; x.beginPath(); x.moveTo(260, 660); x.lineTo(W - 260, 660); x.stroke();
    x.fillStyle = COLORS.muted; x.font = `400 28px ${sans}`;
    x.fillText(`completed all ${C.courses.length} courses of the Botox Academy`, W / 2, 716);
    x.fillText('on ' + new Date(cert.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W / 2, 756);
    // Courses in two columns
    x.textAlign = 'left';
    const top = 840, colW = (W - 280) / 2, rows = Math.ceil(C.courses.length / 2);
    x.fillStyle = COLORS.accent; x.font = `600 20px ${sans}`;
    if ('letterSpacing' in x) x.letterSpacing = '3px';
    x.fillText('COURSES COMPLETED', 140, top - 20);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
    C.courses.forEach((c, i) => {
      const cx = 140 + (i < rows ? 0 : colW + 20), cy = top + 26 + (i % rows) * 40;
      x.fillStyle = COLORS.green; x.beginPath(); x.arc(cx + 9, cy - 8, 9, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(cx + 4.5, cy - 8); x.lineTo(cx + 8, cy - 4.5); x.lineTo(cx + 14, cy - 11.5); x.stroke();
      x.fillStyle = COLORS.ink;
      let f = 23; x.font = `400 ${f}px ${sans}`; while (x.measureText(c.title).width > colW - 34 && f > 17) x.font = `400 ${--f}px ${sans}`;
      let t = c.title; while (x.measureText(t).width > colW - 34 && t.length > 4) t = t.slice(0, -2);
      x.fillText(t === c.title ? t : t.trimEnd() + '...', cx + 30, cy);
    });
    // Statement
    let y = top + 26 + rows * 40 + 40;
    x.strokeStyle = COLORS.line; x.lineWidth = 2; x.beginPath(); x.moveTo(140, y); x.lineTo(W - 140, y); x.stroke();
    y += 50; x.fillStyle = COLORS.muted; x.font = `400 21px ${sans}`;
    for (const ln of wrap(x, C.certificate.statement, W - 280)) { x.fillText(ln, 140, y); y += 32; }
    x.textAlign = 'center'; x.fillStyle = COLORS.ink; x.font = `600 21px ${sans}`;
    x.fillText('Educational certificate only. Not a professional credential or license.', W / 2, H - 120);
    return cv;
  }
  const certBlob = (cert) => new Promise((res) => drawCertificate(cert).toBlob(res, 'image/png'));
  BT.academy = {
    ready: () => loading,
    stats: () => stats(),
    lessons: () => ALL.map((l) => l.id),
    certificateBlob: () => { const a = state(); return a.certificate ? certBlob(a.certificate) : Promise.resolve(null); },
    // Called by the Face Map's Live view when the camera starts (live-view achievement).
    markLive: () => { const a = state(); if (a.liveAt) return; a.liveAt = Date.now(); put(a); check(a); },
  };

  let certUrl = null;
  BT.screen('acad-cert', {
    title: 'Certificate',
    render(root) {
      if (!C) return loadingView(root, 'Certificate');
      const a = state(), s = stats(a);
      if (!a.certificate) {
        root.innerHTML = `${BT.navHeader('Certificate')}
          <section class="card stack"><div class="ac-lock"><span class="ac-medal">${BT.icon('lock', 22)}</span><div class="grow"><div class="li-title">Locked until 100%</div><div class="li-sub">${s.done} of ${s.total} lessons done. Finish every course to earn your certificate.</div></div></div>${bar(s.done, s.total)}
          <div class="ac-note">${esc(C.certificate.statement)}</div></section>`;
        return;
      }
      const cert = a.certificate;
      root.innerHTML = `${BT.navHeader('Certificate')}
        <img class="ac-cert-img" data-img alt="${esc(`${C.certificate.title} for ${cert.name || 'Academy learner'}, completed ${BT.fmt.dateLong(cert.at)}, listing all ${C.courses.length} courses. ${C.certificate.statement}`)}" width="1240" height="1754">
        <button class="btn primary" data-dl>${BT.icon('download', 18)} Download PNG</button>
        <section class="card stack"><div class="field"><label for="ac-name">Name on certificate</label><input id="ac-name" class="input" type="text" autocomplete="name" value="${esc(cert.name || '')}" placeholder="Your name"></div>
          <div class="ac-note">${esc(C.certificate.statement)}</div></section>`;
      const img = root.querySelector('[data-img]');
      certBlob(cert).then((b) => { if (certUrl) URL.revokeObjectURL(certUrl); certUrl = URL.createObjectURL(b); img.src = certUrl; });
      root.querySelector('#ac-name').onchange = (e) => { const x = state(); x.certificate = { ...x.certificate, name: e.target.value.trim() }; put(x); };
      root.querySelector('[data-dl]').onclick = async () => {
        const b = await certBlob(state().certificate), url = URL.createObjectURL(b);
        const el = document.createElement('a'); el.href = url; el.download = 'botox-academy-certificate.png'; document.body.appendChild(el); el.click(); el.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        BT.toast('Certificate saved');
      };
    },
  });

  /* ---------- RESOURCES ---------- */
  const lib = { type: 'all', q: '' };
  BT.screen('acad-resources', {
    title: 'Resources',
    render(root) {
      if (!C) return loadingView(root, 'Resources');
      const seen = new Map();
      ALL.forEach((l) => (l.resources || []).forEach((r) => { if (!seen.has(r.url)) seen.set(r.url, { ...r, from: l.title }); }));
      const items = [...seen.values()];
      const counts = {}; items.forEach((r) => (counts[r.type] = (counts[r.type] || 0) + 1));
      root.innerHTML = `${BT.navHeader('Resources')}
        <div class="ac-search">${BT.icon('search', 18)}<input class="input" type="search" placeholder="Search titles and sources" aria-label="Search resources" value="${esc(lib.q)}" data-q></div>
        <div class="ac-filters" role="tablist">${[['all', 'All', items.length], ...TYPES.filter((t) => counts[t[0]]).map((t) => [t[0], t[1], counts[t[0]]])].map(([v, lbl, n]) => `<button class="chip ${lib.type === v ? 'on' : ''}" data-t="${v}" role="tab" aria-selected="${lib.type === v}">${esc(lbl)} <span class="faint">${n}</span></button>`).join('')}</div>
        <section class="card" style="padding-top:4px;padding-bottom:4px"><div class="list" data-list></div></section>
        <p class="disclaimer">Links open the original source in a new tab. Checked ${esc(C.checked || '')}.</p>`;
      const list = root.querySelector('[data-list]');
      const draw = () => {
        const q = lib.q.toLowerCase();
        const show = items.filter((r) => (lib.type === 'all' || r.type === lib.type) && (!q || (r.title + ' ' + r.source + ' ' + (r.why || '') + ' ' + r.from).toLowerCase().includes(q)));
        list.innerHTML = show.length ? show.map((r) => resRow(r, r.from)).join('') : '<div class="empty" style="padding:20px">No resources match.</div>';
        list.dataset.count = show.length;
      };
      draw();
      root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { lib.type = b.dataset.t; root.querySelectorAll('[data-t]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); }); draw(); }));
      root.querySelector('[data-q]').oninput = (e) => { lib.q = e.target.value; draw(); };
    },
  });
})();
