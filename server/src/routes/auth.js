import { Router } from 'express';
import { signAdminToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { pin } = req.body || {};
  const expected = process.env.ADMIN_PIN || '1234';
  if (!pin || String(pin) !== String(expected)) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  res.json({ token: signAdminToken() });
});

router.get('/check', (_req, res) => res.json({ ok: true }));

export default router;
