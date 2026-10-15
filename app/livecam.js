/* Live camera face mapping: the front camera plus MediaPipe Face Landmarker, with the muscle map from
   facemap.js warped onto the face every frame. Loaded by the hosted build (tools/build.mjs) and
   app/preview.html, never by the claude.ai artifact, which has no camera. facemap.js falls back to the
   photo flow when BT.liveCam is missing, the camera is denied, or the tracker fails to load.

   BT.liveCam.supported() -> bool
   BT.liveCam.mount(el, opts) -> { setPoints(points), select(id), setOpacity(k), setFrozen(bool), snapshot() -> Promise<File|null>, destroy() }
     opts.points, opts.selectedId  same shape as BT.faceMap.mount: [{id, siteId, x, y, units, caution?}] in the 300x400 face space
     opts.opacity                  overlay opacity, 0..1
     opts.onChange(points)         after a tap adds a point
     opts.onSelect(id|null)        after a tap selects a point
     opts.onStatus(status)         'loading' | 'searching' | 'tracking' | 'frozen'
     opts.onError(err)             camera denied or the tracker failed; err.denied is true for a permission refusal

   How the map follows the face: ANCHORS pairs Face Landmarker landmark indices with the same feature in
   the 300x400 drawing. Those points plus a ring of outer points (placed by a least-squares similarity
   fit, so the forehead edge and neck move with the head) are triangulated once in drawing space. Every
   muscle vertex and injection point keeps its triangle and barycentric weights, so a frame only moves the
   triangle corners. A tap runs the same map backwards to get drawing coordinates.

   Frozen zoom (#27): once frozen, pinch, ctrl+wheel and the - / 1x / + bar zoom 1x to 4x, and one finger
   pans while zoomed. The video sits in a wrapper that gets one CSS transform (translate, then scale from
   the top left). The overlay canvas is not scaled by CSS: draw() and the tap mapping run every point
   through the same zoom, so lines stay sharp, dots and labels keep their screen size, and a tap maps
   back through the zoom to the face point under the finger. Unfreezing or destroy resets to 1x. */
(function () {
  const BT = window.BT;
  if (!BT) return;

  // Pinned: tasks-vision 1.0.1 (2026-07-31) and the float16 v1 face landmarker model.
  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  /* ---------- landmark anchors ----------
     [patient-left index, patient-right index, x, y]: x is the patient's left (viewer's right, x > 150) and
     mirrors to 300 - x for the right. Face Landmarker's "left" landmarks are the subject's left, which is
     image right in the unmirrored camera frame, matching the drawing. Eyes, brows, nose and lips pin to
     the same feature in the drawing. The top of the tracked face outline (landmark 10) sits about 70% of
     the way from the brows to the hairline, so the forehead row is placed there rather than at the
     drawing's hairline (y 64); jaw points sit on the drawing's head outline at their measured heights. */
  const SIDE = [
    [263, 33, 203, 148], [362, 133, 166, 151], [386, 159, 185, 142], [374, 145, 185, 156], // eye corners and lids
    [336, 107, 166, 134], [296, 66, 183, 128], [334, 105, 198, 126], [293, 63, 210, 128], [300, 70, 218, 132], // brow, inner to tail
    [327, 98, 173, 201], [291, 61, 182, 234], [267, 37, 158, 222], [314, 84, 166, 247], // nose wing, mouth corner, lips
    // face outline, forehead down to chin
    [338, 109, 172, 84], [297, 67, 191, 89], [332, 103, 208, 97], [284, 54, 220, 108], [251, 21, 227, 121], [389, 162, 231, 136],
    [356, 127, 232, 155], [454, 234, 231, 172], [323, 93, 229, 186], [361, 132, 225, 206], [288, 58, 219, 227], [397, 172, 212, 243],
    [365, 136, 203, 254], [379, 150, 195, 265], [378, 149, 185, 273], [400, 176, 172, 282], [377, 148, 160, 286],
  ];
  const MID = [[10, 150, 82], [151, 150, 105], [9, 150, 128], [168, 150, 145], [6, 150, 153], [1, 150, 200], [2, 150, 207], [0, 150, 225], [17, 150, 250], [18, 150, 260], [152, 150, 288]];
  const ANCHORS = MID.map(([i, x, y]) => ({ i, x, y }));
  SIDE.forEach(([l, r, x, y]) => { ANCHORS.push({ i: l, x, y }); ANCHORS.push({ i: r, x: 300 - x, y }); });
  const RING = [[-20, -10], [60, -20], [150, -24], [240, -20], [320, -10], [330, 80], [330, 170], [324, 260], [324, 340], [320, 414], [230, 420], [150, 420], [70, 420], [-20, 414], [-24, 340], [-24, 260], [-30, 170], [-30, 80]];
  const TPL = ANCHORS.map((a) => [a.x, a.y]).concat(RING); // mesh vertices in drawing space
  const NA = ANCHORS.length;
  const EYE_L = ANCHORS.findIndex((a) => a.i === 263), EYE_R = ANCHORS.findIndex((a) => a.i === 33);

  /* ---------- geometry ---------- */
  function delaunay(pts) {
    // Bowyer-Watson. Fine for the ~90 fixed points here; runs once.
    const n = pts.length, B = 1e4, P = pts.concat([[-B, -B], [3 * B, -B], [-B, 3 * B]]);
    const mk = (a, b, c) => {
      const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c];
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
      return { v: [a, b, c], x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
    };
    let tris = [mk(n, n + 1, n + 2)];
    for (let i = 0; i < n; i++) {
      const [px, py] = P[i], keep = [], edges = new Map();
      tris.forEach((t) => {
        if ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r2) {
          [[t.v[0], t.v[1]], [t.v[1], t.v[2]], [t.v[2], t.v[0]]].forEach(([a, b]) => { const k = a < b ? a + ',' + b : b + ',' + a; edges.set(k, edges.has(k) ? null : [a, b]); });
        } else keep.push(t);
      });
      edges.forEach((e) => e && keep.push(mk(e[0], e[1], i)));
      tris = keep;
    }
    return tris.filter((t) => t.v.every((k) => k < n)).map((t) => t.v);
  }
  const TRI = delaunay(TPL);

  function bary(px, py, A, B, C) {
    const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (!d) return null;
    const a = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / d;
    const b = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / d;
    return [a, b, 1 - a - b];
  }
  // The triangle of mesh `V` holding (x, y) and its weights, or the nearest one when strict is false.
  function locate(V, x, y, strict) {
    let best = null, bm = -Infinity;
    for (let t = 0; t < TRI.length; t++) {
      const [i, j, k] = TRI[t], w = bary(x, y, V[i], V[j], V[k]);
      if (!w) continue;
      const m = Math.min(w[0], w[1], w[2]);
      if (m >= -1e-6) return { t, w };
      if (m > bm) { bm = m; best = { t, w }; }
    }
    return strict ? null : best;
  }
  const at = (V, b) => { const [i, j, k] = TRI[b.t], w = b.w; return [w[0] * V[i][0] + w[1] * V[j][0] + w[2] * V[k][0], w[0] * V[i][1] + w[1] * V[j][1] + w[2] * V[k][1]]; };

  // Least-squares similarity (rotate, scale, move) taking the anchor template points onto the tracked ones.
  function similarity(src, dst) {
    let sx = 0, sy = 0, dx = 0, dy = 0; const n = src.length;
    for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
    sx /= n; sy /= n; dx /= n; dy /= n;
    let a = 0, b = 0, q = 0;
    for (let i = 0; i < n; i++) {
      const x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy;
      a += x * u + y * v; b += x * v - y * u; q += x * x + y * y;
    }
    const c = a / q, s = b / q;
    return ([x, y]) => [c * (x - sx) - s * (y - sy) + dx, s * (x - sx) + c * (y - sy) + dy];
  }

  // One Euro filter: steady when the head is still, quick when it moves.
  function euro(minCut = 1.2, beta = 0.015, dCut = 1) {
    let x = null, dx = 0, t0 = 0;
    const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
    return (v, t) => {
      if (x === null || t - t0 > 500) { x = v; dx = 0; t0 = t; return v; }
      const dt = Math.max(1e-3, (t - t0) / 1000); t0 = t;
      const d = (v - x) / dt, ad = alpha(dCut, dt);
      dx = ad * d + (1 - ad) * dx;
      const a = alpha(minCut + beta * Math.abs(dx), dt);
      x = a * v + (1 - a) * x;
      return x;
    };
  }

  /* ---------- shapes bound to the mesh (once) ---------- */
  let SHAPES = null;
  function shapes() {
    if (SHAPES) return SHAPES;
    const fm = BT.faceMap, bind = (poly) => poly.map(([x, y]) => locate(TPL, x, y, false));
    SHAPES = {
      muscles: fm.polys.muscles.map((m) => ({ id: m.id, b: bind(m.poly) })),
      caution: fm.polys.caution.map((z) => ({ id: z.id, b: bind(z.poly) })),
      features: fm.polys.features.map((p) => bind(p)),
    };
    return SHAPES;
  }

  /* ---------- tracker (loaded once per page) ---------- */
  let loading = null;
  function landmarker() {
    if (!loading) {
      // MediaPipe's wasm prints startup notes ("INFO: Created TensorFlow Lite XNNPACK delegate") through
      // console.error. Send those to console.debug so real errors stay meaningful.
      if (!console.error.btQuiet) {
        const err = console.error;
        console.error = function (...a) { if (typeof a[0] === 'string' && /^(INFO:|[IW]\d{4} )/.test(a[0])) return console.debug(...a); return err.apply(this, a); };
        console.error.btQuiet = true;
      }
      loading = (async () => {
        const { FaceLandmarker, FilesetResolver } = await import(CDN + '/vision_bundle.mjs');
        const files = await FilesetResolver.forVisionTasks(CDN + '/wasm');
        const make = (delegate) => FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numFaces: 1 });
        try { return await make('GPU'); } catch (e) { console.warn('Face tracking on the GPU is unavailable, using the CPU', e); return make('CPU'); }
      })();
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  // Zoom bar, same look as facemap.js .fm-zbar, kept here because the camera view can mount without a face map.
  function injectCSS() {
    if (document.getElementById('lc-css')) return;
    const st = document.createElement('style');
    st.id = 'lc-css';
    st.textContent = `
.lc-zw{position:absolute;inset:0;transform-origin:0 0;will-change:transform}
.lc-zbar{position:absolute;right:8px;bottom:8px;top:auto;display:flex;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden;z-index:2}
.lc-zbar[hidden]{display:none}
.lc-zbar button{min-width:40px;height:40px;font-size:20px;line-height:1;color:var(--accent);display:grid;place-items:center}
.lc-zbar button[data-z=lvl]{font-size:12px;min-width:44px;color:var(--muted);font-variant-numeric:tabular-nums;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.lc-zbar button:disabled{color:var(--faint);opacity:.6}
.fm-cam.lc-frozen canvas{touch-action:none}
.fm-cam.lc-zoomed canvas{cursor:grab}
`;
    document.head.appendChild(st);
  }

  const supported = () => !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.WebAssembly);

  function mount(el, opts) {
    opts = Object.assign({ points: [], selectedId: null, opacity: 0.85 }, opts || {});
    const S = shapes();
    const video = document.createElement('video');
    video.setAttribute('playsinline', ''); video.muted = true; video.autoplay = true;
    const canvas = document.createElement('canvas');
    injectCSS();
    const zw = document.createElement('div'); zw.className = 'lc-zw'; zw.appendChild(video);
    const zbar = document.createElement('div'); zbar.className = 'fm-zbar lc-zbar'; zbar.hidden = true;
    zbar.innerHTML = '<button type="button" data-z="out" aria-label="Zoom out">&minus;</button><button type="button" data-z="lvl" aria-label="Reset zoom">1x</button><button type="button" data-z="in" aria-label="Zoom in">+</button>';
    el.append(zw, canvas, zbar);
    const ctx = canvas.getContext('2d');
    canvas.style.opacity = opts.opacity;

    let pts = [], sel = opts.selectedId, stream = null, raf = 0, dead = false, frozen = false;
    let tracker = null, lastT = -1, mesh = null, seen = 0, status = '';
    const filt = ANCHORS.map(() => [euro(), euro()]);
    const css = getComputedStyle(el);
    const accent = css.getPropertyValue('--accent').trim() || '#1E3FCB';
    const muscleRGB = '209,125,107', cautionRGB = '246,194,91';

    const setStatus = (s) => { if (s !== status) { status = s; opts.onStatus && opts.onStatus(s); } };
    const bindPts = (list) => list.map((p) => ({ ...p, b: locate(TPL, +p.x, +p.y, false) }));
    pts = bindPts(opts.points || []);

    /* camera */
    async function start() {
      setStatus('loading');
      try {
        const [s, lm] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } } }),
          landmarker(),
        ]);
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s; tracker = lm;
        video.srcObject = s;
        await video.play().catch(() => {});
        setStatus(frozen ? 'frozen' : 'searching');
        loop();
      } catch (e) {
        if (dead) return;
        const err = e instanceof Error ? e : new Error(String(e));
        err.denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        console.warn('Live face map unavailable', e);
        stop();
        opts.onError && opts.onError(err);
      }
    }
    function stop() {
      cancelAnimationFrame(raf); raf = 0;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    /* frame loop */
    function loop() {
      raf = requestAnimationFrame(loop);
      if (!el.isConnected) return destroy(); // the screen was replaced without calling destroy
      if (!frozen && tracker && video.readyState >= 2 && video.currentTime !== lastT) {
        lastT = video.currentTime;
        const now = performance.now();
        let res = null;
        try { res = tracker.detectForVideo(video, now); } catch (e) { console.warn('face tracking frame failed', e); }
        const lm = res && res.faceLandmarks && res.faceLandmarks[0];
        if (lm) {
          const vw = video.videoWidth, vh = video.videoHeight;
          const A = ANCHORS.map((a, k) => [filt[k][0](lm[a.i].x * vw, now), filt[k][1](lm[a.i].y * vh, now)]);
          const sim = similarity(TPL.slice(0, NA), A);
          mesh = A.concat(RING.map(sim));
          seen = now;
          setStatus('tracking');
        } else if (now - seen > 400) { mesh = null; setStatus('searching'); }
      }
      draw();
    }

    // camera pixel -> on-screen CSS pixel (object-fit: cover, mirrored like a selfie view), then the frozen zoom
    function view() {
      const W = el.clientWidth, H = el.clientHeight, vw = video.videoWidth || 1, vh = video.videoHeight || 1;
      const s = Math.max(W / vw, H / vh), ox = (W - vw * s) / 2, oy = (H - vh * s) / 2, { k, x: zx, y: zy } = Z;
      return { W, H, s, ox, oy, to: ([x, y]) => [zx + k * (W - (ox + x * s)), zy + k * (oy + y * s)], from: (x, y) => [(W - (x - zx) / k - ox) / s, ((y - zy) / k - oy) / s] };
    }

    /* frozen zoom: screen = Z.k * unzoomed + (Z.x, Z.y), in CSS pixels of el */
    const ZMAX = 4, Z = { k: 1, x: 0, y: 0 };
    function applyZoom() {
      const W = el.clientWidth, H = el.clientHeight;
      Z.k = Math.max(1, Math.min(ZMAX, Z.k));
      Z.x = Math.min(0, Math.max(W - Z.k * W, Z.x)); Z.y = Math.min(0, Math.max(H - Z.k * H, Z.y));
      const on = Z.k > 1.001;
      if (!on) { Z.k = 1; Z.x = 0; Z.y = 0; }
      zw.style.transform = on ? `translate(${Z.x}px, ${Z.y}px) scale(${Z.k})` : '';
      el.classList.toggle('lc-zoomed', on);
      zbar.querySelector('[data-z=lvl]').textContent = Math.round(Z.k * 10) / 10 + 'x';
      zbar.querySelector('[data-z=out]').disabled = !on;
      zbar.querySelector('[data-z=in]').disabled = Z.k >= ZMAX - 0.001;
    }
    // Zoom to k keeping unzoomed point (ax, ay) under screen point (sx, sy), all relative to el.
    function zoomAt(k, ax, ay, sx, sy) {
      Z.k = Math.max(1, Math.min(ZMAX, k));
      Z.x = sx - Z.k * ax; Z.y = sy - Z.k * ay;
      applyZoom();
    }
    const unzoom = (sx, sy) => [(sx - Z.x) / Z.k, (sy - Z.y) / Z.k];
    function zoomStep(f) { const cx = el.clientWidth / 2, cy = el.clientHeight / 2, [ax, ay] = unzoom(cx, cy); zoomAt(Z.k * f, ax, ay, cx, cy); }
    function resetZoom() { Z.k = 1; applyZoom(); }
    zbar.onclick = (e) => {
      const b = e.target.closest('[data-z]'); if (!b || !frozen) return;
      const z = b.dataset.z;
      if (z === 'in') zoomStep(1.6); else if (z === 'out') zoomStep(1 / 1.6); else resetZoom();
    };

    function draw() {
      const v = view(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(v.W * dpr), ch = Math.round(v.H * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, v.W, v.H);
      if (!mesh) return;
      // line weights scale with the face on screen: 106 is the outer eye corner span in the drawing
      const eL = mesh[EYE_L], eR = mesh[EYE_R];
      const unit = Math.max(0.6, Math.min(2, (v.s * Math.hypot(eL[0] - eR[0], eL[1] - eR[1])) / 106));
      const path = (b) => { ctx.beginPath(); b.forEach((q, k) => { const [x, y] = v.to(at(mesh, q)); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
      const used = {}, sp = pts.find((p) => p.id === sel);
      pts.forEach((p) => (used[p.siteId ? BT.site(p.siteId).id : ''] = 1));
      const selM = sp && sp.siteId ? BT.site(sp.siteId).id : null;

      ctx.lineJoin = 'round';
      S.muscles.forEach((m) => {
        path(m.b);
        ctx.fillStyle = `rgba(${muscleRGB},${m.id === selM ? 0.5 : used[m.id] ? 0.36 : 0.2})`; ctx.fill();
        ctx.lineWidth = 2.2 * unit; ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.stroke();
        ctx.lineWidth = 1 * unit; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
      });
      ctx.setLineDash([4 * unit, 3 * unit]);
      S.caution.forEach((z) => { path(z.b); ctx.fillStyle = `rgba(${cautionRGB},.12)`; ctx.fill(); ctx.lineWidth = 1.1 * unit; ctx.strokeStyle = `rgba(${cautionRGB},.95)`; ctx.stroke(); });
      ctx.setLineDash([]);
      S.features.forEach((b) => { path(b); ctx.lineWidth = 1 * unit; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke(); });

      const order = pts.slice().sort((a, b) => (a.id === sel) - (b.id === sel));
      ctx.font = `600 ${Math.round(12 * Math.min(1.3, unit))}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      order.forEach((p) => {
        const [x, y] = v.to(at(mesh, p.b)), r = 5.5 * Math.min(1.4, unit), side = x >= v.W / 2 ? 1 : -1;
        if (p.id === sel) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = accent; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
        const label = String(Math.round((+p.units || 0) * 10) / 10);
        ctx.textAlign = side > 0 ? 'left' : 'right';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(label, x + side * (r + 4), y);
        ctx.fillStyle = '#fff'; ctx.fillText(label, x + side * (r + 4), y);
      });
    }

    /* taps: select a nearby point, or add one where the face is. While frozen, two fingers pinch-zoom and
       one finger pans once zoomed; a pinch or a pan never adds a point. */
    let down = null, pz = null, pinched = false;
    const touches = new Map();
    const local = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const onDown = (e) => {
      if (e.button > 0) return;
      if (frozen && e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          down = null; pinched = true;
          const r = el.getBoundingClientRect(), [a, b] = [...touches.values()];
          const [ax, ay] = unzoom((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
          pz = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: Z.k, ax, ay };
          return;
        }
        if (touches.size > 2) return;
      }
      if (pinched) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    };
    const onMove = (e) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pz && touches.size >= 2) {
        const r = el.getBoundingClientRect(), [a, b] = [...touches.values()];
        zoomAt(pz.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / pz.d0), pz.ax, pz.ay, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        return;
      }
      const d = down;
      if (!d || d.id !== e.pointerId || !frozen || Z.k <= 1.001) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.moved = true; d.zx = Z.x; d.zy = Z.y; }
      if (d.moved) { Z.x = d.zx + (e.clientX - d.x); Z.y = d.zy + (e.clientY - d.y); applyZoom(); }
    };
    const onWheel = (e) => {
      if (!frozen || !e.ctrlKey) return; // a trackpad pinch arrives as ctrl+wheel
      e.preventDefault();
      const [sx, sy] = local(e), [ax, ay] = unzoom(sx, sy);
      zoomAt(Z.k * Math.exp(-e.deltaY * 0.01), ax, ay, sx, sy);
    };
    const onUp = (e) => {
      touches.delete(e.pointerId);
      if (touches.size < 2) pz = null;
      if (pinched) { if (!touches.size) pinched = false; down = null; return; }
      const d = down; down = null;
      if (!d || d.id !== e.pointerId || d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
      if (!mesh) { BT.toast(status === 'loading' ? 'Face tracking is still loading' : 'Hold the phone so your whole face is in view'); return; }
      const r = el.getBoundingClientRect(), v = view(), tx = e.clientX - r.left, ty = e.clientY - r.top;
      let near = null, nd = 24;
      pts.forEach((p) => { const [x, y] = v.to(at(mesh, p.b)), dd = Math.hypot(x - tx, y - ty); if (dd < nd) { nd = dd; near = p; } });
      if (near) { sel = near.id; opts.onSelect && opts.onSelect(sel); return; }
      const [cx, cy] = v.from(tx, ty), loc = locate(mesh, cx, cy, true);
      if (!loc) return;
      const [x, y] = at(TPL, loc), fm = BT.faceMap;
      if (!fm.inFace(x, y)) { if (sel) { sel = null; opts.onSelect && opts.onSelect(null); } return; }
      const info = fm.hitInfo(x, y), siteId = info.caution ? '' : info.muscle;
      const np = { id: BT.uid(), siteId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, units: Math.max(1, Math.round(BT.site(siteId).range[0] / 2)) };
      if (info.caution) { np.caution = info.caution; const z = (BT.cautionZones || []).find((q) => q.id === info.caution); if (z) BT.toast(`Caution: ${z.label}. ${z.note}`); }
      pts = [...pts, { ...np, b: locate(TPL, np.x, np.y, false) }];
      sel = np.id;
      opts.onChange && opts.onChange(plain());
      opts.onSelect && opts.onSelect(sel);
    };
    const onCancel = (e) => { down = null; touches.delete(e.pointerId); if (touches.size < 2) pz = null; if (!touches.size) pinched = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const plain = () => pts.map(({ b, ...p }) => p);

    // Release the camera while the app is in the background.
    const onVis = () => { if (dead) return; if (document.hidden) stop(); else if (!stream) start(); };
    document.addEventListener('visibilitychange', onVis);

    function destroy() {
      if (dead) return;
      dead = true; stop();
      document.removeEventListener('visibilitychange', onVis);
      video.srcObject = null;
      resetZoom();
      zw.remove(); canvas.remove(); zbar.remove();
      el.classList.remove('lc-frozen', 'lc-zoomed');
    }

    start();
    return {
      setPoints(list) { pts = bindPts(list || []); if (sel && !pts.some((p) => p.id === sel)) sel = null; },
      select(id) { sel = id && pts.some((p) => p.id === id) ? id : null; },
      setOpacity(k) { canvas.style.opacity = k; },
      setFrozen(f) {
        frozen = !!f;
        touches.clear(); pz = null; pinched = false; down = null;
        resetZoom();
        zbar.hidden = !frozen;
        el.classList.toggle('lc-frozen', frozen);
        if (frozen) video.pause(); else { video.play().catch(() => {}); lastT = -1; }
        if (stream) setStatus(frozen ? 'frozen' : mesh ? 'tracking' : 'searching');
      },
      async snapshot() {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return null;
        const c = document.createElement('canvas'); c.width = vw; c.height = vh;
        const g = c.getContext('2d'); g.translate(vw, 0); g.scale(-1, 1); g.drawImage(video, 0, 0, vw, vh);
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
        return blob ? new File([blob], 'face-map.jpg', { type: 'image/jpeg' }) : null;
      },
      destroy,
    };
  }

  BT.liveCam = { supported, mount, preload: () => landmarker().catch(() => {}) };
})();
