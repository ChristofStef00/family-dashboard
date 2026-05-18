#!/usr/bin/env bash
# Family Dashboard — Raspberry Pi kiosk setup
#
# Idempotent: re-running is safe. Tested on Pi OS Trixie (Wayland default)
# and Bookworm (X11). Writes kiosk autostart files for whichever
# compositor is installed:
#   • Wayfire (Pi 4 / Trixie Wayland)  → ~/.config/wayfire.ini
#   • labwc   (Pi 5 / Trixie Wayland)  → ~/.config/labwc/autostart
#   • LXDE-pi (X11 / Bookworm + after raspi-config switch to X11)
#                                      → ~/.config/lxsession/LXDE-pi/autostart
#   • XDG fallback                     → ~/.config/autostart/*.desktop
#
# What this does:
#   1. Installs Node.js 20 + build tools (better-sqlite3 needs them)
#   2. Installs Chromium + unclutter
#   3. Installs npm deps + builds client/dist + admin/dist
#   4. Creates server/.env from the template if it's missing
#   5. Registers a systemd service so the API starts on boot
#   6. Writes kiosk autostart entries for every detected compositor
#   7. Disables screen blanking / DPMS where possible

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
SERVICE_NAME="family-dashboard"
SERVER_URL="http://localhost:3000"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m  %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m  %s\n' "$*"; }

if [ "${EUID}" -eq 0 ]; then
  warn "Run this as your normal user (not root). It will sudo when needed."
  exit 1
fi

# ───── 1. Node + build deps ─────────────────────────────────────────────
step "Installing Node.js 20 and build tools"
need_node=1
if command -v node >/dev/null; then
  major=$(node -v | sed 's/^v//' | cut -d. -f1)
  [ "$major" -ge 20 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
# Pi OS Trixie ships Chromium as the `chromium` package; older Bookworm
# images still call it `chromium-browser`. Pick whichever apt knows about.
if apt-cache show chromium >/dev/null 2>&1; then
  CHROMIUM_PKG=chromium
elif apt-cache show chromium-browser >/dev/null 2>&1; then
  CHROMIUM_PKG=chromium-browser
else
  warn "Couldn't find a chromium package via apt — install one manually."
  CHROMIUM_PKG=""
fi
sudo apt-get install -y --no-install-recommends \
  build-essential python3 git \
  ${CHROMIUM_PKG} unclutter
ok "Node $(node -v)"

# ───── 2. Install + build ────────────────────────────────────────────────
step "Installing dependencies and building"
cd "$APP_DIR"
npm install
npm run build
ok "Built client/dist and admin/dist"

# ───── 3. .env ──────────────────────────────────────────────────────────
step "Configuring environment"
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  # Generate a real JWT secret on first install
  RAND=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${RAND}|" server/.env
  warn "server/.env created from template. Edit ADMIN_PIN and (optionally) Google/Mealie creds before going live."
  warn "  ${APP_DIR}/server/.env"
fi
ok "Environment configured"

# ───── 4. systemd service ───────────────────────────────────────────────
step "Installing systemd service"
sudo tee /etc/systemd/system/${SERVICE_NAME}.service >/dev/null <<EOF
[Unit]
Description=Family Dashboard server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}
sleep 2
if sudo systemctl is-active --quiet ${SERVICE_NAME}; then
  ok "Server is running at ${SERVER_URL}"
else
  warn "Service failed to start. Check:  sudo journalctl -u ${SERVICE_NAME} -n 50 --no-pager"
fi

# ───── 5. Chromium kiosk autostart ──────────────────────────────────────
step "Configuring Chromium kiosk autostart"
# Detect chromium binary (Trixie ships `chromium`; older Bookworm ships `chromium-browser`).
CHROMIUM_BIN=$(command -v chromium-browser || command -v chromium || echo chromium)
CHROMIUM_ARGS="--kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 --disable-pinch --overscroll-history-navigation=0 --no-first-run --start-fullscreen ${SERVER_URL}"
KIOSK_TAG="family-dashboard-kiosk"

# ─── X11 / LXDE-pi (legacy Bookworm + Trixie-after-raspi-config-X11) ────
LXDE_AUTOSTART="${HOME}/.config/lxsession/LXDE-pi/autostart"
mkdir -p "$(dirname "$LXDE_AUTOSTART")"
cat > "$LXDE_AUTOSTART" <<EOF
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
@${CHROMIUM_BIN} ${CHROMIUM_ARGS}
EOF
ok "X11 autostart  → ${LXDE_AUTOSTART}"

# ─── wayfire (Pi 4 default on Trixie Wayland) ───────────────────────────
if command -v wayfire >/dev/null 2>&1; then
  WAYFIRE_INI="${HOME}/.config/wayfire.ini"
  mkdir -p "$(dirname "$WAYFIRE_INI")"
  touch "$WAYFIRE_INI"
  # Ensure [autostart] section exists, then idempotently add our entry.
  grep -q '^\[autostart\]' "$WAYFIRE_INI" || printf '\n[autostart]\n' >> "$WAYFIRE_INI"
  sed -i "/^${KIOSK_TAG}[[:space:]]*=/d" "$WAYFIRE_INI"
  sed -i "/^\[autostart\]/a ${KIOSK_TAG} = ${CHROMIUM_BIN} ${CHROMIUM_ARGS}" "$WAYFIRE_INI"
  ok "Wayfire autostart → ${WAYFIRE_INI}"
fi

# ─── labwc (Pi 5 default on Trixie Wayland) ─────────────────────────────
if command -v labwc >/dev/null 2>&1; then
  LABWC_AUTO="${HOME}/.config/labwc/autostart"
  mkdir -p "$(dirname "$LABWC_AUTO")"
  if [ -f "$LABWC_AUTO" ]; then
    # Strip any prior kiosk line, keep rest of file intact.
    sed -i "/${KIOSK_TAG}/d" "$LABWC_AUTO"
  else
    echo '#!/bin/sh' > "$LABWC_AUTO"
  fi
  echo "${CHROMIUM_BIN} ${CHROMIUM_ARGS} &  # ${KIOSK_TAG}" >> "$LABWC_AUTO"
  chmod +x "$LABWC_AUTO"
  ok "labwc autostart  → ${LABWC_AUTO}"
fi

# ─── XDG fallback (works for any compliant session) ─────────────────────
XDG_AUTOSTART="${HOME}/.config/autostart/${KIOSK_TAG}.desktop"
mkdir -p "$(dirname "$XDG_AUTOSTART")"
cat > "$XDG_AUTOSTART" <<EOF
[Desktop Entry]
Type=Application
Name=Family Dashboard Kiosk
Exec=${CHROMIUM_BIN} ${CHROMIUM_ARGS}
X-GNOME-Autostart-enabled=true
EOF
ok "XDG autostart  → ${XDG_AUTOSTART}"

# ───── 6. Disable screen blanking (belt + braces) ───────────────────────
step "Disabling screen blanking via raspi-config"
sudo raspi-config nonint do_blanking 1 >/dev/null 2>&1 \
  && ok "Screen blanking disabled" \
  || warn "raspi-config blanking off failed (non-fatal; @xset lines above also disable it)"

# ───── Done ─────────────────────────────────────────────────────────────
echo
ok "Setup complete!"
echo
echo "Next steps:"
echo "  1. Edit server/.env if you haven't yet:  nano ${APP_DIR}/server/.env"
echo "  2. Reboot to launch the kiosk:           sudo reboot"
echo "  3. Tail logs:                            sudo journalctl -u ${SERVICE_NAME} -f"
echo "  4. Update later:                         cd ${APP_DIR} && ./scripts/update.sh"
echo
echo "From another device on the LAN:"
echo "  Admin:    http://$(hostname -I | awk '{print $1}'):3000/admin"
echo "  Display:  http://$(hostname -I | awk '{print $1}'):3000"
