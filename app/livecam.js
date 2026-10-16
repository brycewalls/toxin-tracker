/* Live camera face mapping: the front camera plus MediaPipe Face Landmarker, with the muscles placed from the
   person's own face landmarks and shaded onto the face every frame. Loaded by the hosted build (tools/build.mjs)
   and app/preview.html, never by the claude.ai artifact, which has no camera. facemap.js falls back to the
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

   The face mesh (#45, #50): MediaPipe's canonical face model (468 vertices in landmark order, 898 tessellation
   triangles, in centimetres) plus three rings of extra vertices outside the face outline for the forehead, temples,
   jaw angle and neck. Each frame the landmarks (One Euro filtered) move the 468 vertices and the rings follow a
   least-squares 3D affine fit of the canonical model to them. Per-triangle facing and per-vertex normals come
   from the live mesh. A thin-plate spline fitted once maps the canonical model onto the 300x400 drawing, so a
   tapped point is saved in the same face coordinates as the 2D map, and saved points come back onto the face.

   Muscles in landmark space (#64): no part of the 2D illustration is drawn here. Each muscle region (MUSCLES) is a
   polygon whose corners are landmarks plus centimetre offsets on the canonical face, following the placement
   rules in research/2026-10-14_botox-injection-anatomy.md (frontalis from 1.5 cm above the brow to the hairline,
   crow's feet 1 to 2.5 cm lateral to the eye corner, DAO from the mouth corner to the jawline, masseter over the
   jaw angle, platysma below the jaw). Corners outside the mesh (hairline, temples, jaw angle, neck) land on the
   rings, so they are extrapolated from the person's face shape and scale (the canonical model is metric, with a
   6.3 cm interpupillary distance, and the per-frame fit scales it to their landmarks). Each region is filled with
   a fine grid, every grid vertex bound to a mesh triangle, so it moves with expressions. WebGL draws the grid:
   translucent fill, fiber-direction stripes, lighting from the mesh normals so it reads as molded to the brow,
   cheek and jaw, feathered edges, and fading to nothing where the surface turns away. There is no outline, eye,
   nose or lip line art. The 2D canvas above it carries only points, a muscle label for the selected point,
   caution zones (ZONES) as faint hatching that shows when a point is near one, and reference pattern markers.

   Reference patterns (#65): the picker under the camera view shows one area of BT.patterns (app/patterns.js) as
   ghost markers placed from the same landmark space, with their reference unit ranges and the area's safety zones.
   'Use these points' opens the log with them as unconfirmed points (confirmed: false).

   Frozen zoom (#27): once frozen, pinch, ctrl+wheel and the - / 1x / + bar zoom 1x to 4x, and one finger
   pans while zoomed. The video sits in a wrapper that gets one CSS transform (translate, then scale from
   the top left). The overlay canvases are not scaled by CSS: draw() and the tap mapping run every point
   through the same zoom, so the fills stay sharp, dots and labels keep their screen size, and a tap maps
   back through the zoom to the face point under the finger. Unfreezing or destroy resets to 1x.

   Content Security Policy: no inline script, eval or Function; styles go in through constructable stylesheets
   (a <style> element only where those are missing), and the wasm falls back to its same-origin URL when the
   policy blocks fetching a blob: URL. */
(function () {
  const BT = window.BT;
  if (!BT) return;

  // Pinned: tasks-vision 1.0.1 (2026-07-31) and the float16 v1 face landmarker model, served from our own host
  // (#55): tools/build.mjs copies them into dist/vendor/ from tools/vendor.lock.json after checking each SHA-256.
  // Nothing here loads from a CDN. Sizes drive the progress bar; SHA is checked again on a network fetch, before
  // the file is stored, and tools/build.mjs fails if these values drift from the lock.
  const VENDOR = new URL('vendor/mediapipe/', document.baseURI).href;
  const LIB = VENDOR + 'tasks-vision/1.0.1';
  const MODEL = VENDOR + 'models/face_landmarker/float16/1/face_landmarker.task';
  const SIZE = { model: 3758596, 'vision_wasm_internal.wasm': 11756954, 'vision_wasm_nosimd_internal.wasm': 10960242 };
  const SHA = {
    model: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
    'vision_wasm_internal.wasm': '8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886',
    'vision_wasm_nosimd_internal.wasm': 'a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192',
  };
  // Cache Storage bucket for the wasm binary and the model; a new pin or a new origin for them gets a new name,
  // and older bt-live-* buckets are dropped the first time the tracker loads.
  const CACHE = 'bt-live-1.0.1-f16v1-self';
  const DEBUG = /[?&]lcdebug\b/.test(location.search);

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

  /* ---------- muscles and caution zones in landmark space (#64) ----------
     A corner is [landmark, dx, dy] or [[landmarkA, landmarkB, t], dx, dy] (t of the way from A to B), with dx, dy
     in centimetres on the canonical face: x toward the patient's left (image right in the unmirrored frame), y down.
     side 'b' shapes are written for the patient's left (landmark x > 0) and mirrored for the right; side 'c'
     shapes give the half from the top of the midline round the patient's left to the bottom of it (half), and
     the other half is mirrored. Placement follows research/2026-10-14_botox-injection-anatomy.md.
     fib: lin (parallel fibers at angle a, degrees, y down), fan (rays from corner c), arc (rings round c, k
     squashes y). h and f override the grid step and the edge feather (cm) for thin muscles; hole (a half, like
     side 'c') leaves an opening. */
  const MUSCLES = [
    // Frontalis: from about 1.5 cm above the brow (the treated zone stays above that) to the hairline, which is
    // extrapolated about 5.5 cm above the brow through the forehead ring; a narrow midline gap between the halves.
    { id: 'frontalis', side: 'b', fib: { t: 'lin', a: 90 }, poly: [[336, -0.99, -1.5], [296, 0, -1.6], [334, 0, -1.6], [293, 0.2, -1.4], [284, -0.4, -0.8], [332, -0.1, -1.5], [297, 0, -2.4], [338, -1.49, -2.4]] },
    // Procerus: midline, nasal root up to between the brow heads.
    { id: 'procerus', side: 'c', fib: { t: 'lin', a: 90 }, half: [[9, 0, -0.5], [9, 0.55, -0.4], [168, 0.6, 0], [6, 0.5, 0.1], [6, 0, 0.1]] },
    // Corrugator: medial orbital rim, oblique up and out into the mid-brow skin, ending inside the midpupil line.
    { id: 'corrugator', side: 'b', fib: { t: 'lin', a: -17 }, poly: [[285, -0.5, 0.2], [295, 0, 0.1], [282, -0.3, 0], [334, -0.6, -0.3], [296, 0, -0.35], [336, -0.6, -0.1]] },
    // Brow tail: the superolateral orbicularis under the tail of the brow.
    { id: 'browtail', side: 'b', fib: { t: 'arc', c: [[263, 362, 0.5], 0, 0] }, poly: [[283, 0, 0.15], [276, 0.2, 0.25], [300, 0.55, 0.15], [300, 0.3, -0.4], [293, 0, -0.4], [334, 0.5, -0.15]] },
    // Lateral orbicularis oculi (crow's feet): a crescent from about 0.6 to 2.6 cm outside the eye corner.
    { id: 'oculi', side: 'b', fib: { t: 'arc', c: [[263, 362, 0.5], 0, 0] }, poly: [[263, 0.6, -1.4], [263, 1.6, -1.55], [263, 2.4, -0.8], [263, 2.6, 0.3], [263, 2.2, 1.4], [263, 1.4, 1.9], [263, 0.7, 1.3], [263, 1.0, 0]] },
    // Pretarsal orbicularis: a thin strip just under the lower lash line.
    { id: 'pretarsal', side: 'b', h: 0.08, f: 0.1, fib: { t: 'arc', c: [[263, 362, 0.5], 0, 0] }, poly: [[[362, 374, 0.4], 0, 0.15], [374, 0, 0.18], [[374, 263, 0.55], 0, 0.12], [[374, 263, 0.55], 0, 0.4], [374, 0, 0.48], [[362, 374, 0.4], 0, 0.4]] },
    // Temporalis: the temple behind the lateral orbital rim and above the arch, mostly on the rings.
    { id: 'temporalis', side: 'b', fib: { t: 'fan', c: [361, -0.5, -2.5] }, poly: [[368, 0.15, 0.3], [389, -0.1, 0.4], [389, -0.2, -0.6], [251, 0.1, -1.1], [284, 0.3, -1.2], [284, -0.2, -0.4], [301, 0.2, 0]] },
    // Nasalis (transverse part): across the nasal dorsum and upper sidewalls.
    { id: 'nasalis', side: 'c', fib: { t: 'arc', c: [2, 0, 0] }, half: [[6, 0, 0.5], [6, 0.75, 0.45], [456, 0.25, 0.15], [281, 0.3, 0.25], [5, 0, 0.1]] },
    // Depressor septi nasi: columella base into the upper lip.
    { id: 'dsn', side: 'c', h: 0.08, f: 0.1, fib: { t: 'lin', a: 90 }, half: [[2, 0, -0.25], [2, 0.3, -0.2], [0, 0.3, -0.35], [0, 0, -0.3]] },
    // LLSAN: beside the nose from the frontal process of the maxilla down to the ala and upper lip.
    { id: 'llsan', side: 'b', h: 0.12, f: 0.14, fib: { t: 'fan', c: [362, -0.1, -0.3] }, poly: [[362, -0.35, 0.7], [362, 0.15, 0.6], [358, 0.45, 0.1], [327, 0.9, 0.6], [327, 0.5, 0.9], [358, 0, -0.15], [362, -0.6, 1.3]] },
    // Orbicularis oris: round the mouth, the lips included, open at the mouth slit.
    { id: 'oris', side: 'c', fib: { t: 'arc', c: [13, 0, 0.3], k: 0.55 }, hole: [[13, 0, -0.05], [311, 0, -0.05], [308, -0.1, 0], [402, 0, 0.05], [14, 0, 0.05]], half: [[0, 0, -0.75], [269, 0.1, -0.6], [409, 0.5, -0.35], [291, 0.65, 0.05], [[291, 17, 0.4], 0.35, 0.45], [17, 0, 0.55]] },
    // DAO: a triangle from just outside the mouth corner down to the jawline.
    { id: 'dao', side: 'b', fib: { t: 'fan', c: [291, 0.3, 0.1] }, poly: [[291, 0.4, 0.4], [379, 0.35, -0.45], [378, 0.2, -0.3], [400, 0.2, -0.45], [291, 0.15, 0.75]] },
    // Mentalis: the chin, below the mental crease.
    { id: 'mentalis', side: 'c', fib: { t: 'fan', c: [200, 0, -0.3] }, half: [[200, 0, -0.05], [200, 0.85, 0.1], [400, -0.55, -0.45], [377, -0.35, -0.3], [152, 0, -0.35]] },
    // Masseter: zygomatic arch down to the jaw angle (extrapolated past the outline), behind its front edge.
    { id: 'masseter', side: 'b', fib: { t: 'lin', a: 81 }, poly: [[352, -0.6, 0.3], [352, 0.6, 0.1], [361, -0.1, 0], [288, 0, 0.1], [397, 0.15, 0.2], [397, -0.35, 0.3], [364, 0.1, 0.2], [416, 0.1, 0], [376, -0.5, 0]] },
    // Platysma: over the jawline and down the neck (extrapolated through the lower rings).
    { id: 'platysma', side: 'b', fib: { t: 'lin', a: 66 }, poly: [[400, 0.2, -0.5], [379, 0.4, -0.6], [365, 0.4, 0.4], [365, 0.5, 3.2], [378, 0.6, 4.6], [377, 0, 4.4], [377, -0.3, 1.0]] },
  ];
  // Caution zones. core: true are the BT.cautionZones a tapped point is tagged with; the rest are safety zones that
  // reference patterns (app/patterns.js) show, with their own label and note here.
  const ring = (lm, r, n) => Array.from({ length: n }, (_, k) => [lm, r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n)]);
  const ZONES = [
    { id: 'zygomaticus', core: true, side: 'b', poly: [[347, -0.2, 0.6], [352, -0.2, 0.1], [291, 0.9, 0.15], [291, 0.25, -0.5]] },
    { id: 'risorius', core: true, side: 'b', poly: [[291, 0.55, -0.2], [416, -0.25, -0.35], [416, -0.25, 0.35], [291, 0.55, 0.3]] },
    { id: 'levator-palpebrae', core: true, side: 'b', poly: [[362, 0, -0.22], [386, 0, -0.28], [263, -0.2, -0.2], [276, -0.15, 0.45], [282, 0, 0.42], [295, -0.6, 0.35]] },
    { id: 'lower-lid', side: 'b', label: 'Lower eyelid', note: 'Lid laxity, swelling and cheek heaviness. Only micro-doses here.', poly: [[374, -0.6, 0.75], [374, 1.2, 0.6], [374, 1.4, 1.4], [374, -0.5, 1.6]] },
    { id: 'brow-lateral', side: 'b', label: 'Outer forehead', note: 'Treating the outer frontalis less keeps the outer brow from lifting into a peak.', poly: [[293, 0.15, -1.0], [284, -0.35, -0.2], [332, 0, -1.2], [293, -0.4, -2.2]] },
    { id: 'commissure', side: 'b', label: 'Mouth corner', note: 'DAO points stay at least 1.5 cm from the corner.', poly: ring(291, 0.7, 12) },
    { id: 'lower-lip', side: 'b', label: 'Lower lip depressors', note: 'Lip control. DAO and chin points stay low and to the side.', poly: [[17, 0.45, 0.15], [291, -0.4, 0.75], [291, -0.1, 1.6], [200, 0.55, 0.3]] },
    { id: 'lip-lifters', side: 'b', label: 'Upper lip lifters', note: 'Points too low or too far out weaken the upper lip lift.', poly: [[358, 0.15, -0.35], [358, 0.9, -0.2], [327, 1.2, 0.9], [327, 0.6, 1.1]] },
    { id: 'mandible-border', side: 'b', label: 'Jaw border', note: 'Masseter points stay at least 1 cm above the border.', poly: [[379, 0, 0.05], [365, 0, 0.05], [397, 0.15, 0.05], [288, 0.2, 0], [288, -0.7, -0.2], [397, -0.6, -0.65], [365, -0.5, -0.8], [379, -0.3, -0.8]] },
    { id: 'neck-midline', side: 'c', label: 'Front of the neck', note: 'Swallowing and voice muscles lie deeper. Superficial and band-guided only.', half: [[152, 0, 0.5], [152, 0.8, 0.5], [152, 0.8, 4.8], [152, 0, 4.8]] },
  ];
  const zoneText = (id) => {
    const z = ZONES.find((q) => q.id === id) || {}, core = (BT.cautionZones || []).find((q) => q.id === id);
    return core ? { label: core.label, note: core.note } : { label: z.label || id, note: z.note || '' };
  };

  // Mirror partner of every landmark: the canonical vertex nearest (-x, y, z).
  let PAIR = null;
  function pairs() {
    if (PAIR) return PAIR;
    const { C } = faceMesh();
    PAIR = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      let best = i, bd = Infinity;
      for (let j = 0; j < N; j++) { const d = (C[3 * j] + C[3 * i]) ** 2 + (C[3 * j + 1] - C[3 * i + 1]) ** 2 + (C[3 * j + 2] - C[3 * i + 2]) ** 2; if (d < bd) { bd = d; best = j; } }
      PAIR[i] = best;
    }
    return PAIR;
  }
  // A corner spec -> canonical [x, y] (cm), mirrored for the patient's right when mir.
  function cpt(s, mir) {
    const { C } = faceMesh(), pr = pairs(), [a, dx, dy] = s, L = (i) => (mir ? pr[i] : i);
    let x, y;
    if (Array.isArray(a)) { const i = L(a[0]), j = L(a[1]), t = a[2]; x = C[3 * i] + (C[3 * j] - C[3 * i]) * t; y = C[3 * i + 1] + (C[3 * j + 1] - C[3 * i + 1]) * t; }
    else { const i = L(a); x = C[3 * i]; y = C[3 * i + 1]; }
    return [x + (mir ? -(dx || 0) : dx || 0), y + (dy || 0)];
  }
  // The shapes of a definition: [{id, poly (canonical cm), mir}], two for side 'b', one for side 'c'.
  function expand(def) {
    if (def.side === 'c') {
      const h = def.half.map((s) => cpt(s, false)), back = def.half.slice(1, -1).reverse().map((s) => cpt(s, true));
      return [{ id: def.id, poly: [...h, ...back], mir: false }];
    }
    return [false, true].map((mir) => ({ id: def.id + (mir ? '-r' : '-l'), poly: def.poly.map((s) => cpt(s, mir)), mir }));
  }
  // Signed distance from (x, y) to a polygon's edge: positive inside.
  function sdist(poly, x, y) {
    let d = Infinity, inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      const ex = xi - xj, ey = yi - yj, l2 = ex * ex + ey * ey || 1e-9, t = Math.max(0, Math.min(1, ((x - xj) * ex + (y - yj) * ey) / l2));
      d = Math.min(d, Math.hypot(x - xj - t * ex, y - yj - t * ey));
    }
    return inside ? d : -d;
  }
  const polyArea = (p) => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return Math.abs(a) / 2; };

  // The front-facing canonical triangle (extended mesh) holding canonical (x, y), nearest the camera where the
  // front view overlaps itself; the nearest triangle when none holds it.
  let CBOX = null;
  function locateC(x, y) {
    const { C, T, NT, FRONT } = faceMesh(), w = [0, 0, 0];
    if (!CBOX) {
      CBOX = new Float32Array(NT * 5);
      for (let t = 0; t < NT; t++) {
        const i = 3 * T[3 * t], j = 3 * T[3 * t + 1], k = 3 * T[3 * t + 2];
        CBOX[5 * t] = Math.min(C[i], C[j], C[k]); CBOX[5 * t + 1] = Math.max(C[i], C[j], C[k]);
        CBOX[5 * t + 2] = Math.min(C[i + 1], C[j + 1], C[k + 1]); CBOX[5 * t + 3] = Math.max(C[i + 1], C[j + 1], C[k + 1]);
        CBOX[5 * t + 4] = ((C[j] - C[i]) * (C[k + 1] - C[i + 1]) - (C[j + 1] - C[i + 1]) * (C[k] - C[i])) * FRONT > 0 ? 1 : 0;
      }
    }
    const tri = (t) => { const i = 3 * T[3 * t], j = 3 * T[3 * t + 1], k = 3 * T[3 * t + 2]; return bary(x, y, C[i], C[i + 1], C[j], C[j + 1], C[k], C[k + 1], w); };
    let best = null, bz = Infinity;
    for (let t = 0; t < NT; t++) {
      if (!CBOX[5 * t + 4] || x < CBOX[5 * t] - 1e-6 || x > CBOX[5 * t + 1] + 1e-6 || y < CBOX[5 * t + 2] - 1e-6 || y > CBOX[5 * t + 3] + 1e-6) continue;
      if (!tri(t) || Math.min(w[0], w[1], w[2]) < -1e-6) continue;
      const z = w[0] * C[3 * T[3 * t] + 2] + w[1] * C[3 * T[3 * t + 1] + 2] + w[2] * C[3 * T[3 * t + 2] + 2];
      if (z < bz) { bz = z; best = { t, w: w.slice() }; }
    }
    if (best) return best;
    let bm = -Infinity;
    for (let t = 0; t < NT; t++) { if (!CBOX[5 * t + 4] || !tri(t)) continue; const m = Math.min(w[0], w[1], w[2]); if (m > bm) { bm = m; best = { t, w: w.slice() }; } }
    return best;
  }
  // canonical (x, y) of a bound point
  const atC = (b) => { const { C, T } = faceMesh(), i = 3 * T[3 * b.t], j = 3 * T[3 * b.t + 1], k = 3 * T[3 * b.t + 2], w = b.w; return [w[0] * C[i] + w[1] * C[j] + w[2] * C[k], w[0] * C[i + 1] + w[1] * C[j + 1] + w[2] * C[k + 1]]; };

  // A polygon resampled every 0.25 cm, each sample bound to the mesh.
  function outline(poly) {
    const out = [];
    poly.forEach(([x, y], k) => {
      const [nx, ny] = poly[(k + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 0.25));
      for (let s = 0; s < n; s++) out.push(locateC(x + ((nx - x) * s) / n, y + ((ny - y) * s) / n));
    });
    return out;
  }
  /* Built once: every muscle as a grid of bound vertices (GPU buffers), every zone as a bound outline. */
  let GEO = null;
  function geometry() {
    if (GEO) return GEO;
    const t0 = performance.now(), { C, T, FRONT } = faceMesh();
    const regions = [], vt = [], vw = [], st = [], idx = [];
    MUSCLES.forEach((def) => expand(def).forEach((sh) => {
      const m = regions.length, H = def.h || 0.2, Fe = def.f || 0.22, SP = 0.17;
      const poly = sh.poly, xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      const hole = def.hole ? expand({ side: 'c', half: def.hole })[0].poly : null;
      const x0 = Math.min(...xs) - Fe, x1 = Math.max(...xs) + Fe, y0 = Math.min(...ys) - Fe, y1 = Math.max(...ys) + Fe;
      const nx = Math.ceil((x1 - x0) / H) + 1, ny = Math.ceil((y1 - y0) / H) + 1;
      // fiber coordinate: stripes run along the fibers, so this counts across them
      const f = def.fib, fc = f.c ? cpt(f.c, sh.mir) : null, ang = f.t === 'lin' ? ((sh.mir ? 180 - f.a : f.a) * Math.PI) / 180 : 0;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rm = fc ? Math.max(1, Math.hypot(cx - fc[0], cy - fc[1])) : 1;
      const fiber = (x, y) => {
        if (f.t === 'lin') return (-(x - cx) * Math.sin(ang) + (y - cy) * Math.cos(ang)) / SP;
        if (f.t === 'fan') return (Math.atan2(y - fc[1], x - fc[0]) * rm) / SP;
        return Math.hypot(x - fc[0], (y - fc[1]) / (f.k || 1)) / SP;
      };
      const node = new Int32Array(nx * ny).fill(-1), e = new Float32Array(nx * ny);
      for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
        const x = x0 + c * H, y = y0 + r * H;
        let k = (sdist(poly, x, y) + Fe) / (2 * Fe);
        if (hole) k = Math.min(k, (0.12 - sdist(hole, x, y)) / 0.24);
        e[r * nx + c] = Math.max(0, Math.min(1, k));
      }
      const vid = (r, c) => {
        const q = r * nx + c;
        if (node[q] >= 0) return node[q];
        const x = x0 + c * H, y = y0 + r * H, b = locateC(x, y);
        node[q] = vt.length;
        vt.push(b.t); vw.push(b.w[0], b.w[1], b.w[2]); st.push(e[q], fiber(x, y), m, x, y);
        return node[q];
      };
      let sx = 0, sy = 0, sn = 0;
      for (let r = 0; r + 1 < ny; r++) for (let c = 0; c + 1 < nx; c++) {
        const q = r * nx + c;
        if (e[q] + e[q + 1] + e[q + nx] + e[q + nx + 1] <= 0) continue;
        const a = vid(r, c), b = vid(r, c + 1), d = vid(r + 1, c), g = vid(r + 1, c + 1);
        // grid cells are counter-clockwise in canonical x right, y down when listed a, d, g; flip to FRONT
        const cw = FRONT > 0;
        if (cw) idx.push(a, g, d, a, b, g); else idx.push(a, d, g, a, g, b);
        if (e[q] > 0.5) { sx += x0 + c * H; sy += y0 + r * H; sn++; }
      }
      const pc = sn ? [sx / sn, sy / sn] : poly[0];
      regions.push({ id: sh.id, poly, area: polyArea(poly), c: pc, cb: locateC(pc[0], pc[1]), ob: outline(poly) });
    }));
    // winding check: make every muscle triangle's canonical cross product agree with the tessellation's FRONT
    const NVm = vt.length, CX = new Float32Array(NVm), CY = new Float32Array(NVm);
    for (let v = 0; v < NVm; v++) { CX[v] = st[5 * v + 3]; CY[v] = st[5 * v + 4]; }
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k], b = idx[k + 1], c = idx[k + 2];
      if (((CX[b] - CX[a]) * (CY[c] - CY[a]) - (CY[b] - CY[a]) * (CX[c] - CX[a])) * FRONT < 0) { idx[k + 1] = c; idx[k + 2] = b; }
    }
    // zones: bound outlines
    const zones = [];
    ZONES.forEach((def) => expand(def).forEach((sh) => {
      const b = outline(sh.poly);
      zones.push({ id: def.id, key: sh.id, core: !!def.core, poly: sh.poly, n: b.length, b, area: polyArea(sh.poly) });
    }));
    const VST = new Float32Array(NVm * 3);
    for (let v = 0; v < NVm; v++) { VST[3 * v] = st[5 * v]; VST[3 * v + 1] = st[5 * v + 1]; VST[3 * v + 2] = st[5 * v + 2]; }
    GEO = { regions, zones, NVm, VT: Uint16Array.from(vt), VW: Float32Array.from(vw), VST, IDX: Uint16Array.from(idx) };
    stats.geometry = { muscles: regions.length, vertices: NVm, triangles: idx.length / 3, zones: zones.length, ms: Math.round(performance.now() - t0) };
    if (NVm > 65535) console.warn('[live] muscle grid has more vertices than 16-bit indices hold');
    return GEO;
  }
  // The muscle region (smallest holding it) and core caution zone at canonical (x, y).
  function regionAt(x, y) {
    const G = geometry();
    let m = null, z = null;
    G.regions.forEach((r) => { if (sdist(r.poly, x, y) > 0 && (!m || r.area < m.area)) m = r; });
    G.zones.forEach((q) => { if (q.core && sdist(q.poly, x, y) > 0 && (!z || q.area < z.area)) z = q; });
    return { muscle: m ? m.id : '', caution: z ? z.id : null };
  }

  // A reference pattern (BT.patterns area) as ghost points: canonical position, binding, drawing position.
  function ghostsOf(area) {
    if (!area) return [];
    const out = [];
    area.points.forEach((p, k) => {
      (p.side === 'b' ? [false, true] : [false]).forEach((mir) => {
        const [x, y] = cpt(p.at, mir), b = locateC(x, y), [dx, dy] = atD(b);
        out.push({ key: area.id + ':' + k + (mir ? 'r' : 'l'), siteId: mir ? p.siteId.replace(/-l$/, '-r') : p.siteId, units: p.units, why: p.why, cx: x, cy: y, b, x: Math.round(dx * 10) / 10, y: Math.round(dy * 10) / 10 });
      });
    });
    return out;
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
  async function getBytes(url, size, sha) {
    let cache = null, res = null, from = 'network';
    try { cache = await caches.open(CACHE); res = await cache.match(url); } catch (e) { cache = null; }
    if (res) { from = 'cache'; prog.cached++; }
    else {
      res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
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
    if (from === 'network') {
      // Verify before storing, so a damaged or swapped download is never used or kept. Cache hits were checked
      // when they were stored. crypto.subtle needs a secure context (https or localhost), which the camera does too.
      if (sha && crypto.subtle) {
        const got = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
        if (got !== sha) throw new Error(`${url.split('/').pop()} failed its integrity check`);
      }
      if (cache) cache.put(url, new Response(bytes, { headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' } })).catch((e) => console.warn('Could not cache', url, e));
    }
    return { bytes, from };
  }

  // Drop Cache Storage buckets from earlier pins (and from when these files came from the CDN).
  function dropOldBuckets() {
    try { caches.keys().then((keys) => keys.forEach((k) => { if (k.startsWith('bt-live-') && k !== CACHE) caches.delete(k); })).catch(() => {}); } catch (e) {}
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

  async function blobFetchable() {
    const u = URL.createObjectURL(new Blob(['1']));
    try { await (await fetch(u)).text(); return true; } catch (e) { return false; } finally { URL.revokeObjectURL(u); }
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
        dropOldBuckets();
        const modelP = getBytes(MODEL, SIZE.model, SHA.model).then((r) => { mark(`model fetch (${r.from}, ${(r.bytes.length / 1048576).toFixed(1)} MB)`, T0); return r; });
        modelP.catch(() => {});
        const vision = await import(LIB + '/vision_bundle.mjs');
        let t = mark('import tasks-vision', T0);
        const files = await vision.FilesetResolver.forVisionTasks(LIB + '/wasm');
        const name = files.wasmBinaryPath.split('/').pop();
        prog.total = SIZE.model + (SIZE[name] || SIZE['vision_wasm_internal.wasm']); emit();
        const wasmP = getBytes(files.wasmBinaryPath, SIZE[name], SHA[name]).then((r) => { mark(`wasm fetch (${name}, ${r.from}, ${(r.bytes.length / 1048576).toFixed(1)} MB)`, t); return r; });
        const [wasm, model] = await Promise.all([wasmP, modelP]);
        prog.phase = 'start'; emit();
        // The wasm loader fetches the binary through locateFile, so hand it the bytes already in memory.
        // A strict Content-Security-Policy without blob: in connect-src blocks that fetch; then the loader gets the
        // same-origin URL (the service worker answers it from the bt-live cache this file just filled).
        let url = URL.createObjectURL(new Blob([wasm.bytes], { type: 'application/wasm' }));
        if (!(await blobFetchable())) { URL.revokeObjectURL(url); url = ''; mark('blob: fetch blocked, wasm loads from its URL', t); }
        const fileset = { wasmLoaderPath: files.wasmLoaderPath, wasmBinaryPath: url || files.wasmBinaryPath };
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
        } finally { if (url) URL.revokeObjectURL(url); }
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

  // Styles through a constructable stylesheet, so a strict style-src (no 'unsafe-inline') still applies them;
  // a <style> element only where constructable stylesheets are missing.
  function addCSS(id, text) {
    if (addCSS[id]) return;
    addCSS[id] = true;
    try {
      const sh = new CSSStyleSheet();
      sh.replaceSync(text);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
      return;
    } catch (e) {}
    const st = document.createElement('style');
    st.id = id; st.textContent = text;
    document.head.appendChild(st);
  }
  // Zoom bar, same look as facemap.js .fm-zbar, kept here because the camera view can mount without a face map.
  const CSS_ZOOM = `
.lc-zw{position:absolute;inset:0;transform-origin:0 0;will-change:transform}
.lc-zbar{position:absolute;right:8px;bottom:8px;top:auto;display:flex;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden;z-index:2}
.lc-zbar[hidden]{display:none}
.lc-zbar button{min-width:40px;height:40px;font-size:20px;line-height:1;color:var(--accent);display:grid;place-items:center}
.lc-zbar button[data-z=lvl]{font-size:12px;min-width:44px;color:var(--muted);font-variant-numeric:tabular-nums;border-left:1px solid var(--line);border-right:1px solid var(--line)}
.lc-zbar button:disabled{color:var(--faint);opacity:.6}
.fm-cam.lc-frozen canvas{touch-action:none}
.fm-cam.lc-zoomed canvas{cursor:grab}
`;
  // The muscle canvas, the progress pill, the reference pattern banner and picker.
  const CSS_LIVE = `
.fm-cam canvas.lc-gl{pointer-events:none}
.lc-prog{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:1;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);background:rgba(0,0,0,.55);color:#fff;font-size:12px;line-height:1.3;padding:6px 12px;border-radius:999px;white-space:nowrap;pointer-events:none;font-variant-numeric:tabular-nums}
.lc-prog[hidden]{display:none}
.lc-prog i{display:block;flex:none;width:56px;height:4px;border-radius:2px;background:rgba(255,255,255,.3);overflow:hidden}
.lc-prog i[hidden]{display:none}
.lc-prog b{display:block;height:100%;width:0;background:#fff;transition:width .2s}
.lc-ref{position:absolute;left:8px;right:8px;top:8px;z-index:1;text-align:left;pointer-events:none}
.fm-cam.lc-hasref .fm-camst{top:auto;bottom:112px}
.lc-ref[hidden]{display:none}
.lc-ref span{display:inline-block;max-width:100%;background:rgba(0,0,0,.55);color:#fff;font-size:11.5px;line-height:1.35;padding:5px 10px;border-radius:10px}
.lc-pat{min-width:0;margin-top:12px;display:flex;flex-direction:column;gap:10px}
.lc-pat-h{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lc-pat-h span{font-weight:600}
.lc-pat-h select{min-width:0;min-height:38px;max-width:62%;padding:0 10px;border-radius:10px;border:1px solid var(--line);background:var(--card-2);color:var(--fg);font:inherit;font-size:13px}
.lc-pat-sum{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;padding:8px 12px;border-radius:12px;background:var(--card-2);border:1px solid var(--line);text-align:left;font-size:13px;line-height:1.35}
.lc-pat-sum[hidden]{display:none}
.lc-pat-sum i{flex:none;font-style:normal;color:var(--accent);font-size:12px}
.lc-pat-b{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;background:var(--card-2);border:1px solid var(--line)}
.lc-pat-b[hidden]{display:none}
.lc-pat-tags{display:flex;flex-wrap:wrap;gap:6px}
.lc-pat-note{font-weight:600;font-size:13px;line-height:1.4}
.lc-pat-sub{color:var(--muted);font-size:12.5px;line-height:1.4}
.lc-pat-pts{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px;font-size:12.5px;color:var(--muted)}
.lc-pat-pts b{color:var(--fg);font-weight:500}
.lc-pat details{font-size:12px;color:var(--muted);line-height:1.4}
.lc-pat summary{cursor:pointer;color:var(--accent)}
`;

  const supported = () => !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.WebAssembly);

  /* Muscle shader. a_p: camera pixels, a_n: normal (x right, y down, z toward the viewer), a_s: edge weight (0 at the
     feathered rim, 1 inside), fiber coordinate, muscle index. u_k holds each muscle's strength (selected, used,
     in the shown pattern). The fragment shader lights the fill from the normal, adds fiber stripes (faded out when
     they would be finer than a pixel), and fades it to nothing as the surface turns away from the camera. */
  const VS = 'attribute vec2 a_p;attribute vec3 a_n;attribute vec3 a_s;uniform vec4 u_xf;uniform float u_k[32];varying vec3 v_n;varying vec3 v_s;' +
    'void main(){int i=int(a_s.z+0.5);v_n=a_n;v_s=vec3(a_s.x,a_s.y,u_k[i]);gl_Position=vec4(u_xf.x*a_p.x+u_xf.y,u_xf.z*a_p.y+u_xf.w,0.,1.);}';
  const FS = (deriv) => (deriv ? '#extension GL_OES_standard_derivatives : enable\n' : '') +
    'precision mediump float;uniform vec3 u_c;uniform vec3 u_l;varying vec3 v_n;varying vec3 v_s;' +
    'void main(){vec3 n=normalize(v_n);float face=smoothstep(0.12,0.5,n.z);float e=smoothstep(0.,1.,v_s.x);float a=e*face*v_s.z;' +
    'if(a<0.004)discard;float s=abs(fract(v_s.y)-0.5)*2.;float fib=smoothstep(0.55,1.,s);' +
    (deriv ? 'fib*=1.-smoothstep(0.3,0.65,fwidth(v_s.y));' : '') +
    'float dif=max(dot(n,u_l),0.);vec3 col=u_c*(0.28+0.88*dif)*(1.-0.2*fib)*(0.82+0.18*e);' +
    'float sp=pow(max(dot(reflect(-u_l,n),vec3(0.,0.,1.)),0.),16.)*0.22;col+=vec3(sp*e);gl_FragColor=vec4(col*a,a);}';
  const LIGHT = (() => { const l = [0.35, -0.6, 0.72], n = Math.hypot(...l); return l.map((x) => x / n); })(); // upper left on the mirrored screen
  const MUSCLE_RGB = [0.82, 0.3, 0.27];
  const O0 = [0, 0], O1 = [1, 1];

  function mount(el, opts) {
    opts = Object.assign({ points: [], selectedId: null, opacity: 0.85 }, opts || {});
    const G = geometry();
    const video = document.createElement('video');
    video.setAttribute('playsinline', ''); video.muted = true; video.autoplay = true;
    const canvas = document.createElement('canvas');
    addCSS('lc-css', CSS_ZOOM);
    addCSS('lc-css-live', CSS_LIVE);
    const zw = document.createElement('div'); zw.className = 'lc-zw'; zw.appendChild(video);
    const zbar = document.createElement('div'); zbar.className = 'fm-zbar lc-zbar'; zbar.hidden = true;
    zbar.innerHTML = '<button type="button" data-z="out" aria-label="Zoom out">&minus;</button><button type="button" data-z="lvl" aria-label="Reset zoom">1x</button><button type="button" data-z="in" aria-label="Zoom in">+</button>';
    el.append(zw, canvas, zbar);
    const ctx = canvas.getContext('2d');
    canvas.style.opacity = opts.opacity;
    // Muscle fills: a WebGL canvas under the 2D one.
    const glc = document.createElement('canvas'); glc.className = 'lc-gl'; glc.style.opacity = opts.opacity;
    el.insertBefore(glc, canvas);
    const pill = document.createElement('div'); pill.className = 'lc-prog'; pill.hidden = true; pill.innerHTML = '<span></span><i><b></b></i>';
    const ref = document.createElement('div'); ref.className = 'lc-ref'; ref.hidden = true;
    el.append(pill, ref);
    const { NV, NT, T, FRONT } = faceMesh();

    let pts = [], sel = opts.selectedId, stream = null, raf = 0, dead = false, frozen = false, failed = false;
    let tracker = null, lastT = -1, mesh = null, seen = 0, status = '';
    let firstRes = false, firstFace = false, frames = 0, fpsT = 0;
    let pat = null, ghosts = [];
    const t0 = performance.now();
    // live state, allocated once: P holds every vertex in camera pixels (x, y, z), TF each triangle's facing
    // (cosine toward the camera, <= 0 when turned away), NN each vertex's unit normal (x right, y down, z toward the viewer)
    const P = new Float32Array(NV * 3), raw = new Float32Array(N * 3), TF = new Float32Array(NT), NN = new Float32Array(NV * 3);
    const A3 = new Float64Array(12), S3 = new Float64Array(12);
    const { C } = faceMesh();
    const filt = euroBank(N * 3);
    const zmax = Math.max(...G.zones.map((z) => z.n), ...G.regions.map((r) => r.ob.length));
    const ZX = new Float32Array(zmax), ZY = new Float32Array(zmax);
    const css = getComputedStyle(el);
    const accent = css.getPropertyValue('--accent').trim() || '#1E3FCB';
    const cautionRGB = '246,194,91';

    const setStatus = (s) => { if (s !== status) { status = s; opts.onStatus && opts.onStatus(s); } };
    // Saved points are bound through the drawing (their x, y are 2D map coordinates); c is the canonical position.
    const bindPts = (list) => list.map((p) => { const b = locate(+p.x, +p.y, false); return { ...p, b, c: atC(b) }; });
    pts = bindPts(opts.points || []);

    /* WebGL muscles: positions and normals change every frame; edge weight, fiber coordinate and muscle never do */
    let gl = null, dynBuf = null, dyn = null, uXf = null, uK = null, glShown = false;
    const K = new Float32Array(32);
    function initGL() {
      try { gl = glc.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: DEBUG }); } catch (e) { gl = null; }
      if (!gl) { glc.remove(); return; }
      try {
        const deriv = !!gl.getExtension('OES_standard_derivatives');
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS(deriv))); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        gl.useProgram(pr);
        const sb = gl.createBuffer(), as = gl.getAttribLocation(pr, 'a_s');
        gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, G.VST, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(as); gl.vertexAttribPointer(as, 3, gl.FLOAT, false, 0, 0);
        dyn = new Float32Array(G.NVm * 5);
        dynBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, dyn, gl.DYNAMIC_DRAW);
        const ap = gl.getAttribLocation(pr, 'a_p'), an = gl.getAttribLocation(pr, 'a_n');
        gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(an); gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 20, 8);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, G.IDX, gl.STATIC_DRAW);
        uXf = gl.getUniformLocation(pr, 'u_xf'); uK = gl.getUniformLocation(pr, 'u_k');
        gl.uniform3f(gl.getUniformLocation(pr, 'u_c'), ...MUSCLE_RGB);
        gl.uniform3f(gl.getUniformLocation(pr, 'u_l'), ...LIGHT);
        gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      } catch (e) { console.warn('WebGL muscle view unavailable, drawing flat fills', e); gl = null; glc.remove(); }
    }
    glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; glc.remove(); });
    initGL();

    /* reference patterns (#65): picker and details under the camera view, banner inside it */
    let panel = null;
    const PT = BT.patterns;
    if (PT && PT.areas && PT.areas.length) {
      panel = document.createElement('div'); panel.className = 'lc-pat';
      panel.innerHTML = `<label class="lc-pat-h"><span>Reference pattern</span><select aria-label="Reference pattern"><option value="">None</option>${PT.areas.map((a) => `<option value="${BT.esc(a.id)}">${BT.esc(a.label)}</option>`).join('')}</select></label>
        <button type="button" class="lc-pat-sum" aria-expanded="false" hidden><span data-sum></span><i data-chev>Details</i></button>
        <div class="lc-pat-b" hidden>
          <div class="lc-pat-tags"><span class="pill blue" data-ev></span><span class="pill amber">${BT.esc(PT.REVIEW)}</span></div>
          <div class="lc-pat-note">${BT.esc(PT.NOTE)}</div>
          <div class="lc-pat-sub" data-total></div>
          <ul class="lc-pat-pts" data-pts></ul>
          <div class="lc-pat-sub" data-notes></div>
          <details><summary>Source</summary><p data-src></p></details>
          <button type="button" class="btn" data-use>Use these points</button>
        </div>`;
      const slot = (el.parentNode && el.parentNode.querySelector('[data-patslot]')) || null;
      if (slot) slot.append(panel); else el.after(panel);
      ref.innerHTML = `<span>${BT.esc(PT.NOTE)}</span>`;
      const selEl = panel.querySelector('select'), box = panel.querySelector('.lc-pat-b'), sum = panel.querySelector('.lc-pat-sum');
      selEl.onchange = () => setPattern(selEl.value);
      // Collapsed to a one-line summary so the camera controls stay on screen (#82); a tap opens the details.
      const expand = (open) => { box.hidden = !open; sum.setAttribute('aria-expanded', String(open)); sum.querySelector('[data-chev]').textContent = open ? 'Hide' : 'Details'; };
      sum.onclick = () => expand(box.hidden);
      panel.querySelector('[data-use]').onclick = () => {
        if (!pat || !ghosts.length) return;
        // Unconfirmed: the log treats these units as suggestions to confirm (#61). Reference low end, never adjusted.
        const points = ghosts.map((g) => ({ id: BT.uid(), siteId: g.siteId, x: g.x, y: g.y, units: g.units[0], refUnits: g.units.slice(), confirmed: false, suggested: true, pattern: pat.id }));
        if (BT.openLog) BT.openLog({ points });
        else BT.toast('Logging is not available yet');
      };
      panel.fill = () => {
        expand(false);
        sum.hidden = !pat;
        if (!pat) return;
        const n = pat.points.reduce((a, p) => a + (p.side === 'b' ? 2 : 1), 0);
        const lo = pat.points.reduce((a, p) => a + p.units[0] * (p.side === 'b' ? 2 : 1), 0), hi = pat.points.reduce((a, p) => a + p.units[1] * (p.side === 'b' ? 2 : 1), 0);
        panel.querySelector('[data-sum]').textContent = `${pat.label}: ${n} ${n === 1 ? 'point' : 'points'}, ${PT.fmtUnits([lo, hi])} reference`;
        panel.querySelector('[data-ev]').textContent = pat.evidence;
        panel.querySelector('[data-total]').textContent = pat.total;
        panel.querySelector('[data-notes]').textContent = pat.notes;
        panel.querySelector('[data-src]').textContent = pat.source;
        panel.querySelector('[data-pts]').innerHTML = pat.points.map((p) => {
          return `<li><b>${BT.esc(PT.fmtUnits(p.units))}</b> ${p.side === 'b' ? 'each side' : 'midline'} · ${BT.esc(p.why)}</li>`;
        }).join('');
      };
    }
    function setPattern(id) {
      pat = PT && id ? PT.find(id) : null;
      ghosts = ghostsOf(pat);
      ref.hidden = !pat;
      el.classList.toggle('lc-hasref', !!pat);
      if (panel) { panel.querySelector('select').value = pat ? pat.id : ''; panel.fill(); }
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

    // Landmarks -> P (filtered), the rings through a 3D affine fit, then facing per triangle and normals per vertex.
    function pose(lm, now) {
      const vw = video.videoWidth, vh = video.videoHeight;
      for (let i = 0; i < N; i++) { const p = lm[i]; raw[3 * i] = p.x * vw; raw[3 * i + 1] = p.y * vh; raw[3 * i + 2] = p.z * vw; }
      filt.run(raw, now);
      P.set(raw);
      // least-squares affine canonical -> live: A = (sum p h^T) Ginv, h = [canonical, 1]
      const { Ginv } = faceMesh();
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
      // facing: the z of each triangle's unit normal, signed so front faces are positive. The outward normal is
      // -FRONT * (u x w) in camera axes (z away); flipping z gives the viewer-facing normal the shader lights.
      NN.fill(0);
      for (let t = 0; t < NT; t++) {
        const i = 3 * T[3 * t], j = 3 * T[3 * t + 1], k = 3 * T[3 * t + 2];
        const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2], wx = P[k] - P[i], wy = P[k + 1] - P[i + 1], wz = P[k + 2] - P[i + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        TF[t] = len ? (FRONT * nz) / len : 0;
        const ax = -FRONT * nx, ay = -FRONT * ny, az = FRONT * nz;
        NN[i] += ax; NN[i + 1] += ay; NN[i + 2] += az; NN[j] += ax; NN[j + 1] += ay; NN[j + 2] += az; NN[k] += ax; NN[k + 1] += ay; NN[k + 2] += az;
      }
      for (let v = 0; v < NV; v++) { const x = NN[3 * v], y = NN[3 * v + 1], z = NN[3 * v + 2], l = Math.sqrt(x * x + y * y + z * z) || 1; NN[3 * v] = x / l; NN[3 * v + 1] = y / l; NN[3 * v + 2] = z / l; }
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

    /* caution zones: faint hatching, shown in proportion to how close a placed or reference point is (cm) */
    function zoneStrength(z) {
      let d = Infinity, dg = Infinity;
      pts.forEach((p) => { d = Math.min(d, -sdist(z.poly, p.c[0], p.c[1])); });
      ghosts.forEach((g) => { dg = Math.min(dg, -sdist(z.poly, g.cx, g.cy)); });
      const m = Math.min(d, dg);
      let a = m <= 0 ? 1 : Math.max(0, 1 - m / 1.0);
      if (pat && pat.zones.indexOf(z.id) >= 0) a = Math.max(a, 0.7);
      return { a, d }; // d: placed points only, for the zone's name
    }
    // Project a bound outline into ZX/ZY (screen pixels); returns its mean facing.
    function projectRing(bs, ax, bx, ay, by) {
      let face = 0;
      for (let q = 0; q < bs.length; q++) {
        const b = bs[q], t = b.t, i = 3 * T[3 * t], j = 3 * T[3 * t + 1], k = 3 * T[3 * t + 2], w = b.w;
        ZX[q] = ax * (w[0] * P[i] + w[1] * P[j] + w[2] * P[k]) + bx;
        ZY[q] = ay * (w[0] * P[i + 1] + w[1] * P[j + 1] + w[2] * P[k + 1]) + by;
        face += TF[t];
      }
      return face / bs.length;
    }
    const shownZones = [];
    function drawZones(ax, bx, ay, by, unit) {
      shownZones.length = 0;
      G.zones.forEach((z) => {
        const { a, d } = zoneStrength(z);
        if (a <= 0.02) return;
        const face = projectRing(z.b, ax, bx, ay, by);
        if (face < 0.3) return; // turned away
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let q = 0; q < z.n; q++) { if (ZX[q] < x0) x0 = ZX[q]; if (ZX[q] > x1) x1 = ZX[q]; if (ZY[q] < y0) y0 = ZY[q]; if (ZY[q] > y1) y1 = ZY[q]; }
        const k = a * Math.min(1, (face - 0.3) / 0.25);
        ctx.save();
        ctx.beginPath();
        for (let q = 0; q < z.n; q++) q ? ctx.lineTo(ZX[q], ZY[q]) : ctx.moveTo(ZX[q], ZY[q]);
        ctx.closePath();
        ctx.fillStyle = `rgba(${cautionRGB},${0.1 * k})`;
        ctx.fill();
        ctx.clip();
        ctx.beginPath();
        const step = Math.max(4, 5 * unit);
        for (let s = x0 + y0 - (y1 - y0); s < x1 + y1; s += step) { ctx.moveTo(s - y0, y0); ctx.lineTo(s - y1, y1); }
        ctx.lineWidth = Math.max(0.8, 0.9 * unit); ctx.strokeStyle = `rgba(${cautionRGB},${0.6 * k})`;
        ctx.stroke();
        ctx.restore();
        shownZones.push({ key: z.key, id: z.id, a: k, near: d < 0.4, x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
      });
    }
    function tag(text, x, y, align, small) {
      ctx.font = `${small ? 500 : 600} ${small ? 11 : 12.5}px system-ui, sans-serif`;
      const w = ctx.measureText(text).width + 12, h = small ? 18 : 21;
      const W = el.clientWidth, left = Math.max(4, Math.min(W - w - 4, align === 'left' ? x : align === 'right' ? x - w : x - w / 2));
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(left, y - h / 2, w, h, h / 2); else ctx.rect(left, y - h / 2, w, h);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, left + 6, y + 0.5);
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
      // sizes scale with the face on screen: 8.9 cm is the canonical outer eye corner span
      const pxcm = (Math.abs(ax) * Math.hypot(P[3 * 263] - P[3 * 33], P[3 * 263 + 1] - P[3 * 33 + 1])) / 8.9;
      const unit = Math.max(0.6, Math.min(2, pxcm / 32));
      const used = {}, sp = pts.find((p) => p.id === sel), inPat = {};
      pts.forEach((p) => (used[p.siteId ? BT.site(p.siteId).id : ''] = 1));
      ghosts.forEach((g) => (inPat[g.siteId] = 1));
      const selM = sp && sp.siteId ? BT.site(sp.siteId).id : null;

      if (gl) {
        G.regions.forEach((r, i) => { K[i] = r.id === selM ? 0.95 : used[r.id] ? 0.72 : pat ? (inPat[r.id] ? 0.8 : 0.3) : 0.55; });
        const { VT, VW, NVm } = G;
        for (let q = 0; q < NVm; q++) {
          const t = VT[q], i = 3 * T[3 * t], j = 3 * T[3 * t + 1], k = 3 * T[3 * t + 2], w0 = VW[3 * q], w1 = VW[3 * q + 1], w2 = VW[3 * q + 2], o5 = 5 * q;
          dyn[o5] = w0 * P[i] + w1 * P[j] + w2 * P[k];
          dyn[o5 + 1] = w0 * P[i + 1] + w1 * P[j + 1] + w2 * P[k + 1];
          dyn[o5 + 2] = w0 * NN[i] + w1 * NN[j] + w2 * NN[k];
          dyn[o5 + 3] = w0 * NN[i + 1] + w1 * NN[j + 1] + w2 * NN[k + 1];
          dyn[o5 + 4] = w0 * NN[i + 2] + w1 * NN[j + 2] + w2 * NN[k + 2];
        }
        gl.viewport(0, 0, cw, ch);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dyn);
        gl.uniform4f(uXf, (ax * 2) / v.W, (bx * 2) / v.W - 1, (-ay * 2) / v.H, 1 - (by * 2) / v.H);
        gl.uniform1fv(uK, K);
        // the mirror and the clip-space y flip each reverse the winding
        gl.frontFace(FRONT * Math.sign(ax) * -Math.sign(ay) > 0 ? gl.CCW : gl.CW);
        gl.drawElements(gl.TRIANGLES, G.IDX.length, gl.UNSIGNED_SHORT, 0);
        glShown = true;
      } else {
        // Without WebGL: flat translucent fills of the regions that face the camera (no outline either way).
        G.regions.forEach((r) => {
          const face = projectRing(r.ob, ax, bx, ay, by);
          if (face < 0.35) return;
          ctx.beginPath();
          for (let q = 0; q < r.ob.length; q++) q ? ctx.lineTo(ZX[q], ZY[q]) : ctx.moveTo(ZX[q], ZY[q]);
          ctx.closePath();
          ctx.fillStyle = `rgba(209,77,69,${(r.id === selM ? 0.5 : used[r.id] ? 0.38 : 0.26) * Math.min(1, (face - 0.35) / 0.25)})`;
          ctx.fill();
        });
      }

      ctx.lineJoin = 'round';
      drawZones(ax, bx, ay, by, unit);

      // reference pattern: soft ghost markers with their reference range
      if (ghosts.length) {
        const r = 6.5 * Math.min(1.4, unit), done = [];
        ghosts.forEach((g) => {
          const q = placeCam(g.b);
          if (!q) return;
          const x = ax * q[0] + bx, y = ay * q[1] + by;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
          ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();
          ctx.setLineDash([3, 2.5]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
          // one range label per cluster: skip it when the same text is already drawn close by; point it inward near an edge
          const text = PT.fmtUnits(g.units);
          if (pxcm <= 12 || done.some((q) => q.text === text && Math.hypot(q.x - x, q.y - y) < 60)) return;
          done.push({ text, x, y });
          const out = x >= v.W / 2 ? 1 : -1, side = (out > 0 ? v.W - x : x) < 80 ? -out : out;
          tag(text, x + side * (r + 3), y, side > 0 ? 'left' : 'right', true);
        });
      }

      // zone names only beside a point that is in or right next to one
      const selZ = sp && sp.caution;
      shownZones.forEach((z) => { if (z.near && z.a > 0.6 && z.id !== selZ) tag(zoneText(z.id).label, z.x, z.y, 'center', true); });

      const order = pts.slice().sort((a, b) => (a.id === sel) - (b.id === sel));
      ctx.textBaseline = 'middle';
      order.forEach((p) => {
        const q = placeCam(p.b);
        if (!q) return; // on the far side of the face
        const x = ax * q[0] + bx, y = ay * q[1] + by, r = 5.5 * Math.min(1.4, unit), side = x >= v.W / 2 ? 1 : -1;
        if (p.id === sel) { ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = accent; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
        const label = String(Math.round((+p.units || 0) * 10) / 10);
        ctx.font = `600 ${Math.round(12 * Math.min(1.3, unit))}px system-ui, sans-serif`;
        ctx.textAlign = side > 0 ? 'left' : 'right';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(label, x + side * (r + 4), y);
        ctx.fillStyle = '#fff'; ctx.fillText(label, x + side * (r + 4), y);
        // the muscle name, only for the selected (just placed or tapped) point
        if (p.id === sel) tag(p.caution ? zoneText(p.caution).label + ' (caution)' : p.siteId ? BT.site(p.siteId).label : 'Outside the mapped muscles', x, y - r - 16, 'center');
      });
      const dt = performance.now() - tA;
      stats.drawMs = stats.drawMs ? stats.drawMs * 0.9 + dt * 0.1 : dt;
      if (DEBUG) { (stats.drawHist ||= []).push(dt); if (stats.drawHist.length > 300) stats.drawHist.shift(); }
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
      // the muscle drawn under the finger, from the same landmark-space regions the view shows
      const c = atC(loc), info = regionAt(c[0], c[1]), siteId = info.caution ? '' : info.muscle;
      const np = { id: BT.uid(), siteId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, units: Math.max(1, Math.round(BT.site(siteId).range[0] / 2)) };
      if (info.caution) { np.caution = info.caution; const z = zoneText(info.caution); BT.toast(`Caution: ${z.label}. ${z.note}`); }
      pts = [...pts, { ...np, b: loc, c }];
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
    const plain = () => pts.map(({ b, c, ...p }) => p);

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
      glc.remove(); pill.remove(); ref.remove(); if (panel) panel.remove(); prog.subs.delete(showPill);
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      gl = null;
      el.classList.remove('lc-frozen', 'lc-zoomed', 'lc-hasref');
    }

    start();
    const api = {
      setPoints(list) { pts = bindPts(list || []); if (sel && !pts.some((p) => p.id === sel)) sel = null; },
      select(id) { sel = id && pts.some((p) => p.id === id) ? id : null; },
      setOpacity(k) { canvas.style.opacity = k; glc.style.opacity = k; },
      setPattern,
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
    // ?lcdebug: screen positions for tests and on-device checks
    if (DEBUG) {
      const scr = (q) => { if (!q) return null; const v = view(), o = v.to(O0), u = v.to(O1); return [(u[0] - o[0]) * q[0] + o[0], (u[1] - o[1]) * q[1] + o[1]]; };
      api.debug = {
        lm: (i) => (mesh ? scr([P[3 * i], P[3 * i + 1]]) : null),
        regions: () => G.regions.map((r) => ({ id: r.id, at: scr(placeCam(r.cb)), facing: mesh ? TF[r.cb.t] : 0 })),
        ghosts: () => ghosts.map((g) => ({ siteId: g.siteId, units: g.units, x: g.x, y: g.y, at: scr(placeCam(g.b)) })),
        zones: () => shownZones.map((z) => ({ key: z.key, a: z.a })),
        points: () => pts.map((p) => ({ id: p.id, siteId: p.siteId, caution: p.caution || null, c: p.c, at: scr(placeCam(p.b)) })),
        zoneDist: () => G.zones.map((z) => ({ key: z.key, d: Math.min(...pts.map((p) => -sdist(z.poly, p.c[0], p.c[1]))) })),
      };
      BT.liveCam.last = api;
    }
    return api;
  }

  BT.liveCam = { supported, mount, preload: () => landmarker().catch(() => null), stats, geometry: () => stats.geometry };
})();
