/* Boot (#56): renders the tab icons, wires the tab bar, starts the first render and the live countdowns.
   It was an inline <script> at the end of app/index.html; it is an external file so the hosted app's
   Content-Security-Policy can use script-src 'self' with no 'unsafe-inline'. Loaded last, after every screen. */
(function () {
  document.querySelectorAll('[data-ic]').forEach((s) => (s.outerHTML = BT.icon(s.dataset.ic, s.dataset.ic === 'plus' ? 26 : 22)));
  // iOS Safari ignores user-scalable=no; its gesture events are the only way to stop a pinch zoom.
  ['gesturestart', 'gesturechange'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.querySelector('.tabbar').addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) BT.go(t.dataset.tab); });
  let rt; BT.on('change', () => { clearTimeout(rt); rt = setTimeout(() => { if (BT.sheetOpen()) BT._stale = true; else { BT._stale = false; BT.render(); } }, 30); });
  BT.render();
  BT.init().then(() => {
    // The artifact opens with marked sample data; the hosted app starts empty (Settings can load the sample).
    if (!window.BT_CLOUD && !BT.data.injections.length && !BT.data.settings.sampleCleared && !BT.data.settings.sampleLoaded) BT.loadSample();
    // Sample data v2 uses muscles and freeform points; refresh older sample records.
    else if (BT.hasSample() && BT.data.settings.sampleVersion !== 2) { BT.clearSample(); BT.save('settings', { sampleCleared: false }); BT.loadSample(); }
    if (BT.hasSample()) BT.save('settings', { sampleVersion: 2 });
    BT.render();
  });
  // Live timers tick without re-rendering whole screens: elements with data-until="<ms epoch>" show a countdown.
  setInterval(() => document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = BT.fmt.countdown(+el.dataset.until - Date.now()); }), 1000);
})();
