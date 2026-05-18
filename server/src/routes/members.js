import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { getPointTotalsMap, getGoalProgress } from '../services/scoring.js';

const router = Router();

function parseMember(row) {
  if (!row) return row;
  return { ...row, show_in_points: row.show_in_points == null ? true : !!row.show_in_points };
}

router.get('/', (_req, res) => {
  const members = db
    .prepare('SELECT id, name, color, emoji, sort_order, show_in_points, created_at FROM family_members ORDER BY sort_order, id')
    .all()
    .map(parseMember);

  const totals = getPointTotalsMap();

  res.json(members.map(m => {
    const t = totals.get(m.id) || { earned: 0, spent: 0, balance: 0 };
    return {
      ...m,
      points_earned: t.earned,
      points_spent:  t.spent,
      points:        t.balance,
      goal:          getGoalProgress(m.id, t.balance)
    };
  }));
});

router.post('/', requireAdmin, (req, res) => {
  const {
    name, color = '#9ca3af', emoji = '🙂', sort_order = 0,
    show_in_points = true
  } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare(
    'INSERT INTO family_members (name, color, emoji, sort_order, show_in_points) VALUES (?, ?, ?, ?, ?)'
  ).run(name, color, emoji, sort_order, show_in_points ? 1 : 0);
  res.status(201).json(parseMember(
    db.prepare('SELECT * FROM family_members WHERE id = ?').get(info.lastInsertRowid)
  ));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM family_members WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  db.prepare(
    'UPDATE family_members SET name = ?, color = ?, emoji = ?, sort_order = ?, show_in_points = ? WHERE id = ?'
  ).run(
    next.name, next.color, next.emoji, next.sort_order,
    (next.show_in_points === false || next.show_in_points === 0) ? 0 : 1,
    id
  );
  res.json(parseMember(db.prepare('SELECT * FROM family_members WHERE id = ?').get(id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM family_members WHERE id = ?').run(id);
  res.status(204).end();
});

export default router;
