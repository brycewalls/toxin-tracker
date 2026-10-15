/* Face Map: reusable line-art face component + the "Face Map" tab screen.
   BT.faceMap.mount(el, opts) -> { setSelected(map), getSelected(), destroy(), setMode(m), setHeat(h), setMarkerScale(k) }
   BT.faceMap.coords = { siteId: {x, y} } in the 300 x 400 drawing space (patient's left = viewer's right, x > 150). */
(function () {
  const BT = window.BT;
  if (!BT) return;

  /* ---------- geometry ---------- */
  const VBX = 14, VBW = 272, VBH = 392; // visible window into the 300 x 400 drawing
  const coords = {
    frontalis: { x: 150, y: 86 },
    glabella: { x: 150, y: 122 },
    'corrugator-l': { x: 176, y: 122 }, 'corrugator-r': { x: 124, y: 122 },
    'brow-l': { x: 208, y: 121 }, 'brow-r': { x: 92, y: 121 },
    'crows-l': { x: 216, y: 152 }, 'crows-r': { x: 84, y: 152 },
    bunny: { x: 150, y: 160 },
    gummy: { x: 150, y: 210 },
    lipflip: { x: 150, y: 231 },
    'dao-l': { x: 181, y: 258 }, 'dao-r': { x: 119, y: 258 },
    mentalis: { x: 150, y: 270 },
    'masseter-l': { x: 208, y: 214 }, 'masseter-r': { x: 92, y: 214 },
    platysma: { x: 150, y: 328 },
  };

  // Muscle zones, written for the viewer-right side (patient left); "-r" ids mirror them.
  const ZB = {
    frontalis: { d: 'M98 112 C96 88 118 66 150 66 C182 66 204 88 202 112 C186 108 170 106 150 106 C130 106 114 108 98 112 Z' },
    glabella: { d: 'M143 108 C146 104 154 104 157 108 L158 136 C154 140 146 140 142 136 Z' },
    corrugator: { d: 'M160 128 C167 116 183 111 193 117 C184 120 174 125 165 137 Z' },
    brow: { d: 'M196 125 C204 118 214 122 219 133 C212 133 204 131 197 131 Z' },
    crows: { d: 'M205 138 C213 133 223 135 227 142 C229 154 225 164 216 168 C210 160 206 150 205 138 Z' },
    bunny: { d: 'M160 150 C165 146 170 154 169 170 C164 174 160 168 159 160 Z', both: true },
    gummy: { d: 'M158 205 C166 205 172 210 174 216 C168 221 160 221 156 218 Z', both: true },
    lipflip: { d: 'M150 228 C153 224 158 222 162 222 C168 223 174 228 180 233 C172 236 160 236 150 236 Z', both: true },
    dao: { d: 'M176 242 C184 244 190 252 190 262 C190 268 186 272 184 272 C178 266 172 254 170 246 Z' },
    mentalis: { d: 'M128 268 C128 258 138 256 150 256 C162 256 172 258 172 268 C172 278 162 282 150 282 C138 282 128 278 128 268 Z' },
    masseter: { d: 'M200 188 C210 188 220 196 220 212 C220 224 214 232 206 238 C200 232 197 224 197 212 C197 202 197 194 200 188 Z' },
    platysma: { d: 'M136 292 C132 316 132 342 140 362 L150 366 L150 296 Z', both: true },
  };
  const FLIP = ' transform="matrix(-1 0 0 1 300 0)"';
  function zoneEls(id, cls, extra = '') {
    const z = ZB[id.replace(/-[lr]$/, '')];
    if (!z) return '';
    let out = `<path class="${cls}" d="${z.d}"${/-r$/.test(id) ? FLIP : ''}${extra}/>`;
    if (z.both) out += `<path class="${cls}" d="${z.d}"${FLIP}${extra}/>`;
    return out;
  }

  // nearest-neighbor distance per site, used to size hit circles so they never overlap
  const hitR = {};
  Object.keys(coords).forEach((a) => {
    let m = 99;
    Object.keys(coords).forEach((b) => { if (a !== b) m = Math.min(m, Math.hypot(coords[a].x - coords[b].x, coords[a].y - coords[b].y)); });
    hitR[a] = Math.min(15, m / 2);
  });

  /* ---------- the drawing ---------- */
  const sym = (s) => `<g>${s}</g><g${FLIP}>${s}</g>`;
  const HEAD = 'M150 22 C200 22 232 58 232 118 C233 156 230 188 222 214 C216 234 206 256 190 270 C178 281 164 288 150 288 C136 288 122 281 110 270 C94 256 84 234 78 214 C70 188 67 156 68 118 C68 58 100 22 150 22 Z';
  const NECK = 'M114 270 L186 270 C184 304 186 330 190 350 C214 358 248 366 282 384 L300 400 L0 400 L18 384 C52 366 86 358 110 350 C114 330 116 304 114 270 Z';

  function faceStatic(uid) {
    const ln = (d, c = '') => `<path class="fm-ln ${c}" d="${d}"/>`;
    const neck = sym(ln('M186 274 C184 304 186 330 190 350 C214 358 248 366 282 384') +
      ln('M194 288 C184 316 168 346 156 372', 'f') + ln('M143 300 C142 326 143 348 147 366', 'f') + ln('M150 372 C168 366 192 366 214 374', 'f'));
    const ears = sym(`<path class="fm-skin" d="M231 140 C246 132 253 154 248 172 C245 184 238 192 228 190"/>` + ln('M237 150 C243 150 245 162 241 172', 'f'));
    const brows = sym('<path class="fm-fill" d="M160 139 C172 127 196 120 216 134 C198 127 177 132 165 143 Z" style="fill-opacity:.7"/>');
    const eyes = sym(
      ln('M166 151 C174 140 192 139 202 148') + ln('M166 151 C176 158 192 157 202 148') +
      ln('M169 143 C178 132 196 131 207 141', 'f') + ln('M171 161 C181 167 195 166 205 157', 'f') +
      '<circle class="fm-ln" cx="185" cy="149" r="6.6"/><circle class="fm-fill" cx="185" cy="149" r="2.5" style="fill-opacity:.8"/>' +
      ln('M204 148 L224 142 M204 151 L226 152 M204 154 L222 162', 'f t'));
    const nose = sym(
      ln('M157 140 C158 162 160 178 166 191') + ln('M166 191 C175 192 177 204 169 208 C165 210 160 210 155 207') +
      ln('M158 203 C162 201 166 202 167 205', 'f') + ln('M150 211 C152 211 154 210 155 207', 'f'));
    const mouth = sym(
      '<path class="fm-fill" d="M150 228 C153 224 158 222 162 222 C168 223 174 228 180 233 C174 246 162 251 150 251 Z" style="fill-opacity:.08"/>' +
      ln('M150 228 C153 224 158 222 162 222 C168 223 174 228 180 233') + ln('M180 233 C172 236 160 236 150 236') + ln('M180 233 C174 246 162 251 150 251') +
      ln('M154 212 C155 216 158 219 161 222', 'f') + ln('M172 207 C184 217 190 230 189 247', 'f'));
    const zones = BT.sites.map((s) => zoneEls(s.id, 'fm-zone')).join('');
    return `<defs>
      <linearGradient id="${uid}-mg" gradientUnits="userSpaceOnUse" x1="0" y1="270" x2="0" y2="392"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
      <mask id="${uid}-nm" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="400"><rect width="300" height="400" fill="url(#${uid}-mg)"/></mask>
      <radialGradient id="${uid}-gl"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.9"/><stop offset=".55" style="stop-color:var(--accent);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></radialGradient>
    </defs>
    <g mask="url(#${uid}-nm)"><path class="fm-skin2" d="${NECK}"/>${neck}</g>
    ${ears}
    <path class="fm-skin" d="${HEAD}"/>
    ${zones}
    ${ln('M86 108 C88 78 114 60 150 60 C186 60 212 78 214 108', 'dots')}
    ${ln('M122 282 C136 296 164 296 178 282', 'f')}${ln('M137 259 C145 263 155 263 163 259', 'f')}
    ${brows}${eyes}${nose}${mouth}
    <g class="fm-dyn"></g>`;
  }

  /* ---------- css ---------- */
  function injectCSS() {
    if (document.getElementById('fm-css')) return;
    const st = document.createElement('style');
    st.id = 'fm-css';
    st.textContent = `
.fm{position:relative;width:100%;--fm-skin:var(--card-2);--fm-stroke:var(--faint);--fm-line:var(--muted);--fm-zone:var(--muted)}
.fm-overlay{--fm-skin:transparent;--fm-stroke:var(--hero-fg);--fm-line:var(--hero-fg);--fm-zone:var(--hero-fg)}
.fm-overlay .fm-stage svg{filter:drop-shadow(0 0 1.5px rgba(0,0,0,.7))}
.fm-stage{position:relative}
.fm-stage svg{display:block;width:100%;height:100%;overflow:visible}
.fm-skin{fill:var(--fm-skin);stroke:var(--fm-stroke);stroke-width:1.3;stroke-linejoin:round}
.fm-skin2{fill:var(--fm-skin)}
.fm-ln{fill:none;stroke:var(--fm-line);stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}
.fm-ln.f{opacity:.45}.fm-ln.t{stroke-width:.9}
.fm-ln.dots{stroke:var(--fm-stroke);stroke-dasharray:.1 4.2;stroke-width:1.6;opacity:.8}
.fm-fill{fill:var(--fm-line)}
.fm-zone{fill:var(--fm-zone);fill-opacity:.08}
.fm-act{fill:var(--accent);pointer-events:none}
.fm-m{cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
.fm-m .halo{fill:var(--accent);fill-opacity:.18;pointer-events:none}
.fm-m .core{fill:var(--accent);stroke:var(--card);stroke-width:1.6;pointer-events:none}
.fm-m .ring{fill:var(--card);fill-opacity:.88;stroke:var(--accent);stroke-opacity:.55;stroke-width:1.2;pointer-events:none}
.fm-m .pl{stroke:var(--accent);stroke-width:1.5;stroke-linecap:round;pointer-events:none}
.fm-m .hint{fill:var(--faint);fill-opacity:.6;pointer-events:none}
.fm-m:focus-visible .ring,.fm-m:focus-visible .core{stroke:var(--fg);stroke-width:2.2;stroke-opacity:1}
.fm-tx{fill:var(--accent-ink);font:600 10px var(--font);text-anchor:middle;dominant-baseline:central;pointer-events:none;font-variant-numeric:tabular-nums}
.fm-lead{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.fm-lead line{stroke:var(--accent);stroke-opacity:.6;stroke-dasharray:3 3;stroke-width:1}
.fm-labs{position:absolute;inset:0;pointer-events:none}
.fm-lab{position:absolute;pointer-events:auto;font-size:12px;line-height:1.28;min-height:40px;cursor:default}
.fm-lab.tap{cursor:pointer}
.fm-lab.l{text-align:right}
.fm-lab .t{color:var(--fg);font-weight:500;font-size:13px}
.fm-lab .s{color:var(--muted);font-size:11.5px}
.fm-lab .d{color:var(--faint);font-size:11px}
.fm-cap{min-height:46px;text-align:center;font-size:13px;color:var(--muted);padding:6px 8px 0;display:grid;gap:1px;align-content:start}
.fm-cap b{color:var(--fg);font-weight:500;font-size:14px}
.fm-live{position:relative;width:100%;aspect-ratio:3/4;max-height:72vh;border-radius:16px;overflow:hidden;background:var(--card-2);user-select:none;-webkit-user-select:none}
.fm-live img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.fm-live[data-mode=align]{touch-action:none;cursor:grab}
.fm-live[data-mode=select]{touch-action:pan-y}
.fm-ov{position:absolute;inset:0}
.fm-live[data-mode=align] .fm-ov{pointer-events:none}
.fm-ovw{position:absolute;left:50%;top:50%;width:78%;transform-origin:center}
.fm-ctl{display:grid;gap:4px}
.fm-sl{display:grid;grid-template-columns:64px 1fr 44px;align-items:center;gap:10px;min-height:40px;font-size:13px;color:var(--muted)}
.fm-sl input{width:100%;accent-color:var(--accent);height:40px;margin:0}
.fm-sl output{text-align:right;font-variant-numeric:tabular-nums;font-size:12px}
.fm-step button{width:42px;height:42px}
.fm-step input{height:42px;width:48px}
.fm-bar{height:5px;border-radius:3px;background:var(--card-2);margin-top:7px;overflow:hidden}
.fm-bar i{display:block;height:100%;border-radius:3px;background:var(--accent)}
.fm-drop{display:grid;justify-items:center;gap:12px;text-align:center;padding:30px 16px;border:1.5px dashed var(--accent-line);border-radius:16px;background:var(--accent-soft)}
.fm-drop>.ic{color:var(--accent)}
.fm-row-btn{width:100%;text-align:left}
`;
    document.head.appendChild(st);
  }

  /* ---------- component ---------- */
  function mount(el, opts) {
    opts = Object.assign({ mode: 'display', selected: {}, labels: false, heat: null, hints: false, caption: null, overlay: false, maxWidth: 320, markerScale: 1 }, opts || {});
    injectCSS();
    const uid = 'fm' + Math.random().toString(36).slice(2, 8);
    let sel = Object.assign({}, opts.selected || {});
    let heat = opts.heat ? Object.assign({}, opts.heat) : null;
    let mscale = opts.markerScale || 1;
    let lastW = 0, kb = false, capId = null;
    const esc = BT.esc;
    const hasSel = (id) => Object.prototype.hasOwnProperty.call(sel, id);

    el.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'fm' + (opts.overlay ? ' fm-overlay' : '');
    root.innerHTML = `<div class="fm-stage"><svg viewBox="${VBX} 0 ${VBW} ${VBH}" role="img" aria-label="Face map">${faceStatic(uid)}</svg></div><svg class="fm-lead"></svg><div class="fm-labs"></div>`;
    el.appendChild(root);
    const stage = root.querySelector('.fm-stage'), svg = stage.querySelector('svg'), dyn = svg.querySelector('.fm-dyn');
    const lead = root.querySelector('.fm-lead'), labs = root.querySelector('.fm-labs');
    let cap = null;
    const wantCap = opts.caption === null ? true : opts.caption;
    if (wantCap) { cap = document.createElement('div'); cap.className = 'fm-cap'; cap.setAttribute('aria-live', 'polite'); el.appendChild(cap); }

    const labelParts = (id) => {
      let v = opts.labelFor ? opts.labelFor(id) : null;
      if (v == null) v = { title: BT.site(id).label, sub: BT.fmt.units(+sel[id] || 0) };
      if (typeof v === 'string') { const p = v.split('\n'); v = { title: p[0], sub: p[1], date: p[2] }; }
      return v;
    };
    const keysShown = () => Object.keys(sel).filter((k) => coords[k]);

    function metrics() {
      const W = Math.max(240, root.clientWidth || el.clientWidth || 340);
      const showLabels = !!opts.labels && opts.mode === 'display' && keysShown().length > 0;
      const faceW = showLabels ? Math.round(W * 0.54) : Math.min(W, opts.maxWidth || 320);
      const left = Math.round((W - faceW) / 2), s = faceW / VBW;
      return { W, faceW, left, s, H: Math.round(faceW * VBH / VBW), showLabels };
    }
    const fsFor = (t, r) => (t.length <= 2 ? 10 : t.length === 3 ? 8.6 : 7.6) * (r / 10.5);

    function marker(id, kind, r, text) {
      const c = coords[id], site = BT.site(id), hr = hitR[id] * Math.max(1, Math.min(1.3, mscale === 1 ? 1 : 1 / mscale));
      let inner = '', cls = '';
      if (kind === 'add') { const p = r * 0.42; cls = 'add'; inner = `<circle class="ring" r="${r}"/><path class="pl" d="M${-p} 0H${p}M0 ${-p}V${p}"/>`; }
      else if (kind === 'on') { cls = 'on'; inner = `<circle class="halo" r="${r * 1.55}"/><circle class="core" r="${r}"/><text class="fm-tx" style="font-size:${fsFor(text, r).toFixed(1)}px">${esc(text)}</text>`; }
      else if (kind === 'dot') { cls = 'on'; inner = `<circle class="halo" r="${r * 2.2}"/><circle class="core" r="${r}"/>`; }
      else { cls = 'hintm'; inner = `<circle class="hint" r="2.6"/>`; }
      const act = kind === 'hint' ? '' : '';
      return `<g class="fm-m ${cls}" data-id="${id}" role="button" tabindex="0" aria-label="${esc(site.label)}${hasSel(id) ? ', ' + esc(BT.fmt.units(+sel[id] || 0)) : ''}" transform="translate(${c.x} ${c.y})">${inner}<circle r="${hr.toFixed(1)}" fill="transparent"/></g>${act}`;
    }

    function render() {
      const m = metrics();
      lastW = root.clientWidth;
      stage.style.width = m.faceW + 'px';
      stage.style.height = m.H + 'px';
      stage.style.marginLeft = m.left + 'px';
      const ids = BT.sites.map((s) => s.id).filter((id) => coords[id]);
      const hmax = heat ? Math.max(1, ...Object.values(heat).map((v) => +v || 0)) : 1;
      let glow = '', zonesOn = '', marks = '';
      const sr = m.s; // px per drawing unit
      if (heat) ids.forEach((id) => {
        const v = +heat[id] || 0; if (!v || hasSel(id)) return;
        const n = v / hmax, c = coords[id];
        glow += `<circle cx="${c.x}" cy="${c.y}" r="${(22 + 8 * n).toFixed(1)}" fill="url(#${uid}-gl)" opacity="${(0.28 + 0.72 * n).toFixed(2)}" pointer-events="none"/>`;
        zonesOn += zoneEls(id, 'fm-act', ` style="fill-opacity:${(0.1 + 0.36 * n).toFixed(2)}"`);
      });
      ids.forEach((id) => { if (hasSel(id)) zonesOn += zoneEls(id, 'fm-act', ' style="fill-opacity:.34"'); });
      const interactive = opts.mode === 'select' || !!opts.onTap;
      ids.forEach((id) => {
        if (opts.mode === 'select') {
          if (hasSel(id)) { const t = String(Math.round((+sel[id] || 0) * 10) / 10); marks += marker(id, 'on', 10.5 / Math.max(.8, Math.min(1.4, mscale)), t); }
          else marks += marker(id, 'add', 10.5 / Math.max(.8, Math.min(1.4, mscale)));
        } else if (hasSel(id)) {
          if (m.showLabels) marks += marker(id, 'dot', 5.4 / sr);
          else marks += marker(id, 'on', 10, String(Math.round((+sel[id] || 0) * 10) / 10));
        } else if (heat && (+heat[id] || 0) > 0) marks += marker(id, 'on', 8.2, String(Math.round(+heat[id])));
        else if (opts.hints || (opts.onTap && !opts.hints)) marks += marker(id, 'hint', 3);
      });
      dyn.innerHTML = glow + zonesOn + marks;
      svg.style.pointerEvents = interactive ? '' : 'none';
      layoutLabels(m);
      if (kb && capId) { const g = dyn.querySelector(`.fm-m[data-id="${capId}"]`); if (g) g.focus({ preventScroll: true }); }
    }

    function layoutLabels(m) {
      labs.innerHTML = ''; lead.innerHTML = '';
      if (!m.showLabels) { root.style.height = m.H + 'px'; return; }
      const gw = Math.max(60, m.left - 8);
      const items = keysShown().map((id) => ({ id, px: m.left + (coords[id].x - VBX) * m.s, py: coords[id].y * m.s }));
      items.sort((a, b) => a.py - b.py);
      let nl = 0, nr = 0;
      items.forEach((it) => {
        const x = coords[it.id].x;
        it.side = x < 148 ? 'l' : x > 152 ? 'r' : (nl < nr ? 'l' : 'r');
        it.side === 'l' ? nl++ : nr++;
        const p = labelParts(it.id), div = document.createElement('div');
        div.className = 'fm-lab ' + it.side + (opts.onTap ? ' tap' : '');
        div.style.width = gw + 'px'; div.style[it.side === 'l' ? 'left' : 'right'] = '0';
        div.dataset.id = it.id;
        div.innerHTML = `<div class="t">${esc(p.title)}</div>${p.sub ? `<div class="s">${esc(p.sub)}</div>` : ''}${p.date ? `<div class="d">${esc(p.date)}</div>` : ''}`;
        labs.appendChild(div); it.el = div;
      });
      let bottom = m.H;
      ['l', 'r'].forEach((side) => {
        let prev = -1e9;
        items.filter((i) => i.side === side).forEach((it) => {
          const h = it.el.offsetHeight || 52, top = Math.max(0, it.py - 10, prev + 8);
          it.el.style.top = top + 'px'; it.top = top; prev = top + h; bottom = Math.max(bottom, prev);
        });
      });
      lead.setAttribute('width', m.W); lead.setAttribute('height', bottom);
      lead.innerHTML = items.map((it) => {
        const ex = it.side === 'l' ? gw + 4 : m.W - gw - 4, ey = it.top + 9;
        const dx = ex - it.px, dy = ey - it.py, len = Math.hypot(dx, dy) || 1, o = 7;
        return `<line x1="${(it.px + dx / len * o).toFixed(1)}" y1="${(it.py + dy / len * o).toFixed(1)}" x2="${ex}" y2="${ey.toFixed(1)}"/>`;
      }).join('');
      root.style.height = Math.ceil(bottom + 2) + 'px';
    }

    function setCaption(id, verb) {
      if (!cap) return;
      if (!id) { cap.innerHTML = opts.mode === 'select' ? 'Tap a zone to add it. Tap again to remove it.' : '&nbsp;'; return; }
      const s = BT.site(id);
      cap.innerHTML = `<b>${esc(s.label)}</b><span>${esc(s.muscle)}${verb ? ' \u00B7 ' + esc(verb) : ''}</span><span class="tiny">Common range ${s.range[0]} to ${s.range[1]}U (reference only)</span>`;
    }

    function act(id) {
      capId = id;
      if (opts.mode === 'select') {
        if (hasSel(id)) { delete sel[id]; setCaption(id, 'removed'); }
        else { sel[id] = BT.site(id).range[0] || 1; setCaption(id, 'added at ' + BT.fmt.units(sel[id])); }
        render();
        opts.onChange && opts.onChange(Object.assign({}, sel));
      } else if (opts.onTap) opts.onTap(id);
    }

    const onClick = (e) => {
      const g = e.target.closest('.fm-m,.fm-lab'); if (!g || !root.contains(g)) return;
      const id = g.dataset.id; if (!id) return;
      kb = false; act(id);
    };
    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const g = e.target.closest('.fm-m'); if (!g) return;
      e.preventDefault(); kb = true; act(g.dataset.id);
    };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);

    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (Math.abs(root.clientWidth - lastW) > 1) render(); }); ro.observe(el); }

    setCaption(null);
    render();
    return {
      setSelected(map) { sel = Object.assign({}, map || {}); render(); },
      getSelected() { return Object.assign({}, sel); },
      setHeat(h) { heat = h ? Object.assign({}, h) : null; render(); },
      setMode(m) { opts.mode = m; setCaption(null); render(); },
      setMarkerScale(k) { const n = +k || 1; if (Math.abs(n - mscale) > 0.02) { mscale = n; render(); } },
      destroy() { ro && ro.disconnect(); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); el.innerHTML = ''; },
    };
  }

  BT.faceMap = { mount, coords, zones: ZB };

  /* ---------- screen ---------- */
  const state = { view: 'map', live: { file: null, url: null, x: 0, y: 0, s: 1, rot: 0, op: 0.8, mode: 'align', sel: {} } };
  let mounts = [];
  const num = (n) => Math.round(n * 10) / 10;

  function siteHistory(id) {
    const rows = [];
    BT.sortedInjections().forEach((inj) => {
      const hit = (inj.sites || []).filter((s) => s.siteId === id);
      if (hit.length) rows.push({ inj, units: hit.reduce((a, s) => a + (+s.units || 0), 0) });
    });
    return rows;
  }

  function openSite(id) {
    const site = BT.site(id), rows = siteHistory(id);
    const total = rows.reduce((a, r) => a + r.units, 0);
    const sh = BT.sheet({ title: site.label });
    sh.body.innerHTML = `
      <div class="card">
        <div class="eyebrow">${BT.esc(site.muscle || 'Zone')}</div>
        <div class="row between gap" style="margin-top:8px"><div><div class="li-title">Common range</div><div class="big-num num" style="margin-top:4px">${site.range[0]} to ${site.range[1]}<small>U</small></div></div><span class="pill">reference only</span></div>
      </div>
      <div class="card">
        <div class="card-h"><h3>History</h3>${rows.length ? `<span class="pill blue">${rows.length} ${rows.length === 1 ? 'injection' : 'injections'} \u00B7 ${num(total)}U</span>` : ''}</div>
        ${rows.length ? `<div class="list">${rows.map((r) => {
          const p = BT.product(r.inj.productId);
          return `<button class="li fm-row-btn" data-inj="${BT.esc(r.inj.id)}"><span class="dot" style="background:${p.color}"></span><div class="grow"><div class="li-title num">${BT.esc(BT.fmt.units(r.units))} \u00B7 ${BT.esc(p.name)}</div><div class="li-sub">${BT.esc(BT.fmt.dateLong(r.inj.at))} \u00B7 ${BT.esc(BT.fmt.ago(r.inj.at))}${r.inj.provider ? ' \u00B7 ' + BT.esc(r.inj.provider) : ''}</div></div>${BT.icon('chevron', 18, 'faint')}</button>`;
        }).join('')}</div>` : `<div class="empty" style="padding:20px 8px">No injections here yet.</div>`}
      </div>`;
    sh.body.querySelectorAll('[data-inj]').forEach((b) => (b.onclick = () => { sh.close(); if (BT.screens.injection) BT.go('injection', b.dataset.inj); }));
  }

  /* ----- map view ----- */
  function mapBody(body) {
    const last = BT.lastInjection();
    const sel = {};
    ((last && last.sites) || []).forEach((s) => { sel[s.siteId] = (sel[s.siteId] || 0) + (+s.units || 0); });
    const p = last ? BT.product(last.productId) : null;
    body.innerHTML = `<div id="fm-map"></div>
      <div class="row between gap" style="margin-top:6px"><span class="muted small">Tap a site to see its history</span>${last ? `<span class="pill green">Last ${BT.esc(BT.fmt.date(last.at))}</span>` : ''}</div>
      ${last ? '' : '<div class="callout" style="margin-top:12px">Log an injection and its sites will light up here.</div>'}`;
    mounts.push(BT.faceMap.mount(body.querySelector('#fm-map'), {
      mode: 'display', selected: sel, labels: true, hints: true, caption: false, onTap: openSite,
      labelFor: (id) => ({ title: BT.site(id).label, sub: `${BT.fmt.units(sel[id])} \u00B7 ${p.name}`, date: `${BT.fmt.weekday(last.at)}, ${BT.fmt.date(last.at)}` }),
    }));
  }

  /* ----- live view ----- */
  function liveBody(body) {
    const L = state.live;
    if (!L.url) {
      body.innerHTML = `<div class="fm-drop">${BT.icon('camera', 34)}<div><div class="li-title">Map on your own face</div><div class="muted small" style="margin-top:4px">Take a selfie or pick a photo, then line the outline up with your face and tap the zones to treat.</div></div>
        <div class="row gap wrap" style="justify-content:center"><button class="btn primary" data-cam>${BT.icon('camera', 18)} Take selfie</button><button class="btn" data-lib>${BT.icon('image', 18)} Choose photo</button></div></div>
        <p class="tiny muted" style="margin:10px 2px 0">Your phone camera opens to take the photo. Nothing is saved until you choose to.</p>`;
      const pick = async (cap) => {
        const f = await BT.photo.pick(cap ? { capture: 'user' } : {});
        if (!f) return;
        if (L.url) URL.revokeObjectURL(L.url);
        Object.assign(L, { file: f, url: URL.createObjectURL(f), x: 0, y: 0, s: 1, rot: 0, mode: 'align' });
        BT.render();
      };
      body.querySelector('[data-cam]').onclick = () => pick(true);
      body.querySelector('[data-lib]').onclick = () => pick(false);
      return;
    }

    body.innerHTML = `
      <div class="fm-live" data-mode="${L.mode}"><img alt="Your photo" src="${BT.esc(L.url)}"><div class="fm-ov"><div class="fm-ovw"></div></div></div>
      <div class="stack" style="margin-top:12px">
        <div data-seg></div>
        <div class="muted small" data-help style="text-align:center"></div>
        <div class="fm-ctl">
          <div class="fm-sl" data-sl="size"><span>Size</span><input type="range" min="30" max="250" step="1"><output></output></div>
          <div class="fm-sl" data-sl="rot"><span>Rotate</span><input type="range" min="-60" max="60" step="1"><output></output></div>
          <div class="fm-sl" data-sl="op"><span>Opacity</span><input type="range" min="25" max="100" step="1"><output></output></div>
        </div>
        <div class="row gap"><button class="btn sm ghost" data-retake>${BT.icon('camera', 16)} Retake</button><button class="btn sm ghost" data-reset>Reset outline</button></div>
        <div data-list></div>
        <div class="stack-s"><button class="btn primary" data-log>${BT.icon('syringe', 18)} Save as injection</button><button class="btn" data-before>${BT.icon('image', 18)} Save photo as Before</button></div>
      </div>`;
    const lv = body.querySelector('.fm-live'), ovw = body.querySelector('.fm-ovw');
    const help = body.querySelector('[data-help]'), list = body.querySelector('[data-list]');
    const sl = (k) => body.querySelector(`[data-sl="${k}"]`);
    const fm = BT.faceMap.mount(ovw, {
      mode: L.mode === 'select' ? 'select' : 'display', selected: L.sel, overlay: true, caption: false, maxWidth: 9999,
      onChange(map) { L.sel = map; drawList(); },
    });
    mounts.push(fm);

    function applyXf() {
      ovw.style.transform = `translate(-50%,-50%) translate(${L.x}px,${L.y}px) rotate(${L.rot}deg) scale(${L.s})`;
      ovw.style.opacity = L.op;
      fm.setMarkerScale(L.s);
      const set = (k, v, txt) => { const s = sl(k); s.querySelector('input').value = v; s.querySelector('output').textContent = txt; };
      set('size', Math.round(L.s * 100), Math.round(L.s * 100) + '%');
      set('rot', Math.round(L.rot), Math.round(L.rot) + '\u00B0');
      set('op', Math.round(L.op * 100), Math.round(L.op * 100) + '%');
    }
    const modeUi = () => {
      lv.dataset.mode = L.mode;
      help.textContent = L.mode === 'align' ? 'Drag to move, pinch or use the sliders to fit the outline to your face.' : 'Tap the zones you want to treat, then set the units below.';
      fm.setMode(L.mode === 'select' ? 'select' : 'display');
    };
    body.querySelector('[data-seg]').appendChild(BT.seg([['align', 'Align'], ['select', 'Select sites']], L.mode, (v) => { L.mode = v; modeUi(); })).classList.add('full');

    sl('size').querySelector('input').oninput = (e) => { L.s = e.target.value / 100; applyXf(); };
    sl('rot').querySelector('input').oninput = (e) => { L.rot = +e.target.value; applyXf(); };
    sl('op').querySelector('input').oninput = (e) => { L.op = e.target.value / 100; applyXf(); };
    body.querySelector('[data-reset]').onclick = () => { Object.assign(L, { x: 0, y: 0, s: 1, rot: 0, op: 0.8 }); applyXf(); };
    body.querySelector('[data-retake]').onclick = async () => {
      const f = await BT.photo.pick({ capture: 'user' });
      if (!f) return;
      if (L.url) URL.revokeObjectURL(L.url);
      Object.assign(L, { file: f, url: URL.createObjectURL(f) });
      BT.render();
    };

    /* drag, pinch and twist in align mode */
    const pts = new Map();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    lv.addEventListener('pointerdown', (e) => {
      if (L.mode !== 'align') return;
      try { lv.setPointerCapture(e.pointerId); } catch (x) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    lv.addEventListener('pointermove', (e) => {
      if (L.mode !== 'align' || !pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), cur = { x: e.clientX, y: e.clientY };
      if (pts.size === 1) { L.x += cur.x - prev.x; L.y += cur.y - prev.y; }
      else if (pts.size === 2) {
        const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
        const od = Math.hypot(prev.x - other.x, prev.y - other.y) || 1, nd = Math.hypot(cur.x - other.x, cur.y - other.y);
        const oa = Math.atan2(prev.y - other.y, prev.x - other.x), na = Math.atan2(cur.y - other.y, cur.x - other.x);
        L.s = clamp(L.s * nd / od, 0.3, 2.5);
        let da = (na - oa) * 180 / Math.PI; if (da > 180) da -= 360; if (da < -180) da += 360;
        L.rot = clamp(L.rot + da, -60, 60);
      }
      pts.set(e.pointerId, cur);
      applyXf();
    });
    const up = (e) => pts.delete(e.pointerId);
    lv.addEventListener('pointerup', up); lv.addEventListener('pointercancel', up);
    lv.addEventListener('wheel', (e) => { if (L.mode !== 'align') return; e.preventDefault(); L.s = clamp(L.s * Math.exp(-e.deltaY * 0.0015), 0.3, 2.5); applyXf(); }, { passive: false });

    /* chosen sites with steppers */
    function drawList() {
      const ids = BT.sites.map((s) => s.id).filter((id) => Object.prototype.hasOwnProperty.call(L.sel, id));
      const total = ids.reduce((a, id) => a + (+L.sel[id] || 0), 0);
      if (!ids.length) { list.innerHTML = `<div class="empty" style="padding:16px 8px">No sites chosen yet. Switch to Select sites and tap your photo.</div>`; syncBtns(); return; }
      list.innerHTML = `<div class="card-h" style="margin-bottom:0"><h3>Chosen sites</h3><span class="pill blue num">${num(total)}U across ${ids.length} ${ids.length === 1 ? 'site' : 'sites'}</span></div>
        <div class="list">${ids.map((id) => { const s = BT.site(id); return `<div class="li" data-id="${id}"><div class="grow"><div class="li-title">${BT.esc(s.label)}</div><div class="li-sub">${BT.esc(s.muscle)} \u00B7 common ${s.range[0]} to ${s.range[1]}U</div></div>
          <div class="stepper fm-step"><button data-d="-1" aria-label="Fewer units">\u2212</button><input inputmode="decimal" value="${num(L.sel[id])}" aria-label="Units"><button data-d="1" aria-label="More units">+</button></div>
          <button class="icon-btn" data-rm aria-label="Remove ${BT.esc(s.label)}">${BT.icon('close', 18)}</button></div>`; }).join('')}</div>`;
      list.querySelectorAll('.li').forEach((row) => {
        const id = row.dataset.id, inp = row.querySelector('input');
        const setU = (v) => { if (!(v > 0)) return; L.sel[id] = Math.min(200, num(v)); fm.setSelected(L.sel); inp.value = L.sel[id]; refreshTotal(); };
        row.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => setU(Math.max(0.5, (+L.sel[id] || 0) + +b.dataset.d))));
        inp.onchange = () => { const v = parseFloat(String(inp.value).replace(',', '.')); v > 0 ? setU(v) : (inp.value = L.sel[id]); };
        row.querySelector('[data-rm]').onclick = () => { delete L.sel[id]; fm.setSelected(L.sel); drawList(); };
      });
      syncBtns();
    }
    function refreshTotal() {
      const ids = Object.keys(L.sel), t = ids.reduce((a, id) => a + (+L.sel[id] || 0), 0), pill = list.querySelector('.pill');
      if (pill) pill.textContent = `${num(t)}U across ${ids.length} ${ids.length === 1 ? 'site' : 'sites'}`;
    }
    function syncBtns() { body.querySelector('[data-log]').disabled = !Object.keys(L.sel).length; }

    body.querySelector('[data-log]').onclick = () => {
      const sites = Object.keys(L.sel).map((siteId) => ({ siteId, units: +L.sel[siteId] || 0 }));
      if (!sites.length) return;
      if (BT.openLog) BT.openLog({ sites, photoFile: L.file });
      else BT.toast('Logging is not available yet');
    };
    body.querySelector('[data-before]').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const src = await BT.photo.store(L.file);
        BT.save('photos', { kind: 'before', at: Date.now(), src, injectionId: null, note: 'Face map' });
        BT.toast('Saved as a Before photo');
      } catch (err) { console.error(err); BT.toast('Could not save that photo'); }
      btn.disabled = false;
    };

    applyXf(); modeUi(); drawList();
  }

  /* ----- frequency ----- */
  function freqCard() {
    const count = {}, units = {};
    BT.data.injections.forEach((inj) => {
      const seen = {};
      (inj.sites || []).forEach((s) => { units[s.siteId] = (units[s.siteId] || 0) + (+s.units || 0); seen[s.siteId] = 1; });
      Object.keys(seen).forEach((k) => (count[k] = (count[k] || 0) + 1));
    });
    const top = Object.keys(count).sort((a, b) => count[b] - count[a] || units[b] - units[a]).slice(0, 5);
    const max = top.length ? count[top[0]] : 1;
    const card = BT.h(`<section class="card"><div class="card-h"><h3>Frequency</h3><span class="pill">All time</span></div><div id="fm-freq"></div>
      ${top.length ? `<div class="list" style="margin-top:8px">${top.map((id) => `<button class="li fm-row-btn" data-id="${id}"><div class="grow"><div class="li-title">${BT.esc(BT.site(id).label)}</div><div class="li-sub num">${count[id]} ${count[id] === 1 ? 'injection' : 'injections'} \u00B7 ${BT.esc(BT.fmt.units(units[id]))} total</div><div class="fm-bar"><i style="width:${Math.round(count[id] / max * 100)}%"></i></div></div><span class="pill blue num">${count[id]}x</span></button>`).join('')}</div>`
        : `<div class="empty" style="padding:16px 8px">Your most-used sites will show up here.</div>`}</section>`);
    card.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openSite(b.dataset.id)));
    return { card, mount: () => mounts.push(BT.faceMap.mount(card.querySelector('#fm-freq'), { mode: 'display', heat: count, caption: false, onTap: openSite, hints: true, maxWidth: 270 })) };
  }

  BT.screen('face', {
    title: 'Face Map',
    render(root) {
      mounts.forEach((m) => { try { m.destroy(); } catch (e) {} });
      mounts = [];
      root.appendChild(BT.h('<header class="page-h"><h1 class="title-xl">Face Map</h1><span></span></header>'));
      const card = BT.h('<section class="card"><div class="card-h"><h3>Injection Sites</h3><span data-seg></span></div><div data-body></div></section>');
      card.querySelector('[data-seg]').replaceWith(BT.seg([['map', 'Map'], ['live', 'Live']], state.view, (v) => { state.view = v; BT.render(); }));
      root.appendChild(card);
      const body = card.querySelector('[data-body]');
      if (state.view === 'live') liveBody(body);
      else {
        mapBody(body);
        const f = freqCard();
        root.appendChild(f.card);
        f.mount();
      }
      root.appendChild(BT.h('<p class="disclaimer">Reference ranges are educational, not medical advice. Follow your injector\u2019s plan.</p>'));
    },
  });
})();
