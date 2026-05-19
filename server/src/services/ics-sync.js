import ical from 'node-ical';
import { DateTime } from 'luxon';
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

/* ───── Timezone helpers ────────────────────────────────────────────── */

/** The user's configured display timezone — used as the fallback for any
 *  ICS event that doesn't carry its own valid TZID. */
function getDefaultTz() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'timezone'").get();
  if (!row) return 'UTC';
  try { return JSON.parse(row.value); } catch { return row.value; }
}

/** True if luxon can resolve `tz` to a real IANA zone. */
function isValidTz(tz) {
  if (!tz) return false;
  return DateTime.now().setZone(tz).isValid;
}

/**
 * Reinterpret a Date's *UTC wall fields* (the year/month/.../hour numbers you
 * see when reading the ISO string) as if they were local wall time in `tz`,
 * and return the actual UTC Date. This is how we rescue events that
 * node-ical stored as 9 AM UTC when they were meant to be 9 AM <user's tz>.
 */
function reinterpretAsTz(date, tz) {
  if (!tz || tz === 'UTC') return date;
  return DateTime.fromObject({
    year:   date.getUTCFullYear(),
    month:  date.getUTCMonth() + 1,
    day:    date.getUTCDate(),
    hour:   date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  }, { zone: tz }).toJSDate();
}

/* ───── Sync ────────────────────────────────────────────────────────── */

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
  const fallbackTz = getDefaultTz();

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

    // Decide which timezone the wall-fields should be interpreted in.
    // If node-ical already parsed a real IANA TZID, trust it (the Date
    // already has the correct UTC ms). Otherwise (no TZID, "UTC" floating,
    // or an unknown TZID), assume the user's configured timezone.
    const evtTz = evt.start?.tz;
    const reinterpret = !allDay && !isValidTz(evtTz);
    const fixDate = (d) => (d && reinterpret ? reinterpretAsTz(d, fallbackTz) : d);

    if (evt.rrule) {
      const exdates = new Set(
        Object.values(evt.exdate || {}).map(d => new Date(d).toISOString())
      );
      const overrides = evt.recurrences || {};
      const masterStart = fixDate(evt.start);
      const masterEnd   = fixDate(evt.end || evt.start);
      const duration = (masterEnd?.getTime?.() || masterStart.getTime()) - masterStart.getTime();
      let occStarts;
      try {
        occStarts = evt.rrule.between(rangeStart, rangeEnd, true);
      } catch (_e) {
        occStarts = [];
      }
      for (const occStart of occStarts) {
        if (exdates.has(occStart.toISOString())) continue;
        const correctedOcc = fixDate(occStart);
        const occKey = correctedOcc.toISOString().slice(0, 10);
        const ovr = overrides[occKey];
        const id = `${calendarId}:${evt.uid}:${occKey}`;
        if (ovr) {
          incoming.push({
            id,
            title:    ovr.summary || baseTitle,
            description: ovr.description ?? description,
            location: ovr.location  ?? location,
            start:    fixDate(ovr.start),
            end:      fixDate(ovr.end),
            allDay:   ovr.datetype === 'date'
          });
        } else {
          incoming.push({
            id,
            title: baseTitle, description, location,
            start: correctedOcc,
            end:   new Date(correctedOcc.getTime() + duration),
            allDay
          });
        }
      }
    } else {
      if (!evt.start) continue;
      const start = fixDate(evt.start);
      const end = fixDate(evt.end) || new Date(start.getTime() + 60 * 60 * 1000);
      if (end < rangeStart || start > rangeEnd) continue;
      incoming.push({
        id: `${calendarId}:${evt.uid}`,
        title: baseTitle, description, location,
        start, end, allDay
      });
    }
  }

  // When the subscription has no owner, every event gets the sub's color
  // baked in so a future member-color change doesn't accidentally repaint
  // shared events. Owned subs leave color=NULL and inherit member.color.
  const eventColor = sub.member_id ? null : (sub.color || null);

  // Upsert + clean up stale rows for this subscription.
  const incomingIds = new Set(incoming.map(e => e.id));
  const existing = db.prepare(
    `SELECT id FROM calendar_events WHERE calendar_id = ?`
  ).all(calendarId).map(r => r.id);

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
