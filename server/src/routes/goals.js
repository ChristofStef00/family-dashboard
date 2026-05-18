import { Router } from 'express';
import { db } from '../db/index.js';
import { getGoalProgress, getPointTotalsMap } from '../services/scoring.js';

const router = Router();

/**
 * GET /api/goals
 * Current goal + progress for every member that has one set.
 * Also returns the list of members who can "afford" each reward right now,
 * so the Points page can show a "Buy" affordance per member.
 */
router.get('/', (_req, res) => {
  const totals = getPointTotalsMap();
  const members = db.prepare(
    'SELECT id FROM family_members ORDER BY sort_order'
  ).all();

  const goals = members
    .map(m => {
      const t = totals.get(m.id) || { balance: 0 };
      const g = getGoalProgress(m.id, t.balance);
      return g ? { member_id: m.id, ...g } : null;
    })
    .filter(Boolean);

  // Affordability per reward × member, gated by reward assignment.
  // assignee_ids = [] means "available to every member".
  const rewards = db.prepare('SELECT id, point_cost, assignee_ids FROM rewards WHERE active = 1').all();
  const affordable = {};
  for (const r of rewards) {
    const assignees = JSON.parse(r.assignee_ids || '[]');
    const eligible = assignees.length === 0
      ? members
      : members.filter(m => assignees.includes(m.id));
    affordable[r.id] = eligible
      .filter(m => (totals.get(m.id)?.balance || 0) >= r.point_cost)
      .map(m => m.id);
  }

  res.json({ goals, affordable });
});

router.get('/members/:id', (req, res) => {
  const memberId = Number(req.params.id);
  const totals = getPointTotalsMap();
  const t = totals.get(memberId) || { balance: 0 };
  res.json(getGoalProgress(memberId, t.balance));
});

router.put('/members/:id', (req, res) => {
  const memberId = Number(req.params.id);
  const rewardId = Number(req.body?.reward_id);
  if (!rewardId) return res.status(400).json({ error: 'reward_id required' });
  const reward = db.prepare('SELECT id, assignee_ids FROM rewards WHERE id = ? AND active = 1').get(rewardId);
  if (!reward) return res.status(404).json({ error: 'Reward not found' });
  const assignees = JSON.parse(reward.assignee_ids || '[]');
  if (assignees.length > 0 && !assignees.includes(memberId)) {
    return res.status(400).json({ error: 'Member is not eligible for this reward' });
  }

  db.prepare(`
    INSERT INTO member_reward_goals (member_id, reward_id) VALUES (?, ?)
    ON CONFLICT(member_id) DO UPDATE SET reward_id = excluded.reward_id, selected_at = datetime('now')
  `).run(memberId, rewardId);

  const totals = getPointTotalsMap();
  const t = totals.get(memberId) || { balance: 0 };
  res.json(getGoalProgress(memberId, t.balance));
});

router.delete('/members/:id', (req, res) => {
  db.prepare('DELETE FROM member_reward_goals WHERE member_id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;
