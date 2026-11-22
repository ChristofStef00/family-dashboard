#!/usr/bin/env bash
# Pull the latest code, rebuild, and refresh whatever actually needs it.
set -euo pipefail

cd "$(dirname "$0")/.."

BEFORE=$(git rev-parse HEAD)

echo "→ git pull"
git pull --ff-only

echo "→ npm install"
npm install

echo "→ npm run build"
npm run build

AFTER=$(git rev-parse HEAD)

# Only the Node service needs root, and only when server-side code actually
# changed — Express serves client/dist and admin/dist off disk per request, so
# a front-end-only update goes live the moment the build finishes. Skipping the
# restart when nothing server-side moved keeps the common case sudo-free.
if [ "$BEFORE" = "$AFTER" ]; then
  SERVER_CHANGED=""
else
  SERVER_CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" -- server/ package.json package-lock.json)
fi

if [ -n "$SERVER_CHANGED" ]; then
  echo "→ server code changed, restarting family-dashboard (needs sudo)"
  sudo systemctl restart family-dashboard
else
  echo "→ no server-side changes, leaving the service running"
fi

# Reload the browser so the new bundle is actually on screen. The kiosk runs as
# a systemd --user unit (see scripts/setup-pi.sh), so this needs no sudo and
# cannot leave a black screen: Restart=always brings it back either way.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if systemctl --user list-unit-files family-dashboard-kiosk.service >/dev/null 2>&1; then
  echo "→ reloading kiosk browser"
  systemctl --user restart family-dashboard-kiosk.service \
    && echo "  kiosk restarted" \
    || echo "  ! kiosk restart failed — press F5 on the display, or check: systemctl --user status family-dashboard-kiosk"
else
  echo "→ kiosk unit not installed; press F5 on the display to pick up the new build"
fi

echo "✓ Updated. Tail logs with:  sudo journalctl -u family-dashboard -f"
