import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// Keys whose VALUES are never returned in the public settings response —
// only a sentinel showing whether they're set. Updating still works as
// usual via the admin-protected PUT.
const SECRET_KEYS = new Set(['mealie_token']);

function asObject({ includeSecrets = false } = {}) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const r of rows) {
    if (!includeSecrets && SECRET_KEYS.has(r.key)) {
      obj[r.key] = r.value ? '__set__' : '';
      continue;
    }
    try { obj[r.key] = JSON.parse(r.value); }
    catch { obj[r.key] = r.value; }
  }
  return obj;
}

router.get('/', (_req, res) => res.json(asObject()));

// Admin-protected variant exposes raw values (currently unused; reserved for
// future panels that need to display existing secrets — UIs should prefer the
// "__set__" sentinel + replace-only flow.)
router.get('/full', requireAdmin, (_req, res) => res.json(asObject({ includeSecrets: true })));

router.put('/', requireAdmin, (req, res) => {
  const updates = req.body || {};
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      // Skip empty-string updates to secret fields so users don't accidentally clear
      // a previously-saved token by submitting the form with the masked field empty.
      if (SECRET_KEYS.has(k) && (v === '' || v == null)) continue;
      const value = typeof v === 'string' ? v : JSON.stringify(v);
      upsert.run(k, value);
    }
  });
  tx();
  res.json(asObject());
});

export default router;
