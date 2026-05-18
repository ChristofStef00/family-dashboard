#!/usr/bin/env bash
# Pull the latest code, rebuild, restart the kiosk service.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ git pull"
git pull --ff-only

echo "→ npm install"
npm install

echo "→ npm run build"
npm run build

echo "→ restart family-dashboard"
sudo systemctl restart family-dashboard

echo "✓ Updated and restarted. Tail logs with:  sudo journalctl -u family-dashboard -f"
