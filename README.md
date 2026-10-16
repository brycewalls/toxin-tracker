# Toxin Tracker

A Botox injection tracker modeled on PepPedia's UI.

- **Web app:** https://toxin-tracker-bw.web.app (also served at https://toxin-tracker-bw.firebaseapp.com), Firebase project `toxin-tracker-bw` (Spark plan), Google sign-in. This is the only deploy target. The claude.ai artifact prototype is retired (#62) and is not republished.

This README is the guide to how work on this project is tracked. Design notes and decisions stay in the project folder in Cowork.

- Issues (bugs, changes, roadmap): https://github.com/brycewalls/toxin-tracker/issues
- CI runs and page screenshots: https://github.com/brycewalls/toxin-tracker/actions
- Releases: https://github.com/brycewalls/toxin-tracker/releases
- Milestones (deadlines): https://github.com/brycewalls/toxin-tracker/milestones

## What is in here

- `app/index.html` is the page body: the stylesheet, the app shell and the tab bar, then one `<script src>` per file. `app/core.js` is the shared contract (data, storage, router); `facemap.js`, `today.js`, `log.js`, `history.js`, `stock.js` and `academy.js` are one tab each, and `app/boot.js` runs last (tab icons, tab bar, first render, countdowns). There is no inline script or inline event handler anywhere (see Security headers).
- `app/preview.html` loads `index.html` and runs its scripts in order, with local sample data and no sign-in. This is the page CI tests; `index.html` itself is in `tools/smoke.ignore` because it is a fragment. `core.js` still falls back to localStorage (and the old `window.claude` db, if present) when `window.BT_CLOUD` is missing; only the preview uses that path.
- `app/cloud.js` is the Firebase backend, loaded only by the hosted build: the Google sign-in screen, then Firestore `users/{uid}/records/{kind__id}` (one document per record, `{kind, rec, updatedAt, base, by, aid}`), `users/{uid}/audit/{autoId}` and `users/{uid}/meta/keys`. `core.js` uses it whenever `window.BT_CLOUD` exists. Photos are stored as compressed JPEGs inside their records, because Firebase Storage needs the Blaze plan.
- `tools/build.mjs` wraps `app/index.html` in a full document, adds the Firebase SDK, `cloud.js` and `offline.js`, copies the scripts, `web/` (icons, manifest) and the vendored third-party files (see Vendored code) into `dist/` (git-ignored), and generates `dist/sw.js` from `tools/sw.template.js`.
- **Offline (#52):** `dist/sw.js` precaches the app shell (page, scripts, icons, manifest, the vendored Firebase SDK) under a cache named for a hash of the build, so the app opens with no connection. It never caches Firestore, Auth or `/__/` traffic. `app/offline.js` (hosted build only) registers it, shows 'Update ready' when a deploy lands, and shows the offline banner and 'Synced' toast. Firestore's offline cache holds the log and queues changes; `core.js` listens to the records collection live. Sign-out runs `BT_CLOUD.wipeLocal()`, which clears Firestore's local cache and the runtime caches. Firestore's offline cache opens only after sign-in.
- **Privacy (#53, #54):** no account address ships to Hosting. Who may use the app lives only in `firebase/firestore.rules` (deployed to Firestore, never served); after sign-in `cloud.js` reads one of the person's own records from the server, and `permission-denied` turns the account away with 'This app is private'. An approved account with no records passes, and offline the check is skipped (the rules still guard the server). Sign-out, the idle timeout and a denied account all run one `endSession()`: Auth sign-out, then `BT_CLOUD.wipeLocal()` (terminate Firestore, `clearPersistence()`, delete every cache but the `tt-shell-*` app shell, clear the in-memory log), then reload. The idle timeout is off by default ('Never on this device', #105) and gives a 60-second 'Still there?' warning when on; Settings sets 15, 30 or 60 minutes or 'Never on this device', stored in this device's localStorage. It compares a stored last-active time on return, since iOS freezes timers in the background. Exports need a Google sign-in from the last 10 minutes (`BT_CLOUD.requireRecentAuth()`); Delete all my data uses the same helper with 4 minutes.
- **Botox Academy (#69):** `app/academy.js` is the Learn tab: courses, lessons, quizzes, a resources library, achievements and a certificate. The content is `research/2026-10-15_botox-academy-content.json` (sources in `research/2026-10-15_botox-academy-research.md`); `tools/build.mjs` writes it to `dist/academy.json`, which the service worker precaches with the shell. `app/preview.html` reads the research file directly. Progress is `settings.academy` (`lessons`, `achievements`, `certificate`, `liveAt`), so it syncs like any setting. Edit lessons in the JSON, not in the script, and keep the safety framing: education about how qualified injectors treat, no self-injection, sourcing or reconstitution instructions.
- **Saves, audit and stale edits (#57, #58):** each change is one `WriteBatch`: the record (with `updatedAt` from `serverTimestamp()`, `base` = the server `updatedAt` it was built on, `by` = a random id for this browser, `aid` = its audit entry) plus an append-only `users/{uid}/audit/{autoId}` entry `{kind, recordId, action, at}`, never record contents. Commits are not awaited (offline stays silent), but each is tracked: a refusal shows an error and a Not saved bar with Retry and Discard, and the record stays on screen. The rules refuse a record update built on an older version than another device's write; a device can always build on its own last write, so offline edits on one phone never block each other. Settings merge field by field, so they have no stale check. Replacing a photo writes the new one and deletes the old one in the same commit.
- **End-to-end encryption (#66), behind a flag:** `ENCRYPTION` in `app/cloud.js` has been `'on'` since 0.16 (2026-10-16); 0.15 shipped it `'off'` (see Deploy: encryption rollout). On, a record's `rec`, photos included, is sealed on the phone before it is written: `{v: 1, iv, ct}`, AES-GCM with a 256-bit data key and the document id as additional data. Settings are sealed leaf by leaf instead (`'tt-e1:<iv>:<ct>'`, bound to the field's path), so the map keys (field names, lesson and achievement ids) stay plain and two devices' field-level merges still combine. The data key is stored only wrapped, in `users/{uid}/meta/keys`: once with the person's passphrase (PBKDF2-SHA256, 600,000 iterations, random 16-byte salt) and once with a recovery key (24 random characters, shown once at setup). The passphrase and recovery key never leave the phone. A first run shows setup; a new device shows Unlock (passphrase or recovery key, wrong tries rate-limited on the device, works offline if the keys document is in the cache). The unlocked key is kept as a non-extractable `CryptoKey` in this device's IndexedDB (`tt-keys`), and `wipeLocal()` deletes it. Records still in plain form are encrypted in place after the first unlock, and any that turn up later (from a device on an older build). Settings can change the passphrase or make a new recovery key (both rewrap the same data key). With the flag off, an account that already has keys is still unlocked as usual, so either build reads an encrypted log. **Lose both the passphrase and the recovery key and nobody can read the log, including the project owner.** The owner and Google still see account emails, uids, record counts, kinds, timestamps and settings field names.
- **Delete and export (#59):** Settings, Delete all my data asks for DELETE typed out and a Google sign-in from the last 4 minutes, waits for unsynced changes, then deletes every record, photo, audit entry and the keys on the server, wipes this device and deletes the Auth account. Export everything downloads a JSON file of every record, decrypted, photos included; Export treatments downloads the CSV (cells starting with = + - @ get an apostrophe). Both are file downloads, never the clipboard.
- **Settings sync (#83):** settings are one document (`settings__settings`) that the Academy, What's New, nudges and Settings all share, so `core.js` writes only the fields a save changed (`set({kind, rec: {changed leaves}}, {merge: true})`, `FieldValue.delete()` for a removed key), diffing nested maps key by key: completing a lesson writes `rec.academy.lessons.<id>` and two devices combine. Settings writes wait for the first full server snapshot after sign-in (a cache snapshot counts once this device has had one since its last wipe), then apply merged on top of the server's values. Sign-out waits up to 5 seconds for unsynced changes and asks before discarding any; an idle timeout with unsynced changes locks the app behind the sign-in screen and wipes only once they reach the server.
- **Sync tests:** `node tools/sync_test.mjs` builds the hosted app with encryption off into `.sync-dist/` and runs it in Playwright against `tools/fake-firebase.js`, a fake Firestore and Auth with server latency, an offline cache and a write queue, never the live project. It covers sign-out and sign-in with a slow first snapshot, two devices saving at once, sign-out and the idle timeout online and offline, and a relaunch while an idle sign-out waits. `--dist <dir>` runs it against another build (for example main's, to see the old behavior).
- `firebase/firestore.rules` is a template: `tools/rules.mjs` fills `__ALLOWED_EMAILS__` from the git-ignored `firebase/allowlist.local` at deploy (#94). It lets each approved, signed-in person read and write only their own data, and checks every record's shape, that the document id matches the kind, that every new-format write carries an audit entry from the same commit, the ciphertext size per kind, and the keys document's shape; audit entries cannot be changed or deleted except during Delete all my data (#60). App Check has a client path in `cloud.js` behind `APP_CHECK_SITE_KEY`, off until a reCAPTCHA v3 key is registered (it also needs the app-check compat SDK vendored). `plainAllowed()` keeps app 0.14's `{kind, rec}` writes and unencrypted records working during the rollout. Keep addresses out of its comments.
- **Emulator tests:** `bash tools/emulator_test.sh` (Java and the Firebase CLI) builds the rules with throwaway `example.invalid` accounts, starts the Firestore and Auth emulators for the `demo-toxin-tracker` project, and runs `tools/firestore_rules_test.mjs` (every rule, in both rollout modes) and `tools/e2e_emulator_test.mjs` (the app built with `--emulators`, encryption off and on, in headless Chromium with fake Google accounts). `rules` or `e2e` as an argument runs one of them. The real allowlist and the live project are never touched.
- **Sign-in setup outside the repo:** the Google provider is on in Firebase Authentication, and the auto-created OAuth web client in Google Cloud Console lists `https://toxin-tracker-bw.web.app` as a JavaScript origin and `https://toxin-tracker-bw.web.app/__/auth/handler` as a redirect URI. Without the redirect URI, sign-in fails with `redirect_uri_mismatch` (#9). A custom domain needs both added the same way.
- `replica/` holds the PepPedia recon (screens, feature list) the UI was copied from.

## Privacy

The app holds health records for two people, so the setup keeps them on as few machines and services as possible.

- **Two accounts, enforced by the server.** `firebase/firestore.rules` lets in only two approved, verified Google accounts, and each one reads and writes only `users/{their uid}/records`. The list lives only in the git-ignored `firebase/allowlist.local` and the rules built from it, which deploy to Firestore and are never served; no address ships in the hosted files or the public repo (#53, #94). Any other account signs in to Google but gets 'This app is private' and nothing from the database.
- **No analytics, no third-party trackers.** There is no Google Analytics, no measurement ID, no error reporting service and no font or script CDN. The only outside hosts the page talks to are Google sign-in and Firestore (see the CSP below). Nothing logs record contents to the console.
- **Wipe on sign-out and idle.** Sign-out, the idle timeout (off by default, set in Settings) and a denied account all run `endSession()`: Auth sign-out, then `BT_CLOUD.wipeLocal()` clears Firestore's offline cache, every runtime cache except the app shell, and the in-memory log, then the page reloads (#54). The service worker never stores records, photos or account data.
- **Vendored code with hashes.** Every third-party file the app runs is served from our own host and checked against its SHA-256 in `tools/vendor.lock.json` at build time, and the Firebase scripts carry SRI (see Vendored code, #55). The one exception is Google's sign-in loader (`apis.google.com/js/api.js`), which the Firebase Auth SDK fetches itself for the popup and redirect flows; it cannot be vendored.
- **Backups: none on Spark.** The Spark plan has no scheduled Firestore exports or point-in-time recovery, and this project does not run any. Export everything (JSON, photos included) in Settings is the backup: export after a batch of changes and keep the file somewhere private. It is not encrypted. Export asks for a Google sign-in from the last 10 minutes.

## Security headers

`firebase.json` sends these on every page and file of both hosting domains (#56). Firebase's own `/__/` paths (the Auth handler and iframe) are left out, so `frame-ancestors` and `X-Frame-Options` never block the sign-in iframe.

| Header | Value |
|---|---|
| Content-Security-Policy | see below |
| X-Frame-Options | `DENY` |
| Permissions-Policy | `camera=(self), microphone=(), geolocation=(), payment=()` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| X-Content-Type-Options | `nosniff` |

The Content-Security-Policy, one directive per line:

```
default-src 'self'
script-src 'self' 'wasm-unsafe-eval' https://apis.google.com
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
connect-src 'self' blob: https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com
frame-src https://toxin-tracker-bw.firebaseapp.com https://toxin-tracker-bw.web.app https://accounts.google.com
worker-src 'self' blob:
media-src 'self' blob:
object-src 'none'
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
```

Why each exception is there:

- `script-src 'wasm-unsafe-eval'`: MediaPipe compiles its WebAssembly face tracker for the Live view. It allows wasm compilation only, not `eval`.
- `script-src https://apis.google.com`: Firebase Auth loads Google's gapi loader for the sign-in iframe, eagerly on Safari and iOS and on the first sign-in elsewhere. Without it, sign-in fails on iPhone.
- `style-src 'unsafe-inline'`: the stylesheet is the `<style>` block in `index.html`, `cloud.js` and `offline.js` add their own `<style>` elements, and the screens use `style=""` attributes for computed values (bar widths, colors, positions). Inline styles cannot run code, and scripts stay strict, so this is the usual trade.
- `connect-src blob:`: `app/livecam.js` checks the wasm binary's SHA-256, then hands it to MediaPipe as a `blob:` URL, which MediaPipe fetches.
- `connect-src` Google hosts: Firestore (WebChannel and long-polling both use `firestore.googleapis.com`), Auth (`identitytoolkit`, `securetoken`), and `www.googleapis.com` for Auth's project config lookup.
- `frame-src`: the Auth iframe runs on the auth domain, which is whichever hosting domain the app was opened on (`cloud.js`), and `accounts.google.com` covers Google's own frames.
- `img-src data: blob:` and `media-src blob:`: icons, photo previews, the certificate image and the camera stream.

No inline `<script>` and no inline event handler (`onclick=` and the like) exist in `app/`; keep it that way, or the CSP blocks them. Use `addEventListener` or a delegated listener, as `BT.navHeader`'s `[data-nav-back]` does.

**How it was tested:** a local static server applied the `firebase.json` headers to `dist/` and Playwright checked Chromium and WebKit for zero CSP violations on the sign-in gate (including the Auth iframe, and the Google sign-in popup in Chromium), every tab and pushed screen with the cloud stubbed, the Live view with a fake camera through to tracking, and service worker registration plus an offline reload.

**After every deploy that touches headers:**

1. `curl -sI https://toxin-tracker-bw.web.app/ | grep -iE 'content-security|frame|permissions|strict|referrer|nosniff'` and the same for `https://toxin-tracker-bw.firebaseapp.com/`. All six headers should show on both.
2. `curl -sI https://toxin-tracker-bw.web.app/__/auth/iframe` should show no `X-Frame-Options` and no `frame-ancestors`.
3. A real Google sign-in on the iPhone (Safari and the home-screen app) and on a desktop browser, with the console open on desktop: no 'Refused to' or Content Security Policy messages. Then open Live, and go offline once.

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
6. **Deploy** from an up-to-date `main` with `bash tools/deploy.sh` (hosting plus Firestore rules, needs the Firebase CLI logged in on this Mac). Then run the post-deploy checks under Security headers and clear the `deploy pending` label. If it broke, open a bug that links the release.

## Deploy: encryption rollout (#66, PR #79)

Encryption ships in two deploys so nobody's saves break and both people have a backup before their log is encrypted.

| Rules deployed | App 0.14 (before this) | App 0.15, `ENCRYPTION = 'off'` (step 1) | App 0.16, `ENCRYPTION = 'on'` (step 2) |
|---|---|---|---|
| main's rules before this change | works | every save refused (new fields, audit) | every save refused |
| these rules, `plainAllowed()` true | works (`{kind, rec}` accepted, no audit) | works | works |
| these rules, `plainAllowed()` false (step 3) | every save refused | plain saves refused | works |

An encrypted account also needs every device on 0.15 or later before step 2: 0.14 cannot read sealed records or sealed settings. 0.15 and 0.16 read both forms, and either one asks to unlock an account that has keys.

1. **Step 1:** merge this with `ENCRYPTION = 'off'`, then `bash tools/deploy.sh` (rules and hosting together). On each phone, open the app and tap Reload on Update ready, check Settings shows 0.15, then Settings, Export everything, and keep the file somewhere private.
2. **Step 2:** once both phones show 0.15 and both have an export, a PR sets `ENCRYPTION = 'on'` and starts a 0.16 release entry; merge, `bash tools/deploy.sh`. Each person's next open shows Lock your log: choose a passphrase (at least 10 characters), save the recovery key, Finish. The records are encrypted in place right after. Other devices ask for the passphrase once.
3. **Step 3 (optional, later):** once both accounts show only ciphertext in the Firestore console, a PR sets `plainAllowed()` to `false` in the rules; deploy. From then on the server refuses anything not encrypted.

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
- **Rules and end to end on the emulators:** `bash tools/emulator_test.sh` (see What is in here). Needs `brew install openjdk`; the script adds its path.
- **Sign-in locally:** serve `dist/` on `localhost` (an authorized domain) after `node tools/build.mjs`; Firebase preview channels cannot do Google sign-in.
- **On a real phone** before a release, for the photo picker, the Live face map, and anything else with touch.
