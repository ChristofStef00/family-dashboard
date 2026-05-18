import { Router } from 'express';
import { google } from 'googleapis';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
];

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/oauth/callback'
  );
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
  const rows = db.prepare(`
    SELECT t.id, t.member_id, t.email, t.expiry, t.selected_calendars,
           m.name AS member_name, m.color, m.emoji
    FROM calendar_tokens t JOIN family_members m ON m.id = t.member_id
    ORDER BY m.sort_order
  `).all();
  res.json(rows.map(r => ({
    ...r,
    selected_calendars: parseSelected(r)
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
  // Drop events from calendars no longer in the selection
  const placeholders = ids.length ? ids.map(() => '?').join(',') : "''";
  db.prepare(`
    DELETE FROM calendar_events
    WHERE member_id = ? AND calendar_id NOT IN (${placeholders})
  `).run(t.member_id, ...ids);
  res.json({ ok: true, selected: ids });
});

// Start OAuth — admin selects member_id, redirected back with code
router.get('/oauth/start', requireAdmin, (req, res) => {
  const memberId = Number(req.query.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth not configured' });
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: String(memberId)
  });
  res.json({ url });
});

router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');
    const memberId = Number(state);
    const client = oauthClient();
    const { tokens } = await client.getToken(String(code));
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: me } = await oauth2.userinfo.get();

    db.prepare(`
      INSERT INTO calendar_tokens (member_id, email, access_token, refresh_token, expiry, scope)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(member_id, email) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, calendar_tokens.refresh_token),
        expiry = excluded.expiry,
        scope = excluded.scope
    `).run(
      memberId,
      me.email,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date || (Date.now() + 3600 * 1000),
      tokens.scope || SCOPES.join(' ')
    );

    res.send('<html><body style="font-family:Inter,sans-serif;background:#0f0f13;color:#f0f0f5;display:flex;align-items:center;justify-content:center;height:100vh"><div><h2>✓ Connected</h2><p>You may close this window.</p></div></body></html>');
  } catch (e) {
    res.status(500).send(`OAuth callback error: ${e.message}`);
  }
});

router.delete('/connections/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT member_id FROM calendar_tokens WHERE id = ?').get(id);
  db.prepare('DELETE FROM calendar_tokens WHERE id = ?').run(id);
  // Clean up events from this account if no other token exists for the member with overlapping calendars
  if (t) {
    const remaining = db.prepare('SELECT id FROM calendar_tokens WHERE member_id = ?').all(t.member_id);
    if (remaining.length === 0) {
      db.prepare('DELETE FROM calendar_events WHERE member_id = ?').run(t.member_id);
    }
  }
  res.status(204).end();
});

router.get('/events', (req, res) => {
  const start = req.query.start || new Date().toISOString();
  const end = req.query.end || new Date(Date.now() + 35 * 24 * 3600 * 1000).toISOString();
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

export async function syncAllCalendars() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return { skipped: true, reason: 'Google OAuth not configured' };
  }
  const tokens = db.prepare('SELECT * FROM calendar_tokens').all();
  const summary = { synced: 0, calendars: 0, errors: [] };

  // Composite key: `${calendar_id}::${event_id}` so the same event id across calendars doesn't collide.
  const upsert = db.prepare(`
    INSERT INTO calendar_events (id, member_id, calendar_id, title, description, location, start_time, end_time, all_day, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, description = excluded.description, location = excluded.location,
      start_time = excluded.start_time, end_time = excluded.end_time, all_day = excluded.all_day,
      updated_at = datetime('now')
  `);
  const deleteStaleForMember = db.prepare(
    `DELETE FROM calendar_events WHERE member_id = ? AND end_time < datetime('now', '-1 day')`
  );

  const timeMin = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

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
              upsert.run(
                compositeId, t.member_id, calendarId,
                ev.summary || '(no title)', ev.description || null, ev.location || null,
                ev.start.dateTime || ev.start.date, ev.end.dateTime || ev.end.date,
                allDay ? 1 : 0
              );
            }
          });
          tx();
          summary.calendars++;
        } catch (e) {
          summary.errors.push({ token_id: t.id, calendar_id: calendarId, error: e.message });
        }
      }

      deleteStaleForMember.run(t.member_id);
      persistRefreshedCreds(client, t.id);
      summary.synced++;
    } catch (e) {
      summary.errors.push({ token_id: t.id, error: e.message });
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
