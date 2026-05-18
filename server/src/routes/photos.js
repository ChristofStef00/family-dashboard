import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const uploadDir = process.env.UPLOAD_DIR || path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  }
});

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM photos ORDER BY added_at DESC').all();
  res.json(rows.map(p => ({ ...p, url: `/uploads/${p.filename}` })));
});

router.post('/', requireAdmin, upload.array('photos', 50), (req, res) => {
  const insert = db.prepare('INSERT INTO photos (filename, path, caption) VALUES (?, ?, ?)');
  const created = (req.files || []).map(f => {
    const info = insert.run(f.filename, f.path, req.body?.caption || null);
    return { id: info.lastInsertRowid, filename: f.filename, url: `/uploads/${f.filename}` };
  });
  res.status(201).json(created);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  if (photo) {
    try { fs.unlinkSync(photo.path); } catch { /* ignore */ }
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  }
  res.status(204).end();
});

export default router;
