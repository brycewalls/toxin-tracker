#!/usr/bin/env bash
# Runs the Firestore rules tests and the end-to-end app tests against the local Firestore and Auth emulators.
#   bash tools/emulator_test.sh            # rules, then end to end (both encryption off and on)
#   bash tools/emulator_test.sh rules      # rules only
#   bash tools/emulator_test.sh e2e        # end to end only
# Needs Java (brew install openjdk; this adds the Homebrew path) and the Firebase CLI. Uses a demo- project, so
# nothing touches the live one, and its own throwaway example.invalid accounts: the real allowlist
# (firebase/allowlist.local) is never read, and firebase/.firestore.rules.deploy is never written.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)
what=${1:-all}
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
command -v java >/dev/null || { echo "Java not found. brew install openjdk" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Two approved test accounts; a third address (someone@example.invalid) is left off on purpose.
printf 'owner@example.invalid\nsecond@example.invalid\n' > "$tmp/allowlist"
node tools/rules.mjs --allowlist "$tmp/allowlist" --out "$tmp/firestore.rules"
cat > "$tmp/firebase.json" <<'JSON'
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "port": 8080 }, "auth": { "port": 9099 }, "ui": { "enabled": false }, "singleProjectMode": true }
}
JSON

cmds=()
if [ "$what" = all ] || [ "$what" = rules ]; then cmds+=("node '$root/tools/firestore_rules_test.mjs'"); fi
if [ "$what" = all ] || [ "$what" = e2e ]; then
  node tools/build.mjs --out "$tmp/dist-off" --encryption off --emulators >/dev/null
  node tools/build.mjs --out "$tmp/dist-on" --encryption on --emulators >/dev/null
  cmds+=("node '$root/tools/e2e_emulator_test.mjs' --off '$tmp/dist-off' --on '$tmp/dist-on'")
fi
script=$(IFS='&'; echo "${cmds[*]}" | sed 's/&/ \&\& /g')
cd "$tmp" # the emulators write their debug logs to the working directory
firebase emulators:exec --config "$tmp/firebase.json" --only firestore,auth --project demo-toxin-tracker "$script"
