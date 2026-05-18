import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import './db/index.js';

import membersRouter from './routes/members.js';
import choresRouter from './routes/chores.js';
import rewardsRouter from './routes/rewards.js';
import photosRouter from './routes/photos.js';
import calendarRouter from './routes/calendar.js';
import weatherRouter from './routes/weather.js';
import settingsRouter from './routes/settings.js';
import authRouter from './routes/auth.js';
import haRouter from './routes/ha.js';
import messagesRouter from './routes/messages.js';
import quoteRouter from './routes/quote.js';
import streaksRouter from './routes/streaks.js';
import mealieRouter from './routes/mealie.js';
import routinesRouter from './routes/routines.js';
import bonusesRouter from './routes/bonuses.js';
import goalsRouter from './routes/goals.js';
import vacationsRouter from './routes/vacations.js';
import activityRouter from './routes/activity.js';
import './services/cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

const uploadDir = process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/members', membersRouter);
app.use('/api/chores', choresRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/photos', photosRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/quote', quoteRouter);
app.use('/api/streaks', streaksRouter);
app.use('/api/mealie', mealieRouter);
app.use('/api/routines', routinesRouter);
app.use('/api/bonuses', bonusesRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/vacations', vacationsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/ha', haRouter);

const clientDist = path.resolve(__dirname, '../../client/dist');
const adminDist  = path.resolve(__dirname, '../../admin/dist');
if (fs.existsSync(adminDist)) {
  app.use('/admin', express.static(adminDist));
  app.get('/admin/*', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
}
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Family Dashboard server listening on :${PORT}`);
});
