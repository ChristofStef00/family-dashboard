import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { awardStreaksIfDue } from '../services/scoring.js';

const router = Router();

function parseChore(row) {
  if (!row) return row;
  return {
    ...row,
    assignee_ids: JSON.parse(row.assignee_ids || '[]'),
    custom_days:  row.custom_days ? JSON.parse(row.custom_days) : null,
    active: !!row.active,
    category:   row.category   || 'chore',
    claim_mode: row.claim_mode || 'multi'
  };
}

// Match SQLite's datetime('now') format — "YYYY-MM-DD HH:MM:SS" UTC. Using
// Date.toISOString() ("YYYY-MM-DDTHH:MM:SS.sssZ") breaks lexical comparison
// against the column because space < 'T' (every same-day completion was
// being filtered out, so `completed_by` always came back empty).
function toSqliteUTC(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toSqliteUTC(d);
}

function startOfWeekISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday start
  return toSqliteUTC(d);
}

router.get('/', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.category) {
    where.push('category = ?');
    params.push(req.query.category);
  }
  const sql = `SELECT * FROM chores ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
  res.json(db.prepare(sql).all(...params).map(parseChore));
});

// Today's chores with completion status. Chores still use assignee_ids —
// only the listed members see the chore on their card. Bonuses are excluded
// here (handled by /api/bonuses/today and rely on opt-in selection instead
// of admin-set assignees). One-time chores disappear once any member has
// completed them.
router.get('/today', (_req, res) => {
  const dow = new Date().getDay();
  const todayStart = startOfTodayISO();
  const weekStart  = startOfWeekISO();

  // Lazy daily archive: any once-chore with a completion older than the
  // current day's start gets flipped to active=0 here. That's how "stays
  // visible today, clears tomorrow" is enforced — completed-today rows
  // have completed_at >= todayStart so they don't match.
  db.prepare(`
    UPDATE chores SET active = 0
    WHERE active = 1 AND frequency = 'once' AND id IN (
      SELECT DISTINCT chore_id FROM chore_completions
      WHERE completed_at < ?
    )
  `).run(todayStart);

  const chores = db
    .prepare("SELECT * FROM chores WHERE active = 1 AND category = 'chore'")
    .all()
    .map(parseChore);

  const todayKey = (cid, mid) => `${cid}:${mid}`;
  const todaySet = new Set(db
    .prepare('SELECT chore_id, member_id FROM chore_completions WHERE completed_at >= ?')
    .all(todayStart).map(c => todayKey(c.chore_id, c.member_id)));
  const weekSet = new Set(db
    .prepare('SELECT chore_id, member_id FROM chore_completions WHERE completed_at >= ?')
    .all(weekStart).map(c => todayKey(c.chore_id, c.member_id)));

  const visible = chores.filter(c => {
    // Chores use only 'once' | 'custom' (see migrateChoreFrequencyV2).
    // Once-chores: any survivors past the lazy archive are still in their
    // completion day (or never completed) — both should show on the kiosk.
    if (c.frequency === 'once')   return true;
    // Custom: show only on the weekdays listed in custom_days. A chore with no
    // days assigned never shows (this is what fixes "Clean basement" sitting on
    // the dashboard every day — it now only appears on its scheduled days).
    if (c.frequency === 'custom') return Array.isArray(c.custom_days) && c.custom_days.includes(dow);
    // Legacy fallback (pre-migration rows): daily shows, anything else hidden.
    if (c.frequency === 'daily')  return true;
    return false;
  });

  const result = visible.map(c => ({
    ...c,
    completed_by: c.assignee_ids.filter(mid => {
      if (c.frequency === 'weekly') return weekSet.has(todayKey(c.id, mid));
      return todaySet.has(todayKey(c.id, mid));
    })
  }));
  res.json(result);
});

router.post('/', requireAdmin, (req, res) => {
  const {
    title, description = null,
    assignee_ids = [], frequency = 'custom', custom_days = null,
    points = 0, active = true, category = 'chore',
    claim_mode = 'multi'
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  // Bonuses ignore assignees (kids opt in via the Points page). Force [] so
  // existing dashboard logic doesn't accidentally hide them.
  const cat = category === 'bonus' ? 'bonus' : 'chore';
  const ids = cat === 'bonus' ? [] : assignee_ids;
  const info = db.prepare(`
    INSERT INTO chores (title, description, assignee_ids, frequency, custom_days, points, active, category, claim_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description,
         JSON.stringify(ids), frequency,
         custom_days ? JSON.stringify(custom_days) : null,
         points, active ? 1 : 0,
         cat,
         claim_mode === 'single' ? 'single' : 'multi');
  res.status(201).json(parseChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(info.lastInsertRowid)));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = parseChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(id));
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  const category   = next.category   === 'bonus'  ? 'bonus'  : 'chore';
  const claim_mode = next.claim_mode === 'single' ? 'single' : 'multi';
  // Bonuses don't use assignees — clear the field if category was switched.
  const assigneeIds = category === 'bonus' ? [] : (next.assignee_ids || []);
  db.prepare(`
    UPDATE chores SET title = ?, description = ?, assignee_ids = ?, frequency = ?,
                       custom_days = ?, points = ?, active = ?, category = ?, claim_mode = ?
    WHERE id = ?
  `).run(
    next.title, next.description ?? null,
    JSON.stringify(assigneeIds),
    next.frequency,
    next.custom_days ? JSON.stringify(next.custom_days) : null,
    next.points || 0,
    next.active ? 1 : 0,
    category,
    claim_mode,
    id
  );
  res.json(parseChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(id)));
});

// Soft delete — flip active=0 so the chore disappears from kiosk + admin
// lists but its completions stay linked (preserving every point awarded).
// Hard deletion would cascade and wipe those completions via the FK.
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE chores SET active = 0 WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

// Mark a chore done for a member (used by display + HA)
router.post('/:id/complete', (req, res) => {
  const choreId = Number(req.params.id);
  const memberId = Number(req.body?.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  const chore = parseChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(choreId));
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  // Bonuses skip the assignee gate (they're opt-in via Points page selection).
  if (chore.category === 'chore' && !chore.assignee_ids.includes(memberId)) {
    return res.status(400).json({ error: 'Member is not assigned to this chore' });
  }
  const windowStart = chore.frequency === 'weekly' ? startOfWeekISO()
                    : chore.frequency === 'once'   ? '1970-01-01 00:00:00' // any prior completion blocks
                    : startOfTodayISO();
  const exists = db.prepare(`
    SELECT id FROM chore_completions
    WHERE chore_id = ? AND member_id = ? AND completed_at >= ?
  `).get(choreId, memberId, windowStart);
  if (exists) return res.json({ already_completed: true, awards: [] });

  const info = db.prepare(`
    INSERT INTO chore_completions (chore_id, member_id, points_awarded)
    VALUES (?, ?, ?)
  `).run(choreId, memberId, chore.points || 0);

  // One-time chores aren't archived immediately — they stay on the kiosk
  // for the rest of the day with strike-through styling. The lazy archive
  // at the top of /api/chores/today clears them once the next day starts.

  const awards = awardStreaksIfDue(memberId, { kind: 'chore', chore_id: choreId });
  res.status(201).json({
    id: info.lastInsertRowid,
    points_awarded: chore.points || 0,
    awards
  });
});

router.delete('/:id/complete', (req, res) => {
  const choreId = Number(req.params.id);
  const memberId = Number(req.body?.member_id || req.query.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  const chore = parseChore(db.prepare('SELECT * FROM chores WHERE id = ?').get(choreId));
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  const windowStart = chore.frequency === 'weekly' ? startOfWeekISO() : startOfTodayISO();
  db.prepare(`
    DELETE FROM chore_completions
    WHERE chore_id = ? AND member_id = ? AND completed_at >= ?
  `).run(choreId, memberId, windowStart);
  res.status(204).end();
});

router.get('/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const memberId = req.query.member_id ? Number(req.query.member_id) : null;
  const sql = memberId
    ? `SELECT cc.*, c.title FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id WHERE cc.member_id = ? ORDER BY cc.completed_at DESC LIMIT ?`
    : `SELECT cc.*, c.title FROM chore_completions cc JOIN chores c ON c.id = cc.chore_id ORDER BY cc.completed_at DESC LIMIT ?`;
  const rows = memberId
    ? db.prepare(sql).all(memberId, limit)
    : db.prepare(sql).all(limit);
  res.json(rows);
});

export default router;
