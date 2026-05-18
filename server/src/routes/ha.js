import { Router } from 'express';
import { db } from '../db/index.js';
import { getWeekMeals } from '../services/mealie.js';
import { getPointTotalsMap, awardStreaksIfDue } from '../services/scoring.js';

const router = Router();

function todayStartISO() {
  const d = new Date(); d.setHours(0,0,0,0); return d.toISOString();
}

router.get('/status', (_req, res) => {
  const todayStart = todayStartISO();
  const chores = db.prepare('SELECT id, assignee_ids FROM chores WHERE active = 1').all();
  let totalSlots = 0;
  for (const c of chores) totalSlots += JSON.parse(c.assignee_ids || '[]').length;
  const completedToday = db.prepare(
    'SELECT COUNT(*) AS n FROM chore_completions WHERE completed_at >= ?'
  ).get(todayStart).n;
  const lastSyncRow = db.prepare("SELECT value FROM settings WHERE key = 'last_calendar_sync'").get();
  res.json({
    chores_total: totalSlots,
    chores_completed_today: completedToday,
    chores_completion_pct: totalSlots ? Math.round((completedToday / totalSlots) * 100) : 0,
    last_calendar_sync: lastSyncRow ? JSON.parse(lastSyncRow.value) : null,
    server_time: new Date().toISOString()
  });
});

router.get('/family', (_req, res) => {
  const todayStart = todayStartISO();
  const members = db.prepare('SELECT id, name, color, emoji FROM family_members ORDER BY sort_order').all();
  const totals = getPointTotalsMap();
  const todayCounts = Object.fromEntries(
    db.prepare('SELECT member_id, COUNT(*) AS n FROM chore_completions WHERE completed_at >= ? GROUP BY member_id').all(todayStart)
      .map(r => [r.member_id, r.n])
  );
  res.json(members.map(m => {
    const t = totals.get(m.id) || { earned: 0, spent: 0, balance: 0 };
    return {
      ...m,
      points: t.balance,
      chores_completed_today: todayCounts[m.id] || 0
    };
  }));
});

router.post('/chore/complete', (req, res) => {
  const choreId = Number(req.body?.chore_id);
  const memberId = Number(req.body?.member_id);
  if (!choreId || !memberId) return res.status(400).json({ error: 'chore_id and member_id required' });
  const chore = db.prepare('SELECT * FROM chores WHERE id = ?').get(choreId);
  if (!chore) return res.status(404).json({ error: 'chore not found' });
  const info = db.prepare(
    'INSERT INTO chore_completions (chore_id, member_id, points_awarded) VALUES (?, ?, ?)'
  ).run(choreId, memberId, chore.points || 0);
  const awards = awardStreaksIfDue(memberId, choreId);
  res.status(201).json({
    id: info.lastInsertRowid,
    points_awarded: chore.points || 0,
    awards
  });
});

// Lightweight meal plan feed for Home Assistant REST sensor.
// Returns today + next 6 days, with each day flattened for easy templating.
router.get('/mealplan', (_req, res) => {
  const week = getWeekMeals(6);
  res.json(week.map(d => ({
    date: d.date,
    breakfast: d.breakfast ? slim(d.breakfast) : null,
    lunch:     d.lunch     ? slim(d.lunch)     : null,
    dinner:    d.dinner    ? slim(d.dinner)    : null,
    snack:     d.snack     ? slim(d.snack)     : null
  })));
});
function slim(m) {
  return {
    recipe_name: m.recipe_name || m.note_title || null,
    recipe_slug: m.recipe_slug || null,
    image_url:   m.image_url   || null,
    note:        m.note_title  || null
  };
}

router.post('/message', (req, res) => {
  const { message, ttl_seconds = 30 } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  const expiresAt = new Date(Date.now() + Number(ttl_seconds) * 1000).toISOString();
  const info = db.prepare(
    'INSERT INTO display_messages (message, expires_at) VALUES (?, ?)'
  ).run(message, expiresAt);
  res.status(201).json({ id: info.lastInsertRowid, expires_at: expiresAt });
});

export default router;
