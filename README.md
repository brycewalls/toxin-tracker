# Toxin Tracker

A Botox injection tracker modeled on PepPedia's UI, built first as a claude.ai artifact (https://claude.ai/artifact/XdzP7PhNk37YPSANBAehnZ) and headed for a Firebase web app later.

This README is the guide to how work on this project is tracked. Design notes and decisions stay in the project folder in Cowork.

- Issues (bugs, changes, roadmap): https://github.com/brycewalls/toxin-tracker/issues
- CI runs and page screenshots: https://github.com/brycewalls/toxin-tracker/actions
- Releases: https://github.com/brycewalls/toxin-tracker/releases
- Milestones (deadlines): https://github.com/brycewalls/toxin-tracker/milestones

## What is in here

- `app/index.html` is the artifact page body. `app/core.js` is the shared contract (data, storage, the `window.claude` runtime calls); `facemap.js`, `today.js`, `log.js`, `history.js` and `stock.js` are one tab each.
- `app/preview.html` loads `index.html` and runs its scripts in order, so the app opens outside claude.ai. This is the page CI tests; `index.html` itself is in `tools/smoke.ignore` because it is a fragment.
- `replica/` holds the PepPedia recon (screens, feature list) the UI was copied from.

## The loop

1. **It starts as an issue.** A bug, a change, a roadmap idea. Open one with the matching template, or tell Claude and it opens one.
2. **Work happens on a branch named for the issue:** `fix/12-photo-picker`, `feat/20-reminders`.
3. **A pull request brings it back to `main`** with `Closes #12` in the body. CI opens the app at desktop and phone widths on the PR.
4. **Merging to `main` is the build.** CI runs again and keeps screenshots.
5. **A tag makes a release** when a version is worth marking: `git tag v0.1 && git push origin main --tags`. CI attaches a zip of the site.
6. **Deploy** (today, republish the artifact), then clear the `deploy pending` label. If it broke, open a bug that links the release.

## Labels

`bug` / `change` / `roadmap` / `testing` for type, `area: <part>` for where, `priority: now` / `next` / `later`, `deploy pending` for merged-but-not-live, `blocked` for waiting on something.

## Working with Claude on this

"Log a bug: ...", "what's open?", "work on #12", "release 0.2". Claude reads the open issues before starting, works on a branch, opens the PR, waits for CI, and comments on the issue with what changed and what was checked. Merging is your call unless you say otherwise.

## Testing

- **CI on every push:** the app at two widths, zero console errors, no overflow. Red means it does not merge.
- **In Chrome, by hand:** the look and feel a script cannot check.
- **On a real phone** before a release, for the photo picker, the Live face map, and anything else with touch.
