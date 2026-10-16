/* Release notes and the app version (#12).
   Every PR that ships something people will notice adds its bullets to the top entry, or starts
   a new entry when it is a new release. BT.VERSION is always the first entry's version, so the
   number in Settings and What's New cannot drift from the notes. Write bullets for the person
   using the app: what they can now do, in plain words. */
(function () {
  BT.RELEASES = [
    {
      version: '0.14', date: '2026-10-15', title: 'Polish and fixes',
      items: [
        'The Effect level chart now starts at your latest treatment, with today marked, instead of a long flat line.',
        'Change or delete a photo right from Before & After.',
        'Quiz questions and answers shuffle every time you take a quiz.',
        'Finishing a lesson out of order now points you to the next lesson instead of a certificate you have not unlocked yet.',
        'The sign-in page shows the new app icon.',
        'The top of Today no longer looks cut off under the status bar.',
      ],
    },
    {
      version: '0.13', date: '2026-10-15', title: 'Your progress stays put',
      items: [
        'Fixed Academy progress, and other settings, being lost after signing out and back in.',
        'Lessons and achievements now combine across your phones instead of overwriting each other.',
        'Signing out waits for your changes to finish syncing, and asks first if something has not synced yet.',
        'In the Live view, Freeze floats on the camera so it is always in reach, and pattern details fold into one line below.',
      ],
    },
    {
      version: '0.12', date: '2026-10-15', title: 'Muscles molded to your face',
      items: [
        'The Live view now places each muscle from the shape of your own face and shades it so it wraps your brow, cheeks and jaw. No outline art, only the muscle groups.',
        'Pick a treatment area in the Live view to see its published reference pattern on your face, then copy the points into your log as suggested units.',
        'Suggested units must be confirmed before a treatment saves, and a note appears when a muscle goes above its reference range.',
        'The Academy moved out of the tab bar. Open it from the card on Today, the cap button at the top, or the shortcuts.',
        'Videos and articles you have opened show a checkmark, and lessons count how many you have viewed.',
        'Today asks whether an open reaction has cleared up, and reminds you to log reactions in the days after a treatment.',
        'Fixed the spacing under the tab bar on History and Stock, and added browser security protections.',
      ],
    },
    {
      version: '0.11', date: '2026-10-15', title: 'Botox Academy and stronger privacy',
      items: [
        'New Learn tab: the Botox Academy, with 22 courses and 35 lessons on how each treatment works, the anatomy, published patterns and safety, plus quizzes and vetted videos and reading.',
        'Track your progress, unlock 15 achievements, and earn an educational certificate of completion when you finish every course.',
        'The app now signs you out after a period of no use, with a warning first. Choose the time, or Never on this device, in Settings.',
        'Signing out, or the timeout, erases the copy of your data stored on the phone.',
        'All of the app\'s code, including the face tracker, now comes from the app itself, checked against a fingerprint, instead of outside servers.',
      ],
    },
    {
      version: '0.10', date: '2026-10-15', title: 'Works offline',
      items: [
        'Toxin Tracker opens and works with no connection. Log treatments, photos and reactions anywhere.',
        'Anything you change offline saves on your phone and syncs as soon as you are back online. A small banner tells you when you are offline.',
        'Changes made on your other phone show up right away, without reloading.',
        'When a new version is out, tap Update ready to load it.',
        'Signing out now erases the copy of your data stored on the phone.',
      ],
    },
    {
      version: '0.9', date: '2026-10-15', title: 'Live map melts onto your face',
      items: [
        'The Live map now follows the full shape of your face, curving over your cheeks, nose and jaw, and blends into your skin instead of sitting on top.',
        'The camera starts much faster, and after the first time the face tracker loads from your phone instead of downloading again.',
        'Zoomed maps use the full width and more height, with no box cutting off the face.',
        'Picking a mood fills only the day you tapped.',
        'New vials, treatments and reactions show up right away after you save.',
        'Date fields fit the screen on iPhone, nothing scrolls sideways, and tapping into a field no longer zooms the page.',
      ],
    },
    {
      version: '0.8', date: '2026-10-14', title: 'Day 7 check-in',
      items: [
        'A week after each treatment, Today shows a check-in: take your after photo, compare it with the before, then log a touch-up or mark that you did not need one.',
        'Touch-ups link to the original treatment, show a combined total, and do not reset your next-treatment countdown.',
        'Change the check-in day in Settings. Many injectors judge touch-ups at 10 to 14 days.',
        'A Save button at the bottom of Log Injection and Log Reaction.',
        'Mentalis now lists the mental crease as well as a pebbled chin.',
      ],
    },
    {
      version: '0.7', date: '2026-10-14', title: 'Zoom everywhere and a new icon',
      items: [
        'Zoom into the Injection Sites and Frequency maps on the Face Map tab, and the map on a treatment. Labels hide while zoomed and come back at 1x.',
        'Freeze the Live camera, then pinch or use the minus and plus buttons to zoom in and place points precisely.',
        'A new app icon. Remove the app from your home screen and add it again to see it.',
        'Fixed a white bar showing under the bottom tab bar on some screens.',
      ],
    },
    {
      version: '0.6', date: '2026-10-14', title: 'Live face map on your camera',
      items: [
        'Face Map, Live: tap Start live camera and the muscle map follows your face as you move.',
        'Tap your face on the camera to drop a point. It stays pinned to that spot as you turn your head.',
        'Freeze holds the picture still while you place points. Save as injection attaches that frame as your Before photo.',
        'No camera, or you said no to it? Take a selfie or choose a photo and line it up by hand, same as before.',
      ],
    },
    {
      version: '0.5', date: '2026-10-14', title: 'Korean toxins and your own products',
      items: [
        'Add Botulax, Nabota, Meditoxin, Innotox, Coretox, Liztox (Hutox) and Wondertox to your stock.',
        'Using something else? Pick Other when adding a vial, name it, and it is saved for next time.',
        'Log Injection shows the products you have in stock first, with the rest under All products.',
      ],
    },
    {
      version: '0.4', date: '2026-10-14', title: 'Zoom in to place points',
      items: [
        'Pinch the face map in Log Injection, or use the minus and plus buttons, to zoom up to 4x and place points exactly.',
        'Placing a point keeps you on the map. Fill in units in the list below when you are done.',
        'The rest of the app no longer zooms by accident when you pinch or double-tap.',
        'What\'s New: see your version and what each release added. You are reading it.',
      ],
    },
    {
      version: '0.3', date: '2026-10-14', title: 'Your own web app',
      items: [
        'Toxin Tracker now lives at toxin-tracker-bw.web.app. Sign in with Google and your log follows you to any device.',
        'Add it to your home screen for an app icon and full-screen view.',
        'Your log is private to your Google account.',
      ],
    },
    {
      version: '0.2', date: '2026-10-14', title: 'Muscle face map',
      items: [
        'The face map shows the real muscles, from the forehead to the neck, with caution zones marked.',
        'Tap anywhere to drop an injection point; drag to adjust. The app works out which muscle it hit.',
        'The log groups points by muscle with typical ranges and placement tips.',
      ],
    },
    {
      version: '0.1', date: '2026-10-14', title: 'First version',
      items: [
        'Log treatments with product, vial, sites and units.',
        'Aftercare timers, including when you can exercise again.',
        'Vial inventory, reactions, before and after photos, and a dilution calculator.',
      ],
    },
  ];
  // Planned work, shown under "Coming next". Keep it short and drop items once they ship.
  BT.UPCOMING = [
    'Full-size photos.',
  ];
  BT.VERSION = BT.RELEASES[0].version;
  BT.release = (v) => BT.RELEASES.find((r) => r.version === v) || null;

  const css = `
  .wn-ver { display: flex; align-items: baseline; gap: 10px; }
  .wn-rel { display: grid; gap: 10px; }
  .wn-rel h3 { font-size: 17px; }
  .wn-rel ul, .wn-up ul { margin: 0; padding-left: 18px; display: grid; gap: 8px; color: var(--fg); }
  .wn-rel li, .wn-up li { line-height: 1.45; }
  .wn-up ul { color: var(--muted); }`;
  function addCss() { if (document.getElementById('wn-css')) return; const s = document.createElement('style'); s.id = 'wn-css'; s.textContent = css; document.head.appendChild(s); }
  const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  BT.screen('whatsnew', {
    title: "What's New",
    render(root) {
      addCss();
      // Opening this screen counts as seeing the current release.
      if (BT.data.settings.seenVersion !== BT.VERSION) BT.save('settings', { seenVersion: BT.VERSION });
      const rel = BT.RELEASES.map((r, i) => `<section class="card wn-rel">
          <div class="row between gap"><span class="eyebrow">Version ${BT.esc(r.version)}</span>${i === 0 ? '<span class="pill blue">You are here</span>' : `<span class="tiny muted">${fmtDate(r.date)}</span>`}</div>
          <h3>${BT.esc(r.title)}</h3>
          ${i === 0 ? `<div class="tiny muted">${fmtDate(r.date)}</div>` : ''}
          <ul>${r.items.map((t) => `<li>${BT.esc(t)}</li>`).join('')}</ul></section>`).join('');
      root.innerHTML = `${BT.navHeader("What's New")}
        <section class="card"><div class="eyebrow">You are on</div><div class="wn-ver"><span class="big-num">${BT.esc(BT.VERSION)}</span><span class="muted">${BT.esc(BT.RELEASES[0].title)}</span></div></section>
        ${BT.UPCOMING.length ? `<section class="card wn-up stack-s"><div class="card-h" style="margin:0"><h3>Coming next</h3><span class="pill">Planned</span></div><ul>${BT.UPCOMING.map((t) => `<li>${BT.esc(t)}</li>`).join('')}</ul></section>` : ''}
        ${rel}`;
    },
  });

  // One-time card for Today after an update. today.js places it; returns '' when there is nothing new.
  BT.whatsNewCard = () => {
    const s = BT.data.settings;
    if (s.seenVersion === BT.VERSION) return '';
    if (window.BT_CLOUD && !BT.isLoaded()) return ''; // settings are defaults until the first full load (#101)
    const r = BT.RELEASES[0];
    return `<section class="card stack-s" data-wn>
      <div class="row between gap"><span class="pill blue">New in ${BT.esc(r.version)}</span><button class="icon-btn" data-wn-x aria-label="Dismiss">${BT.icon('close', 18)}</button></div>
      <h3>${BT.esc(r.title)}</h3>
      <p class="muted small" style="margin:0">${BT.esc(r.items[0])}</p>
      <button class="btn sm" data-go="whatsnew" style="justify-self:start">See what's new</button></section>`;
  };
  BT.bindWhatsNewCard = (root) => {
    const x = root.querySelector('[data-wn-x]');
    if (x) x.onclick = (e) => { e.stopPropagation(); BT.save('settings', { seenVersion: BT.VERSION }); };
  };
})();
