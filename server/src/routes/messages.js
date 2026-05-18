import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM display_messages WHERE expires_at > datetime('now') ORDER BY created_at DESC`
  ).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { message, ttl_seconds = 30 } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  const expiresAt = new Date(Date.now() + Number(ttl_seconds) * 1000).toISOString();
  const info = db.prepare(
    'INSERT INTO display_messages (message, expires_at) VALUES (?, ?)'
  ).run(message, expiresAt);
  res.status(201).json(db.prepare('SELECT * FROM display_messages WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM display_messages WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;
