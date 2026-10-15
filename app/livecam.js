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
     opts.onStatus(status)         'loading' (no camera picture yet) | 'searching' | 'tracking' | 'frozen'
     opts.onError(err)             camera denied or the tracker failed; err.denied is true for a permission refusal
   BT.liveCam.preload() -> Promise<FaceLandmarker|null>   starts loading the tracker (the Face Map screen calls it)
   BT.liveCam.stats                                       start-up timings (log) and per-frame costs, for ?lcdebug

   Start-up (#44): the camera and the tracker start in parallel, and the camera picture shows as soon as
   getUserMedia resolves, with a progress pill until tracking is ready. The tracker's wasm and model are
   fetched here (in parallel, with byte progress) and kept in Cache Storage, so a later visit reads them from
   the phone. The tracker runs on the CPU (see delegates()), with the GPU as the fallback. Every step is
   timed into BT.liveCam.stats.log and console.info; ?lcdebug shows live frame costs in the pill.

   How the map follows the face (#45): the full Face Landmarker mesh drives the warp. MediaPipe's canonical
   face model (468 vertices in landmark order, 898 tessellation triangles) is fitted to the 300x400 drawing
   once: a thin-plate spline through ANCHORS (landmark index -> the same feature in the drawing) places every
   canonical vertex in drawing space. Three rings of extra vertices outside the face outline cover the
   forehead, ears and neck; each frame they follow a least-squares 3D affine fit of the canonical model to
   the live landmarks. Every muscle outline vertex and injection point keeps its triangle and barycentric
   weights, so a frame only moves the triangle corners, and a tap runs the same map backwards. The muscle
   fills are a texture drawn through the mesh with WebGL on a canvas blended with multiply, so skin shading
   shows through; the outlines, caution lines and points are drawn on the 2D canvas above. Triangles facing
   away (their normal from the landmark x, y and z) are culled, the ones turning away fade, and the rings
   fade out toward the hairline, ears and neck. Landmarks pass through a One Euro filter.

   Frozen zoom (#27): once frozen, pinch, ctrl+wheel and the - / 1x / + bar zoom 1x to 4x, and one finger
   pans while zoomed. The video sits in a wrapper that gets one CSS transform (translate, then scale from
   the top left). The overlay canvas is not scaled by CSS: draw() and the tap mapping run every point
   through the same zoom, so lines stay sharp, dots and labels keep their screen size, and a tap maps
   back through the zoom to the face point under the finger. Unfreezing or destroy resets to 1x. */
(function () {
  const BT = window.BT;
  if (!BT) return;

  // Pinned: tasks-vision 1.0.1 (2026-07-31) and the float16 v1 face landmarker model. Sizes drive the progress bar.
  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const SIZE = { model: 3758596, 'vision_wasm_internal.wasm': 11756954, 'vision_wasm_nosimd_internal.wasm': 10960242 };
  const CACHE = 'bt-live-1.0.1-f16v1'; // Cache Storage bucket for the two pinned files; a new pin gets a new name
  const DEBUG = /[?&]lcdebug\b/.test(location.search);

  // Open the connections early; the bundle, wasm and model come from these two hosts.
  ['https://cdn.jsdelivr.net', 'https://storage.googleapis.com'].forEach((href) => {
    if (document.querySelector(`link[rel=preconnect][href="${href}"]`)) return;
    const l = document.createElement('link'); l.rel = 'preconnect'; l.href = href; l.crossOrigin = 'anonymous'; document.head.appendChild(l);
  });

  /* ---------- landmark anchors ----------
     [patient-left index, patient-right index, x, y]: x is the patient's left (viewer's right, x > 150) and
     mirrors to 300 - x for the right. Face Landmarker's "left" landmarks are the subject's left, which is
     image right in the unmirrored camera frame, matching the drawing. Eyes, brows, nose and lips pin to
     the same feature in the drawing. The top of the tracked face outline (landmark 10) sits about 70% of
     the way from the brows to the hairline, so the forehead row is placed there rather than at the
     drawing's hairline (y 64); jaw points sit on the drawing's head outline at their measured heights.
     These are the control points of the canonical-model-to-drawing fit below. */
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

  /* ---------- MediaPipe face mesh ----------
     From canonical_face_model.obj in google-ai-edge/mediapipe (mediapipe/modules/face_geometry/data,
     Apache 2.0): the canonical face model whose 468 vertices are in Face Landmarker landmark order, and its
     898 triangles, the face tessellation (FACEMESH_TESSELATION is these triangles' edges). Packed as base64
     digit pairs (0..4095): MESH_V is x, y, z per vertex in cm (y up, z toward the camera) as (c + 10.24) / 0.005;
     MESH_F is three 0-based vertex indices per triangle. The 10 iris landmarks (468 to 477) are not in the mesh. */
  const MESH_V =
    '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';
  const MESH_F =
    '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';
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function unpack(s) {
    const out = new Uint16Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = (B64.indexOf(s[2 * i]) << 6) | B64.indexOf(s[2 * i + 1]);
    return out;
  }
  const N = 468; // mesh landmarks
  // Rings outside the face outline: [distance from the face centre as a multiple of the outline's, fill alpha].
  // They push back in depth as they go out (RING_Z cm per unit), so the far side culls when the head turns.
  const RINGS = [[1.22, 0.7], [1.6, 0.3], [2.3, 0]], RING_Z = 5;
  const TEX = { w: 600, h: 800, sx: 2, sy: 2 }; // fill texture: the 300x400 drawing at 2x

  /* ---------- small linear algebra ---------- */
  // Solve A x = b for several right-hand sides (Gaussian elimination, partial pivoting). A is n*n, row-major.
  function solve(A, n, rhs) {
    const m = rhs.length;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
      if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } rhs.forEach((b) => { const t = b[c]; b[c] = b[p]; b[p] = t; }); }
      const d = A[c * n + c] || 1e-12;
      for (let r = c + 1; r < n; r++) {
        const f = A[r * n + c] / d;
        if (!f) continue;
        for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
        for (let j = 0; j < m; j++) rhs[j][r] -= f * rhs[j][c];
      }
    }
    return rhs.map((b) => {
      const x = new Float64Array(n);
      for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k]; x[r] = s / (A[r * n + r] || 1e-12); }
      return x;
    });
  }

  // Thin-plate spline through control points src -> dst (2D). lambda smooths it: at 1 (used below) the anchors
  // drift at most 2.5 drawing units and 2 of the 898 triangles fold slightly; at 5 none fold but anchors drift 5.
  function tps(src, dst, lambda) {
    const n = src.length, m = n + 3, A = new Float64Array(m * m), bx = new Float64Array(m), by = new Float64Array(m);
    const U = (r2) => (r2 > 1e-12 ? 0.5 * r2 * Math.log(r2) : 0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i * m + j] = i === j ? lambda : U((src[i][0] - src[j][0]) ** 2 + (src[i][1] - src[j][1]) ** 2);
      A[i * m + n] = A[n * m + i] = 1; A[i * m + n + 1] = A[(n + 1) * m + i] = src[i][0]; A[i * m + n + 2] = A[(n + 2) * m + i] = src[i][1];
      bx[i] = dst[i][0]; by[i] = dst[i][1];
    }
    const [wx, wy] = solve(A, m, [bx, by]);
    return (x, y) => {
      let u = wx[n] + wx[n + 1] * x + wx[n + 2] * y, v = wy[n] + wy[n + 1] * x + wy[n + 2] * y;
      for (let i = 0; i < n; i++) { const k = U((x - src[i][0]) ** 2 + (y - src[i][1]) ** 2); u += wx[i] * k; v += wy[i] * k; }
      return [u, v];
    };
  }

  /* ---------- the mesh, built once ----------
     Vertices 0..467 are the landmarks, then the rings. C: canonical position in camera orientation (x right,
     y down, z away from the camera, like the landmarks). D: drawing position. T: triangles, all wound the
     same way as a front-facing canonical triangle (FRONT is the sign of their 2D cross product). */
  let M = null;
  function faceMesh() {
    if (M) return M;
    const q = unpack(MESH_V), f = unpack(MESH_F);
    // face outline: the tessellation edges used by a single triangle, walked into a loop from landmark 10
    const once = new Map(), key = (a, b) => (a < b ? a * N + b : b * N + a);
    for (let k = 0; k < f.length; k += 3) for (let e = 0; e < 3; e++) { const kk = key(f[k + e], f[k + (e + 1) % 3]); once.set(kk, (once.get(kk) || 0) + 1); }
    const nb = new Map(), link = (a, b) => { if (!nb.has(a)) nb.set(a, []); nb.get(a).push(b); };
    once.forEach((c, kk) => { if (c === 1) { const a = Math.floor(kk / N), b = kk % N; link(a, b); link(b, a); } });
    const oval = [10];
    for (let prev = -1, cur = 10; ;) { const nx = nb.get(cur).find((x) => x !== prev); if (nx === 10 || oval.length > N) break; oval.push(nx); prev = cur; cur = nx; }
    const NO = oval.length, NV = N + NO * RINGS.length;

    const C = new Float32Array(NV * 3);
    for (let i = 0; i < N; i++) { C[3 * i] = q[3 * i] * 0.005 - 10.24; C[3 * i + 1] = -(q[3 * i + 1] * 0.005 - 10.24); C[3 * i + 2] = -(q[3 * i + 2] * 0.005 - 10.24); }
    let cx = 0, cy = 0;
    oval.forEach((i) => { cx += C[3 * i]; cy += C[3 * i + 1]; });
    cx /= NO; cy /= NO;
    const VA0 = new Float32Array(NV).fill(1);
    RINGS.forEach(([s, a], r) => oval.forEach((i, k) => {
      const v = N + r * NO + k;
      C[3 * v] = cx + (C[3 * i] - cx) * s; C[3 * v + 1] = cy + (C[3 * i + 1] - cy) * s; C[3 * v + 2] = C[3 * i + 2] + (s - 1) * RING_Z;
      VA0[v] = a;
    }));

    // triangles: the tessellation, then quads between the outline and each ring
    const cross = (i, j, k) => (C[3 * j] - C[3 * i]) * (C[3 * k + 1] - C[3 * i + 1]) - (C[3 * j + 1] - C[3 * i + 1]) * (C[3 * k] - C[3 * i]);
    let pos = 0;
    for (let k = 0; k < f.length; k += 3) pos += cross(f[k], f[k + 1], f[k + 2]) > 0 ? 1 : -1;
    const FRONT = pos > 0 ? 1 : -1, tri = Array.from(f);
    const ringV = (r, k) => (r < 0 ? oval[(k + NO) % NO] : N + r * NO + ((k + NO) % NO));
    for (let r = -1; r < RINGS.length - 1; r++) for (let k = 0; k < NO; k++) {
      const a = ringV(r, k), b = ringV(r, k + 1), c = ringV(r + 1, k + 1), d = ringV(r + 1, k);
      [[a, b, c], [a, c, d]].forEach(([i, j, l]) => (cross(i, j, l) * FRONT > 0 ? tri.push(i, j, l) : tri.push(i, l, j)));
    }
    const T = Uint16Array.from(tri), NT = T.length / 3;

    // canonical -> drawing: thin-plate spline through the anchors
    const fit = tps(ANCHORS.map((a) => [C[3 * a.i], C[3 * a.i + 1]]), ANCHORS.map((a) => [a.x, a.y]), 1);
    const D = new Float32Array(NV * 2);
    for (let v = 0; v < NV; v++) { const [x, y] = fit(C[3 * v], C[3 * v + 1]); D[2 * v] = x; D[2 * v + 1] = y; }
    const BOX = new Float32Array(NT * 4); // drawing-space bounds per triangle, for locate()
    for (let t = 0; t < NT; t++) {
      const i = T[3 * t], j = T[3 * t + 1], k = T[3 * t + 2];
      BOX[4 * t] = Math.min(D[2 * i], D[2 * j], D[2 * k]); BOX[4 * t + 1] = Math.max(D[2 * i], D[2 * j], D[2 * k]);
      BOX[4 * t + 2] = Math.min(D[2 * i + 1], D[2 * j + 1], D[2 * k + 1]); BOX[4 * t + 3] = Math.max(D[2 * i + 1], D[2 * j + 1], D[2 * k + 1]);
    }

    // The per-frame 3D affine fit (canonical -> live) solves a 4x4 normal system whose matrix depends only on
    // the canonical landmarks, so its inverse is computed here once.
    const G = new Float64Array(16);
    for (let i = 0; i < N; i++) { const h = [C[3 * i], C[3 * i + 1], C[3 * i + 2], 1]; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) G[r * 4 + c] += h[r] * h[c]; }
    const Ginv = new Float64Array(16), id = [0, 1, 2, 3].map((c) => { const e = new Float64Array(4); e[c] = 1; return e; });
    solve(G, 4, id).forEach((col, c) => { for (let r = 0; r < 4; r++) Ginv[r * 4 + c] = col[r]; });

    // folds: tessellation triangles whose drawing-space winding disagrees with the canonical one (should be ~0)
    let folds = 0;
    for (let t = 0; t < f.length / 3; t++) {
      const i = T[3 * t], j = T[3 * t + 1], k = T[3 * t + 2];
      const dc = (D[2 * j] - D[2 * i]) * (D[2 * k + 1] - D[2 * i + 1]) - (D[2 * j + 1] - D[2 * i + 1]) * (D[2 * k] - D[2 * i]);
      if (Math.sign(dc) !== Math.sign(cross(i, j, k))) folds++;
    }
    M = { NV, NT, NO, oval, C, D, T, VA0, BOX, Ginv, FRONT, folds };
    // how far the smoothed fit lets each anchor drift from its drawing position, in drawing units
    const drift = Math.max(...ANCHORS.map((a) => Math.hypot(D[2 * a.i] - a.x, D[2 * a.i + 1] - a.y)));
    stats.mesh = { vertices: NV, triangles: NT, folds, drift: Math.round(drift * 10) / 10 };
    return M;
  }

  const bary = (px, py, ax, ay, bx, by, cx, cy, out) => {
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (!d) return false;
    out[0] = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
    out[1] = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
    out[2] = 1 - out[0] - out[1];
    return true;
  };
  // The drawing-space triangle holding (x, y) and its weights, or the nearest one when strict is false.
  function locate(x, y, strict) {
    const { D, T, BOX, NT } = faceMesh(), w = [0, 0, 0];
    const tri = (t) => { const i = T[3 * t], j = T[3 * t + 1], k = T[3 * t + 2]; return bary(x, y, D[2 * i], D[2 * i + 1], D[2 * j], D[2 * j + 1], D[2 * k], D[2 * k + 1], w); };
    for (let t = 0; t < NT; t++) {
      if (x < BOX[4 * t] - 1e-6 || x > BOX[4 * t + 1] + 1e-6 || y < BOX[4 * t + 2] - 1e-6 || y > BOX[4 * t + 3] + 1e-6) continue;
      if (tri(t) && Math.min(w[0], w[1], w[2]) >= -1e-6) return { t, w: w.slice() };
    }
    if (strict) return null;
    let best = null, bm = -Infinity;
    for (let t = 0; t < NT; t++) { if (!tri(t)) continue; const m = Math.min(w[0], w[1], w[2]); if (m > bm) { bm = m; best = { t, w: w.slice() }; } }
    return best;
  }
  const atD = (b) => { const { D, T } = faceMesh(), i = T[3 * b.t], j = T[3 * b.t + 1], k = T[3 * b.t + 2], w = b.w; return [w[0] * D[2 * i] + w[1] * D[2 * j] + w[2] * D[2 * k], w[0] * D[2 * i + 1] + w[1] * D[2 * j + 1] + w[2] * D[2 * k + 1]]; };

  // One Euro filter over a whole Float32Array of channels: steady when the head is still, quick when it moves.
  function euroBank(n, minCut = 1.0, beta = 0.05, dCut = 1) {
    const x = new Float32Array(n), dx = new Float32Array(n);
    let t0 = -1;
    const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
    return {
      reset() { t0 = -1; },
      run(v, t) { // filters v in place
        if (t0 < 0 || t - t0 > 500) { x.set(v); dx.fill(0); t0 = t; return; }
        const dt = Math.max(1e-3, (t - t0) / 1000), ad = alpha(dCut, dt);
        t0 = t;
        for (let i = 0; i < n; i++) {
          const d = (v[i] - x[i]) / dt;
          dx[i] = ad * d + (1 - ad) * dx[i];
          x[i] += alpha(minCut + beta * Math.abs(dx[i]), dt) * (v[i] - x[i]);
          v[i] = x[i];
        }
      },
    };
  }

  /* ---------- shapes bound to the mesh (once) ----------
     Outlines are resampled every 3 drawing units so they bend with the mesh instead of cutting across it. */
  let SHAPES = null;
  function shapes() {
    if (SHAPES) return SHAPES;
    const fm = BT.faceMap;
    const bind = (poly) => {
      const pts = [];
      poly.forEach(([x, y], k) => {
        const [nx, ny] = poly[(k + 1) % poly.length], steps = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 3));
        for (let s = 0; s < steps; s++) pts.push([x + ((nx - x) * s) / steps, y + ((ny - y) * s) / steps]);
      });
      const n = pts.length, t = new Uint16Array(n), w = new Float32Array(n * 3);
      pts.forEach(([x, y], k) => { const b = locate(x, y, false); t[k] = b.t; w.set(b.w, 3 * k); });
      return { n, t, w };
    };
    SHAPES = {
      muscles: fm.polys.muscles.map((m) => ({ id: m.id, poly: m.poly, ...bind(m.poly) })),
      caution: fm.polys.caution.map((z) => ({ id: z.id, poly: z.poly, ...bind(z.poly) })),
      features: fm.polys.features.map((p) => bind(p)),
    };
    SHAPES.max = Math.max(...[...SHAPES.muscles, ...SHAPES.caution, ...SHAPES.features].map((s) => s.n));
    return SHAPES;
  }

  /* ---------- tracker (loaded once per page) ---------- */
  const stats = { log: [], delegate: '', drawMs: 0, detectMs: 0, fps: 0 };
  let T0 = 0;
  function mark(step, since) {
    const now = performance.now(), e = { step, ms: Math.round(now - since), at: Math.round(now - T0) };
    stats.log.push(e);
    console.info(`[live] ${step}: ${e.ms} ms (${e.at} ms after start)`);
    return now;
  }
  const prog = { phase: 'idle', got: 0, total: SIZE.model + SIZE['vision_wasm_internal.wasm'], cached: 0, subs: new Set() };
  const emit = () => prog.subs.forEach((f) => f());

  // Fetch a pinned file with byte progress, from Cache Storage when an earlier visit stored it.
  async function getBytes(url, size) {
    let cache = null, res = null, from = 'network';
    try { cache = await caches.open(CACHE); res = await cache.match(url); } catch (e) { cache = null; }
    if (res) { from = 'cache'; prog.cached++; }
    else {
      res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      if (cache) cache.put(url, res.clone()).catch((e) => console.warn('Could not cache', url, e));
    }
    const reader = res.body && res.body.getReader && res.body.getReader();
    if (!reader) { const b = new Uint8Array(await res.arrayBuffer()); prog.got += b.length; emit(); return { bytes: b, from }; }
    const parts = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); n += value.length; prog.got += value.length; emit();
    }
    if (size && n !== size) console.warn(`[live] ${url.split('/').pop()} is ${n} bytes, expected ${size}`);
    const bytes = new Uint8Array(n);
    let o = 0; parts.forEach((p) => { bytes.set(p, o); o += p.length; });
    return { bytes, from };
  }

  function delegates() {
    let pref = '';
    try { pref = localStorage.getItem('bt.liveDelegate') || ''; } catch (e) {}
    // CPU by default: on the GPU the first inference compiles shaders on the main thread (4.4 s in headless
    // Chromium, and the likely iPhone stall in #44), freezing the camera picture, while the CPU (XNNPACK)
    // starts in ~0.1 s and ran 15 ms a frame here. localStorage bt.liveDelegate = 'GPU' opts back in to try it.
    if (pref === 'GPU') return ['GPU', 'CPU'];
    return ['CPU', 'GPU'];
  }

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
        T0 = performance.now(); stats.log.length = 0;
        Object.assign(prog, { phase: 'download', got: 0, cached: 0 }); emit();
        const modelP = getBytes(MODEL, SIZE.model).then((r) => { mark(`model fetch (${r.from}, ${(r.bytes.length / 1048576).toFixed(1)} MB)`, T0); return r; });
        modelP.catch(() => {});
        const vision = await import(CDN + '/vision_bundle.mjs');
        let t = mark('import tasks-vision', T0);
        const files = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
        const name = files.wasmBinaryPath.split('/').pop();
        prog.total = SIZE.model + (SIZE[name] || SIZE['vision_wasm_internal.wasm']); emit();
        const wasmP = getBytes(files.wasmBinaryPath, SIZE[name]).then((r) => { mark(`wasm fetch (${name}, ${r.from}, ${(r.bytes.length / 1048576).toFixed(1)} MB)`, t); return r; });
        const [wasm, model] = await Promise.all([wasmP, modelP]);
        prog.phase = 'start'; emit();
        // The wasm loader fetches the binary through locateFile, so hand it the bytes already in memory.
        const url = URL.createObjectURL(new Blob([wasm.bytes], { type: 'application/wasm' }));
        const fileset = { wasmLoaderPath: files.wasmLoaderPath, wasmBinaryPath: url };
        let lm = null, last = null;
        try {
          for (const delegate of delegates()) {
            t = performance.now();
            try {
              lm = await vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: model.bytes, delegate }, runningMode: 'VIDEO', numFaces: 1 });
              stats.delegate = delegate;
              mark(`create on ${delegate}`, t);
              break;
            } catch (e) {
              last = e;
              mark(`create on ${delegate} failed`, t);
              console.warn(`Face tracking on the ${delegate} is unavailable`, e);
            }
          }
        } finally { URL.revokeObjectURL(url); }
        if (!lm) throw last || new Error('Face tracking could not start');
        // The first inference compiles kernels (and GPU shaders); do it now on a blank frame, not on the camera's first.
        t = performance.now();
        try { const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d').fillRect(0, 0, 64, 64); lm.detectForVideo(c, 1); } catch (e) {}
        mark('warm-up inference', t);
        mark('tracker ready', T0);
        prog.phase = 'ready'; emit();
        return lm;
      })();
      loading.catch(() => { loading = null; prog.phase = 'error'; emit(); });
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

  // The fill canvas and the progress pill; kept apart from injectCSS so the two style blocks change independently.
  function injectLiveCSS() {
    if (document.getElementById('lc-css-live')) return;
    const st = document.createElement('style');
    st.id = 'lc-css-live';
    st.textContent = `
.fm-cam canvas.lc-gl{pointer-events:none;mix-blend-mode:multiply}
.lc-prog{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:1;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);background:rgba(0,0,0,.55);color:#fff;font-size:12px;line-height:1.3;padding:6px 12px;border-radius:999px;white-space:nowrap;pointer-events:none;font-variant-numeric:tabular-nums}
.lc-prog[hidden]{display:none}
.lc-prog i{display:block;flex:none;width:56px;height:4px;border-radius:2px;background:rgba(255,255,255,.3);overflow:hidden}
.lc-prog i[hidden]{display:none}
.lc-prog b{display:block;height:100%;width:0;background:#fff;transition:width .2s}
`;
    document.head.appendChild(st);
  }

  const supported = () => !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.WebAssembly);

  const VS = 'attribute vec3 a_p;attribute vec2 a_uv;uniform vec4 u_xf;varying vec2 v_uv;varying float v_a;' +
    'void main(){v_uv=a_uv;v_a=a_p.z;gl_Position=vec4(u_xf.x*a_p.x+u_xf.y,u_xf.z*a_p.y+u_xf.w,0.,1.);}';
  const FS = 'precision mediump float;uniform sampler2D u_t;varying vec2 v_uv;varying float v_a;void main(){gl_FragColor=texture2D(u_t,v_uv)*v_a;}';
  const O0 = [0, 0], O1 = [1, 1];

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
    injectLiveCSS();
    // Muscle fills: a WebGL canvas under the 2D one, multiplied onto the video so skin shading shows through.
    const glc = document.createElement('canvas'); glc.className = 'lc-gl'; glc.style.opacity = opts.opacity;
    el.insertBefore(glc, canvas);
    const pill = document.createElement('div'); pill.className = 'lc-prog'; pill.hidden = true; pill.innerHTML = '<span></span><i><b></b></i>';
    el.appendChild(pill);
    const { NV, NT, T, C, D, VA0, Ginv, FRONT } = faceMesh();

    let pts = [], sel = opts.selectedId, stream = null, raf = 0, dead = false, frozen = false, failed = false;
    let tracker = null, lastT = -1, mesh = null, seen = 0, status = '';
    let firstRes = false, firstFace = false, frames = 0, fpsT = 0;
    const t0 = performance.now();
    // live state, allocated once: P holds every vertex in camera pixels (x, y, z), TF each triangle's facing
    // (cosine toward the camera, <= 0 when turned away), VA each vertex's alpha (ring fade times facing)
    const P = new Float32Array(NV * 3), raw = new Float32Array(N * 3), TF = new Float32Array(NT), VF = new Float32Array(NV), VA = new Float32Array(NV);
    const VC = new Float32Array(NV), A3 = new Float64Array(12), S3 = new Float64Array(12);
    for (let k = 0; k < T.length; k++) VC[T[k]]++;
    const filt = euroBank(N * 3);
    const SX = new Float32Array(S.max), SY = new Float32Array(S.max), SA = new Float32Array(S.max);
    const css = getComputedStyle(el);
    const accent = css.getPropertyValue('--accent').trim() || '#1E3FCB';
    const muscleRGB = '209,125,107', cautionRGB = '246,194,91', fillRGB = '205,92,78';

    const setStatus = (s) => { if (s !== status) { status = s; opts.onStatus && opts.onStatus(s); } };
    const bindPts = (list) => list.map((p) => ({ ...p, b: locate(+p.x, +p.y, false) }));
    pts = bindPts(opts.points || []);

    /* WebGL fills: positions and alpha change every frame, texture coordinates (drawing position) never do */
    let gl = null, glBuf = null, glData = null, uXf = null, tex = null, texKey = '', glShown = false;
    const texC = document.createElement('canvas'); texC.width = TEX.w; texC.height = TEX.h;
    const tctx = texC.getContext('2d');
    function initGL() {
      try { gl = glc.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true }); } catch (e) { gl = null; }
      if (!gl) { glc.remove(); return; }
      try {
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        gl.useProgram(pr);
        const uv = new Float32Array(NV * 2);
        for (let v = 0; v < NV; v++) { uv[2 * v] = (D[2 * v] * TEX.sx) / TEX.w; uv[2 * v + 1] = (D[2 * v + 1] * TEX.sy) / TEX.h; }
        const attr = (name, data, size, usage) => {
          const b = gl.createBuffer(), at = gl.getAttribLocation(pr, name);
          gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage);
          gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, size, gl.FLOAT, false, 0, 0);
          return b;
        };
        attr('a_uv', uv, 2, gl.STATIC_DRAW);
        glData = new Float32Array(NV * 3);
        glBuf = attr('a_p', glData, 3, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, T, gl.STATIC_DRAW);
        uXf = gl.getUniformLocation(pr, 'u_xf');
        tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      } catch (e) { console.warn('WebGL face map unavailable, drawing flat fills', e); gl = null; glc.remove(); }
    }
    glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; glc.remove(); });
    initGL();
    // The fill texture: the drawing's muscles and caution zones, redrawn only when the used or selected muscles change.
    function paintTex(used, selM) {
      const key = Object.keys(used).sort().join() + '|' + selM;
      if (key === texKey) return;
      texKey = key;
      tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, TEX.w, TEX.h); tctx.setTransform(TEX.sx, 0, 0, TEX.sy, 0, 0);
      const fill = (poly, style) => { tctx.beginPath(); poly.forEach(([x, y], k) => (k ? tctx.lineTo(x, y) : tctx.moveTo(x, y))); tctx.closePath(); tctx.fillStyle = style; tctx.fill(); };
      S.muscles.forEach((m) => fill(m.poly, `rgba(${fillRGB},${m.id === selM ? 0.8 : used[m.id] ? 0.6 : 0.42})`));
      S.caution.forEach((z) => fill(z.poly, `rgba(${cautionRGB},.3)`));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texC);
    }

    /* progress pill: tracker download and start-up while the camera already shows; with ?lcdebug, live costs */
    const pillTxt = pill.querySelector('span'), pillBar = pill.querySelector('i'), pillFill = pill.querySelector('b');
    function showPill() {
      if (dead) return;
      const loadingNow = !!stream && !tracker && prog.phase !== 'error';
      if (loadingNow) {
        const pct = prog.total ? Math.min(100, Math.round((prog.got / prog.total) * 100)) : 0;
        pillTxt.textContent = prog.phase === 'download' ? `Loading face tracking ${pct}%` : 'Starting face tracking';
        pillFill.style.width = (prog.phase === 'download' ? pct : 100) + '%';
        pillBar.hidden = false;
      } else if (DEBUG && tracker) {
        pillTxt.textContent = `${stats.delegate} · ${stats.fps} fps · detect ${stats.detectMs.toFixed(1)} ms · draw ${stats.drawMs.toFixed(1)} ms`;
        pillBar.hidden = true;
      }
      pill.hidden = !(loadingNow || (DEBUG && tracker));
    }
    prog.subs.add(showPill);

    /* camera and tracker start together; the picture shows as soon as the camera answers */
    function fail(e) {
      if (dead || failed) return;
      failed = true;
      const err = e instanceof Error ? e : new Error(String(e));
      err.denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      console.warn('Live face map unavailable', e);
      stop();
      opts.onError && opts.onError(err);
    }
    async function start() {
      setStatus('loading');
      const t = performance.now();
      landmarker().then((lm) => { if (dead) return; tracker = lm; showPill(); }, fail);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } } });
        if (dead || failed) { s.getTracks().forEach((tr) => tr.stop()); return; }
        mark('getUserMedia', t);
        stream = s;
        video.srcObject = s;
        await video.play().catch(() => {});
        mark('camera picture showing', t);
        setStatus(frozen ? 'frozen' : 'searching');
        showPill();
        loop();
      } catch (e) { fail(e); }
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
        const dt = performance.now() - now;
        stats.detectMs = stats.detectMs ? stats.detectMs * 0.9 + dt * 0.1 : dt;
        if (!firstRes) { firstRes = true; mark('first tracking result', t0); }
        frames++;
        if (now - fpsT >= 1000) { stats.fps = Math.round((frames * 1000) / (now - fpsT || 1)); frames = 0; fpsT = now; if (DEBUG) showPill(); }
        const lm = res && res.faceLandmarks && res.faceLandmarks[0];
        if (lm && lm.length >= N) {
          if (!firstFace) { firstFace = true; mark('first face found', t0); }
          pose(lm, now);
          mesh = P; seen = now;
          setStatus('tracking');
        } else if (now - seen > 400) { mesh = null; filt.reset(); setStatus('searching'); }
      }
      draw();
    }

    // Landmarks -> P (filtered), the rings through a 3D affine fit, then facing and alpha per triangle and vertex.
    function pose(lm, now) {
      const vw = video.videoWidth, vh = video.videoHeight;
      for (let i = 0; i < N; i++) { const p = lm[i]; raw[3 * i] = p.x * vw; raw[3 * i + 1] = p.y * vh; raw[3 * i + 2] = p.z * vw; }
      filt.run(raw, now);
      P.set(raw);
      // least-squares affine canonical -> live: A = (sum p h^T) Ginv, h = [canonical, 1]
      S3.fill(0);
      for (let i = 0; i < N; i++) {
        const hx = C[3 * i], hy = C[3 * i + 1], hz = C[3 * i + 2];
        for (let r = 0; r < 3; r++) { const v = P[3 * i + r]; S3[4 * r] += v * hx; S3[4 * r + 1] += v * hy; S3[4 * r + 2] += v * hz; S3[4 * r + 3] += v; }
      }
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) A3[4 * r + c] = S3[4 * r] * Ginv[c] + S3[4 * r + 1] * Ginv[4 + c] + S3[4 * r + 2] * Ginv[8 + c] + S3[4 * r + 3] * Ginv[12 + c];
      for (let v = N; v < NV; v++) {
        const hx = C[3 * v], hy = C[3 * v + 1], hz = C[3 * v + 2];
        for (let r = 0; r < 3; r++) P[3 * v + r] = A3[4 * r] * hx + A3[4 * r + 1] * hy + A3[4 * r + 2] * hz + A3[4 * r + 3];
      }
      // facing: the z of each triangle's unit normal, signed so front faces are positive
      VF.fill(0);
      for (let t = 0; t < NT; t++) {
        const i = 3 * T[3 * t], j = 3 * T[3 * t + 1], k = 3 * T[3 * t + 2];
        const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2], wx = P[k] - P[i], wy = P[k + 1] - P[i + 1], wz = P[k + 2] - P[i + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const fz = len ? (FRONT * nz) / len : 0;
        TF[t] = fz; VF[i / 3] += fz; VF[j / 3] += fz; VF[k / 3] += fz;
      }
      // fade from fully shown at a facing of 0.45 to hidden at 0.1, times the ring fade
      for (let v = 0; v < NV; v++) { const f = VF[v] / (VC[v] || 1), a = (f - 0.1) / 0.35; VA[v] = VA0[v] * (a < 0 ? 0 : a > 1 ? 1 : a); }
    }
    // A bound point in camera pixels, or null when its triangle faces away.
    const placeCam = (b) => {
      if (!mesh || TF[b.t] <= 0.05) return null;
      const i = 3 * T[3 * b.t], j = 3 * T[3 * b.t + 1], k = 3 * T[3 * b.t + 2], w = b.w;
      return [w[0] * P[i] + w[1] * P[j] + w[2] * P[k], w[0] * P[i + 1] + w[1] * P[j + 1] + w[2] * P[k + 1]];
    };
    // The front-facing live triangle under camera pixel (x, y), nearest the camera where the mesh overlaps itself.
    function locateLive(x, y) {
      const w = [0, 0, 0];
      let best = null, bz = Infinity;
      for (let t = 0; t < NT; t++) {
        if (TF[t] <= 0.05) continue;
        const i = 3 * T[3 * t], j = 3 * T[3 * t + 1], k = 3 * T[3 * t + 2];
        if (!bary(x, y, P[i], P[i + 1], P[j], P[j + 1], P[k], P[k + 1], w) || Math.min(w[0], w[1], w[2]) < -1e-6) continue;
        const z = w[0] * P[i + 2] + w[1] * P[j + 2] + w[2] * P[k + 2];
        if (z < bz) { bz = z; best = { t, w: w.slice() }; }
      }
      return best;
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

    // Project a bound outline into SX/SY (screen pixels) and SA (alpha; 0 where its triangle faces away).
    function project(sh, ax, bx, ay, by) {
      for (let q = 0; q < sh.n; q++) {
        const t = sh.t[q], i = T[3 * t], j = T[3 * t + 1], k = T[3 * t + 2], w0 = sh.w[3 * q], w1 = sh.w[3 * q + 1], w2 = sh.w[3 * q + 2];
        SX[q] = ax * (w0 * P[3 * i] + w1 * P[3 * j] + w2 * P[3 * k]) + bx;
        SY[q] = ay * (w0 * P[3 * i + 1] + w1 * P[3 * j + 1] + w2 * P[3 * k + 1]) + by;
        SA[q] = TF[t] > 0.02 ? w0 * VA[i] + w1 * VA[j] + w2 * VA[k] : 0;
      }
    }
    // Stroke a projected closed outline in runs of similar alpha, so it fades and breaks where the mesh does.
    const LEVEL = [0, 0.3, 0.65, 1];
    function strokeRuns(n, w1, s1, w2, s2) {
      let cur = -1;
      const flush = () => {
        if (cur <= 0) return;
        ctx.globalAlpha = LEVEL[cur];
        if (w1) { ctx.lineWidth = w1; ctx.strokeStyle = s1; ctx.stroke(); }
        ctx.lineWidth = w2; ctx.strokeStyle = s2; ctx.stroke();
      };
      for (let a = 0; a < n; a++) {
        const b = a + 1 === n ? 0 : a + 1, m = SA[a] < SA[b] ? SA[a] : SA[b], l = m > 0.8 ? 3 : m > 0.45 ? 2 : m > 0.12 ? 1 : 0;
        if (l !== cur) { flush(); cur = l; ctx.beginPath(); ctx.moveTo(SX[a], SY[a]); }
        ctx.lineTo(SX[b], SY[b]);
      }
      flush();
      ctx.globalAlpha = 1;
    }
    // Without WebGL: flat fills on the 2D canvas, skipped for an outline that is mostly turned away.
    function fillFlat(n, style) {
      let s = 0;
      for (let q = 0; q < n; q++) s += SA[q];
      if (s / n < 0.5) return;
      ctx.beginPath();
      for (let q = 0; q < n; q++) q ? ctx.lineTo(SX[q], SY[q]) : ctx.moveTo(SX[q], SY[q]);
      ctx.closePath(); ctx.fillStyle = style; ctx.fill();
    }

    function draw() {
      const tA = performance.now();
      const v = view(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(v.W * dpr), ch = Math.round(v.H * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      if (gl && (glc.width !== cw || glc.height !== ch)) { glc.width = cw; glc.height = ch; glShown = true; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, v.W, v.H);
      if (!mesh) {
        if (gl && glShown) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); glShown = false; }
        return;
      }
      // camera pixel -> screen is affine per axis (mirror, cover scale, frozen zoom): sx = ax x + bx, sy = ay y + by
      const o = v.to(O0), u = v.to(O1), ax = u[0] - o[0], bx = o[0], ay = u[1] - o[1], by = o[1];
      // line weights scale with the face on screen: 106 is the outer eye corner span in the drawing
      const unit = Math.max(0.6, Math.min(2, (v.s * Math.hypot(P[3 * 263] - P[3 * 33], P[3 * 263 + 1] - P[3 * 33 + 1])) / 106));
      const used = {}, sp = pts.find((p) => p.id === sel);
      pts.forEach((p) => (used[p.siteId ? BT.site(p.siteId).id : ''] = 1));
      const selM = sp && sp.siteId ? BT.site(sp.siteId).id : null;

      if (gl) {
        paintTex(used, selM);
        for (let k = 0, n = NV; k < n; k++) { glData[3 * k] = P[3 * k]; glData[3 * k + 1] = P[3 * k + 1]; glData[3 * k + 2] = VA[k]; }
        gl.viewport(0, 0, cw, ch);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, glBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, glData);
        gl.uniform4f(uXf, (ax * 2) / v.W, (bx * 2) / v.W - 1, (-ay * 2) / v.H, 1 - (by * 2) / v.H);
        // the mirror and the clip-space y flip each reverse the winding
        gl.frontFace(FRONT * Math.sign(ax) * -Math.sign(ay) > 0 ? gl.CCW : gl.CW);
        gl.drawElements(gl.TRIANGLES, T.length, gl.UNSIGNED_SHORT, 0);
        glShown = true;
      }

      ctx.lineJoin = 'round';
      S.muscles.forEach((m) => {
        project(m, ax, bx, ay, by);
        if (!gl) fillFlat(m.n, `rgba(${muscleRGB},${m.id === selM ? 0.5 : used[m.id] ? 0.36 : 0.2})`);
        strokeRuns(m.n, 2 * unit, 'rgba(0,0,0,.2)', 0.9 * unit, 'rgba(255,255,255,.78)');
      });
      ctx.setLineDash([4 * unit, 3 * unit]);
      S.caution.forEach((z) => {
        project(z, ax, bx, ay, by);
        if (!gl) fillFlat(z.n, `rgba(${cautionRGB},.12)`);
        strokeRuns(z.n, 0, '', 1.1 * unit, `rgba(${cautionRGB},.95)`);
      });
      ctx.setLineDash([]);
      S.features.forEach((b) => { project(b, ax, bx, ay, by); strokeRuns(b.n, 0, '', 1 * unit, 'rgba(255,255,255,.5)'); });

      const order = pts.slice().sort((a, b) => (a.id === sel) - (b.id === sel));
      ctx.font = `600 ${Math.round(12 * Math.min(1.3, unit))}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      order.forEach((p) => {
        const q = placeCam(p.b);
        if (!q) return; // on the far side of the face
        const x = ax * q[0] + bx, y = ay * q[1] + by, r = 5.5 * Math.min(1.4, unit), side = x >= v.W / 2 ? 1 : -1;
        if (p.id === sel) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = accent; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
        const label = String(Math.round((+p.units || 0) * 10) / 10);
        ctx.textAlign = side > 0 ? 'left' : 'right';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(label, x + side * (r + 4), y);
        ctx.fillStyle = '#fff'; ctx.fillText(label, x + side * (r + 4), y);
      });
      const dt = performance.now() - tA;
      stats.drawMs = stats.drawMs ? stats.drawMs * 0.9 + dt * 0.1 : dt;
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
      if (!mesh) { BT.toast(!tracker ? 'Face tracking is still loading' : 'Hold the phone so your whole face is in view'); return; }
      const r = el.getBoundingClientRect(), v = view(), tx = e.clientX - r.left, ty = e.clientY - r.top;
      let near = null, nd = 24;
      pts.forEach((p) => { const q = placeCam(p.b); if (!q) return; const [x, y] = v.to(q), dd = Math.hypot(x - tx, y - ty); if (dd < nd) { nd = dd; near = p; } });
      if (near) { sel = near.id; opts.onSelect && opts.onSelect(sel); return; }
      const [cx, cy] = v.from(tx, ty), loc = locateLive(cx, cy);
      if (!loc) return;
      const [x, y] = atD(loc), fm = BT.faceMap;
      if (!fm.inFace(x, y)) { if (sel) { sel = null; opts.onSelect && opts.onSelect(null); } return; }
      const info = fm.hitInfo(x, y), siteId = info.caution ? '' : info.muscle;
      const np = { id: BT.uid(), siteId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, units: Math.max(1, Math.round(BT.site(siteId).range[0] / 2)) };
      if (info.caution) { np.caution = info.caution; const z = (BT.cautionZones || []).find((q) => q.id === info.caution); if (z) BT.toast(`Caution: ${z.label}. ${z.note}`); }
      pts = [...pts, { ...np, b: loc }];
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
      glc.remove(); pill.remove(); prog.subs.delete(showPill);
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      gl = null;
      el.classList.remove('lc-frozen', 'lc-zoomed');
    }

    start();
    return {
      setPoints(list) { pts = bindPts(list || []); if (sel && !pts.some((p) => p.id === sel)) sel = null; },
      select(id) { sel = id && pts.some((p) => p.id === id) ? id : null; },
      setOpacity(k) { canvas.style.opacity = k; glc.style.opacity = k; },
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

  BT.liveCam = { supported, mount, preload: () => landmarker().catch(() => null), stats };
})();
