/* Face Map: anatomical muscle illustration with freeform injection points, plus the "Face Map" tab screen.

   BT.faceMap.mount(el, opts) -> { setPoints(points), getPoints(), select(pointId), setMode(mode), setHeat(h), setMarkerScale(k), destroy() }
     opts.mode         'edit' | 'display'
     opts.points       [{id, siteId, x, y, units}]  (x,y optional: filled by place())
     opts.onChange     (points) => void   new array after every add / move / remove (edit mode)
     opts.onSelect     (pointId|null) => void
     opts.selectedId   initially selected point
     opts.defaultUnits (muscleId) => number   units for a new point
     opts.labels       display mode: leader lines from each muscle group to side labels
     opts.labelFor     (muscleId) => string | {title, sub}
     opts.heat         {muscleId: number}  fill intensity by value, points hidden
     opts.overlay      white line art for drawing over a photo
     opts.onTapMuscle  (muscleId) => void   display mode
     opts.caption      show the muscle caption under the drawing (default: edit mode)
     opts.captionEl    render the caption into this element instead
     opts.toggle       show the Muscles on/off switch (default: edit mode)
   BT.faceMap.hitTest(x, y) -> muscleId | '' (no muscle) | null (caution zone)
   BT.faceMap.place(points) -> new array, x,y filled on each muscle's typical pattern
   BT.faceMap.centroid(muscleId) -> {x, y};  BT.faceMap.paths = {muscleId: d}
   Drawing space is 300 x 400. Patient's left (ids ending -l) is the viewer's right, x > 150. */
(function () {
  const BT = window.BT;
  if (!BT) return;

  /* ---------- geometry helpers ---------- */
  const W0 = 300;
  const VB = [40, 14, 220, 370]; // visible window into the drawing
  const r1 = (n) => Math.round(n * 10) / 10;
  // Mirror a path across x = 150. Paths here use only absolute M/L/C/Q/Z, so numbers alternate x, y.
  const mirrorD = (d) => { let i = 0; return d.replace(/-?\d*\.?\d+/g, (n) => (i++ % 2 === 0 ? String(r1(W0 - +n)) : n)); };

  function flatten(d) {
    const tk = d.match(/[MLCQZ]|-?\d*\.?\d+/gi) || [];
    const pts = []; let i = 0, cmd = 'M', cx = 0, cy = 0;
    const n = () => +tk[i++];
    while (i < tk.length) {
      if (/^[a-z]$/i.test(tk[i])) { cmd = tk[i++].toUpperCase(); if (cmd === 'Z') continue; }
      if (cmd === 'M' || cmd === 'L') { cx = n(); cy = n(); pts.push([cx, cy]); }
      else if (cmd === 'C') {
        const a = n(), b = n(), c = n(), e = n(), x = n(), y = n();
        for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; pts.push([u * u * u * cx + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x, u * u * u * cy + 3 * u * u * t * b + 3 * u * t * t * e + t * t * t * y]); }
        cx = x; cy = y;
      } else if (cmd === 'Q') {
        const a = n(), b = n(), x = n(), y = n();
        for (let k = 1; k <= 10; k++) { const t = k / 10, u = 1 - t; pts.push([u * u * cx + 2 * u * t * a + t * t * x, u * u * cy + 2 * u * t * b + t * t * y]); }
        cx = x; cy = y;
      } else i++;
    }
    return pts;
  }
  function inPoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function polyStats(poly) {
    let a = 0, cx = 0, cy = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j], f = xj * yi - xi * yj;
      a += f; cx += (xj + xi) * f; cy += (yj + yi) * f;
      x0 = Math.min(x0, xi); y0 = Math.min(y0, yi); x1 = Math.max(x1, xi); y1 = Math.max(y1, yi);
    }
    a /= 2;
    return { area: Math.abs(a), cx: a ? cx / (6 * a) : (x0 + x1) / 2, cy: a ? cy / (6 * a) : (y0 + y1) / 2, box: [x0, y0, x1, y1] };
  }

  /* ---------- anatomy ----------
     Muscle shapes are drawn for the patient's left (viewer's right); "-r" ids mirror them. Midline muscles are full shapes. */
  const SHAPES = {
    frontalis: 'M157 64 C176 63 196 68 208 80 C211 91 212 103 211 116 C200 112 186 112 174 115 C166 117 159 120 154 123 C154 103 155 83 157 64 Z',
    procerus: 'M145 147 C144 138 143 126 145 118 C146 114 154 114 155 118 C157 126 156 138 155 147 C152 149 148 149 145 147 Z',
    corrugator: 'M155 141 C158 133 167 127 178 123 C186 120 193 119 198 121 C193 125 185 128 177 132 C169 136 163 141 159 146 Z',
    browtail: 'M199 121 C207 117 217 121 223 131 C219 136 212 136 206 132 C202 129 200 125 199 121 Z',
    oculi: 'M211 133 C221 135 229 145 229 153 C229 163 223 171 212 174 C217 166 219 159 219 152 C219 144 216 138 211 133 Z',
    pretarsal: 'M168 155 C177 161 193 160 203 152 L205 155 C197 164 178 166 167 159 Z',
    temporalis: 'M210 84 C221 84 230 96 233 112 C235 128 234 142 231 152 L225 150 C221 136 217 118 213 104 C211 97 210 90 210 84 Z',
    nasalis: 'M140 168 C144 160 156 160 160 168 C163 174 165 180 166 186 C160 182 155 179 150 179 C145 179 140 182 134 186 C135 180 137 174 140 168 Z',
    dsn: 'M147 207 C147 204 153 204 153 207 L154 219 C152 221 148 221 146 219 Z',
    llsan: 'M160 150 C164 148 168 151 168 156 C170 170 176 186 182 200 C184 206 182 212 177 214 C174 204 168 188 164 172 C161 164 159 156 160 150 Z',
    oris: 'M150 211 C166 211 184 219 193 234 C187 252 168 262 150 262 C132 262 113 252 107 234 C116 219 134 211 150 211 Z',
    dao: 'M184 240 C189 248 194 255 196 261 C190 268 182 276 174 282 C175 266 179 252 184 240 Z',
    mentalis: 'M138 266 C142 262 158 262 162 266 C166 273 162 282 150 284 C138 282 134 273 138 266 Z',
    masseter: 'M203 187 C209 181 220 179 227 183 C227 198 223 214 217 228 C212 241 206 251 199 258 C197 244 197 226 198 210 C198 200 200 192 203 187 Z',
    platysma: 'M155 292 C167 290 179 284 187 275 C186 304 188 330 192 348 C206 356 222 362 236 368 L236 376 L160 376 C156 348 154 320 155 292 Z',
  };
  // Fiber direction for the hatching: lin = parallel at angle a; fan = rays from c; arc = rings around c (k squashes y).
  const FIB = {
    frontalis: { t: 'lin', a: 92 }, procerus: { t: 'lin', a: 90 }, corrugator: { t: 'lin', a: -26 },
    browtail: { t: 'arc', c: [185, 149] }, oculi: { t: 'arc', c: [185, 149] }, pretarsal: { t: 'arc', c: [185, 138] },
    temporalis: { t: 'fan', c: [224, 178] }, nasalis: { t: 'arc', c: [150, 214] }, dsn: { t: 'lin', a: 90 },
    llsan: { t: 'fan', c: [156, 120] }, oris: { t: 'arc', c: [150, 236], k: 0.58 }, dao: { t: 'fan', c: [183, 234] },
    mentalis: { t: 'fan', c: [150, 244] }, masseter: { t: 'fan', c: [196, 110] }, platysma: { t: 'lin', a: 62 },
  };
  // Usually-avoided muscles (caution zones), drawn for the viewer's right and mirrored.
  const CAUTION_SHAPES = {
    zygomaticus: [
      'M212 176 C217 174 222 177 221 182 C212 200 200 218 189 236 L184 233 C192 214 202 194 212 176 Z',
      'M199 168 C203 166 206 169 205 173 C197 187 189 202 181 218 L176 216 C182 200 190 184 199 168 Z',
    ],
    risorius: ['M189 236 C193 234 198 233 202 232 L202 237 C198 237 194 238 190 240 Z'],
    'levator-palpebrae': ['M166 151 C174 140 192 139 202 148 L207 142 C196 128 176 128 165 142 Z'],
  };
  // Typical injection patterns (template side). Used by place() for points that have no x,y yet.
  const PAT = {
    frontalis: [[172, 98], [192, 96], [182, 84], [164, 86], [202, 86], [176, 72], [196, 74]],
    procerus: [[150, 134], [150, 124]],
    corrugator: [[164, 137], [178, 128], [190, 123]],
    browtail: [[210, 126], [217, 130]],
    oculi: [[221, 141], [224, 152], [221, 163], [215, 170]],
    pretarsal: [[186, 162], [196, 159], [176, 161]],
    temporalis: [[218, 104], [225, 118], [229, 134], [220, 124]],
    nasalis: [[157, 172], [143, 172], [150, 166]],
    dsn: [[150, 213]],
    llsan: [[166, 168], [173, 188]],
    oris: [[160, 219], [140, 219], [172, 225], [128, 225], [158, 256], [142, 256]],
    dao: [[188, 258], [183, 268]],
    mentalis: [[144, 272], [156, 272], [150, 279]],
    masseter: [[206, 228], [213, 224], [204, 240], [210, 236], [203, 249]],
    platysma: [[166, 302], [168, 322], [171, 342], [174, 360], [180, 296], [184, 316], [188, 336], [194, 354]],
  };

  const HEAD = 'M150 24 C196 24 229 56 231 112 C232 140 231 168 226 196 C222 220 212 246 194 266 C181 280 166 288 150 288 C134 288 119 280 106 266 C88 246 78 220 74 196 C69 168 68 140 69 112 C71 56 104 24 150 24 Z';
  const NECK = 'M114 268 L186 268 C184 302 186 328 190 348 C214 356 248 364 282 382 L300 400 L0 400 L18 382 C52 364 86 356 110 348 C114 328 116 302 114 268 Z';
  const HAIR = 'M150 17 C206 17 241 58 238 120 C238 132 236 144 234 154 C232 136 229 116 224 104 C214 82 190 66 150 64 C110 66 86 82 76 104 C71 116 68 136 66 154 C64 144 62 132 62 120 C59 58 94 17 150 17 Z';
  const EAR = 'M230 134 C241 125 252 137 251 156 C250 173 243 188 229 192 Z';
  const EYE = 'M166 151 C174 140 192 139 203 148 C192 157 176 158 166 151 Z';
  const POLY = { head: flatten(HEAD), neck: flatten(NECK).filter((p) => p[1] <= 384), earL: flatten(EAR), earR: flatten(mirrorD(EAR)) };
  const inFace = (x, y) => inPoly(POLY.head, x, y) || (y < 384 && inPoly(POLY.neck, x, y)) || inPoly(POLY.earL, x, y) || inPoly(POLY.earR, x, y);

  // Muscle registry, built once.
  const MUS = {}, ORDER = [];
  BT.muscles.forEach((m) => {
    const base = m.id.replace(/-[lr]$/, ''), sh = SHAPES[base];
    if (!sh) return;
    const d = m.side === 'r' ? mirrorD(sh) : sh, poly = flatten(d), st = polyStats(poly);
    MUS[m.id] = { id: m.id, base, side: m.side, d, poly, area: st.area, cx: st.cx, cy: st.cy, box: st.box, fib: null };
    ORDER.push(m.id);
  });
  const CZ = [];
  Object.keys(CAUTION_SHAPES).forEach((zid) => CAUTION_SHAPES[zid].forEach((sh, i) => {
    [sh, mirrorD(sh)].forEach((d, k) => { const poly = flatten(d), st = polyStats(poly); CZ.push({ zid, key: zid + '-' + i + (k ? 'r' : 'l'), d, poly, area: st.area, box: st.box }); });
  }));
  const zoneInfo = (zid) => (BT.cautionZones || []).find((z) => z.id === zid) || { id: zid, label: zid, note: '' };

  /* ---------- fiber hatching ---------- */
  function fiberD(spec, box, step) {
    const [x0, y0, x1, y1] = [box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2];
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const out = [];
    if (spec.t === 'lin') {
      const a = (spec.a * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
      const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0) / 2 + 2;
      const pr = corners.map(([x, y]) => (x - ox) * nx + (y - oy) * ny), lo = Math.min(...pr), hi = Math.max(...pr);
      for (let t = lo + step / 2; t < hi; t += step) {
        const px = ox + nx * t, py = oy + ny * t;
        out.push(`M${r1(px - ux * L)} ${r1(py - uy * L)} L${r1(px + ux * L)} ${r1(py + uy * L)}`);
      }
    } else if (spec.t === 'fan') {
      const [cx, cy] = spec.c, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, base = Math.atan2(my - cy, mx - cx);
      const rel = corners.map(([x, y]) => { let d = Math.atan2(y - cy, x - cx) - base; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
      const R = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy))) + 2, rm = Math.max(8, Math.hypot(mx - cx, my - cy));
      const da = step / rm, lo = Math.min(...rel), hi = Math.max(...rel);
      for (let t = lo + da / 2; t < hi; t += da) { const a = base + t; out.push(`M${r1(cx)} ${r1(cy)} L${r1(cx + Math.cos(a) * R)} ${r1(cy + Math.sin(a) * R)}`); }
    } else {
      const [cx, cy] = spec.c, k = spec.k || 1, K = 0.5523;
      const ds = corners.map(([x, y]) => Math.hypot(x - cx, (y - cy) / k));
      const inside = x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1;
      const lo = inside ? step : Math.max(step, Math.min(...ds) - 30), hi = Math.max(...ds);
      for (let r = lo; r < hi; r += step) {
        const a = r, b = r * k;
        out.push(`M${r1(cx - a)} ${r1(cy)} C${r1(cx - a)} ${r1(cy - b * K)} ${r1(cx - a * K)} ${r1(cy - b)} ${r1(cx)} ${r1(cy - b)} C${r1(cx + a * K)} ${r1(cy - b)} ${r1(cx + a)} ${r1(cy - b * K)} ${r1(cx + a)} ${r1(cy)} C${r1(cx + a)} ${r1(cy + b * K)} ${r1(cx + a * K)} ${r1(cy + b)} ${r1(cx)} ${r1(cy + b)} C${r1(cx - a * K)} ${r1(cy + b)} ${r1(cx - a)} ${r1(cy + b * K)} ${r1(cx - a)} ${r1(cy)}`);
      }
    }
    return out.join('');
  }
  ORDER.forEach((id) => {
    const m = MUS[id], spec = FIB[m.base] || { t: 'lin', a: 90 };
    const step = m.area < 260 ? 1.7 : 2.3;
    if (m.side === 'r') { const tpl = MUS[id.replace(/-r$/, '-l')]; m.fib = tpl ? mirrorD(tpl.fib || fiberD(spec, tpl.box, step)) : fiberD(spec, m.box, step); }
    else m.fib = fiberD(spec, m.box, step);
  });
  CZ.forEach((z) => { z.fib = fiberD({ t: 'lin', a: 45 }, z.box, 2.2); });

  /* ---------- hit testing and placement ---------- */
  const keyOf = (p) => (p && p.siteId ? BT.site(p.siteId).id : '');
  function hitInfo(x, y) {
    let best = null;
    ORDER.forEach((id) => { const m = MUS[id]; if (inPoly(m.poly, x, y) && (!best || m.area < best.area)) best = { muscle: id, caution: null, area: m.area }; });
    CZ.forEach((z) => { if (inPoly(z.poly, x, y) && (!best || z.area < best.area)) best = { muscle: null, caution: z.zid, area: z.area }; });
    return best || { muscle: '', caution: null, area: 0 };
  }
  const hitTest = (x, y) => { const h = hitInfo(x, y); return h.caution ? null : h.muscle; };
  const centroid = (id) => { const m = MUS[id ? BT.site(id).id : '']; return m ? { x: r1(m.cx), y: r1(m.cy) } : { x: 150, y: 196 }; };

  function place(points) {
    const out = (points || []).map((p) => ({ ...p, id: p.id || BT.uid() }));
    const has = (p) => Number.isFinite(+p.x) && Number.isFinite(+p.y) && p.x !== null && p.y !== null && p.x !== '' && p.y !== '';
    const taken = out.filter(has).map((p) => [+p.x, +p.y]);
    const free = (x, y) => taken.every(([a, b]) => Math.hypot(a - x, b - y) > 6);
    out.forEach((p) => {
      if (has(p)) { p.x = +p.x; p.y = +p.y; return; }
      const id = keyOf(p), m = MUS[id];
      let spot = null;
      if (m) {
        const pat = (PAT[m.base] || []).map(([x, y]) => (m.side === 'r' ? [W0 - x, y] : [x, y]));
        spot = pat.find(([x, y]) => free(x, y));
        if (!spot) {
          // spiral outward from the centroid until a free spot inside the muscle turns up
          for (let k = 0; k < 400 && !spot; k++) {
            const a = k * 2.4, rr = 2 + k * 0.35, x = m.cx + Math.cos(a) * rr, y = m.cy + Math.sin(a) * rr;
            if (inPoly(m.poly, x, y) && free(x, y)) spot = [x, y];
          }
        }
        spot = spot || [m.cx, m.cy];
      } else {
        for (let k = 0; k < 60 && !spot; k++) { const x = 150 + ((k % 5) - 2) * 9, y = 196 + Math.floor(k / 5) * 9; if (free(x, y)) spot = [x, y]; }
        spot = spot || [150, 196];
      }
      p.x = r1(spot[0]); p.y = r1(spot[1]);
      taken.push(spot);
    });
    return out;
  }

  /* ---------- the drawing ---------- */
  const FLIP = ' transform="matrix(-1 0 0 1 300 0)"';
  const sym = (s) => `<g>${s}</g><g${FLIP}>${s}</g>`;
  const ln = (d, c = '') => `<path class="fm-ln ${c}" d="${d}"/>`;

  function drawing(uid) {
    const byArea = ORDER.slice().sort((a, b) => MUS[b].area - MUS[a].area);
    const clips = ORDER.map((id) => `<clipPath id="${uid}-c-${id}"><path d="${MUS[id].d}"/></clipPath>`).join('') +
      CZ.map((z) => `<clipPath id="${uid}-z-${z.key}"><path d="${z.d}"/></clipPath>`).join('') +
      `<clipPath id="${uid}-eye"><path d="${EYE}"/></clipPath>`;
    const mu = (id) => { const m = MUS[id]; return `<g class="fm-mu" data-m="${id}"><path class="fm-mf" d="${m.d}"/><path class="fm-mh" d="${m.fib}" clip-path="url(#${uid}-c-${id})"/><path class="fm-mo" d="${m.d}"/></g>`; };
    const isNeck = (id) => MUS[id].base === 'platysma';
    const neckMus = byArea.filter(isNeck).map(mu).join(''), faceMus = byArea.filter((id) => !isNeck(id)).map(mu).join('');
    const caution = CZ.map((z) => `<g class="fm-cz" data-c="${z.zid}"><path class="fm-cf" d="${z.d}"/><path class="fm-ch" d="${z.fib}" clip-path="url(#${uid}-z-${z.key})"/><path class="fm-co" d="${z.d}"/></g>`).join('');

    const ears = sym(`<path class="fm-skin" d="${EAR}"/>` + ln('M235 145 C243 144 246 158 242 170 C240 176 237 180 233 182', 'f') + ln('M236 160 C239 158 241 163 238 168', 'f'));
    const neck = sym(ln('M190 290 C182 316 170 342 160 368', 'f') + ln('M164 372 C182 366 206 366 230 376', 'f'));
    // the right eye is the mirrored template, so both share one clip path in template space
    const eyes = sym(`<path class="fm-eyew" d="${EYE}"/>` +
      `<g clip-path="url(#${uid}-eye)"><circle class="fm-iris" cx="185" cy="148.5" r="6.8"/><circle class="fm-pupil" cx="185" cy="148.5" r="2.6"/><circle class="fm-glint" cx="187.4" cy="146.4" r="1"/></g>` +
      ln('M166 151 C174 140 192 139 203 148', 'lid') + ln('M166 151 C176 158 192 157 203 148', 't') +
      ln('M168 143 C178 133 196 132 207 141', 'f') + ln('M170 159 C180 164 194 163 204 155', 'f t') +
      '<path class="fm-car" d="M166 151 C167.5 149 169.5 149 170.5 151 C169.5 153 167.5 153 166 151 Z"/>');
    const brows = sym('<path class="fm-brow" d="M158 140 C168 128 194 118 219 133 C214 131 207 128 199 127 C184 126 170 132 162 143 Z"/>' +
      ln('M162 138 L166 133 M168 134 L173 129 M175 131 L181 126 M183 128 L189 124 M191 126 L197 123 M199 126 L205 124 M207 127 L212 127', 'brh'));
    const nose = sym(ln('M156 142 C157 160 159 176 163 190', 'f') + ln('M163 190 C172 189 177 198 174 205 C172 209 166 210 161 207') +
      ln('M155 206 C158 203 162 203 164 206', 'f') + ln('M150 209 C152 209 154 208 155 206') + ln('M174 199 C184 210 190 222 191 236', 'f'));
    const lips = `<path class="fm-lip" d="M150 227 C153 223 157 221 161 222 C168 223 175 228 182 234 C175 245 163 250 150 250 C137 250 125 245 118 234 C125 228 132 223 139 222 C143 221 147 223 150 227 Z"/>` +
      sym(ln('M150 227 C153 223 157 221 161 222 C168 223 175 228 182 234') + ln('M150 236 C160 236 172 235 182 234', 'mouth') + ln('M182 234 C175 245 163 250 150 250') + ln('M154 210 C155 215 156 219 157 222', 'f')) +
      ln('M141 262 C146 265 154 265 159 262', 'f');

    return `<defs>${clips}
      <linearGradient id="${uid}-ng" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="384"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
      <mask id="${uid}-nm" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="400"><rect width="300" height="400" fill="url(#${uid}-ng)"/></mask></defs>
      <g mask="url(#${uid}-nm)"><path class="fm-skin fm-nostroke" d="${NECK}"/>${sym('<path class="fm-edge" d="M186 268 C184 302 186 328 190 348 C214 356 248 364 282 382"/>')}${neck}<g class="fm-mus">${neckMus}</g></g>
      ${ears}
      <path class="fm-skin" d="${HEAD}"/>
      <path class="fm-hair" d="${HAIR}"/>
      <g class="fm-mus">${faceMus}</g>
      <g class="fm-czs">${caution}</g>
      <g class="fm-feat">${brows}${eyes}${nose}${lips}</g>`;
  }

  /* ---------- css ---------- */
  function injectCSS() {
    if (document.getElementById('fm-css')) return;
    const st = document.createElement('style');
    st.id = 'fm-css';
    st.textContent = `
:root{--fm-skin:#EDEFF4;--fm-hair:#E0E3EA;--fm-stroke:#A6ABB8;--fm-mus:#D17D6B;--fm-mus-ink:#A9564A;--fm-lip:#D9978A;--fm-cau:#C98A1A}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--fm-skin:#1C202B;--fm-hair:#232835;--fm-stroke:#5C6376;--fm-mus:#E0907D;--fm-mus-ink:#F0B4A6;--fm-lip:#C9867A;--fm-cau:#F6C25B}}
:root[data-theme="dark"]{--fm-skin:#1C202B;--fm-hair:#232835;--fm-stroke:#5C6376;--fm-mus:#E0907D;--fm-mus-ink:#F0B4A6;--fm-lip:#C9867A;--fm-cau:#F6C25B}
.fm{position:relative;width:100%;--fm-line:var(--muted);--fm-halo:var(--card)}
.fm-overlay{--fm-skin:transparent;--fm-hair:transparent;--fm-stroke:#FFFFFF;--fm-line:#FFFFFF;--fm-halo:rgba(0,0,0,.6);--fm-mus-ink:#FFFFFF}
.fm-overlay .fm-stage svg{filter:drop-shadow(0 0 1.2px rgba(0,0,0,.75))}
.fm-stage{position:relative}
.fm-stage svg{display:block;width:100%;height:100%;overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.fm[data-mode=edit] .fm-stage svg{touch-action:pan-y;cursor:crosshair}
.fm.fm-zoomable .fm-stage svg{touch-action:pan-y}
.fm.fm-zoomed .fm-stage svg{touch-action:none}
.fm.fm-zoomed .fm-lead,.fm.fm-zoomed .fm-labs{visibility:hidden}
.fm-zbar{position:absolute;right:6px;top:6px;display:flex;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden;z-index:2}
.fm-zbar[hidden]{display:none}
.fm-zbar.below{position:static;width:max-content;margin:8px 0 0 auto;box-shadow:none}
.fm.fm-zoomed .fm-stage{overflow:hidden}
.fm.fm-zoomed .fm-zbar{top:10px;right:10px}
.fm.fm-zoomed .fm-zbar.below{position:absolute;top:auto;bottom:10px;margin:0;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.fm-cam.lc-zoomed .fm-camst{display:none}
.fm-zbar button{min-width:40px;height:40px;font-size:20px;line-height:1;color:var(--accent);display:grid;place-items:center}
.fm-zbar button[data-z=lvl]{font-size:12px;min-width:44px;color:var(--muted);font-variant-numeric:tabular-nums;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.fm-zbar button:disabled{color:var(--faint);opacity:.6}
.fm[data-mode=edit] .fm-pt,.fm[data-mode=edit] .fm-rm{touch-action:none;cursor:grab}
.fm[data-mode=display].tap .fm-stage svg{cursor:pointer}
.fm-skin{fill:var(--fm-skin);stroke:var(--fm-stroke);stroke-width:1.1;stroke-linejoin:round}
.fm-skin.fm-nostroke{stroke:none}
.fm-edge{fill:none;stroke:var(--fm-stroke);stroke-width:1.1;stroke-linecap:round}
.fm-hair{fill:var(--fm-hair);fill-opacity:.7;stroke:var(--fm-stroke);stroke-width:.8;stroke-opacity:.6}
.fm-overlay .fm-hair{stroke-dasharray:2 3}
.fm-ln{fill:none;stroke:var(--fm-line);stroke-width:1.05;stroke-linecap:round;stroke-linejoin:round}
.fm-ln.f{opacity:.5}.fm-ln.t{stroke-width:.8}.fm-ln.lid{stroke-width:1.5}.fm-ln.mouth{stroke-width:1.25}
.fm-ln.brh{stroke:var(--fm-line);stroke-width:.6;opacity:.45}
.fm-eyew{fill:var(--card);stroke:none}
.fm-overlay .fm-eyew{fill:none}
.fm-iris{fill:none;stroke:var(--fm-line);stroke-width:1}
.fm-pupil{fill:var(--fm-line)}
.fm-glint{fill:var(--card)}
.fm-overlay .fm-pupil,.fm-overlay .fm-glint{fill:none}
.fm-car{fill:var(--fm-mus);fill-opacity:.4}
.fm-brow{fill:var(--fm-line);fill-opacity:.3}
.fm-lip{fill:var(--fm-lip);fill-opacity:.32}
.fm-overlay .fm-lip,.fm-overlay .fm-brow{fill-opacity:.12}
.fm-mf{fill:var(--fm-mus);fill-opacity:.13;transition:fill-opacity .18s}
.fm-mh{fill:none;stroke:var(--fm-mus-ink);stroke-width:.42;stroke-opacity:.42;pointer-events:none}
.fm-mo{fill:none;stroke:var(--fm-mus-ink);stroke-width:.65;stroke-opacity:.55;stroke-linejoin:round;pointer-events:none}
.fm-overlay .fm-mf{fill-opacity:.2}
.fm-overlay .fm-mh{stroke-opacity:.22}
.fm-mu.has .fm-mf{fill-opacity:.3}
.fm-mu.has .fm-mo{stroke-opacity:.85}
.fm-mu.hov .fm-mf,.fm-mu.sel .fm-mf{fill-opacity:.46}
.fm-mu.hov .fm-mo,.fm-mu.sel .fm-mo{stroke-opacity:1;stroke-width:1}
.fm-mu.hov .fm-mh,.fm-mu.sel .fm-mh{stroke-opacity:.7}
.fm-heat .fm-mu .fm-mf{fill:var(--accent);fill-opacity:.05}
.fm-heat .fm-mu .fm-mh{stroke-opacity:.22}
.fm-heat .fm-mu.hot .fm-mo{stroke:var(--accent);stroke-opacity:.8}
.fm-cf{fill:var(--fm-cau);fill-opacity:.06}
.fm-ch{fill:none;stroke:var(--fm-cau);stroke-width:.45;stroke-opacity:.5;pointer-events:none}
.fm-co{fill:none;stroke:var(--fm-cau);stroke-width:.7;stroke-dasharray:2 1.6;stroke-opacity:.85;pointer-events:none}
.fm-cz.hov .fm-cf{fill-opacity:.22}
.fm-nomus .fm-mf,.fm-nomus .fm-mh,.fm-nomus .fm-ch,.fm-nomus .fm-cf{opacity:0}
.fm-nomus .fm-mo{stroke-opacity:.18;stroke-dasharray:1.5 2}
.fm-nomus .fm-mu.has .fm-mo,.fm-nomus .fm-mu.sel .fm-mo{stroke-opacity:.5}
.fm-nomus .fm-co{stroke-opacity:.3}
.fm-pt{outline:none}
.fm-pt .dot{fill:var(--accent);stroke:var(--fm-halo);stroke-width:1.4}
.fm-pt .ring{fill:none;stroke:var(--accent);stroke-width:1.5}
.fm-pt .hit{fill:transparent}
.fm-pt .lab{font:600 8.4px var(--font);fill:var(--accent);paint-order:stroke;stroke:var(--fm-halo);stroke-width:2.6px;stroke-linejoin:round;font-variant-numeric:tabular-nums;pointer-events:none}
.fm-overlay .fm-pt .lab{fill:#FFFFFF}
.fm-pt:focus-visible .ring,.fm-pt:focus-visible .dot{stroke:var(--fg);stroke-width:2}
.fm-pt.drag .dot{filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
.fm-rm .bg{fill:var(--fg)}
.fm-rm .x{stroke:var(--bg);stroke-width:1.3;stroke-linecap:round}
.fm-rm .hit{fill:transparent}
.fm-hn{font:600 9px var(--font);fill:var(--accent);text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:var(--card);stroke-width:2.4px;pointer-events:none}
.fm-lead{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.fm-lead line{stroke:var(--accent);stroke-opacity:.65;stroke-dasharray:3 3;stroke-width:1}
.fm-lead circle{fill:var(--accent)}
.fm-labs{position:absolute;inset:0;pointer-events:none}
.fm-lab{position:absolute;pointer-events:auto;font-size:12px;line-height:1.25;min-height:40px;padding:2px 0}
.fm-lab.tap{cursor:pointer}
.fm-lab.l{text-align:right}
.fm-lab .t{color:var(--fg);font-weight:500;font-size:12px}
.fm-lab .s{color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.fm-lab .d{color:var(--faint);font-size:11px}
.fm-foot{display:flex;align-items:flex-start;gap:8px;margin-top:6px}
.fm-cap{flex:1;min-width:0;min-height:58px;font-size:12.5px;color:var(--muted);display:grid;gap:1px;align-content:start;line-height:1.35}
.fm-cap b{color:var(--fg);font-weight:500;font-size:14px}
.fm-cap .warn{color:var(--amber)}
.fm-tog{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;font-size:12.5px;color:var(--muted);padding:0 2px}
.fm-tog i{width:30px;height:18px;border-radius:9px;background:var(--line);position:relative;transition:background .18s}
.fm-tog i::after{content:"";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:var(--card);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .18s}
.fm-tog[aria-pressed=true] i{background:var(--fm-mus)}
.fm-tog[aria-pressed=true] i::after{transform:translateX(12px)}
.fm-live{position:relative;width:100%;aspect-ratio:3/4;max-height:72vh;border-radius:16px;overflow:hidden;background:var(--card-2);user-select:none;-webkit-user-select:none}
.fm-live img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.fm-live[data-mode=align]{touch-action:none;cursor:grab}
.fm-ov{position:absolute;inset:0}
.fm-live[data-mode=align] .fm-ov{pointer-events:none}
.fm-ovw{position:absolute;left:50%;top:50%;width:80%;transform-origin:center}
.fm-ctl{display:grid;gap:4px}
.fm-sl{display:grid;grid-template-columns:64px 1fr 44px;align-items:center;gap:10px;min-height:40px;font-size:13px;color:var(--muted)}
.fm-sl input{width:100%;accent-color:var(--accent);height:40px;margin:0}
.fm-sl output{text-align:right;font-variant-numeric:tabular-nums;font-size:12px}
.fm-step button{width:40px;height:40px}
.fm-step input{height:40px;width:46px}
.fm-bar{height:5px;border-radius:3px;background:var(--card-2);margin-top:7px;overflow:hidden}
.fm-bar i{display:block;height:100%;border-radius:3px;background:var(--accent)}
.fm-drop{display:grid;justify-items:center;gap:12px;text-align:center;padding:30px 16px;border:1.5px dashed var(--accent-line);border-radius:16px;background:var(--accent-soft)}
.fm-drop>.ic{color:var(--accent)}
.fm-row-btn{width:100%;text-align:left}
.fm-sw{width:10px;height:10px;border-radius:3px;background:var(--fm-mus);opacity:.75;flex:none}
.fm-pli.sel{background:var(--accent-soft);margin:0 -10px;padding-left:10px;padding-right:10px;border-radius:12px}
.fm-livecap{min-height:40px;text-align:center;justify-items:center}
.fm-cam video,.fm-cam canvas{position:absolute;inset:0;width:100%;height:100%}
.fm-cam video{object-fit:cover;transform:scaleX(-1);pointer-events:none}
.fm-cam canvas{touch-action:pan-y;cursor:crosshair;transition:opacity .18s}
.fm-camst{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:1;max-width:calc(100% - 24px);background:rgba(0,0,0,.55);color:#fff;font-size:12.5px;line-height:1.3;padding:6px 12px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
`;
    document.head.appendChild(st);
  }

  /* ---------- component ---------- */
  const num = (n) => Math.round((+n || 0) * 10) / 10;
  const labelOf = (id) => (id ? BT.site(id).label : 'General');
  const shortOf = (id) => labelOf(id).replace(/^(Left|Right) /, '');

  function mount(el, opts) {
    opts = Object.assign({ mode: 'display', points: null, labels: false, heat: null, overlay: false, maxWidth: 340, markerScale: 1 }, opts || {});
    injectCSS();
    const esc = BT.esc;
    const uid = 'fm' + Math.random().toString(36).slice(2, 8);
    const fromMap = (sel) => Object.keys(sel || {}).map((siteId) => ({ siteId, units: +sel[siteId] || 0 }));
    const norm = (arr) => place((arr || []).map((p) => ({ ...p, siteId: p.siteId == null ? '' : p.siteId, units: +p.units || 0 })));
    let pts = norm(opts.points || (opts.selected ? fromMap(opts.selected) : []));
    let selId = opts.selectedId || null;
    let heat = opts.heat || null;
    let hov = null; // {muscle, caution}
    let mscale = opts.markerScale || 1, showMus = true, lastW = 0, drag = null;
    // Zoom (#11, #26): maps zoom by narrowing the SVG viewBox, so taps still land in face
    // coordinates through getScreenCTM. Display maps zoom too; while zoomed their gutter labels hide
    // and each dot shows its units. Not on photo overlays, where the photo would not follow.
    let zk = 1, zx = VB[0] + VB[2] / 2, zy = VB[1] + VB[3] / 2, pz = null, pinched = false;
    const touches = new Map();
    const ZMAX = 4;
    const zoomable = () => opts.zoom !== false && !opts.overlay;
    const zoomed = () => zk > 1.001;
    const wantCap = opts.caption == null ? opts.mode === 'edit' : !!opts.caption;
    const wantTog = opts.toggle == null ? opts.mode === 'edit' && !opts.overlay : !!opts.toggle;

    el.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'fm' + (opts.overlay ? ' fm-overlay' : '');
    root.innerHTML = `<div class="fm-stage"><svg viewBox="${VB.join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Face muscle map">${drawing(uid)}<g class="fm-dyn"></g></svg></div><svg class="fm-lead" aria-hidden="true"></svg><div class="fm-labs"></div>`;
    el.appendChild(root);
    const stage = root.querySelector('.fm-stage'), svg = stage.querySelector('svg'), dyn = svg.querySelector('.fm-dyn');
    const lead = root.querySelector('.fm-lead'), labs = root.querySelector('.fm-labs');
    const mg = {}; svg.querySelectorAll('.fm-mu').forEach((g) => (mg[g.dataset.m] = g));
    const cg = [...svg.querySelectorAll('.fm-cz')];
    let cap = opts.captionEl || null, tog = null, foot = null;
    if (cap) { cap.classList.add('fm-cap'); cap.setAttribute('aria-live', 'polite'); }
    if ((wantCap && !cap) || wantTog) {
      foot = document.createElement('div'); foot.className = 'fm-foot';
      if (wantCap && !cap) { cap = document.createElement('div'); cap.className = 'fm-cap'; cap.setAttribute('aria-live', 'polite'); foot.appendChild(cap); }
      else foot.appendChild(document.createElement('span')).style.flex = '1';
      if (wantTog) {
        tog = document.createElement('button'); tog.type = 'button'; tog.className = 'fm-tog'; tog.setAttribute('aria-pressed', 'true');
        tog.innerHTML = '<span>Muscles</span><i></i>';
        tog.onclick = () => { showMus = !showMus; tog.setAttribute('aria-pressed', String(showMus)); root.classList.toggle('fm-nomus', !showMus); };
        foot.appendChild(tog);
      }
      el.appendChild(foot);
    }

    const toLocal = (cx, cy) => {
      const m = svg.getScreenCTM(); if (!m) return null;
      const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
      return { x: Math.max(VB[0] + 2, Math.min(VB[0] + VB[2] - 2, p.x)), y: Math.max(VB[1] + 2, Math.min(VB[1] + VB[3] - 2, p.y)) };
    };
    const emit = () => opts.onChange && opts.onChange(pts.map((p) => ({ ...p })));
    const selPt = () => pts.find((p) => p.id === selId) || null;
    const isEdit = () => opts.mode === 'edit';
    const showLabels = () => !!opts.labels && opts.mode === 'display' && !heat && pts.length > 0;

    function metrics() {
      const W = Math.max(220, root.clientWidth || el.clientWidth || 320);
      const lab = showLabels();
      const faceW = lab ? Math.round(W * 0.5) : Math.min(W, opts.maxWidth || 340);
      const left = Math.round((W - faceW) / 2), s = faceW / VB[2];
      return { W, faceW, left, s, H: Math.round((faceW * VB[3]) / VB[2]), lab };
    }
    // Zoomed box (#41): the full card width edge to edge (bleeding past the card's inner padding, rounded
    // like the card) and taller than the 1x face by the side space the 1x layout left around it, up to 70%
    // of the viewport, so the zoomed face is not cropped to the small 1x box.
    function zbox(m) {
      const c = root.closest('.card');
      let bl = 0, br = 0, rad = '';
      if (c) {
        const rc = c.getBoundingClientRect(), rr = root.getBoundingClientRect(), cs = getComputedStyle(c);
        bl = Math.max(0, Math.round(rr.left - rc.left - c.clientLeft));
        br = Math.max(0, Math.round(rc.right - rr.right - (parseFloat(cs.borderRightWidth) || 0)));
        rad = Math.max(0, (parseFloat(cs.borderTopLeftRadius) || 0) - c.clientLeft) + 'px';
      }
      const h = Math.round(Math.max(m.H, Math.min(m.H + (m.W - m.faceW), (window.innerHeight || 800) * 0.7)));
      return { w: m.W + bl + br, h, bl, br, rad };
    }
    // Size the stage for the current zoom: the 1x face box, or the zoomed box.
    function sizeStage() {
      const m = metrics(), z = zoomed() ? zbox(m) : null;
      // Zoomed, negative margins on both sides widen the stage without adding to the card's content width.
      if (z) { stage.style.width = ''; stage.style.height = z.h + 'px'; stage.style.marginLeft = -z.bl + 'px'; stage.style.marginRight = -z.br + 'px'; stage.style.borderRadius = z.rad; }
      else { stage.style.width = m.faceW + 'px'; stage.style.height = m.H + 'px'; stage.style.marginLeft = m.left + 'px'; stage.style.marginRight = ''; stage.style.borderRadius = ''; }
      m.z = z;
      return m;
    }

    function paintStates() {
      const has = {}; pts.forEach((p) => (has[keyOf(p)] = 1));
      const sp = selPt(), sk = sp ? keyOf(sp) : null;
      const hm = heat ? Math.max(1, ...Object.values(heat).map((v) => +v || 0)) : 1;
      const hv = {}; if (heat) Object.keys(heat).forEach((k) => { const id = BT.site(k).id; hv[id] = (hv[id] || 0) + (+heat[k] || 0); });
      ORDER.forEach((id) => {
        const g = mg[id]; if (!g) return;
        g.classList.toggle('has', !heat && !!has[id]);
        g.classList.toggle('sel', !heat && sk === id);
        g.classList.toggle('hov', !!hov && hov.muscle === id);
        const f = g.firstElementChild;
        if (heat) { const n = (hv[id] || 0) / hm; g.classList.toggle('hot', n > 0); f.style.fillOpacity = n > 0 ? (0.16 + 0.6 * n).toFixed(2) : ''; }
        else { g.classList.remove('hot'); f.style.fillOpacity = ''; }
      });
      cg.forEach((g) => g.classList.toggle('hov', !!hov && hov.caution === g.dataset.c));
      root.classList.toggle('fm-heat', !!heat);
    }

    function ptMarkup(p, m) {
      const sel = p.id === selId, edit = isEdit();
      // While zoomed, a labeled map fills the wide zoomed box (zbox) instead of its 1x column, so its markers grow to match.
      const zs = zoomed() ? (m.lab ? Math.min(2, m.W / m.faceW) : 1) / zk : 1;
      const ms = Math.max(0.55, Math.min(1.6, 1 / mscale)) * zs;
      const r = (m.lab ? 4.2 : 4.6) * ms, side = p.x >= 150 ? 1 : -1;
      const u = num(p.units);
      // strokes are in face units, so they shrink with the zoom too or they swamp the dot
      const sw = (w) => (zs !== 1 ? ` style="stroke-width:${(w * zs).toFixed(2)}px"` : '');
      const lab = m.lab && !zoomed() ? '' : `<text class="lab" x="${r1(side * (r + 2.2))}" y="${r1(3 * ms)}" text-anchor="${side > 0 ? 'start' : 'end'}" style="font-size:${r1(8.4 * ms)}px${zs !== 1 ? `;stroke-width:${(2.6 * zs).toFixed(2)}px` : ''}">${esc(u)}</text>`;
      return `<g class="fm-pt${sel ? ' sel' : ''}" data-id="${esc(p.id)}" transform="translate(${p.x} ${p.y})"${edit ? ' tabindex="0" role="button"' : ''} aria-label="${esc(labelOf(keyOf(p)))}, ${esc(u)} units">` +
        (sel ? `<circle class="ring" r="${r1(r + 3.4 * ms)}"${sw(1.5)}/>` : '') + `<circle class="dot" r="${r1(r)}"${sw(1.4)}/>${lab}` +
        (edit ? `<circle class="hit" r="${r1(12 * ms)}"/>` : '') + '</g>';
    }
    function rmMarkup(p) {
      const ms = Math.max(0.55, Math.min(1.6, 1 / mscale)) / zk, side = p.x >= 150 ? 1 : -1;
      const x = r1(p.x - side * 11 * ms), y = r1(p.y - 11 * ms), k = 2.3 * ms;
      return `<g class="fm-rm" data-rm="1" transform="translate(${x} ${y})" role="button" aria-label="Remove point"><circle class="bg" r="${r1(6 * ms)}"/><path class="x" d="M${-k} ${-k}L${k} ${k}M${k} ${-k}L${-k} ${k}"/><circle class="hit" r="${r1(11 * ms)}"/></g>`;
    }

    function render() {
      const m = sizeStage();
      lastW = root.clientWidth;
      root.dataset.mode = opts.mode;
      root.classList.toggle('tap', !!opts.onTapMuscle);
      let out = '';
      if (heat) {
        const hv = {}; Object.keys(heat).forEach((k) => { const id = BT.site(k).id; hv[id] = (hv[id] || 0) + (+heat[k] || 0); });
        const hs = zoomed() ? ` style="font-size:${r1(9 / zk)}px;stroke-width:${(2.4 / zk).toFixed(2)}px"` : '';
        Object.keys(hv).forEach((id) => { const c = MUS[id]; if (c && hv[id] > 0) out += `<text class="fm-hn" x="${r1(c.cx)}" y="${r1(c.cy)}"${hs}>${esc(num(hv[id]))}</text>`; });
      } else {
        const order = pts.slice().sort((a, b) => (a.id === selId) - (b.id === selId));
        out = order.map((p) => ptMarkup(p, m)).join('');
        const sp = selPt(); if (sp && isEdit()) out += rmMarkup(sp);
      }
      dyn.innerHTML = out;
      paintStates();
      layoutLabels(m);
      if (m.z) root.style.height = m.z.h + 'px'; // labels hide while zoomed; the zoomed box sets the height
      caption();
    }

    function layoutLabels(m) {
      labs.innerHTML = ''; lead.innerHTML = '';
      if (!m.lab) { root.style.height = m.H + 'px'; lead.setAttribute('width', 0); return; }
      const gw = Math.max(56, m.left - 4);
      const gm = new Map();
      pts.forEach((p) => { const k = keyOf(p), g = gm.get(k) || { id: k, units: 0, n: 0, sx: 0, sy: 0 }; g.units += +p.units || 0; g.n++; g.sx += p.x; g.sy += p.y; gm.set(k, g); });
      const items = [...gm.values()].map((g) => { const x = g.sx / g.n, y = g.sy / g.n; return { ...g, x, y, px: m.left + (x - VB[0]) * m.s, py: (y - VB[1]) * m.s }; });
      items.sort((a, b) => a.py - b.py);
      let nl = 0, nr = 0;
      items.forEach((it) => {
        it.side = it.x < 147 ? 'l' : it.x > 153 ? 'r' : nl <= nr ? 'l' : 'r';
        it.side === 'l' ? nl++ : nr++;
        let v = opts.labelFor ? opts.labelFor(it.id) : null;
        if (v == null) { const sd = it.id ? { l: 'Left', r: 'Right' }[BT.site(it.id).side] || '' : ''; v = { title: shortOf(it.id), sub: (sd ? sd + ' \u00B7 ' : '') + BT.fmt.units(it.units), sub2: `${it.n} ${it.n === 1 ? 'point' : 'points'}` }; }
        if (typeof v === 'string') { const p = v.split('\n'); v = { title: p[0], sub: p.slice(1).join(' ') }; }
        const div = document.createElement('div');
        div.className = 'fm-lab ' + it.side + (opts.onTapMuscle ? ' tap' : '');
        div.style.width = gw + 'px'; div.style[it.side === 'l' ? 'left' : 'right'] = '0';
        div.dataset.id = it.id;
        div.innerHTML = `<div class="t">${esc(v.title)}</div>${v.sub ? `<div class="s">${esc(v.sub)}</div>` : ''}${v.sub2 ? `<div class="s d">${esc(v.sub2)}</div>` : ''}`;
        labs.appendChild(div); it.el = div;
      });
      let bottom = m.H;
      ['l', 'r'].forEach((side) => {
        let prev = -1e9;
        items.filter((i) => i.side === side).forEach((it) => {
          const h = it.el.offsetHeight || 40, top = Math.max(0, it.py - 12, prev + 6);
          it.el.style.top = top + 'px'; it.top = top; prev = top + h; bottom = Math.max(bottom, prev);
        });
      });
      lead.setAttribute('width', m.W); lead.setAttribute('height', bottom);
      lead.innerHTML = items.map((it) => {
        const ex = it.side === 'l' ? gw + 3 : m.W - gw - 3, ey = it.top + 10;
        const dx = ex - it.px, dy = ey - it.py, len = Math.hypot(dx, dy) || 1, o = 5;
        return `<line x1="${r1(it.px + (dx / len) * o)}" y1="${r1(it.py + (dy / len) * o)}" x2="${ex}" y2="${r1(ey)}"/><circle cx="${ex}" cy="${r1(ey)}" r="1.6"/>`;
      }).join('');
      root.style.height = Math.ceil(bottom + 2) + 'px';
    }

    function caption() {
      if (!cap) return;
      const sp = selPt();
      const info = hov || (sp ? { muscle: sp.caution ? null : keyOf(sp), caution: sp.caution || null, pt: sp } : null);
      if (!info) { cap.innerHTML = isEdit() ? '<b>Tap the face to add a point</b><span>Drag a point to move it. Tap a point to select or remove it.</span>' : '&nbsp;'; return; }
      const ptLine = info.pt ? `<span>Selected point \u00B7 ${esc(BT.fmt.units(info.pt.units))}</span>` : '';
      if (info.caution) { const z = zoneInfo(info.caution); cap.innerHTML = `<b>${esc(z.label)} (caution zone)</b>${ptLine}<span class="warn">${esc(z.note)}</span>`; return; }
      if (!info.muscle) { cap.innerHTML = `<b>General</b>${ptLine}<span>Outside the mapped muscles.</span>`; return; }
      const s = BT.site(info.muscle);
      cap.innerHTML = `<b>${esc(s.label)}</b>${ptLine}<span>${esc(s.treats)} \u00B7 ${esc(s.muscle)}</span><span class="tiny">Common range ${s.range[0]} to ${s.range[1]}U${s.side === 'c' ? '' : ' per side'} (reference only)</span>${s.caution ? `<span class="tiny warn">${esc(s.caution)}</span>` : ''}`;
    }

    function selectPt(id, notify) {
      selId = id || null; hov = null;
      render();
      if (notify && opts.onSelect) opts.onSelect(selId);
    }
    function addPoint(p) {
      const info = hitInfo(p.x, p.y);
      const siteId = info.caution ? '' : info.muscle;
      const du = opts.defaultUnits ? opts.defaultUnits(siteId) : Math.max(1, Math.round(BT.site(siteId).range[0] / 2));
      const np = { id: BT.uid(), siteId, x: r1(p.x), y: r1(p.y), units: +du || 1 };
      if (info.caution) { np.caution = info.caution; const z = zoneInfo(info.caution); BT.toast(`Caution: ${z.label}. ${z.note}`); }
      pts = [...pts, np];
      selId = np.id; hov = null;
      render(); emit();
      opts.onSelect && opts.onSelect(selId);
    }
    function settle(id) {
      const p = pts.find((q) => q.id === id); if (!p) return;
      const info = hitInfo(p.x, p.y);
      const siteId = info.caution ? '' : info.muscle;
      pts = pts.map((q) => { if (q.id !== id) return q; const n = { ...q, siteId }; if (info.caution) n.caution = info.caution; else delete n.caution; return n; });
      if (info.caution) { const z = zoneInfo(info.caution); BT.toast(`Caution: ${z.label}. ${z.note}`); }
      selId = id; hov = null;
      render(); emit();
      opts.onSelect && opts.onSelect(selId);
    }
    function removeSel() {
      if (!selId) return;
      pts = pts.filter((p) => p.id !== selId); selId = null; hov = null;
      render(); emit();
      opts.onSelect && opts.onSelect(null);
    }

    /* zoom */
    let zbar = null;
    const zbarBelow = opts.mode === 'display';
    // Visible face span at the current zoom: zk times the 1x scale, across the zoomed box (zbox).
    function span() {
      if (!zoomed()) return { w: VB[2], h: VB[3] };
      const m = metrics(), z = zbox(m), u = m.s * zk;
      return { w: z.w / u, h: z.h / u };
    }
    function applyView() {
      if (!zoomable()) { zk = 1; }
      const { w, h } = span();
      zx = w >= VB[2] ? VB[0] + VB[2] / 2 : Math.max(VB[0] + w / 2, Math.min(VB[0] + VB[2] - w / 2, zx));
      zy = h >= VB[3] ? VB[1] + VB[3] / 2 : Math.max(VB[1] + h / 2, Math.min(VB[1] + VB[3] - h / 2, zy));
      svg.setAttribute('viewBox', zk > 1.001 ? `${r1(zx - w / 2)} ${r1(zy - h / 2)} ${r1(w)} ${r1(h)}` : VB.join(' '));
      root.classList.toggle('fm-zoomed', zk > 1.001);
      root.classList.toggle('fm-zoomable', zoomable());
      // A display map's bar sits under the drawing at 1x and floats over the zoomed box, so it never reserves a band.
      if (zbar && zbarBelow) { const fl = zk > 1.001; if (fl && zbar.parentNode !== stage) stage.appendChild(zbar); else if (!fl && zbar.parentNode === stage) root.after(zbar); }
      if (zbar) { zbar.hidden = !zoomable(); zbar.querySelector('[data-z=lvl]').textContent = (Math.round(zk * 10) / 10) + 'x'; zbar.querySelector('[data-z=out]').disabled = zk <= 1.001; zbar.querySelector('[data-z=in]').disabled = zk >= ZMAX - 0.001; }
    }
    // Zoom to k keeping face point (ax, ay) under client point (cx, cy), or the middle of the map when omitted.
    // The box changes size between 1x and zoomed, so the anchor is measured after sizing it.
    function zoomAt(k, ax, ay, cx, cy) {
      zk = Math.max(1, Math.min(ZMAX, k));
      sizeStage();
      const r = svg.getBoundingClientRect();
      const fx = cx == null ? 0.5 : (cx - r.left) / (r.width || 1), fy = cy == null ? 0.5 : (cy - r.top) / (r.height || 1);
      const { w, h } = span();
      zx = ax - fx * w + w / 2; zy = ay - fy * h + h / 2;
      applyView(); render();
    }
    const raw = (cx, cy) => { const m = svg.getScreenCTM(); return m ? new DOMPoint(cx, cy).matrixTransform(m.inverse()) : null; };
    function zoomStep(f) { zoomAt(zk * f, zx, zy); }
    if (opts.zoom !== false && !opts.overlay) {
      zbar = document.createElement('div'); zbar.className = 'fm-zbar'; zbar.hidden = true;
      zbar.innerHTML = '<button type="button" data-z="out" aria-label="Zoom out">&minus;</button><button type="button" data-z="lvl" aria-label="Reset zoom">1x</button><button type="button" data-z="in" aria-label="Zoom in">+</button>';
      zbar.onclick = (e) => { const b = e.target.closest('[data-z]'); if (!b) return; const z = b.dataset.z; if (z === 'in') zoomStep(1.6); else if (z === 'out') zoomStep(1 / 1.6); else { zk = 1; applyView(); render(); } };
      // Display maps keep the bar under the drawing so it never covers points or labels.
      if (opts.mode === 'display') { zbar.classList.add('below'); root.after(zbar); } else stage.appendChild(zbar);
    }
    const onWheel = (e) => {
      if (!zoomable() || !e.ctrlKey) return; // trackpad pinch arrives as ctrl+wheel
      e.preventDefault();
      const a = raw(e.clientX, e.clientY); if (!a) return;
      zoomAt(zk * Math.exp(-e.deltaY * 0.01), a.x, a.y, e.clientX, e.clientY);
    };

    /* pointer handling */
    const onDown = (e) => {
      if (e.button > 0) return;
      if (zoomable() && e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { svg.setPointerCapture(e.pointerId); } catch (x) {}
        if (touches.size === 2) {
          // Second finger: this is a pinch. Undo any point drag the first finger started.
          if (drag && drag.id && drag.moved && drag.orig) { const p = pts.find((q) => q.id === drag.id); if (p) Object.assign(p, drag.orig); render(); }
          drag = null; pinched = true;
          const [a, b] = [...touches.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, an = raw(mx, my);
          pz = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: zk, ax: an ? an.x : zx, ay: an ? an.y : zy };
          return;
        }
        if (touches.size > 2) return;
      }
      if (pinched) return;
      const rm = e.target.closest('.fm-rm'), pe = e.target.closest('.fm-pt');
      drag = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, id: isEdit() && pe ? pe.dataset.id : null, rm: isEdit() && !!rm, moved: false, orig: null };
      if (drag.id) {
        const p = pts.find((q) => q.id === drag.id); drag.orig = p ? { x: p.x, y: p.y } : null;
        try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      }
    };
    const onMove = (e) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pz && touches.size >= 2) {
        const [a, b] = [...touches.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        zoomAt(pz.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / pz.d0), pz.ax, pz.ay, mx, my);
        return;
      }
      if (drag && drag.pid === e.pointerId && !drag.id && zk > 1.001) {
        // One finger on empty space while zoomed pans the view.
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; drag.zx = zx; drag.zy = zy; }
        if (drag.moved) {
          const r = svg.getBoundingClientRect(), u = span().h / (r.height || 1);
          zx = drag.zx - (e.clientX - drag.sx) * u; zy = drag.zy - (e.clientY - drag.sy) * u;
          applyView();
        }
        return;
      }
      if (drag && drag.pid === e.pointerId) {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
        if (drag.moved && drag.id) {
          const l = toLocal(e.clientX, e.clientY); if (!l) return;
          const p = pts.find((q) => q.id === drag.id); if (!p) return;
          p.x = r1(l.x); p.y = r1(l.y);
          const g = dyn.querySelector(`.fm-pt[data-id="${CSS.escape(p.id)}"]`);
          if (g) { g.setAttribute('transform', `translate(${p.x} ${p.y})`); g.classList.add('drag'); }
          const rmg = dyn.querySelector('.fm-rm'); if (rmg) rmg.remove();
          const h = hitInfo(p.x, p.y);
          if (!hov || hov.muscle !== h.muscle || hov.caution !== h.caution) { hov = h; paintStates(); caption(); }
        }
        return;
      }
      if (e.pointerType === 'mouse' && !e.buttons) {
        const l = toLocal(e.clientX, e.clientY); if (!l) return;
        const h = inFace(l.x, l.y) ? hitInfo(l.x, l.y) : null;
        const same = (!h && !hov) || (h && hov && h.muscle === hov.muscle && h.caution === hov.caution);
        if (!same) { hov = h && (h.muscle || h.caution || isEdit()) ? h : null; paintStates(); caption(); }
      }
    };
    const onUp = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pz = null;
      if (pinched) { if (!touches.size) pinched = false; drag = null; return; } // a pinch never drops a point
      const d = drag; drag = null;
      if (!d || d.pid !== e.pointerId) return;
      if (d.moved && !d.id) return; // the page scrolled or panned
      const l = toLocal(e.clientX, e.clientY);
      if (isEdit()) {
        if (d.rm) return removeSel();
        if (d.id) return d.moved ? settle(d.id) : selectPt(d.id, true);
        if (l && inFace(l.x, l.y)) addPoint(l); else if (selId) selectPt(null, true);
        return;
      }
      if (!l || !opts.onTapMuscle) return;
      const h = hitInfo(l.x, l.y);
      if (h.muscle) { hov = h; paintStates(); caption(); opts.onTapMuscle(h.muscle); }
    };
    const onCancel = (e) => {
      touches.delete(e.pointerId); if (touches.size < 2) pz = null; if (!touches.size) pinched = false;
      if (drag && drag.pid === e.pointerId && drag.id && drag.moved && drag.orig) {
        const p = pts.find((q) => q.id === drag.id); if (p) Object.assign(p, drag.orig);
        drag = null; render(); return;
      }
      drag = null;
    };
    const onLeave = () => { if (!drag && hov) { hov = null; paintStates(); caption(); } };
    const onKey = (e) => {
      const g = e.target.closest && e.target.closest('.fm-pt'); if (!g || !isEdit()) return;
      const id = g.dataset.id, p = pts.find((q) => q.id === id); if (!p) return;
      const mv = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPt(id, true); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); selId = id; removeSel(); }
      else if (mv) { e.preventDefault(); p.x = r1(p.x + mv[0]); p.y = r1(p.y + mv[1]); settle(id); const n = dyn.querySelector(`.fm-pt[data-id="${CSS.escape(id)}"]`); if (n) n.focus(); }
    };
    const onLabel = (e) => { const t = e.target.closest('.fm-lab'); if (t && opts.onTapMuscle && t.dataset.id) opts.onTapMuscle(t.dataset.id); };
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancel);
    svg.addEventListener('pointerleave', onLeave);
    svg.addEventListener('keydown', onKey);
    labs.addEventListener('click', onLabel);

    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (Math.abs(root.clientWidth - lastW) > 1) { applyView(); render(); } }); ro.observe(el); }
    applyView();
    render();

    return {
      setPoints(points) { pts = norm(points); if (selId && !pts.some((p) => p.id === selId)) selId = null; render(); },
      getPoints() { return pts.map((p) => ({ ...p })); },
      select(id) { selId = id && pts.some((p) => p.id === id) ? id : null; hov = null; render(); },
      setMode(mode) { opts.mode = mode; selId = mode === 'edit' ? selId : null; hov = null; zk = 1; applyView(); render(); },
      resetZoom() { zk = 1; applyView(); render(); },
      setHeat(h) { heat = h || null; render(); },
      setMarkerScale(k) { const n = +k || 1; if (Math.abs(n - mscale) > 0.02) { mscale = n; render(); } },
      // older callers
      setSelected(map) { pts = norm(fromMap(map)); render(); },
      destroy() {
        ro && ro.disconnect();
        svg.removeEventListener('pointerdown', onDown); svg.removeEventListener('wheel', onWheel); svg.removeEventListener('pointermove', onMove); svg.removeEventListener('pointerup', onUp);
        svg.removeEventListener('pointercancel', onCancel); svg.removeEventListener('pointerleave', onLeave); svg.removeEventListener('keydown', onKey);
        labs.removeEventListener('click', onLabel);
        el.innerHTML = '';
      },
    };
  }

  const paths = {}; ORDER.forEach((id) => (paths[id] = MUS[id].d));
  // Flattened outlines for drawing the map somewhere other than this SVG (livecam.js warps them onto a camera feed).
  const LIPS = 'M150 227 C153 223 157 221 161 222 C168 223 175 228 182 234 C175 245 163 250 150 250 C137 250 125 245 118 234 C125 228 132 223 139 222 C143 221 147 223 150 227 Z';
  const BROW = 'M158 140 C168 128 194 118 219 133 C214 131 207 128 199 127 C184 126 170 132 162 143 Z';
  const polys = {
    muscles: ORDER.map((id) => ({ id, poly: MUS[id].poly })),
    caution: CZ.map((z) => ({ id: z.zid, poly: z.poly })),
    features: [EYE, mirrorD(EYE), BROW, mirrorD(BROW), LIPS].map(flatten),
  };
  BT.faceMap = { mount, hitTest, hitInfo, inFace, place, centroid, paths, polys, viewBox: VB.slice(), cautionPaths: CZ.map((z) => ({ id: z.zid, d: z.d })) };

  /* ---------- screen ---------- */
  const state = { view: 'map', live: { file: null, url: null, x: 0, y: 0, s: 1, rot: 0, op: 0.85, mode: 'align', points: [], sel: null, cam: false } };
  let mounts = [];
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

  function muscleHistory(id) {
    const rows = [];
    BT.sortedInjections().forEach((inj) => {
      const hit = (inj.sites || []).filter((s) => keyOf(s) === id);
      if (hit.length) rows.push({ inj, n: hit.length, units: hit.reduce((a, s) => a + (+s.units || 0), 0) });
    });
    return rows;
  }

  function openMuscle(id) {
    const s = BT.site(id), rows = muscleHistory(id);
    const total = rows.reduce((a, r) => a + r.units, 0);
    const sh = BT.sheet({ title: labelOf(id) });
    const ref = id ? `
      <div class="card">
        <div class="eyebrow">${BT.esc(s.muscle)}</div>
        <div class="li-title" style="margin-top:6px">${BT.esc(s.treats)}</div>
        <div class="row between gap" style="margin-top:12px;align-items:flex-end">
          <div><div class="muted small">Common range${s.side === 'c' ? '' : ' per side'}</div><div class="big-num num" style="margin-top:4px">${s.range[0]} to ${s.range[1]}<small>U</small></div></div>
          <div style="text-align:right"><div class="muted small">Typical points</div><div class="li-title" style="margin-top:4px">${BT.esc(s.points || '')}</div></div>
        </div>
        <div class="row gap-s" style="margin-top:10px"><span class="pill">reference only</span><span class="pill">${BT.esc(s.group || '')}</span></div>
        ${s.caution ? `<div class="callout" style="margin-top:12px;background:var(--amber-soft);border-color:transparent;color:var(--amber)">${BT.esc(s.caution)}</div>` : ''}
      </div>` : `<div class="card"><div class="muted small">Points placed outside the mapped muscles.</div></div>`;
    sh.body.innerHTML = ref + `
      <div class="card">
        <div class="card-h"><h3>History</h3>${rows.length ? `<span class="pill blue num">${plural(rows.length, 'injection', 'injections')} \u00B7 ${num(total)}U</span>` : ''}</div>
        ${rows.length ? `<div class="list">${rows.map((r) => {
          const p = BT.product(r.inj.productId);
          return `<button class="li fm-row-btn" data-inj="${BT.esc(r.inj.id)}"><span class="dot" style="background:${p.color}"></span><div class="grow"><div class="li-title num">${BT.esc(BT.fmt.units(r.units))} \u00B7 ${plural(r.n, 'point', 'points')}</div><div class="li-sub">${BT.esc(BT.fmt.dateLong(r.inj.at))} \u00B7 ${BT.esc(p.name)}${r.inj.provider ? ' \u00B7 ' + BT.esc(r.inj.provider) : ''}</div></div>${BT.icon('chevron', 18, 'faint')}</button>`;
        }).join('')}</div>` : '<div class="empty" style="padding:20px 8px">No injections here yet.</div>'}
      </div>`;
    sh.body.querySelectorAll('[data-inj]').forEach((b) => (b.onclick = () => { sh.close(); if (BT.screens.injection) BT.go('injection', b.dataset.inj); }));
  }

  /* ----- map view ----- */
  function mapBody(body, last) {
    const pts = last ? place(last.sites || []) : [];
    const p = last ? BT.product(last.productId) : null;
    body.innerHTML = `<div data-map></div>
      <div class="row between gap" style="margin-top:8px"><span class="muted small">Tap a muscle to see its history</span>${last ? `<span class="pill green">${BT.esc(p.name)} \u00B7 ${BT.esc(BT.fmt.date(last.at))}</span>` : ''}</div>
      ${last ? '' : '<div class="callout" style="margin-top:12px">Log an injection and its points will show up here.</div>'}`;
    mounts.push(mount(body.querySelector('[data-map]'), {
      mode: 'display', points: pts, labels: true, onTapMuscle: openMuscle, maxWidth: 300,
    }));
  }

  function musclesCard(last) {
    if (!last) return null;
    const groups = BT.byMuscle(last).sort((a, b) => ORDER.indexOf(a.muscle.id) - ORDER.indexOf(b.muscle.id));
    const total = groups.reduce((a, g) => a + g.units, 0);
    const card = BT.h(`<section class="card"><div class="card-h"><h3>Muscles</h3><span class="pill blue num">${num(total)}U \u00B7 ${plural((last.sites || []).length, 'point', 'points')}</span></div>
      <div class="list">${groups.map((g) => `<button class="li fm-row-btn" data-id="${BT.esc(g.muscle.id || '')}"><span class="fm-sw"></span><div class="grow"><div class="li-title">${BT.esc(labelOf(g.muscle.id))}</div><div class="li-sub">${BT.esc(g.muscle.muscle || 'Outside the mapped muscles')}${g.muscle.treats ? ' \u00B7 ' + BT.esc(g.muscle.treats) : ''}</div></div><div style="text-align:right"><div class="li-title num">${BT.esc(BT.fmt.units(g.units))}</div><div class="li-sub num">${plural(g.points.length, 'point', 'points')}</div></div></button>`).join('')}</div></section>`);
    card.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openMuscle(b.dataset.id)));
    return card;
  }

  /* ----- frequency ----- */
  function freqCard() {
    const count = {}, units = {};
    BT.data.injections.forEach((inj) => {
      const seen = {};
      (inj.sites || []).forEach((s) => { const k = keyOf(s); units[k] = (units[k] || 0) + (+s.units || 0); seen[k] = 1; });
      Object.keys(seen).forEach((k) => (count[k] = (count[k] || 0) + 1));
    });
    const top = Object.keys(count).sort((a, b) => count[b] - count[a] || units[b] - units[a]).slice(0, 5);
    const max = top.length ? count[top[0]] : 1;
    const card = BT.h(`<section class="card"><div class="card-h"><h3>Frequency</h3><span class="pill">All time</span></div><div data-freq></div>
      ${top.length ? `<div class="list" style="margin-top:8px">${top.map((id) => `<button class="li fm-row-btn" data-id="${BT.esc(id)}"><div class="grow"><div class="li-title">${BT.esc(labelOf(id))}</div><div class="li-sub num">${plural(count[id], 'injection', 'injections')} \u00B7 ${BT.esc(BT.fmt.units(units[id]))} total</div><div class="fm-bar"><i style="width:${Math.round((count[id] / max) * 100)}%"></i></div></div><span class="pill blue num">${count[id]}x</span></button>`).join('')}</div>`
        : '<div class="empty" style="padding:16px 8px">Your most-treated muscles will show up here.</div>'}</section>`);
    card.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => openMuscle(b.dataset.id)));
    return { card, mount: () => mounts.push(mount(card.querySelector('[data-freq]'), { mode: 'display', heat: count, onTapMuscle: openMuscle, maxWidth: 240 })) };
  }

  /* ----- live view -----
     Three states: the camera (hosted app, BT.liveCam from livecam.js), the start screen, and a photo
     lined up by hand (the claude.ai artifact, or when the camera is refused). Both mapped views share
     the points list and save buttons in pointsPanel. */
  function liveBody(body) {
    const L = state.live;
    if (L.cam && BT.liveCam) return camBody(body);
    if (!L.url) {
      const cam = !!(BT.liveCam && BT.liveCam.supported());
      body.innerHTML = `<div class="fm-drop">${BT.icon('camera', 34)}<div><div class="li-title">Map on your own face</div><div class="muted small" style="margin-top:4px">${cam
        ? 'Point your front camera at your face and the muscle map follows you as you move. Tap where each injection went.'
        : 'Take a selfie or pick a photo, line the muscle outline up with your face, then tap where each injection went.'}</div></div>
        ${cam ? `<button class="btn primary" data-live>${BT.icon('face', 18)} Start live camera</button>` : ''}
        <div class="row gap wrap" style="justify-content:center"><button class="btn${cam ? '' : ' primary'}" data-cam>${BT.icon('camera', 18)} Take selfie</button><button class="btn" data-lib>${BT.icon('image', 18)} Choose photo</button></div></div>
        <p class="tiny muted" style="margin:10px 2px 0">${cam ? 'The camera only runs while this screen is open, and the video stays on your phone.' : 'Your phone camera opens to take the photo.'} Nothing is saved until you choose to.</p>`;
      const pick = async (cap) => {
        const f = await BT.photo.pick(cap ? { capture: 'user' } : {});
        if (!f) return;
        if (L.url) URL.revokeObjectURL(L.url);
        Object.assign(L, { file: f, url: URL.createObjectURL(f), x: 0, y: 0, s: 1, rot: 0, mode: 'align' });
        BT.render();
      };
      if (cam) {
        BT.liveCam.preload();
        body.querySelector('[data-live]').onclick = () => { L.cam = true; BT.render(); };
      }
      body.querySelector('[data-cam]').onclick = () => pick(true);
      body.querySelector('[data-lib]').onclick = () => pick(false);
      return;
    }

    body.innerHTML = `
      <div class="fm-live" data-mode="${L.mode}"><img alt="Your photo" src="${BT.esc(L.url)}"><div class="fm-ov"><div class="fm-ovw"></div></div></div>
      <div class="stack" style="margin-top:12px">
        <div data-seg></div>
        <div class="muted small fm-livecap" data-help></div>
        <div class="fm-ctl" data-ctl>
          <div class="fm-sl" data-sl="size"><span>Size</span><input type="range" min="30" max="250" step="1" aria-label="Outline size"><output></output></div>
          <div class="fm-sl" data-sl="rot"><span>Rotate</span><input type="range" min="-60" max="60" step="1" aria-label="Outline rotation"><output></output></div>
          <div class="fm-sl" data-sl="op"><span>Opacity</span><input type="range" min="25" max="100" step="1" aria-label="Outline opacity"><output></output></div>
        </div>
        <div class="row gap"><button class="btn sm ghost" data-retake>${BT.icon('camera', 16)} Retake</button><button class="btn sm ghost" data-reset>Reset outline</button></div>
        <div data-list></div>
        <div class="stack-s"><button class="btn primary" data-log>${BT.icon('syringe', 18)} Save as injection</button><button class="btn" data-before>${BT.icon('image', 18)} Save photo as Before</button></div>
      </div>`;
    const lv = body.querySelector('.fm-live'), ovw = body.querySelector('.fm-ovw');
    const help = body.querySelector('[data-help]');
    const sl = (k) => body.querySelector(`[data-sl="${k}"]`);
    let panel = null;
    const fm = mount(ovw, {
      mode: L.mode === 'points' ? 'edit' : 'display', points: L.points, overlay: true, maxWidth: 9999, selectedId: L.sel,
      caption: L.mode === 'points', captionEl: help, toggle: false,
      onChange(points) { L.points = points; panel && panel.drawList(); },
      onSelect(id) { L.sel = id; panel && panel.markSel(); },
    });
    mounts.push(fm);
    panel = pointsPanel(body, fm, async () => L.file, 'Switch to Add points and tap your photo where each injection went.');

    function applyXf() {
      ovw.style.transform = `translate(-50%,-50%) translate(${L.x}px,${L.y}px) rotate(${L.rot}deg) scale(${L.s})`;
      ovw.style.opacity = L.op;
      fm.setMarkerScale(L.s);
      const set = (k, v, txt) => { const s = sl(k); s.querySelector('input').value = v; s.querySelector('output').textContent = txt; };
      set('size', Math.round(L.s * 100), Math.round(L.s * 100) + '%');
      set('rot', Math.round(L.rot), Math.round(L.rot) + '°');
      set('op', Math.round(L.op * 100), Math.round(L.op * 100) + '%');
    }
    const modeUi = () => {
      lv.dataset.mode = L.mode;
      body.querySelector('[data-ctl]').style.display = L.mode === 'align' ? '' : 'none';
      fm.setMode(L.mode === 'points' ? 'edit' : 'display');
      if (L.mode === 'align') help.textContent = 'Drag to move, pinch or use the sliders to fit the outline to your face.';
    };
    body.querySelector('[data-seg]').appendChild(BT.seg([['align', 'Align'], ['points', 'Add points']], L.mode, (v) => { L.mode = v; modeUi(); })).classList.add('full');

    sl('size').querySelector('input').oninput = (e) => { L.s = e.target.value / 100; applyXf(); };
    sl('rot').querySelector('input').oninput = (e) => { L.rot = +e.target.value; applyXf(); };
    sl('op').querySelector('input').oninput = (e) => { L.op = e.target.value / 100; applyXf(); };
    body.querySelector('[data-reset]').onclick = () => { Object.assign(L, { x: 0, y: 0, s: 1, rot: 0, op: 0.85 }); applyXf(); };
    body.querySelector('[data-retake]').onclick = async () => {
      const f = await BT.photo.pick({ capture: 'user' });
      if (!f) return;
      if (L.url) URL.revokeObjectURL(L.url);
      Object.assign(L, { file: f, url: URL.createObjectURL(f) });
      BT.render();
    };

    /* drag, pinch and twist in align mode */
    const touches = new Map();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    lv.addEventListener('pointerdown', (e) => {
      if (L.mode !== 'align') return;
      try { lv.setPointerCapture(e.pointerId); } catch (x) {}
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    lv.addEventListener('pointermove', (e) => {
      if (L.mode !== 'align' || !touches.has(e.pointerId)) return;
      const prev = touches.get(e.pointerId), cur = { x: e.clientX, y: e.clientY };
      if (touches.size === 1) { L.x += cur.x - prev.x; L.y += cur.y - prev.y; }
      else if (touches.size === 2) {
        const other = [...touches.entries()].find(([id]) => id !== e.pointerId)[1];
        const od = Math.hypot(prev.x - other.x, prev.y - other.y) || 1, nd = Math.hypot(cur.x - other.x, cur.y - other.y);
        const oa = Math.atan2(prev.y - other.y, prev.x - other.x), na = Math.atan2(cur.y - other.y, cur.x - other.x);
        L.s = clamp((L.s * nd) / od, 0.3, 2.5);
        let da = ((na - oa) * 180) / Math.PI; if (da > 180) da -= 360; if (da < -180) da += 360;
        L.rot = clamp(L.rot + da, -60, 60);
      }
      touches.set(e.pointerId, cur);
      applyXf();
    });
    const up = (e) => touches.delete(e.pointerId);
    lv.addEventListener('pointerup', up); lv.addEventListener('pointercancel', up);
    lv.addEventListener('wheel', (e) => { if (L.mode !== 'align') return; e.preventDefault(); L.s = clamp(L.s * Math.exp(-e.deltaY * 0.0015), 0.3, 2.5); applyXf(); }, { passive: false });

    applyXf(); modeUi(); panel.drawList();
  }

  /* camera view: the map tracks the face, a tap drops a point */
  function camBody(body) {
    const L = state.live;
    body.innerHTML = `
      <div class="fm-live fm-cam"><div class="fm-camst" data-st>Starting the camera</div></div>
      <div class="stack" style="margin-top:12px">
        <div class="muted small fm-livecap fm-cap" data-help></div>
        <div class="fm-ctl"><div class="fm-sl" data-sl="op"><span>Opacity</span><input type="range" min="25" max="100" step="1" aria-label="Map opacity"><output></output></div></div>
        <div class="row gap wrap"><button class="btn sm ghost" data-freeze aria-pressed="false">Freeze</button><button class="btn sm ghost" data-photo>${BT.icon('image', 16)} Use a photo instead</button></div>
        <div data-list></div>
        <div class="stack-s"><button class="btn primary" data-log>${BT.icon('syringe', 18)} Save as injection</button><button class="btn" data-before>${BT.icon('image', 18)} Save photo as Before</button></div>
      </div>`;
    const lv = body.querySelector('.fm-cam'), st = body.querySelector('[data-st]'), help = body.querySelector('[data-help]');
    const op = body.querySelector('[data-sl="op"]'), frz = body.querySelector('[data-freeze]');
    const MSG = { loading: 'Starting the camera', searching: 'Looking for your face', frozen: 'Frozen. Tap to add points.', tracking: '' };
    let panel = null, frozen = false;

    const showHelp = () => {
      const p = L.points.find((q) => q.id === L.sel);
      if (!p) { help.innerHTML = '<b>Tap your face where each injection went</b><span>Points stay pinned to your face as you move. Freeze holds the picture still.</span>'; return; }
      const k = keyOf(p), s = BT.site(k);
      help.innerHTML = p.caution ? `<b>${BT.esc(zoneInfo(p.caution).label)} (caution zone)</b><span class="warn">${BT.esc(zoneInfo(p.caution).note)}</span>`
        : `<b>${BT.esc(labelOf(k))}</b><span>${k ? `${BT.esc(s.treats)} · common ${s.range[0]} to ${s.range[1]}U` : 'Outside the mapped muscles'}</span>`;
    };
    const cam = BT.liveCam.mount(lv, {
      points: L.points, selectedId: L.sel, opacity: L.op,
      onChange(points) { L.points = points; panel && panel.drawList(); },
      onSelect(id) { L.sel = id; panel && panel.markSel(); showHelp(); },
      onStatus(s) { st.textContent = MSG[s] || ''; st.hidden = !MSG[s]; lv.dataset.status = s; },
      onError(err) {
        L.cam = false;
        BT.toast(err.denied ? 'Camera access is off, so use a photo instead. You can turn it on in your browser settings.' : 'Live tracking could not start, so use a photo instead.');
        BT.render();
      },
    });
    mounts.push(cam);
    panel = pointsPanel(body, { setPoints: cam.setPoints, select: (id) => { cam.select(id); showHelp(); } }, () => cam.snapshot(), 'Tap your face on the camera where each injection went.');

    const setOp = () => { op.querySelector('input').value = Math.round(L.op * 100); op.querySelector('output').textContent = Math.round(L.op * 100) + '%'; cam.setOpacity(L.op); };
    op.querySelector('input').oninput = (e) => { L.op = e.target.value / 100; setOp(); };
    frz.onclick = () => { frozen = !frozen; cam.setFrozen(frozen); frz.textContent = frozen ? 'Resume' : 'Freeze'; frz.setAttribute('aria-pressed', String(frozen)); };
    body.querySelector('[data-photo]').onclick = () => { L.cam = false; BT.render(); };
    setOp(); showHelp(); panel.drawList();
  }

  /* placed points with unit steppers, plus the save buttons; shared by the photo and camera views.
     fm needs setPoints(points) and select(id). getFile resolves the photo to attach. */
  function pointsPanel(body, fm, getFile, emptyHint) {
    const L = state.live, list = body.querySelector('[data-list]');
    function markSel() { list.querySelectorAll('[data-pt]').forEach((r) => r.classList.toggle('sel', r.dataset.pt === L.sel)); }
    function drawList() {
      const sorted = L.points.slice().sort((a, b) => (ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b))) || a.y - b.y);
      const total = sorted.reduce((a, p) => a + (+p.units || 0), 0);
      syncBtns();
      if (!sorted.length) { list.innerHTML = `<div class="empty" style="padding:16px 8px">No points yet. ${BT.esc(emptyHint)}</div>`; return; }
      const seen = {};
      list.innerHTML = `<div class="card-h" style="margin-bottom:0"><h3>Points</h3><span class="pill blue num" data-total>${num(total)}U · ${plural(sorted.length, 'point', 'points')}</span></div>
        <div class="list">${sorted.map((p) => {
          const k = keyOf(p), s = BT.site(k); seen[k] = (seen[k] || 0) + 1;
          return `<div class="li fm-pli" data-pt="${BT.esc(p.id)}"><button class="grow fm-row-btn" data-pick><div class="li-title">${BT.esc(labelOf(k))} <span class="muted small">#${seen[k]}</span></div><div class="li-sub">${k ? `common ${s.range[0]} to ${s.range[1]}U` : (p.caution ? BT.esc(zoneInfo(p.caution).label) + ' caution zone' : 'Outside the mapped muscles')}</div></button>
          <div class="stepper fm-step"><button data-d="-1" aria-label="Fewer units">−</button><input inputmode="decimal" value="${num(p.units)}" aria-label="Units"><button data-d="1" aria-label="More units">+</button></div>
          <button class="icon-btn" data-rm aria-label="Remove point">${BT.icon('close', 18)}</button></div>`;
        }).join('')}</div>`;
      list.querySelectorAll('[data-pt]').forEach((row) => {
        const id = row.dataset.pt, inp = row.querySelector('input');
        const setU = (v) => { if (!(v > 0)) return; L.points = L.points.map((p) => (p.id === id ? { ...p, units: Math.min(200, num(v)) } : p)); fm.setPoints(L.points); inp.value = num(v); refreshTotal(); };
        row.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { const p = L.points.find((q) => q.id === id); setU(Math.max(0.5, (+p.units || 0) + +b.dataset.d)); }));
        inp.onchange = () => { const v = parseFloat(String(inp.value).replace(',', '.')); const p = L.points.find((q) => q.id === id); v > 0 ? setU(v) : (inp.value = num(p.units)); };
        row.querySelector('[data-rm]').onclick = () => { L.points = L.points.filter((p) => p.id !== id); if (L.sel === id) L.sel = null; fm.setPoints(L.points); fm.select(L.sel); drawList(); };
        row.querySelector('[data-pick]').onclick = () => { L.sel = id; fm.select(id); markSel(); };
      });
      markSel();
    }
    function refreshTotal() {
      const t = L.points.reduce((a, p) => a + (+p.units || 0), 0), pill = list.querySelector('[data-total]');
      if (pill) pill.textContent = `${num(t)}U · ${plural(L.points.length, 'point', 'points')}`;
    }
    function syncBtns() { body.querySelector('[data-log]').disabled = !L.points.length; }

    body.querySelector('[data-log]').onclick = async () => {
      if (!L.points.length) return;
      const points = L.points.map((p) => ({ id: p.id, siteId: p.siteId || '', x: p.x, y: p.y, units: +p.units || 0 }));
      let photoFile = null;
      try { photoFile = await getFile(); } catch (err) { console.warn('no photo for the log', err); }
      if (BT.openLog) BT.openLog({ points, photoFile });
      else BT.toast('Logging is not available yet');
    };
    body.querySelector('[data-before]').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const file = await getFile();
        if (!file) throw new Error('no photo yet');
        const src = await BT.photo.store(file);
        BT.save('photos', { kind: 'before', at: Date.now(), src, injectionId: null, note: 'Face map' });
        BT.toast('Saved as a Before photo');
      } catch (err) { console.warn(err); BT.toast('Could not save that photo'); }
      btn.disabled = false;
    };
    return { drawList, markSel };
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
        const last = BT.lastInjection();
        mapBody(body, last);
        const mc = musclesCard(last); if (mc) root.appendChild(mc);
        const f = freqCard();
        root.appendChild(f.card);
        f.mount();
      }
      root.appendChild(BT.h('<p class="disclaimer">Muscle placement is approximate and for tracking only. Follow your injector\'s plan.</p>'));
    },
  });
})();
