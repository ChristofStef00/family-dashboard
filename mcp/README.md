# Family Dashboard — MCP server

An [MCP](https://modelcontextprotocol.io) server that exposes the Family
Dashboard (chores, points, calendar, rewards, kiosk messages) as tools for a
local LLM. Built for **Qwen3 in Open WebUI**, running on Unraid.

## How it fits together

Open WebUI doesn't speak MCP directly — it consumes **OpenAPI tool servers**.
The official bridge is [`mcpo`](https://github.com/open-webui/mcpo), which turns
an MCP server into an OpenAPI HTTP endpoint:

```
Open WebUI  ──OpenAPI/HTTP──►  mcpo  ──stdio──►  this MCP server  ──REST──►  Dashboard API (Pi)
   (Unraid)                  (Unraid, same container)                       (Raspberry Pi)
```

The Docker image bundles `mcpo` + this server, so you deploy one container on
Unraid (next to Open WebUI) and point it at the dashboard's LAN address.

## Tools

**Read**
- `list_family` — members with point balances, totals, and current reward goal
- `get_chores_today` — today's chores, points, assignees, who's done them
- `get_calendar` — upcoming events (`days_ahead`, default 7)
- `get_rewards` — rewards and their point costs
- `get_meals_week` — this week's planned meals
- `get_kiosk_messages` — messages currently on the kiosk

**Act**
- `post_kiosk_message` — show a message on the kiosk (`message`, `ttl_seconds`)
- `complete_chore` — mark a chore done for a member (awards points)
- `set_reward_goal` — set what a member is saving toward
- `redeem_reward` — spend points to redeem a reward
- `create_chore` — create a chore *(requires `ADMIN_PIN`)*

Member/reward/chore arguments accept **names or ids** (matched loosely), so the
LLM can say `complete_chore(member="Liam", chore="Make the bed")`.

## Deploy on Unraid

1. Copy the env template and edit it:
   ```bash
   cp .env.example .env
   # set DASHBOARD_URL to the Pi's LAN address, e.g. http://192.168.1.50:3000
   # set ADMIN_PIN (only needed for create_chore)
   # optionally set MCPO_API_KEY
   ```
2. Build and start:
   ```bash
   docker compose up -d --build
   ```
3. Verify the OpenAPI docs are up: open `http://<unraid-ip>:8000/docs`.

## Connect Open WebUI

1. In Open WebUI: **Settings → Tools → Add Tool Server** (OpenAPI).
2. URL: `http://<unraid-ip>:8000`
3. If you set `MCPO_API_KEY`, add it as the server's API key.
4. In a chat, enable the tools and ask Qwen3 things like:
   - "How many points does Liam have?"
   - "What chores are left today?"
   - "Put 'Dinner in 10 minutes' on the kiosk."
   - "Mark Ava's 'Make the bed' as done."

> Tip: enable **Native function calling** for the model in Open WebUI so Qwen3
> calls these tools directly.

## Run locally (without Docker)

```bash
npm install
DASHBOARD_URL=http://family-pi.local:3000 ADMIN_PIN=1234 npm start   # raw stdio MCP
# or inspect the tools interactively:
DASHBOARD_URL=http://family-pi.local:3000 npm run inspect
```

To expose it to Open WebUI without Docker, run mcpo yourself:
```bash
pip install mcpo
DASHBOARD_URL=http://family-pi.local:3000 ADMIN_PIN=1234 \
  mcpo --port 8000 -- node src/index.js
```

## Notes

- Auth: the server logs in with `ADMIN_PIN` to obtain a JWT for admin-gated
  writes, caching it and re-logging in on expiry. Read tools and most kiosk
  actions need no auth.
- This directory is **not** part of the dashboard's npm workspaces, so the Pi's
  `update.sh` (git pull → build → restart) never touches it. It's deployed
  independently on Unraid.
