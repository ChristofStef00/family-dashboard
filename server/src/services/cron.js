import cron from 'node-cron';
import { syncAllCalendars } from '../routes/calendar.js';
import { syncMealPlan, isConfigured as mealieConfigured } from './mealie.js';
import { db } from '../db/index.js';

// Calendar refresh every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    const r = await syncAllCalendars();
    if (!r.skipped) console.log('[cron] calendar sync:', r);
  } catch (e) { console.error('[cron] calendar sync failed:', e.message); }
});

// Clean up expired display messages every minute
cron.schedule('* * * * *', () => {
  db.prepare("DELETE FROM display_messages WHERE expires_at < datetime('now')").run();
});

// Mealie sync — top of every hour. Pulls meal plan AND the configured cookbook.
cron.schedule('0 * * * *', async () => {
  await runMealieSync('cron');
});

// Warm-up sync on boot if Mealie is configured (deferred so server can finish starting)
setTimeout(() => runMealieSync('boot'), 5000);

async function runMealieSync(label) {
  if (!mealieConfigured()) return;
  try {
    const r = await syncMealPlan();
    if (r.skipped) return;
    if (r.error) console.error(`[${label}] mealie sync error:`, r.error);
    else console.log(`[${label}] mealie sync:`, r);
  } catch (e) {
    console.error(`[${label}] mealie sync threw:`, e.message);
  }
}
