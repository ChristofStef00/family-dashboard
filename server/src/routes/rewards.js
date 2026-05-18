import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { getPointTotalsMap } from '../services/scoring.js';

const router = Router();

function parseReward(row) {
  if (!row) return row;
  return {
    ...row,
    assignee_ids: JSON.parse(row.assignee_ids || '[]'),
    active: !!row.active
  };
}

router.get('/', (_req, res) => {
  const rewards = db.prepare('SELECT * FROM rewards ORDER BY point_cost').all().map(parseReward);
  res.json(rewards);
});

router.post('/', requireAdmin, (req, res) => {
  const {
    title, description = null, point_cost = 0,
    assignee_ids = [], active = true
  } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const info = db.prepare(`
    INSERT INTO rewards (title, description, point_cost, assignee_ids, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, description, point_cost, JSON.stringify(assignee_ids), active ? 1 : 0);
  res.status(201).json(parseReward(db.prepare('SELECT * FROM rewards WHERE id = ?').get(info.lastInsertRowid)));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = parseReward(db.prepare('SELECT * FROM rewards WHERE id = ?').get(id));
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  db.prepare(`
    UPDATE rewards
    SET title = ?, description = ?, point_cost = ?, assignee_ids = ?, active = ?
    WHERE id = ?
  `).run(
    next.title, next.description ?? null, next.point_cost || 0,
    JSON.stringify(next.assignee_ids || []),
    next.active ? 1 : 0,
    id
  );
  res.json(parseReward(db.prepare('SELECT * FROM rewards WHERE id = ?').get(id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM rewards WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

// Redemption is intentionally public — kids redeem from the kiosk Points page.
router.post('/:id/redeem', (req, res) => {
  const rewardId = Number(req.params.id);
  const memberId = Number(req.body?.member_id);
  if (!memberId) return res.status(400).json({ error: 'member_id required' });
  const reward = parseReward(db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId));
  if (!reward) return res.status(404).json({ error: 'Reward not found' });
  // [] assignees == available to everyone; otherwise gate by membership.
  if (reward.assignee_ids.length > 0 && !reward.assignee_ids.includes(memberId)) {
    return res.status(400).json({ error: 'Member is not eligible for this reward' });
  }

  // Use the scoring service so all award sources (chores + routines + streak_awards)
  // are counted when checking affordability — not just chore_completions.
  const balance = (getPointTotalsMap().get(memberId) || { balance: 0 }).balance;
  if (balance < reward.point_cost) {
    return res.status(400).json({ error: 'Not enough points' });
  }
  const info = db.prepare(`
    INSERT INTO reward_redemptions (reward_id, member_id, point_cost) VALUES (?, ?, ?)
  `).run(rewardId, memberId, reward.point_cost);
  // If this reward was the member's current goal, clear it (v1 behavior).
  db.prepare(
    'DELETE FROM member_reward_goals WHERE member_id = ? AND reward_id = ?'
  ).run(memberId, rewardId);
  res.status(201).json({ id: info.lastInsertRowid, point_cost: reward.point_cost });
});

router.get('/redemptions', (req, res) => {
  const includeFulfilled = req.query.include_fulfilled === 'true';
  const where = includeFulfilled ? '' : 'WHERE rr.fulfilled_at IS NULL';
  const rows = db.prepare(`
    SELECT rr.id, rr.reward_id, rr.member_id, rr.point_cost, rr.redeemed_at, rr.fulfilled_at,
           r.title AS reward_title,
           m.name AS member_name, m.emoji AS member_emoji, m.color AS member_color
    FROM reward_redemptions rr
    JOIN rewards r        ON r.id = rr.reward_id
    JOIN family_members m ON m.id = rr.member_id
    ${where}
    ORDER BY rr.redeemed_at DESC LIMIT 200
  `).all();
  res.json(rows);
});

// Mark a banked redemption as fulfilled (parent has handed over the IRL reward).
// Public on purpose — both kiosk and admin call this; points are not refunded.
router.post('/redemptions/:id/fulfill', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare(`
    UPDATE reward_redemptions SET fulfilled_at = datetime('now')
    WHERE id = ? AND fulfilled_at IS NULL
  `).run(id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Redemption not found or already fulfilled' });
  }
  res.status(204).end();
});

export default router;
