import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  getTodaysMeals, getWeekMeals, syncMealPlan,
  testConnection, getRecipe, getLastSync, isConfigured,
  getMealPool, getCachedRecipe,
  markMealDone, unmarkMealDone, getMealHistory,
  planMeal, unplanMealById, unplanMealByDate, listPlannedMeals, plannedDatesFor
} from '../services/mealie.js';

const router = Router();

router.get('/today', (_req, res) => {
  res.json({ configured: isConfigured(), meals: getTodaysMeals() });
});

router.get('/week', (req, res) => {
  const days = Math.min(Number(req.query.days) || 7, 14);
  res.json({ configured: isConfigured(), days: getWeekMeals(days) });
});

router.get('/last-sync', (_req, res) => {
  res.json({ synced_at: getLastSync(), configured: isConfigured() });
});

/* ───── Meal pool (deduped recipes from the meal plan) ──────────────── */

router.get('/meals', (_req, res) => {
  res.json({ configured: isConfigured(), meals: getMealPool() });
});

router.post('/meals/:slug/complete', async (req, res) => {
  try {
    const row = await markMealDone(req.params.slug);
    res.status(201).json({ ok: true, ...row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/meals/:slug/complete', (req, res) => {
  unmarkMealDone(req.params.slug);
  res.status(204).end();
});

/* Planned meal calendar assignments */

router.get('/planned', (req, res) => {
  const start = req.query.start || new Date().toISOString().slice(0, 10);
  const end   = req.query.end   || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  res.json(listPlannedMeals(start, end));
});

router.get('/meals/:slug/planned', (req, res) => {
  res.json(plannedDatesFor(req.params.slug));
});

router.post('/meals/:slug/plan', async (req, res) => {
  const { meal_date } = req.body || {};
  if (!meal_date || !/^\d{4}-\d{2}-\d{2}$/.test(meal_date)) {
    return res.status(400).json({ error: 'meal_date (YYYY-MM-DD) required' });
  }
  try {
    const row = await planMeal(req.params.slug, meal_date);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/planned/:id', async (req, res) => {
  try {
    await unplanMealById(Number(req.params.id));
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/meals/:slug/plan', async (req, res) => {
  const date = req.query.meal_date;
  if (!date) return res.status(400).json({ error: 'meal_date required' });
  try {
    await unplanMealByDate(req.params.slug, date);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/meals/:slug/history', (req, res) => {
  res.json(getMealHistory(req.params.slug));
});

router.get('/recipe/:slug', async (req, res) => {
  const slug = req.params.slug;
  const cached = getCachedRecipe(slug);
  if (cached) return res.json(cached);

  try {
    const r = await getRecipe(slug);
    res.json({
      id: r.id, slug: r.slug, name: r.name, description: r.description,
      prep_time:    r.prepTime    || null,
      cook_time:    r.cookTime    || null,
      total_time:   r.totalTime   || null,
      perform_time: r.performTime || null,
      servings: Number(r.recipeYieldQuantity || r.recipeYield) || null,
      ingredients:  r.recipeIngredient   || [],
      instructions: r.recipeInstructions || []
    });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

router.post('/sync', requireAdmin, async (_req, res) => {
  try {
    const result = await syncMealPlan();
    if (result.error) return res.status(502).json(result);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/test', requireAdmin, async (_req, res) => {
  if (!isConfigured()) return res.status(400).json({ error: 'Mealie URL/token not set' });
  try {
    const result = await testConnection();
    res.json(result);
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message, status: e.status || 0 });
  }
});

export default router;
