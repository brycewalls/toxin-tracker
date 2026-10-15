# Toxin Tracker

A Botox injection tracker modeled on PepPedia's UI.

- **Web app (live):** https://toxin-tracker-bw.web.app, Firebase project `toxin-tracker-bw` (Spark plan), Google sign-in.
- **Prototype:** the claude.ai artifact at https://claude.ai/artifact/XdzP7PhNk37YPSANBAehnZ, published from the same `app/` files.

This README is the guide to how work on this project is tracked. Design notes and decisions stay in the project folder in Cowork.

- Issues (bugs, changes, roadmap): https://github.com/brycewalls/toxin-tracker/issues
- CI runs and page screenshots: https://github.com/brycewalls/toxin-tracker/actions
- Releases: https://github.com/brycewalls/toxin-tracker/releases
- Milestones (deadlines): https://github.com/brycewalls/toxin-tracker/milestones

## What is in here

- `app/index.html` is the artifact page body. `app/core.js` is the shared contract (data, storage, the `window.claude` runtime calls); `facemap.js`, `today.js`, `log.js`, `history.js` and `stock.js` are one tab each.
- `app/preview.html` loads `index.html` and runs its scripts in order, so the app opens outside claude.ai. This is the page CI tests; `index.html` itself is in `tools/smoke.ignore` because it is a fragment.
- `app/cloud.js` is the Firebase backend, loaded only by the hosted build: the Google sign-in screen, then Firestore `users/{uid}/records/{kind__id}` (one document per record, `{kind, rec}`). `core.js` uses it when `window.BT_CLOUD` exists and the `window.claude` db otherwise. Photos are stored as compressed JPEGs inside their records, because Firebase Storage needs the Blaze plan.
- `tools/build.mjs` wraps `app/index.html` in a full document, adds the Firebase SDK, `cloud.js` and `offline.js`, copies the scripts, `web/` (icons, manifest) and the vendored third-party files (see Vendored code) into `dist/` (git-ignored), and generates `dist/sw.js` from `tools/sw.template.js`.
- **Offline (#52):** `dist/sw.js` precaches the app shell (page, scripts, icons, manifest, the vendored Firebase SDK) under a cache named for a hash of the build, so the app opens with no connection. It never caches Firestore, Auth or `/__/` traffic. `app/offline.js` (hosted build only) registers it, shows 'Update ready' when a deploy lands, and shows the offline banner and 'Synced' toast. Firestore's offline cache holds the log and queues changes; `core.js` listens to the records collection live. Sign-out runs `BT_CLOUD.wipeLocal()`, which clears Firestore's local cache and the runtime caches. Firestore's offline cache opens only after sign-in.
- **Privacy (#53, #54):** no account address ships to Hosting. Who may use the app lives only in `firebase/firestore.rules` (deployed to Firestore, never served); after sign-in `cloud.js` reads one of the person's own records from the server, and `permission-denied` turns the account away with 'This app is private'. An approved account with no records passes, and offline the check is skipped (the rules still guard the server). Sign-out, the idle timeout and a denied account all run one `endSession()`: Auth sign-out, then `BT_CLOUD.wipeLocal()` (terminate Firestore, `clearPersistence()`, delete every cache but the `tt-shell-*` app shell, clear the in-memory log), then reload. The idle timeout defaults to 30 minutes with a 60-second 'Still there?' warning; Settings sets 15, 30 or 60 minutes or 'Never on this device', stored in this device's localStorage. It compares a stored last-active time on return, since iOS freezes timers in the background. Export CSV needs a Google sign-in from the last 10 minutes (`BT_CLOUD.requireRecentAuth()`); 'Delete all my data' (#59) should use the same helper.
- **Botox Academy (#69):** `app/academy.js` is the Learn tab: courses, lessons, quizzes, a resources library, achievements and a certificate. The content is `research/2026-10-15_botox-academy-content.json` (sources in `research/2026-10-15_botox-academy-research.md`); `tools/build.mjs` writes it to `dist/academy.json`, which the service worker precaches with the shell. `app/preview.html` reads the research file directly; a claude.ai artifact publish needs the same file published as `academy.json`. Progress is `settings.academy` (`lessons`, `achievements`, `certificate`, `liveAt`), so it syncs like any setting. Edit lessons in the JSON, not in the script, and keep the safety framing: education about how qualified injectors treat, no self-injection, sourcing or reconstitution instructions.
- `firebase/firestore.rules` lets each approved, signed-in person read and write only their own records. Keep addresses out of its comments.
- **Sign-in setup outside the repo:** the Google provider is on in Firebase Authentication, and the auto-created OAuth web client in Google Cloud Console lists `https://toxin-tracker-bw.web.app` as a JavaScript origin and `https://toxin-tracker-bw.web.app/__/auth/handler` as a redirect URI. Without the redirect URI, sign-in fails with `redirect_uri_mismatch` (#9). A custom domain needs both added the same way.
- `replica/` holds the PepPedia recon (screens, feature list) the UI was copied from.

## Vendored code

Nothing the app runs loads from a CDN (#55). The Firebase compat SDK 10.14.1, MediaPipe tasks-vision 1.0.1 (bundle, wasm loaders and wasm) and the float16 face landmarker model are served from our own host under `/vendor/`.

- `tools/vendor.lock.json` pins each file: its source `url`, the `path` it is served at, its `sha256` and `bytes`.
- `node tools/build.mjs` fetches anything missing into `.vendor-cache/` (git-ignored) once, checks every file against the lock, and copies them into `dist/vendor/`. A hash or size mismatch, or a file the build needs with no lock entry, fails the build. With a warm cache the build needs no network. `node tools/vendor.mjs` runs the same check on its own.
- The Firebase `<script>` tags carry `integrity` (SHA-384, computed from the checked files). `app/livecam.js` checks the wasm and model SHA-256 again before storing them, and the build fails if its copy of those hashes drifts from the lock.
- To bump a version or add a file: edit `url` and `path` in the lock (use `"sha256": ""` for a new entry), run `node tools/vendor.mjs --update`, and review the printed diff before committing. Hashes never change any other way.
- `firebase.json` serves `/vendor/**` with `Cache-Control: public, max-age=31536000, immutable` (every path carries a version) and sets `application/wasm` for `.wasm`. The service worker precaches the Firebase SDK with the shell and caches the MediaPipe files on first Live use.
- `app/preview.html` has no `/vendor/`, so the Live view there falls back to the photo flow. Test Live from a served `dist/`.

## The loop

1. **It starts as an issue.** A bug, a change, a roadmap idea. Open one with the matching template, or tell Claude and it opens one.
2. **Work happens on a branch named for the issue:** `fix/12-photo-picker`, `feat/20-reminders`.
3. **A pull request brings it back to `main`** with `Closes #12` in the body. CI opens the app at desktop and phone widths on the PR.
4. **Merging to `main` is the build.** CI runs again and keeps screenshots.
5. **A tag makes a release** when a version is worth marking: `git tag v0.1 && git push origin main --tags`. CI attaches a zip of the site.
6. **Deploy** from an up-to-date `main` with `bash tools/deploy.sh` (hosting plus Firestore rules, needs the Firebase CLI logged in on this Mac), and republish the artifact if the prototype should match. Then clear the `deploy pending` label. If it broke, open a bug that links the release.

## Versions and What's New

The app shows its version and release notes in Settings, What's New (`app/releases.js`). `BT.VERSION` is the first entry in `BT.RELEASES`, so there is one place to change.

- Every PR that changes something a user will notice adds a plain-language bullet to the top entry in `app/releases.js`, or starts a new entry (`0.5`, `0.6`, ...) when it ships as a new release.
- Drop items from `BT.UPCOMING` when they ship.
- Tag the release in git with the same number (`v0.4`) after it is deployed.
- After an update, Today shows a one-time "New in x.y" card until it is dismissed or What's New is opened.

## Labels

`bug` / `change` / `roadmap` / `testing` for type, `area: <part>` for where, `priority: now` / `next` / `later`, `deploy pending` for merged-but-not-live, `blocked` for waiting on something.

## Working with Claude on this

"Log a bug: ...", "what's open?", "work on #12", "release 0.2". Claude reads the open issues before starting, works on a branch, opens the PR, waits for CI, and comments on the issue with what changed and what was checked. Merging is your call unless you say otherwise.

## Testing

- **CI on every push:** the app at two widths, zero console errors, no overflow. Red means it does not merge.
- **In Chrome, by hand:** the look and feel a script cannot check.
- **Sign-in locally:** serve `dist/` on `localhost` (an authorized domain) after `node tools/build.mjs`; Firebase preview channels cannot do Google sign-in.
- **On a real phone** before a release, for the photo picker, the Live face map, and anything else with touch.
