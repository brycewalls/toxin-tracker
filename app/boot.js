/* Boot (#56): renders the tab icons, wires the tab bar, starts the first render and the live countdowns.
   It was an inline <script> at the end of app/index.html; it is an external file so the hosted app's
   Content-Security-Policy can use script-src 'self' with no 'unsafe-inline'. Loaded last, after every screen. */
(function () {
  document.querySelectorAll('[data-ic]').forEach((s) => (s.outerHTML = BT.icon(s.dataset.ic, s.dataset.ic === 'plus' ? 26 : 22)));
  // iOS Safari ignores user-scalable=no; its gesture events are the only way to stop a pinch zoom.
  ['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.querySelector('.tabbar').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) BT.go(t.dataset.tab); });
  let rt; BT.on('change', () => { clearTimeout(rt); rt = setTimeout(() => { if (BT.sheetOpen()) BT._stale = true; else { BT._stale = false; BT.render(); } }, 30); });
  /* Hosted app (#101): until the signed-in user's first full load has finished, BT.render (core.js) shows this
     calm loading state in the app shell instead of a screen built from default data (no What's New card, empty
     rings or check-in). The sample-data preview has no BT_CLOUD and renders at once. After ~8 s it offers Retry. */
  let slowTimer = null;
  if (window.BT_CLOUD) {
    BT.booting = true;
    BT.renderBooting = () => {
      const root = document.getElementById('view');
      if (root.dataset.screen === 'booting') return;
      root.dataset.screen = 'booting';
      root.innerHTML = '<div class="boot-load" role="status"><img src="icon.svg" alt="" width="64" height="64"><p>Loading your log</p><div class="boot-slow" hidden><p>Still loading your log</p><button class="btn sm" type="button" data-boot-retry>Retry</button></div></div>';
      root.querySelector('[data-boot-retry]').addEventListener('click', () => location.reload());
    };
    slowTimer = setTimeout(() => { const s = document.querySelector('.boot-slow'); if (s) s.hidden = false; }, 8000);
  }
  BT.render();
  BT.init().then(() => {
    clearTimeout(slowTimer); BT.booting = false;
    // The artifact opens with marked sample data; the hosted app starts empty (Settings can load the sample).
    if (!window.BT_CLOUD && !BT.data.injections.length && !BT.data.settings.sampleCleared && !BT.data.settings.sampleLoaded) BT.loadSample();
    // Sample data v2 uses muscles and freeform points; refresh older sample records.
    else if (BT.hasSample() && BT.data.settings.sampleVersion !== 2) { BT.clearSample(); BT.save('settings', { sampleCleared: false }); BT.loadSample(); }
    if (BT.hasSample()) BT.save('settings', { sampleVersion: 2 });
    BT.render();
    clearTimeout(rt); // init's own 'change' would render this screen a second time
  });
  // Live timers tick without re-rendering whole screens: elements with data-until="<ms epoch>" show a countdown.
  setInterval(() => document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = BT.fmt.countdown(+el.dataset.until - Date.now()); }), 1000);
})();
