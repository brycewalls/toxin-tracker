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
- `tools/build.mjs` wraps `app/index.html` in a full document, adds the Firebase SDK, `cloud.js` and `offline.js`, copies the scripts and `web/` (icons, manifest) into `dist/` (git-ignored), and generates `dist/sw.js` from `tools/sw.template.js`.
- **Offline (#52):** `dist/sw.js` precaches the app shell (page, scripts, icons, manifest, the Firebase SDK) under a cache named for a hash of the build, so the app opens with no connection. It never caches Firestore, Auth or `/__/` traffic. `app/offline.js` (hosted build only) registers it, shows 'Update ready' when a deploy lands, and shows the offline banner and 'Synced' toast. Firestore's offline cache holds the log and queues changes; `core.js` listens to the records collection live. Sign-out runs `BT_CLOUD.wipeLocal()`, which clears Firestore's local cache and the runtime caches.
- `firebase/firestore.rules` lets each signed-in person read and write only their own records.
- **Sign-in setup outside the repo:** the Google provider is on in Firebase Authentication, and the auto-created OAuth web client in Google Cloud Console lists `https://toxin-tracker-bw.web.app` as a JavaScript origin and `https://toxin-tracker-bw.web.app/__/auth/handler` as a redirect URI. Without the redirect URI, sign-in fails with `redirect_uri_mismatch` (#9). A custom domain needs both added the same way.
- `replica/` holds the PepPedia recon (screens, feature list) the UI was copied from.

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
