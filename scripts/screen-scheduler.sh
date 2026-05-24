#!/usr/bin/env bash
# Family Dashboard — kiosk screen scheduler.
#
# Polls the server's /api/settings every minute and toggles HDMI output
# via wlr-randr to match the configured nightly off-window:
#
#   settings.screen_off_start   "HH:MM"   default 23:00
#   settings.screen_on_time     "HH:MM"   default 07:00
#   settings.screen_schedule_enabled  bool  default true
#
# Must be launched from the labwc autostart so it inherits the right
# WAYLAND_DISPLAY / XDG_RUNTIME_DIR — `wlr-randr` needs a live Wayland
# session to talk to. The setup-pi.sh script wires this up automatically;
# for existing installs the README shows the one-line add to
# ~/.config/labwc/autostart.

set -u

API="${API:-http://localhost:3000/api/settings}"
OUTPUT="${OUTPUT:-HDMI-A-1}"
POLL_SECS="${POLL_SECS:-60}"

# Return 0 (true) if "now" falls inside the off window [start, end).
# Handles wrap-around: when start > end (e.g. 23:00 → 07:00) the window
# spans midnight.
in_off_window() {  # $1=start HH:MM  $2=end HH:MM  $3=now HH:MM
  local s="$1" e="$2" n="$3"
  if [[ "$s" < "$e" ]]; then
    [[ "$n" > "$s" || "$n" == "$s" ]] && [[ "$n" < "$e" ]]
  else
    [[ "$n" > "$s" || "$n" == "$s" || "$n" < "$e" ]]
  fi
}

state=""   # "off" or "on" — only call wlr-randr when state changes

while true; do
  json=$(curl -sf "$API" 2>/dev/null) || { sleep "$POLL_SECS"; continue; }
  # Parse three values out via python (no jq dependency).
  read enabled start end <<<"$(
    printf '%s' "$json" | python3 -c '
import sys, json
d = json.load(sys.stdin)
v = d.get("screen_schedule_enabled", True)
# Settings may come back as bool or stringified — normalize.
if isinstance(v, str):
    v = v.lower() in ("true", "1", "yes")
print(v, d.get("screen_off_start", "23:00"), d.get("screen_on_time", "07:00"))
' 2>/dev/null
  )"
  : "${enabled:=True}" "${start:=23:00}" "${end:=07:00}"

  now=$(date +%H:%M)
  if [[ "$enabled" == "True" ]] && in_off_window "$start" "$end" "$now"; then
    want="off"
  else
    want="on"
  fi

  if [[ "$want" != "$state" ]]; then
    if wlr-randr --output "$OUTPUT" --"$want" 2>/dev/null; then
      state="$want"
      echo "[$(date -Iseconds)] screen-scheduler: $OUTPUT → $want (window $start–$end, now $now)"
    fi
  fi

  sleep "$POLL_SECS"
done
