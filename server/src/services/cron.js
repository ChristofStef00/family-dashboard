import cron from 'node-cron';
import { syncAllCalendars } from '../routes/calendar.js';
import { syncAllIcs } from './ics-sync.js';
import { syncMealPlan, isConfigured as mealieConfigured } from './mealie.js';
import { db } from '../db/index.js';

// Calendar refresh every 15 minutes — OAuth + ICS feeds both run on the same cadence.
cron.schedule('*/15 * * * *', async () => {
  try {
    const r = await syncAllCalendars();
    if (!r.skipped) console.log('[cron] calendar sync:', r);
  } catch (e) { console.error('[cron] calendar sync failed:', e.message); }
  try {
    const r = await syncAllIcs();
    if (r.synced > 0 || r.errors.length > 0) console.log('[cron] ICS sync:', r);
  } catch (e) { console.error('[cron] ICS sync failed:', e.message); }
});

// Warm-up ICS sync shortly after boot so any subscriptions are populated quickly.
setTimeout(async () => {
  try {
    const r = await syncAllIcs();
    if (r.synced > 0 || r.errors.length > 0) console.log('[boot] ICS sync:', r);
  } catch (e) { console.error('[boot] ICS sync failed:', e.message); }
}, 4000);

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
