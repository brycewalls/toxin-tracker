#!/usr/bin/env bash
# Deploys the hosted web app to https://toxin-tracker-bw.web.app from this Mac.
# Builds dist/ (hosting predeploy runs tools/build.mjs) and publishes Firestore rules.
# Needs the Firebase CLI logged in as Bryce. Deploy from an up-to-date main.
set -euo pipefail
cd "$(dirname "$0")/.."
branch=$(git branch --show-current)
if [ "$branch" != "main" ] && [ "${1:-}" != "--any-branch" ]; then
  echo "On '$branch', not main. Merge first, or pass --any-branch to deploy it anyway." >&2
  exit 1
fi
firebase deploy --only hosting,firestore:rules --project toxin-tracker-bw
echo "Live: https://toxin-tracker-bw.web.app"
