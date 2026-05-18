import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { syncAllIcs, syncOneIcs } from '../services/ics-sync.js';

const router = Router();

function parseRow(row) {
  if (!row) return row;
  return { ...row, active: !!row.active };
}

router.get('/subscriptions', (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*,
           m.name  AS member_name,
           m.color AS member_color,
           m.emoji AS member_emoji
    FROM ics_subscriptions s
    JOIN family_members m ON m.id = s.member_id
    ORDER BY s.id
  `).all().map(parseRow);
  res.json(rows);
});

router.post('/subscriptions', requireAdmin, async (req, res) => {
  const { member_id, name, url, active = true } = req.body || {};
  if (!member_id || !name || !url) {
    return res.status(400).json({ error: 'member_id, name, and url are required' });
  }
  const info = db.prepare(`
    INSERT INTO ics_subscriptions (member_id, name, url, active)
    VALUES (?, ?, ?, ?)
  `).run(Number(member_id), name, url, active ? 1 : 0);
  const row = parseRow(
    db.prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(info.lastInsertRowid)
  );
  // Kick off an immediate sync so the kiosk shows events right away.
  try { await syncOneIcs(row); } catch (e) {
    db.prepare(`UPDATE ics_subscriptions SET last_error = ? WHERE id = ?`)
      .run(String(e.message).slice(0, 500), row.id);
  }
  res.status(201).json(parseRow(
    db.prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(row.id)
  ));
});

router.patch('/subscriptions/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const next = { ...existing, ...req.body };
  db.prepare(`
    UPDATE ics_subscriptions
    SET member_id = ?, name = ?, url = ?, active = ?
    WHERE id = ?
  `).run(Number(next.member_id), next.name, next.url, next.active ? 1 : 0, id);
  const row = parseRow(db.prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(id));
  if (row.active && (existing.url !== row.url || existing.member_id !== row.member_id)) {
    // URL or owner changed — re-sync (best effort).
    try { await syncOneIcs(row); } catch (_e) { /* error captured in last_error */ }
  }
  res.json(parseRow(db.prepare('SELECT * FROM ics_subscriptions WHERE id = ?').get(id)));
});

router.delete('/subscriptions/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  // Remove the subscription's events first, then the row itself.
  db.prepare('DELETE FROM calendar_events WHERE calendar_id = ?').run(`ics:${id}`);
  db.prepare('DELETE FROM ics_subscriptions WHERE id = ?').run(id);
  res.status(204).end();
});

router.post('/sync', requireAdmin, async (_req, res) => {
  try {
    const r = await syncAllIcs();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
