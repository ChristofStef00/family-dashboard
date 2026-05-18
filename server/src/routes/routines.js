import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { ymd, awardStreaksIfDue } from '../services/scoring.js';

const router = Router();

/* ───── Helpers ─────────────────────────────────────────────────────── */

function parseRoutine(row) {
  if (!row) return row;
  return {
    ...row,
    assignee_ids: JSON.parse(row.assignee_ids || '[]'),
    custom_days:  row.custom_days ? JSON.parse(row.custom_days) : null,
    active: !!row.active
  };
}

function withItems(row) {
  if (!row) return row;
  const items = db.prepare(
    'SELECT id, title, sort_order FROM routine_items WHERE routine_id = ? ORDER BY sort_order, id'
  ).all(row.id);
  return { ...row, items };
}

function appliesToday(routine) {
  const dow = new Date().getDay();
  if (routine.frequency === 'daily')    return true;
  if (routine.frequency === 'weekdays') return dow >= 1 && dow <= 5;
  if (routine.frequency === 'custom')   return Array.isArray(routine.custom_days) && routine.custom_days.includes(dow);
  return true;
}

/* ───── Routine CRUD (admin) ────────────────────────────────────────── */

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM routines ORDER BY id').all().map(parseRoutine).map(withItems);
  res.json(rows);
});

router.post('/', requireAdmin, (req, res) => {
  const {
    title, assignee_ids = [], frequency = 'daily', custom_days = null,
    points = 1, active = true, items = []
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO routines (title, assignee_ids, frequency, custom_days, points, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      title,
      JSON.stringify(assignee_ids),
      frequency,
      custom_days ? JSON.stringify(custom_days) : null,
      points || 1,
      active ? 1 : 0
    );
    const rid = info.lastInsertRowid;
    const insertItem = db.prepare(
      'INSERT INTO routine_items (routine_id, title, sort_order) VALUES (?, ?, ?)'
    );
    items.forEach((it, i) => {
      const t = (typeof it === 'string') ? it : it.title;
      if (t) insertItem.run(rid, t, it.sort_order ?? i);
    });
    return rid;
  });
  const id = tx();
  res.status(201).json(withItems(parseRoutine(
    db.prepare('SELECT * FROM routines WHERE id = ?').get(id)
  )));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = parseRoutine(db.prepare('SELECT * FROM routines WHERE id = ?').get(id));
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  db.prepare(`
    UPDATE routines SET title = ?, assignee_ids = ?, frequency = ?, custom_days = ?,
                        points = ?, active = ?
    WHERE id = ?
  `).run(
    next.title,
    JSON.stringify(next.assignee_ids || []),
    next.frequency,
    next.custom_days ? JSON.stringify(next.custom_days) : null,
    next.points || 1,
    next.active ? 1 : 0,
    id
  );
  res.json(withItems(parseRoutine(
    db.prepare('SELECT * FROM routines WHERE id = ?').get(id)
  )));
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM routines WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

/* ───── Routine items CRUD (admin) ──────────────────────────────────── */

router.post('/:id/items', requireAdmin, (req, res) => {
  const routineId = Number(req.params.id);
  const { title, sort_order = 0 } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const info = db.prepare(
    'INSERT INTO routine_items (routine_id, title, sort_order) VALUES (?, ?, ?)'
  ).run(routineId, title, sort_order);
  res.status(201).json(db.prepare('SELECT * FROM routine_items WHERE id = ?').get(info.lastInsertRowid));
});

router.patch('/items/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM routine_items WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  db.prepare(
    'UPDATE routine_items SET title = ?, sort_order = ? WHERE id = ?'
  ).run(next.title, next.sort_order || 0, id);
  res.json(db.prepare('SELECT * FROM routine_items WHERE id = ?').get(id));
});

router.delete('/items/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM routine_items WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

/* ───── Today's routines (display) ──────────────────────────────────── */

/**
 * GET /api/routines/today
 * Returns one row per (routine, member) combination that applies today,
 * with the member's checked items + completed flag.
 */
router.get('/today', (_req, res) => {
  const today = ymd(new Date());
  const routines = db.prepare('SELECT * FROM routines WHERE active = 1').all().map(parseRoutine);
  const visible = routines.filter(appliesToday);
  if (visible.length === 0) return res.json([]);

  const itemsByRoutine = new Map();
  for (const r of visible) {
    itemsByRoutine.set(r.id, db.prepare(
      'SELECT id, title, sort_order FROM routine_items WHERE routine_id = ? ORDER BY sort_order, id'
    ).all(r.id));
  }

  // Today's checks across the items we care about
  const itemIds = [...itemsByRoutine.values()].flat().map(i => i.id);
  const checksToday = itemIds.length
    ? db.prepare(`
        SELECT item_id, member_id FROM routine_item_checks
        WHERE check_date = ? AND item_id IN (${itemIds.map(() => '?').join(',')})
      `).all(today, ...itemIds)
    : [];
  const checkedKey = (mid, iid) => `${mid}:${iid}`;
  const checkedSet = new Set(checksToday.map(c => checkedKey(c.member_id, c.item_id)));

  const completionsToday = db.prepare(
    'SELECT routine_id, member_id FROM routine_completions WHERE completion_date = ?'
  ).all(today);
  const completedSet = new Set(completionsToday.map(c => `${c.routine_id}:${c.member_id}`));

  const out = [];
  for (const r of visible) {
    const items = itemsByRoutine.get(r.id);
    for (const memberId of r.assignee_ids) {
      out.push({
        routine_id: r.id,
        routine_title: r.title,
        member_id: memberId,
        points: r.points,
        items: items.map(it => ({
          id: it.id,
          title: it.title,
          sort_order: it.sort_order,
          checked: checkedSet.has(checkedKey(memberId, it.id))
        })),
        completed: completedSet.has(`${r.id}:${memberId}`)
      });
    }
  }
  res.json(out);
});

/* ───── Item check / uncheck (display) ──────────────────────────────── */

router.post('/items/:id/check', (req, res) => {
  const itemId = Number(req.params.id);
  const memberId = Number(req.body?.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  const item = db.prepare('SELECT id, routine_id FROM routine_items WHERE id = ?').get(itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const today = ymd(new Date());
  let awarded = null;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO routine_item_checks (item_id, member_id, check_date) VALUES (?, ?, ?)
      ON CONFLICT(item_id, member_id, check_date) DO NOTHING
    `).run(itemId, memberId, today);

    // If every item in the routine is now checked for the member today AND
    // there's no completion row for today yet, award the points and log a completion.
    const total = db.prepare(
      'SELECT COUNT(*) AS n FROM routine_items WHERE routine_id = ?'
    ).get(item.routine_id).n;
    const checked = db.prepare(`
      SELECT COUNT(*) AS n FROM routine_item_checks ric
      JOIN routine_items ri ON ri.id = ric.item_id
      WHERE ri.routine_id = ? AND ric.member_id = ? AND ric.check_date = ?
    `).get(item.routine_id, memberId, today).n;

    if (total > 0 && total === checked) {
      const routine = db.prepare('SELECT points FROM routines WHERE id = ?').get(item.routine_id);
      const points = routine?.points || 0;
      const info = db.prepare(`
        INSERT INTO routine_completions (routine_id, member_id, completion_date, points_awarded)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(routine_id, member_id, completion_date) DO NOTHING
      `).run(item.routine_id, memberId, today, points);
      if (info.changes > 0) {
        awarded = { points, routine_id: item.routine_id };
      }
    }
  });
  tx();

  // Streak awards fire only when the routine actually completed (not on every
  // intermediate item check). Outside the tx so a slow streak query can't
  // hold a write lock; awards have their own dedupe via streak_awards rows.
  let streakAwards = [];
  if (awarded) {
    streakAwards = awardStreaksIfDue(memberId, {
      kind: 'routine',
      routine_id: item.routine_id
    });
  }

  res.status(201).json({ ok: true, awarded, awards: streakAwards });
});

router.delete('/items/:id/check', (req, res) => {
  const itemId = Number(req.params.id);
  const memberId = Number(req.body?.member_id || req.query.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  const item = db.prepare('SELECT id, routine_id FROM routine_items WHERE id = ?').get(itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const today = ymd(new Date());

  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM routine_item_checks WHERE item_id = ? AND member_id = ? AND check_date = ?'
    ).run(itemId, memberId, today);
    // Revoke the day's completion if it existed (refund the point).
    db.prepare(
      'DELETE FROM routine_completions WHERE routine_id = ? AND member_id = ? AND completion_date = ?'
    ).run(item.routine_id, memberId, today);
  });
  tx();

  res.status(204).end();
});

export default router;
