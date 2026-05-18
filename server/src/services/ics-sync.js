import ical from 'node-ical';
import { db } from '../db/index.js';

const upsertEvent = db.prepare(`
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

/**
 * Sync every active ICS subscription. Idempotent: stale events for each
 * calendar_id (`ics:<sub_id>`) are deleted at the end so removed-from-source
 * events disappear from the kiosk too.
 */
export async function syncAllIcs() {
  const subs = db.prepare(
    'SELECT * FROM ics_subscriptions WHERE active = 1'
  ).all();
  const result = { synced: 0, events: 0, errors: [] };

  for (const sub of subs) {
    try {
      const n = await syncOneIcs(sub);
      result.synced++;
      result.events += n;
      db.prepare(
        `UPDATE ics_subscriptions SET last_synced_at = datetime('now'), last_error = NULL WHERE id = ?`
      ).run(sub.id);
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 500);
      result.errors.push({ id: sub.id, name: sub.name, error: msg });
      db.prepare(
        `UPDATE ics_subscriptions SET last_error = ? WHERE id = ?`
      ).run(msg, sub.id);
    }
  }
  return result;
}

/**
 * Sync one subscription. Returns the number of events upserted.
 * Window: 7 days back to 90 days forward (matches the OAuth sync window).
 */
export async function syncOneIcs(sub) {
  const data = await ical.async.fromURL(sub.url);
  const calendarId = `ics:${sub.id}`;

  const now = new Date();
  const rangeStart = new Date(now); rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd   = new Date(now); rangeEnd.setDate(rangeEnd.getDate() + 90);

  const incoming = [];

  for (const key of Object.keys(data)) {
    const evt = data[key];
    if (!evt || evt.type !== 'VEVENT') continue;

    const baseTitle = evt.summary || '(untitled)';
    const description = evt.description || null;
    const location = evt.location || null;
    const allDay = evt.datetype === 'date';

    if (evt.rrule) {
      const exdates = new Set(
        Object.values(evt.exdate || {}).map(d => new Date(d).toISOString())
      );
      const overrides = evt.recurrences || {};
      const duration = (evt.end?.getTime?.() || evt.start.getTime()) - evt.start.getTime();
      let occStarts;
      try {
        occStarts = evt.rrule.between(rangeStart, rangeEnd, true);
      } catch (_e) {
        occStarts = [];
      }
      for (const occStart of occStarts) {
        if (exdates.has(occStart.toISOString())) continue;
        const occKey = occStart.toISOString().slice(0, 10);
        const ovr = overrides[occKey];
        const id = `${calendarId}:${evt.uid}:${occKey}`;
        if (ovr) {
          incoming.push({
            id,
            title:    ovr.summary || baseTitle,
            description: ovr.description ?? description,
            location: ovr.location  ?? location,
            start:    ovr.start,
            end:      ovr.end,
            allDay:   ovr.datetype === 'date'
          });
        } else {
          incoming.push({
            id,
            title: baseTitle, description, location,
            start: occStart,
            end:   new Date(occStart.getTime() + duration),
            allDay
          });
        }
      }
    } else {
      if (!evt.start) continue;
      const start = evt.start;
      const end = evt.end || new Date(start.getTime() + 60 * 60 * 1000);
      if (end < rangeStart || start > rangeEnd) continue;
      incoming.push({
        id: `${calendarId}:${evt.uid}`,
        title: baseTitle, description, location,
        start, end, allDay
      });
    }
  }

  // Upsert + clean up stale rows for this subscription.
  const incomingIds = new Set(incoming.map(e => e.id));
  const existing = db.prepare(
    `SELECT id FROM calendar_events WHERE calendar_id = ?`
  ).all(calendarId).map(r => r.id);

  // When the subscription has no owner, every event gets the sub's color
  // baked in so a future member-color change doesn't accidentally repaint
  // shared events. Owned subs leave color=NULL and inherit member.color.
  const eventColor = sub.member_id ? null : (sub.color || null);

  const tx = db.transaction(() => {
    for (const e of incoming) {
      upsertEvent.run(
        e.id, sub.member_id || null, calendarId,
        e.title, e.description, e.location,
        e.start.toISOString(), e.end.toISOString(),
        e.allDay ? 1 : 0,
        eventColor
      );
    }
    const stale = existing.filter(id => !incomingIds.has(id));
    if (stale.length > 0) {
      const placeholders = stale.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM calendar_events WHERE id IN (${placeholders})`
      ).run(...stale);
    }
  });
  tx();

  return incoming.length;
}
