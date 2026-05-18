import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  computeStreakWithStart,
  computeBestStreak,
  isDoneToday,
  streakRewardMembers
} from '../services/scoring.js';

// Match SQLite's datetime('now') format so lexical comparison on awarded_at works.
function toSqliteUTC(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const router = Router();

const KINDS = new Set(['chore', 'routine', 'all_chores', 'all_routines']);

function parseReward(row) {
  if (!row) return row;
  return {
    ...row,
    active: !!row.active,
    member_ids: JSON.parse(row.member_ids || '[]')
  };
}

function targetTitle(r) {
  if (r.kind === 'chore')         return r.chore_title  || '(chore deleted)';
  if (r.kind === 'routine')       return r.routine_title || '(routine deleted)';
  if (r.kind === 'all_chores')    return 'All chores';
  if (r.kind === 'all_routines')  return 'All routines';
  return '';
}

function validateBody(body) {
  const kind = body?.kind || 'chore';
  if (!KINDS.has(kind)) return 'kind must be one of: chore | routine | all_chores | all_routines';
  if (kind === 'chore'   && !body.chore_id)   return 'chore_id required for kind=chore';
  if (kind === 'routine' && !body.routine_id) return 'routine_id required for kind=routine';
  if (!body.threshold_days)                   return 'threshold_days required';
  return null;
}

/* ───── CRUD ────────────────────────────────────────────────────────── */

router.get('/rewards', (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*,
           c.title  AS chore_title,
           r.title  AS routine_title
    FROM streak_rewards s
    LEFT JOIN chores   c ON c.id = s.chore_id
    LEFT JOIN routines r ON r.id = s.routine_id
    ORDER BY s.threshold_days, s.id
  `).all().map(parseReward).map(row => ({ ...row, target_title: targetTitle(row) }));
  res.json(rows);
});

router.post('/rewards', requireAdmin, (req, res) => {
  const err = validateBody(req.body);
  if (err) return res.status(400).json({ error: err });
  const {
    kind = 'chore', chore_id = null, routine_id = null, member_ids = [],
    threshold_days, bonus_points = 0, active = true
  } = req.body;

  // Normalize: only the target field for the chosen kind is stored.
  const choreId   = kind === 'chore'   ? chore_id   : null;
  const routineId = kind === 'routine' ? routine_id : null;

  const info = db.prepare(`
    INSERT INTO streak_rewards
      (kind, chore_id, routine_id, member_ids,
       threshold_days, bonus_points, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    kind, choreId, routineId, JSON.stringify(member_ids || []),
    threshold_days, bonus_points, active ? 1 : 0
  );
  res.status(201).json(parseReward(
    db.prepare('SELECT * FROM streak_rewards WHERE id = ?').get(info.lastInsertRowid)
  ));
});

router.patch('/rewards/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = parseReward(db.prepare('SELECT * FROM streak_rewards WHERE id = ?').get(id));
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  const err = validateBody(next);
  if (err) return res.status(400).json({ error: err });

  const choreId   = next.kind === 'chore'   ? (next.chore_id || null)   : null;
  const routineId = next.kind === 'routine' ? (next.routine_id || null) : null;

  db.prepare(`
    UPDATE streak_rewards SET
      kind = ?, chore_id = ?, routine_id = ?, member_ids = ?,
      threshold_days = ?, bonus_points = ?, active = ?
    WHERE id = ?
  `).run(
    next.kind, choreId, routineId, JSON.stringify(next.member_ids || []),
    next.threshold_days, next.bonus_points || 0, next.active ? 1 : 0,
    id
  );
  res.json(parseReward(db.prepare('SELECT * FROM streak_rewards WHERE id = ?').get(id)));
});

router.delete('/rewards/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM streak_rewards WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

/* ───── Live progress (display) ─────────────────────────────────────── */

/**
 * One row per (active reward × eligible member). Eligible = explicit
 * member_ids list, or every visible member when the list is empty.
 */
router.get('/progress', (_req, res) => {
  const rewards = db.prepare(`
    SELECT s.*,
           c.title  AS chore_title,
           r.title  AS routine_title
    FROM streak_rewards s
    LEFT JOIN chores   c ON c.id = s.chore_id
    LEFT JOIN routines r ON r.id = s.routine_id
    WHERE s.active = 1
    ORDER BY s.threshold_days, s.id
  `).all().map(parseReward);

  const members = db.prepare(`
    SELECT id, name, color, emoji, sort_order FROM family_members ORDER BY sort_order
  `).all();
  const memberById = new Map(members.map(m => [m.id, m]));

  const checkAwarded = db.prepare(`
    SELECT 1 FROM streak_awards
    WHERE streak_reward_id = ? AND member_id = ? AND awarded_at >= ?
    LIMIT 1
  `);

  const out = [];
  for (const r of rewards) {
    const target = targetTitle(r);
    for (const mid of streakRewardMembers(r)) {
      const m = memberById.get(mid);
      if (!m) continue;
      const { streak, runStart } = computeStreakWithStart(r, mid);
      const best = computeBestStreak(r, mid);
      const doneToday = isDoneToday(r, mid);
      const unlocked = streak >= r.threshold_days;
      let awarded = false;
      if (unlocked && runStart) {
        const rs = new Date(runStart); rs.setHours(0, 0, 0, 0);
        awarded = !!checkAwarded.get(r.id, mid, toSqliteUTC(rs));
      }
      out.push({
        streak_reward_id:   r.id,
        member_id:          mid,
        member_name:        m.name,
        member_color:       m.color,
        member_emoji:       m.emoji,
        member_sort_order:  m.sort_order,
        kind:               r.kind,
        chore_id:           r.chore_id,
        routine_id:         r.routine_id,
        target_title:       target,
        // Back-compat alias for older clients that still read chore_title:
        chore_title:        target,
        threshold_days:     r.threshold_days,
        reward_title:       r.reward_title,
        reward_description: r.reward_description,
        bonus_points:       r.bonus_points,
        current_streak:     streak,
        best_streak:        best,
        done_today:         doneToday,
        unlocked,
        awarded
      });
    }
  }
  out.sort((a, b) => {
    if (a.member_sort_order !== b.member_sort_order) return a.member_sort_order - b.member_sort_order;
    return (b.current_streak / b.threshold_days) - (a.current_streak / a.threshold_days);
  });
  res.json(out);
});

export default router;
