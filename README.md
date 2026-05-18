# Family Dashboard

A full-stack family kiosk for a Raspberry Pi, plus a separate admin UI on the same host.

- **Display** (`client/`) — React + Vite, Skylight Calendar-style aesthetic. Calendar, meals, points, rewards, streaks. Touch-friendly.
- **Admin** (`admin/`) — React + Vite. PIN-gated CRUD for family members, routines, chores, rewards, streaks, vacations, location, calendar accounts, and Mealie integration. Activity log across everything.
- **Server** (`server/`) — Express + better-sqlite3. ES modules. Serves the API + both built front-ends from a single Node process on port 3000.

```
display kiosk     admin (LAN browser)
  http://pi.local      http://pi.local/admin
            \         /
             \       /
        Node + SQLite (single process, :3000)
```

## Quick start (development)

Requires Node 20+.

```bash
npm install
npm run dev   # starts server (3000), client (5173), admin (5174) in parallel
```

Re-seed sample data:

```bash
cd server && npm run seed
```

First-time setup:

1. `cp server/.env.example server/.env` and edit `ADMIN_PIN` + `JWT_SECRET`.
2. (Optional) Add Google OAuth credentials for calendar integration.
3. (Optional) Add Mealie URL + token for meal-plan integration.

The admin UI defaults to PIN `1234`.

## Production (single host)

```bash
npm install
npm run build   # builds client/dist and admin/dist
npm start       # runs the server, which serves both built UIs + the API
```

Server config lives in `server/.env`. Database lives at `server/data/family.db` (auto-created on first run; migrations are idempotent).

## Raspberry Pi kiosk

One-shot deploy:

```bash
# On the Pi:
git clone https://github.com/<you>/family-dashboard.git
cd family-dashboard
./scripts/setup-pi.sh
```

The script installs Node 20, builds the app, registers a systemd service, and configures Chromium to autostart in kiosk mode. See `scripts/setup-pi.sh` for what it does and how to customize.

To update later:

```bash
cd ~/family-dashboard
./scripts/update.sh
```

## Architecture cheat-sheet

- **Points economy** (`docs/` + `server/src/services/scoring.js`): chores + routines + streaks credit `chore_completions` / `routine_completions` / `streak_awards`. Rewards spend out of the same balance via `reward_redemptions`.
- **Streaks** (`server/src/routes/streaks.js`): four kinds — `chore`, `routine`, `all_chores`, `all_routines`. Event-based counting, vacation-aware, bonus points only.
- **Vacations** (`server/src/routes/vacations.js`): date ranges per member that pause streaks.
- **Activity log** (`server/src/routes/activity.js`): unified read of completions, awards, redemptions, fulfillments. Newest first.
- **Calendar** (`server/src/routes/calendar.js`): Google OAuth + 15-min sync cron.
- **Meals** (`server/src/services/mealie.js`): Mealie meal plan + recipe pool, hourly sync.

## Repo layout

```
client/   Kiosk display (React + Vite, port 5173 in dev)
admin/    Admin UI (React + Vite, port 5174 in dev)
server/   Express API + SQLite (port 3000)
docs/     Long-form docs (Home Assistant integration etc.)
ha-card/  (TODO) Home Assistant Lovelace card
scripts/  Pi setup + update scripts
```
