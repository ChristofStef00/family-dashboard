import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

function parseRow(row) {
  if (!row) return row;
  return {
    ...row,
    member_ids: JSON.parse(row.member_ids || '[]')
  };
}

function validateDates(body) {
  if (!body?.start_date || !body?.end_date) return 'start_date and end_date required';
  // ISO YYYY-MM-DD lexically compares correctly
  if (body.end_date < body.start_date) return 'end_date must be on or after start_date';
  return null;
}

router.get('/', (_req, res) => {
  const rows = db.prepare(
    'SELECT * FROM vacations ORDER BY start_date DESC'
  ).all().map(parseRow);
  res.json(rows);
});

router.post('/', requireAdmin, (req, res) => {
  const err = validateDates(req.body);
  if (err) return res.status(400).json({ error: err });
  const { member_ids = [], start_date, end_date, note = null } = req.body;
  const info = db.prepare(`
    INSERT INTO vacations (member_ids, start_date, end_date, note)
    VALUES (?, ?, ?, ?)
  `).run(JSON.stringify(member_ids || []), start_date, end_date, note);
  res.status(201).json(parseRow(db.prepare('SELECT * FROM vacations WHERE id = ?').get(info.lastInsertRowid)));
});

router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = parseRow(db.prepare('SELECT * FROM vacations WHERE id = ?').get(id));
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  const err = validateDates(next);
  if (err) return res.status(400).json({ error: err });
  db.prepare(`
    UPDATE vacations SET member_ids = ?, start_date = ?, end_date = ?, note = ?
    WHERE id = ?
  `).run(JSON.stringify(next.member_ids || []), next.start_date, next.end_date, next.note ?? null, id);
  res.json(parseRow(db.prepare('SELECT * FROM vacations WHERE id = ?').get(id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM vacations WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;
