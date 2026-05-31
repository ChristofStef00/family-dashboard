import { Router } from 'express';
import { google } from 'googleapis';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

function oauthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/oauth/callback'
  );
}

// The OAuth redirect must come back to *this* server at the same host the admin
// reached it on (the admin UI is served by this server, so it's same-origin).
// Hardcoding localhost breaks when the admin is opened from another device.
// An explicit GOOGLE_REDIRECT_URI still wins if set (e.g. behind a proxy).
function redirectUriFromReq(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/calendar/oauth/callback`;
}

function authedClientForToken(t) {
  const c = oauthClient();
  c.setCredentials({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expiry_date: t.expiry
  });
  return c;
}

function persistRefreshedCreds(client, tokenId) {
  const creds = client.credentials;
  if (creds.access_token && creds.expiry_date) {
    db.prepare(`
      UPDATE calendar_tokens SET access_token = ?, expiry = ?,
        refresh_token = COALESCE(?, refresh_token) WHERE id = ?
    `).run(creds.access_token, creds.expiry_date, creds.refresh_token || null, tokenId);
  }
}

function parseSelected(t) {
  try { return JSON.parse(t.selected_calendars || '["primary"]'); }
  catch { return ['primary']; }
}

router.get('/connections', (_req, res) => {
  // LEFT JOIN so shared connections (member_id IS NULL) come through too.
  const rows = db.prepare(`
    SELECT t.id, t.member_id, t.email, t.expiry, t.selected_calendars, t.color,
           m.name  AS member_name,
           m.color AS member_color,
           m.emoji AS emoji
    FROM calendar_tokens t
    LEFT JOIN family_members m ON m.id = t.member_id
    ORDER BY COALESCE(m.sort_order, 9999), t.id
  `).all();
  res.json(rows.map(r => ({
    ...r,
    selected_calendars: parseSelected(r),
    // Back-compat for older clients that expected `color` to be the member color.
    color: r.member_color || r.color || null,
    shared_color: r.color || null
  })));
});

// List Google calendars available for a connection
router.get('/connections/:id/calendars', requireAdmin, async (req, res) => {
  try {
    const t = db.prepare('SELECT * FROM calendar_tokens WHERE id = ?').get(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Connection not found' });
    const client = authedClientForToken(t);
    const cal = google.calendar({ version: 'v3', auth: client });
    const { data } = await cal.calendarList.list({ maxResults: 250, showHidden: false });
    persistRefreshedCreds(client, t.id);
    const selected = new Set(parseSelected(t));
    const items = (data.items || []).map(c => ({
      id: c.id,
      summary: c.summary,
      summary_override: c.summaryOverride || null,
      description: c.description || null,
      primary: !!c.primary,
      access_role: c.accessRole,
      background_color: c.backgroundColor || null,
      foreground_color: c.foregroundColor || null,
      selected: selected.has(c.id) || (c.primary && selected.has('primary'))
    }));
    // Sort: primary first, then alphabetical
    items.sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return (a.summary_override || a.summary || '').localeCompare(b.summary_override || b.summary || '');
    });
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update which calendar IDs a connection should sync
router.put('/connections/:id/calendars', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT * FROM calendar_tokens WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ error: 'Connection not found' });
  const ids = Array.isArray(req.body?.calendar_ids) ? req.body.calendar_ids.filter(x => typeof x === 'string') : null;
  if (!ids) return res.status(400).json({ error: 'calendar_ids array required' });
  db.prepare('UPDATE calendar_tokens SET selected_calendars = ? WHERE id = ?')
    .run(JSON.stringify(ids), id);
  // Drop events from calendars no longer in the selection. `member_id IS ?`
  // handles both owned (member id) and shared (NULL) tokens correctly.
  const placeholders = ids.length ? ids.map(() => '?').join(',') : "''";
  db.prepare(`
    DELETE FROM calendar_events
    WHERE member_id IS ? AND calendar_id NOT IN (${placeholders})
  `).run(t.member_id, ...ids);
  res.json({ ok: true, selected: ids });
});

// Update the color on a shared connection.
router.patch('/connections/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT * FROM calendar_tokens WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ error: 'Connection not found' });
  if (t.member_id) return res.status(400).json({ error: 'Color is only configurable on shared connections' });
  const color = req.body?.color;
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'color must be a #rrggbb hex string' });
  }
  db.prepare('UPDATE calendar_tokens SET color = ? WHERE id = ?').run(color, id);
  // Repaint existing events for this token's calendars.
  const ids = parseSelected(t);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE calendar_events SET color = ?
      WHERE member_id IS NULL AND calendar_id IN (${placeholders})
    `).run(color, ...ids);
  }
  res.json({ ok: true });
});

// Encode/decode the OAuth state. For member-owned connections, state is the
// numeric member id. For "shared" (no owner), state is "shared:<hex-color>".
function encodeState({ memberId, color }) {
  if (memberId) return String(memberId);
  return `shared:${color || '#9ca3af'}`;
}
function decodeState(state) {
  const s = String(state || '');
  if (s.startsWith('shared:')) return { memberId: null, color: s.slice(7) };
  const n = Number(s);
  return { memberId: Number.isFinite(n) && n > 0 ? n : null, color: null };
}

// Start OAuth. Pass either ?member_id=<id> (owned) or ?shared=1&color=#hex
// (a household / no-owner connection).
router.get('/oauth/start', requireAdmin, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth not configured' });
  const shared = req.query.shared === '1' || req.query.shared === 'true';
  const memberId = shared ? null : Number(req.query.member_id);
  if (!shared && !memberId) return res.status(400).json({ error: 'member_id or shared=1 required' });
  const color = shared ? (req.query.color || '#9ca3af') : null;

  const url = oauthClient(redirectUriFromReq(req)).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: encodeState({ memberId, color })
  });
  res.json({ url });
});

router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');
    const { memberId, color } = decodeState(state);
    const client = oauthClient(redirectUriFromReq(req));
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: me } = await oauth2.userinfo.get();

    if (memberId) {
      db.prepare(`
        INSERT INTO calendar_tokens (member_id, email, access_token, refresh_token, expiry, scope, color)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(member_id, email) DO UPDATE SET
          access_token  = excluded.access_token,
          refresh_token = COALESCE(excluded.refresh_token, calendar_tokens.refresh_token),
          expiry        = excluded.expiry,
          scope         = excluded.scope
      `).run(
        memberId, me.email, tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date || (Date.now() + 3600 * 1000),
        tokens.scope || SCOPES.join(' ')
      );
    } else {
      // Shared connection. UNIQUE constraint is on (member_id, email);
      // SQLite treats NULLs as distinct, so multiple shared rows for the
      // same email won't conflict. Check manually for an existing row to
      // avoid duplicates if the same admin reconnects.
      const existing = db.prepare(
        'SELECT id FROM calendar_tokens WHERE member_id IS NULL AND email = ?'
      ).get(me.email);
      if (existing) {
        db.prepare(`
          UPDATE calendar_tokens
          SET access_token = ?, refresh_token = COALESCE(?, refresh_token),
              expiry = ?, scope = ?, color = ?
          WHERE id = ?
        `).run(
          tokens.access_token, tokens.refresh_token || null,
          tokens.expiry_date || (Date.now() + 3600 * 1000),
          tokens.scope || SCOPES.join(' '), color || '#9ca3af',
          existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO calendar_tokens
            (member_id, email, access_token, refresh_token, expiry, scope, color)
          VALUES (NULL, ?, ?, ?, ?, ?, ?)
        `).run(
          me.email, tokens.access_token, tokens.refresh_token || null,
          tokens.expiry_date || (Date.now() + 3600 * 1000),
          tokens.scope || SCOPES.join(' '), color || '#9ca3af'
        );
      }
    }

    res.send('<html><body style="font-family:Inter,sans-serif;background:#0f0f13;color:#f0f0f5;display:flex;align-items:center;justify-content:center;height:100vh"><div><h2>✓ Connected</h2><p>You may close this window.</p></div></body></html>');
  } catch (e) {
    res.status(500).send(`OAuth callback error: ${e.message}`);
  }
});

router.delete('/connections/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare(
    'SELECT member_id, selected_calendars FROM calendar_tokens WHERE id = ?'
  ).get(id);
  db.prepare('DELETE FROM calendar_tokens WHERE id = ?').run(id);
  if (t) {
    if (t.member_id) {
      // Owned connection: nuke this member's events if they have no other
      // tokens left. (Existing behavior.)
      const remaining = db.prepare(
        'SELECT id FROM calendar_tokens WHERE member_id = ?'
      ).all(t.member_id);
      if (remaining.length === 0) {
        db.prepare('DELETE FROM calendar_events WHERE member_id = ?').run(t.member_id);
      }
    } else {
      // Shared connection: drop only the events from this token's calendars.
      const ids = (() => { try { return JSON.parse(t.selected_calendars || '[]'); } catch { return []; } })();
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`
          DELETE FROM calendar_events
          WHERE member_id IS NULL AND calendar_id IN (${placeholders})
        `).run(...ids);
      }
    }
  }
  res.status(204).end();
});

router.get('/events', (req, res) => {
  // Wide default window so past events stay visible on the kiosk calendar
  // (60 days back ↔ 90 days forward). Caller can override with start/end.
  const start = req.query.start || new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const end   = req.query.end   || new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
  // LEFT JOIN so shared events (no member) come through; COALESCE picks the
  // event's stored color, then the owning member's color, then a neutral default.
  const rows = db.prepare(`
    SELECT e.id, e.member_id, e.calendar_id, e.title, e.description, e.location,
           e.start_time, e.end_time, e.all_day, e.updated_at,
           COALESCE(e.color, m.color, '#9ca3af') AS color,
           m.name  AS member_name,
           m.emoji AS emoji
    FROM calendar_events e
    LEFT JOIN family_members m ON m.id = e.member_id
    WHERE e.end_time >= ? AND e.start_time <= ?
    ORDER BY e.start_time
  `).all(start, end);
  res.json(rows.map(r => ({ ...r, all_day: !!r.all_day })));
});

// Manual sync trigger
router.post('/sync', requireAdmin, async (_req, res) => {
  try {
    const result = await syncAllCalendars();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Turn a raw Google/OAuth error into a short, actionable message. `invalid_grant`
// means the stored refresh token was rejected (revoked, or — most commonly —
// expired because the OAuth app is still in "Testing" mode, where Google expires
// refresh tokens after 7 days). The user fixes it by clicking Connect to re-auth.
function friendlyCalendarError(e) {
  const raw = e?.errors?.[0]?.message || e?.response?.data?.error?.message
    || e?.response?.data?.error || e.message || String(e);
  if (typeof raw === 'string' && raw.includes('invalid_grant')) {
    return 'Authorization expired — click Connect to reconnect this account';
  }
  return raw;
}

export async function syncAllCalendars() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return { skipped: true, reason: 'Google OAuth not configured' };
  }
  const tokens = db.prepare('SELECT * FROM calendar_tokens').all();
  const summary = { synced: 0, calendars: 0, errors: [] };

  // Composite key: `${calendar_id}::${event_id}` so the same event id across calendars doesn't collide.
  const upsert = db.prepare(`
    INSERT INTO calendar_events (id, member_id, calendar_id, title, description, location, start_time, end_time, all_day, color, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      member_id   = excluded.member_id,
      title       = excluded.title,
      description = excluded.description,
      location    = excluded.location,
      start_time  = excluded.start_time,
      end_time    = excluded.end_time,
      all_day     = excluded.all_day,
      color       = excluded.color,
      updated_at  = datetime('now')
  `);
  // `IS ?` so this works for both owned (member_id) and shared (NULL) tokens.
  // Keep up to 90 days of history so past events stay visible on the calendar.
  const deleteStaleForToken = db.prepare(
    `DELETE FROM calendar_events WHERE member_id IS ? AND end_time < datetime('now', '-90 days')`
  );

  // Sync window: 30 days back ↔ 90 days forward. Past month stays populated
  // even on a fresh install / cache wipe.
  const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

  for (const t of tokens) {
    const selected = parseSelected(t);
    if (selected.length === 0) continue;
    try {
      const client = authedClientForToken(t);
      const cal = google.calendar({ version: 'v3', auth: client });

      for (const calendarId of selected) {
        try {
          const { data } = await cal.events.list({
            calendarId, timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250
          });
          const tx = db.transaction(() => {
            for (const ev of data.items || []) {
              if (!ev.start || !ev.end) continue;
              const allDay = !!ev.start.date;
              const compositeId = `${calendarId}::${ev.id}`;
              // Shared tokens bake the chosen color into each event; owned
              // tokens leave it NULL so the event inherits member.color.
              const eventColor = t.member_id ? null : (t.color || null);
              upsert.run(
                compositeId, t.member_id || null, calendarId,
                ev.summary || '(no title)', ev.description || null, ev.location || null,
                ev.start.dateTime || ev.start.date, ev.end.dateTime || ev.end.date,
                allDay ? 1 : 0,
                eventColor
              );
            }
          });
          tx();
          summary.calendars++;
        } catch (e) {
          const msg = friendlyCalendarError(e);
          console.error(`[calendar sync] ${t.email || `token#${t.id}`} / calendar "${calendarId}": ${msg}`);
          summary.errors.push({ token_id: t.id, email: t.email, calendar_id: calendarId, error: msg });
        }
      }

      deleteStaleForToken.run(t.member_id);
      persistRefreshedCreds(client, t.id);
      summary.synced++;
    } catch (e) {
      const msg = friendlyCalendarError(e);
      console.error(`[calendar sync] ${t.email || `token#${t.id}`}: ${msg}`);
      summary.errors.push({ token_id: t.id, email: t.email, error: msg });
    }
  }
  summary.last_sync = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('last_calendar_sync', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(summary.last_sync));
  return summary;
}

export default router;
