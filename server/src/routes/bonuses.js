import { Router } from 'express';
import { db } from '../db/index.js';
import { ymd } from '../services/scoring.js';

const router = Router();

function parseBonus(row) {
  if (!row) return row;
  return {
    ...row,
    assignee_ids: JSON.parse(row.assignee_ids || '[]'),
    custom_days:  row.custom_days ? JSON.parse(row.custom_days) : null,
    active: !!row.active,
    claim_mode: row.claim_mode || 'multi'
  };
}

/**
 * GET /api/bonuses/available
 * Every active chore where category='bonus', annotated with which members
 * have opted in via member_bonus_selections.
 */
router.get('/available', (_req, res) => {
  const bonuses = db.prepare(
    "SELECT * FROM chores WHERE category = 'bonus' AND active = 1 ORDER BY points DESC, title"
  ).all().map(parseBonus);

  // Selections owned by members hidden from the Points page don't count —
  // a single-claim bonus held by a hidden member is auto-released for the
  // visible kids to claim. The DB row is preserved so unhiding the member
  // restores their selection.
  const sels = db.prepare(`
    SELECT s.chore_id, s.member_id
    FROM member_bonus_selections s
    JOIN family_members m ON m.id = s.member_id
    WHERE m.show_in_points = 1
  `).all();
  const byChore = new Map();
  for (const s of sels) {
    if (!byChore.has(s.chore_id)) byChore.set(s.chore_id, []);
    byChore.get(s.chore_id).push(s.member_id);
  }

  res.json(bonuses.map(b => ({
    ...b,
    selected_by: byChore.get(b.id) || []
  })));
});

/* ───── Bonuses /available list ─────────────────────────────────────── */
// (above) — claim_mode is exposed via parseBonus so the client can render
// single vs multi UI.

/**
 * GET /api/bonuses/today
 * Returns one row per (selected bonus, member) pair with today's completion
 * state. Optional ?member_id= filters to a single member.
 *
 * Powers the Bonuses subsection on every MemberCard with one polling call.
 */
router.get('/today', (req, res) => {
  const memberFilter = req.query.member_id ? Number(req.query.member_id) : null;

  const dow = new Date().getDay();
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const weekStart  = new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  // Match SQLite's "YYYY-MM-DD HH:MM:SS" UTC format so lexical comparison works.
  const toSqliteUTC = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  // (bonus chore × member-who-selected-it) pairs
  const pairs = db.prepare(`
    SELECT c.id AS chore_id, c.title, c.points, c.frequency, c.custom_days,
           s.member_id
    FROM chores c
    JOIN member_bonus_selections s ON s.chore_id = c.id
    WHERE c.category = 'bonus' AND c.active = 1
      ${memberFilter ? 'AND s.member_id = ?' : ''}
    ORDER BY c.points DESC, c.title
  `).all(...(memberFilter ? [memberFilter] : [])).map(p => ({
    ...p,
    custom_days: p.custom_days ? JSON.parse(p.custom_days) : null
  }));

  // Once-frequency bonuses are tracked PER MEMBER, not globally — so a
  // multi-claim bonus completed by Renley still shows up on Nixon's card
  // until Nixon completes it himself.
  const onceCompletedByMember = new Set(
    db.prepare(`
      SELECT chore_id, member_id FROM chore_completions
      WHERE chore_id IN (SELECT id FROM chores WHERE category = 'bonus' AND frequency = 'once')
    `).all().map(r => `${r.chore_id}:${r.member_id}`)
  );
  const visible = pairs.filter(p => {
    if (p.frequency === 'once')   return !onceCompletedByMember.has(`${p.chore_id}:${p.member_id}`);
    if (p.frequency === 'daily')  return true;
    if (p.frequency === 'weekly') return true;
    if (p.frequency === 'custom') return Array.isArray(p.custom_days) && p.custom_days.includes(dow);
    return true;
  });

  // Per-member completions in the relevant window
  const completionsToday = db.prepare(`
    SELECT chore_id, member_id FROM chore_completions WHERE completed_at >= ?
  `).all(toSqliteUTC(todayStart));
  const completionsWeek  = db.prepare(`
    SELECT chore_id, member_id FROM chore_completions WHERE completed_at >= ?
  `).all(toSqliteUTC(weekStart));
  const todaySet = new Set(completionsToday.map(c => `${c.chore_id}:${c.member_id}`));
  const weekSet  = new Set(completionsWeek.map(c => `${c.chore_id}:${c.member_id}`));

  res.json(visible.map(p => ({
    id: p.chore_id,                  // alias so the client can treat bonuses like chores
    chore_id: p.chore_id,
    member_id: p.member_id,
    title: p.title,
    points: p.points,
    frequency: p.frequency,
    completed: p.frequency === 'weekly'
      ? weekSet.has(`${p.chore_id}:${p.member_id}`)
      : p.frequency === 'once'
        ? onceCompletedByMember.has(`${p.chore_id}:${p.member_id}`)
        : todaySet.has(`${p.chore_id}:${p.member_id}`)
  })));
});

/* ───── Selection (kid opts in / out via Points page) ───────────────── */

router.post('/:choreId/select', (req, res) => {
  const choreId = Number(req.params.choreId);
  const memberId = Number(req.body?.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  const chore = db.prepare(
    "SELECT id, claim_mode FROM chores WHERE id = ? AND category = 'bonus'"
  ).get(choreId);
  if (!chore) return res.status(404).json({ error: 'Bonus not found' });

  // Single-claim: at most one member can hold this bonus at a time. Selecting
  // it for a different member transfers ownership (clears prior selections).
  if (chore.claim_mode === 'single') {
    db.prepare(
      'DELETE FROM member_bonus_selections WHERE chore_id = ? AND member_id != ?'
    ).run(choreId, memberId);
  }
  db.prepare(`
    INSERT INTO member_bonus_selections (member_id, chore_id) VALUES (?, ?)
    ON CONFLICT(member_id, chore_id) DO NOTHING
  `).run(memberId, choreId);
  res.status(201).json({ ok: true });
});

router.delete('/:choreId/select', (req, res) => {
  const choreId = Number(req.params.choreId);
  const memberId = Number(req.body?.member_id || req.query.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  db.prepare(
    'DELETE FROM member_bonus_selections WHERE member_id = ? AND chore_id = ?'
  ).run(memberId, choreId);
  res.status(204).end();
});

export default router;
