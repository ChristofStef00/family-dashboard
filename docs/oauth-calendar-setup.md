# Connecting a Google Calendar via OAuth

> The simpler path is **ICS subscriptions** (admin → Setup → iCal/ICS) — no
> Google Cloud setup, no tunnels. Use OAuth when you need faster updates
> (15-min sync vs the multi-hour lag on Google's published ICS feeds), the
> proper per-calendar color picker, or events to come through with their
> original timezone info baked in.

This walkthrough assumes the kiosk is already running on a Pi at
`janet-host.local` (or whatever hostname/IP you set), with the family
dashboard service active on port 3000.

## Why this is fiddly

Google's OAuth rules (since 2024) only accept these in **Authorized redirect URIs**:

- a real public domain (`example.com`)
- the literal word **`localhost`**

Raw IPs (`192.168.4.x`) and `.local` mDNS names are **rejected**. The kiosk
lives on your LAN, has neither a public domain nor an HTTPS cert, so the
only path is `localhost`. The trick is making `localhost` on your Mac
reach the Pi during the OAuth flow.

We do that with an **SSH port forward**. It's a one-time-per-connection
ritual; after the token lands on the Pi, the 15-min cron syncs run from
the Pi directly and need no tunnel.

---

## One-time Google Cloud Console setup

If you haven't already done this for a previous connection, set it up
once per Google account:

1. Open <https://console.cloud.google.com/> → create or pick a project
   (call it `family-dashboard`).
2. Top search bar → **OAuth consent screen** → choose **External** →
   fill the bare-minimum fields:
   - App name: `Family Dashboard`
   - User support email: your email
   - Developer contact: your email
   - Skip the **Scopes** screen (no scopes to declare here).
   - On the **Test users** page, **add your own Google account**. Until
     this app is "Published," only listed test users can connect.
3. Top search bar → **Credentials** → **+ Create credentials** →
   **OAuth client ID** → Application type **Web application** →
   Name `Family Dashboard`.
4. Under **Authorized redirect URIs**, add exactly one entry:
   ```
   http://localhost:3000/api/calendar/oauth/callback
   ```
   (No IPs, no `.local`, no trailing slash — Google rejects all of those.)
5. **Create**. A modal pops up with **Client ID** and **Client secret** —
   copy both.

## Add the credentials to the Pi

SSH into the Pi:

```bash
ssh pi@janet-host.local
```

Edit the server env:

```bash
TERM=xterm-256color nano ~/family-dashboard/server/.env
```

Make sure these three lines are present and accurate:

```
GOOGLE_CLIENT_ID=…paste-from-cloud-console…
GOOGLE_CLIENT_SECRET=…paste-from-cloud-console…
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/oauth/callback
```

Save (`Ctrl+O`, Enter, `Ctrl+X`). Restart:

```bash
sudo systemctl restart family-dashboard
```

You can `exit` the SSH session now — the rest happens from your Mac.

---

## The OAuth flow itself

### 1. Open the SSH tunnel from your Mac

In a fresh Mac terminal window (NOT inside an SSH-to-Pi session):

```bash
ssh -L 3000:localhost:3000 pi@janet-host.local
```

If `.local` doesn't resolve, fall back to the IP — find it via
`hostname -I | awk '{print $1}'` from any existing Pi session, then:

```bash
ssh -L 3000:localhost:3000 pi@192.168.4.x
```

You'll be logged into the Pi. **Leave this window open** — closing it
kills the tunnel mid-flow.

#### What's actually happening

`-L 3000:localhost:3000` tells SSH to listen on your Mac's port 3000 and
forward every byte through the encrypted SSH connection to the Pi's
port 3000. So:

- Browser hits `http://localhost:3000` on your Mac
- SSH on Mac picks it up → pipes through to the Pi
- Family-dashboard server on the Pi receives it as a normal localhost request
- Response retraces the path

Google sees a redirect URI of `localhost:3000` and is happy.

### 2. Open the admin via the tunnel

In Safari (or any browser on the Mac):

```
http://localhost:3000/admin
```

**Important:** `localhost`, not `janet-host.local`. The whole point is to
look like a localhost callback to Google.

Log in with your `ADMIN_PIN`.

### 3. Connect the calendar

Navigate to **Setup → Calendar**.

Two flavors:

- **Per-member** — under each kid's row, click **Connect**. Events from
  whatever calendars you pick will render in that kid's color.
- **Shared** — at the bottom there's a "Shared Google Calendars" section.
  Pick a color with the swatch, then **Connect shared**. Useful for
  household / school / holiday calendars not tied to a specific kid.

A Google consent screen opens in a new tab — approve. You'll land on a
small green **✓ Connected** page; close that tab.

### 4. Pick which calendars to sync

Back in the admin, the new connection appears in the list. Click
**Calendars** on it. You'll see every calendar that account has access to.
Tick only the ones you want pulled into the kiosk. **Save**.

> The "Steffensen Family" type calendars are usually under your account's
> calendar list, not under your primary calendar — unticking "primary" and
> ticking the actual calendar you care about is correct.

### 5. Force the first sync

Click **Sync now** at the top of the Calendar section. You should see
"Synced N accounts" within a few seconds. Open the kiosk URL on any
device to confirm events appear in the calendar grid.

### 6. Close the tunnel

Back in your Mac terminal, `Ctrl+C` then `exit`. The SSH session ends.
The OAuth tokens (including the refresh token) stay on the Pi forever
unless you click **Disconnect** in admin. The 15-minute cron picks up
fresh events without any tunnel involved.

---

## Day-to-day admin

Once OAuth is set up, the SSH tunnel is **only** needed to:

- Add another Google account (e.g., a spouse's calendar)
- Reconnect an account whose refresh token expired (rare; tokens last
  6 months of inactivity)

For everything else — editing kids, rewards, streaks, etc. — go to
`http://janet-host.local:3000/admin` directly. No tunnel needed.

---

## Troubleshooting

**`redirect_uri_mismatch` on Google's consent screen.** The redirect URI
in `server/.env` and the one in Google Cloud Console must match exactly,
character for character. Double-check both. Save Cloud Console changes;
they propagate within a few seconds.

**"Access blocked: This app's request is invalid."** Your Google account
isn't on the **Test users** list. Cloud Console → OAuth consent screen →
add yourself → retry.

**Safari fails to load `http://localhost:3000/admin`.** The SSH tunnel
isn't open. Confirm the SSH terminal still shows the Pi prompt; if it
disconnected (laptop sleep, network blip), re-run the `ssh -L` command.

**Synced N accounts but no events show on the kiosk.** Check the kiosk's
calendar view — give it ~30s to poll. If still empty, run:

```bash
sqlite3 ~/family-dashboard/server/data/family.db \
  "SELECT title, start_time, calendar_id FROM calendar_events
   WHERE calendar_id NOT LIKE 'ics:%' ORDER BY start_time LIMIT 10;"
```

If the table is empty, the selected calendars might be empty in your
sync window (30 days back to 90 days forward). Add a test event in
Google Calendar, click **Sync now** again.

**Events show but with the wrong color.** For owned connections, the
color follows the member's color (admin → Family → edit the kid's color).
For shared connections, change the color via the small swatch next to
each shared row in the Calendar admin section.

**Disconnecting.** In admin → Setup → Calendar, the **Disconnect** button
on each connection removes the token and (for owned connections) the
events tied to it. Shared connections cascade to events under that
specific token's calendar selection.

---

## ICS vs OAuth: when to use which

| Concern               | ICS                                   | OAuth                                  |
| --------------------- | ------------------------------------- | -------------------------------------- |
| Setup effort          | Paste a URL                           | Cloud Console + SSH tunnel             |
| Update speed          | Hours (Google's published-feed lag)   | 15 min (Google API)                    |
| Timezone reliability  | Sometimes flaky (depends on feed)     | Always correct (proper offsets)        |
| Per-calendar color    | One color per subscription            | One color per connection (multi-cal)   |
| Cross-account         | Each calendar = one URL               | One Google account = many calendars    |
| Works for             | Anything that emits .ics              | Only Google Calendar                   |

Mix freely — you can have ICS feeds for some sources and OAuth for others.
Events from both surface in the same calendar grid.
