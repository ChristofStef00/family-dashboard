import { db } from '../db/index.js';

/* ───── Settings helpers ────────────────────────────────────────────── */

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function isConfigured() {
  return Boolean(getSetting('mealie_url', '') && getSetting('mealie_token', ''));
}

function baseUrl() {
  return String(getSetting('mealie_url', '') || '').replace(/\/+$/, '');
}

function imageUrlForRecipe(slug) {
  const base = baseUrl();
  if (!base || !slug) return null;
  return `${base}/api/media/recipes/${slug}/images/min-original.webp`;
}

/* ───── Date helpers ────────────────────────────────────────────────── */

export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ───── HTTP wrapper with timeout + auth ────────────────────────────── */

const TIMEOUT_MS = 5000;

class MealieError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function mealieFetch(path) {
  if (!isConfigured()) throw new MealieError('Mealie not configured', 0);
  const url = `${baseUrl()}${path}`;
  const token = getSetting('mealie_token', '');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: ctrl.signal
    });
    if (!res.ok) {
      throw new MealieError(`Mealie ${res.status} ${res.statusText}`, res.status);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof MealieError) throw e;
    if (e.name === 'AbortError') throw new MealieError('Mealie request timed out', 408);
    throw new MealieError(e.message || 'Mealie network error', 0);
  } finally {
    clearTimeout(timer);
  }
}

/* ───── Public API ──────────────────────────────────────────────────── */

// Mealie renamed "groups" → "households" in v2. Probe both, cache the winner.
const MEALPLAN_PATHS = ['/api/households/mealplans', '/api/groups/mealplans'];
let workingMealplanPath = null;

export async function getMealPlan(startDate, endDate) {
  const qs = `?start_date=${startDate}&end_date=${endDate}&perPage=200`;

  if (workingMealplanPath) {
    try {
      return await mealieFetch(`${workingMealplanPath}${qs}`);
    } catch (e) {
      // Path may have changed (URL swap, version upgrade). Retry detection on 404.
      if (e.status !== 404) throw e;
      workingMealplanPath = null;
    }
  }

  let lastErr;
  for (const path of MEALPLAN_PATHS) {
    try {
      const data = await mealieFetch(`${path}${qs}`);
      workingMealplanPath = path;
      console.log(`[mealie] using ${path}`);
      return data;
    } catch (e) {
      lastErr = e;
      if (e.status !== 404) throw e; // auth / timeout / network — bail immediately
    }
  }
  throw lastErr || new MealieError('No supported Mealie mealplans path', 404);
}

export async function getRecipe(slugOrId) {
  return mealieFetch(`/api/recipes/${encodeURIComponent(slugOrId)}`);
}

/* ───── Mealie write wrapper (POST/DELETE) ──────────────────────────── */

async function mealieWrite(method, path, body) {
  if (!isConfigured()) throw new MealieError('Mealie not configured', 0);
  const url = `${baseUrl()}${path}`;
  const token = getSetting('mealie_token', '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) throw new MealieError(`Mealie ${res.status} ${res.statusText}`, res.status);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    if (e instanceof MealieError) throw e;
    if (e.name === 'AbortError') throw new MealieError('Mealie request timed out', 408);
    throw new MealieError(e.message || 'Mealie network error', 0);
  } finally {
    clearTimeout(timer);
  }
}

async function mealieCreateMealplan({ date, entryType = 'dinner', recipeId }) {
  const candidates = workingMealplanPath
    ? [workingMealplanPath, ...MEALPLAN_PATHS.filter(p => p !== workingMealplanPath)]
    : MEALPLAN_PATHS;
  let lastErr;
  for (const path of candidates) {
    try {
      const res = await mealieWrite('POST', path, { date, entryType, recipeId });
      workingMealplanPath = path;
      return res;
    } catch (e) {
      lastErr = e;
      if (e.status !== 404) throw e;
    }
  }
  throw lastErr || new MealieError('Mealie mealplan POST not found', 404);
}

/**
 * POST a "made it" event to a recipe's timeline. Mealie computes "Last Made"
 * from the most recent timeline event of type info, so this is what populates
 * that little widget on the recipe page.
 */
async function mealieAddRecipeTimelineEvent(slug, { recipeId, subject = 'Made it', message = null, timestamp } = {}) {
  const body = {
    subject,
    eventType: 'info',
    timestamp: timestamp || new Date().toISOString(),
    ...(recipeId ? { recipeId } : null),
    ...(message  ? { eventMessage: message } : null)
  };
  const variants = [
    `/api/households/recipes/${encodeURIComponent(slug)}/timeline/events`,
    `/api/groups/recipes/${encodeURIComponent(slug)}/timeline/events`,
    // Some Mealie versions accept a flat collection endpoint:
    `/api/recipes/timeline/events`
  ];
  let lastErr;
  for (const path of variants) {
    try {
      return await mealieWrite('POST', path, body);
    } catch (e) {
      lastErr = e;
      if (e.status !== 404 && e.status !== 405) throw e;
    }
  }
  throw lastErr || new MealieError('Mealie recipe timeline endpoint not found', 404);
}

async function mealieDeleteMealplan(entryId) {
  if (!entryId) return;
  const candidates = workingMealplanPath
    ? [workingMealplanPath, ...MEALPLAN_PATHS.filter(p => p !== workingMealplanPath)]
    : MEALPLAN_PATHS;
  let lastErr;
  for (const path of candidates) {
    try {
      await mealieWrite('DELETE', `${path}/${encodeURIComponent(entryId)}`);
      workingMealplanPath = path;
      return;
    } catch (e) {
      lastErr = e;
      if (e.status !== 404) throw e;
    }
  }
  throw lastErr || new MealieError('Mealie mealplan DELETE not found', 404);
}

/* ───── Meal pool (unique recipes from the meal plan) ───────────────── */

/**
 * After a meal plan sync, walk the unique recipe slugs from the cache and
 * fetch full recipe details (ingredients + instructions + times) for each,
 * upserting into recipe_cache. Recipes whose slug no longer appears anywhere
 * in the current cache are pruned.
 *
 * Returns { fetched, failed, removed }.
 */
export async function syncMealPoolRecipes() {
  if (!isConfigured()) return { skipped: true };
  const rows = db.prepare(`
    SELECT DISTINCT recipe_slug FROM meal_plan_cache
    WHERE recipe_slug IS NOT NULL AND recipe_slug != ''
  `).all();
  const wantedSlugs = new Set(rows.map(r => r.recipe_slug));

  const upsert = db.prepare(`
    INSERT INTO recipe_cache
      (id, slug, name, description, image_url, prep_time, cook_time, total_time, perform_time, servings, ingredients, instructions, cookbook_slug, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug, name = excluded.name, description = excluded.description,
      image_url = excluded.image_url, prep_time = excluded.prep_time, cook_time = excluded.cook_time,
      total_time = excluded.total_time, perform_time = excluded.perform_time,
      servings = excluded.servings, ingredients = excluded.ingredients,
      instructions = excluded.instructions, cached_at = datetime('now')
  `);

  let fetched = 0, failed = 0;
  for (const slug of wantedSlugs) {
    try {
      const r = await getRecipe(slug);
      upsert.run(
        r.id || slug,
        r.slug || slug,
        r.name || null,
        r.description || null,
        imageUrlForRecipe(r.slug || slug),
        r.prepTime    || null,
        r.cookTime    || null,
        r.totalTime   || null,
        r.performTime || null,
        Number(r.recipeYieldQuantity || r.recipeYield) || null,
        JSON.stringify(r.recipeIngredient   || []),
        JSON.stringify(r.recipeInstructions || [])
      );
      fetched++;
    } catch (e) {
      failed++;
      console.error(`[mealie] recipe ${slug} failed:`, e.message);
    }
  }

  // Prune cached recipes — and their done state — for slugs that no longer
  // appear in the meal plan. This keeps "Mark as made" tied to the current
  // shopping pool; if you re-curate, old marks naturally fall off.
  const removed = (() => {
    const all = db.prepare('SELECT slug FROM recipe_cache').all();
    const stmtR = db.prepare('DELETE FROM recipe_cache     WHERE slug = ?');
    const stmtM = db.prepare('DELETE FROM meal_completions WHERE recipe_slug = ?');
    const stmtP = db.prepare('DELETE FROM planned_meals    WHERE recipe_slug = ?');
    let n = 0;
    for (const row of all) {
      if (!wantedSlugs.has(row.slug)) {
        stmtR.run(row.slug);
        stmtM.run(row.slug);
        stmtP.run(row.slug);
        n++;
      }
    }
    return n;
  })();

  return { fetched, failed, removed };
}

/**
 * Returns the deduped recipe pool — every distinct recipe that appears in the
 * meal plan, with full details from recipe_cache. Each row includes a `done`
 * boolean and a `completed_at` timestamp from meal_completions. Sorted by name.
 */
export function getMealPool() {
  const rows = db.prepare(`
    SELECT
      r.id, r.slug, r.name, r.description, r.image_url,
      r.prep_time, r.cook_time, r.total_time, r.perform_time, r.servings,
      mc.completed_at,
      pm.meal_date AS planned_date,
      log.times_made,
      log.last_made_at
    FROM recipe_cache r
    LEFT JOIN meal_completions mc ON mc.recipe_slug = r.slug
    LEFT JOIN (
      SELECT recipe_slug, MIN(meal_date) AS meal_date
      FROM planned_meals
      GROUP BY recipe_slug
    ) pm ON pm.recipe_slug = r.slug
    LEFT JOIN (
      SELECT recipe_slug, COUNT(*) AS times_made, MAX(made_at) AS last_made_at
      FROM meal_completion_log
      GROUP BY recipe_slug
    ) log ON log.recipe_slug = r.slug
    WHERE r.slug IN (
      SELECT DISTINCT recipe_slug FROM meal_plan_cache
      WHERE recipe_slug IS NOT NULL AND recipe_slug != ''
    )
    ORDER BY r.name COLLATE NOCASE
  `).all();
  return rows.map(r => ({
    ...r,
    done: !!r.completed_at,
    times_made: r.times_made || 0
  }));
}

/** Full made-history rows for a single recipe (most recent first). */
export function getMealHistory(slug) {
  return db.prepare(`
    SELECT id, recipe_slug, made_at FROM meal_completion_log
    WHERE recipe_slug = ?
    ORDER BY made_at DESC
    LIMIT 50
  `).all(slug);
}

export async function markMealDone(slug) {
  // Local writes first — never depend on Mealie being up
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO meal_completions (recipe_slug) VALUES (?)
      ON CONFLICT(recipe_slug) DO UPDATE SET completed_at = datetime('now')
    `).run(slug);
    db.prepare(`INSERT INTO meal_completion_log (recipe_slug) VALUES (?)`).run(slug);
  });
  tx();

  // Best-effort: push a "Made it" timeline event to Mealie so its
  // Last-Made widget updates alongside our local log.
  if (isConfigured()) {
    const recipeRow = db.prepare('SELECT id FROM recipe_cache WHERE slug = ?').get(slug);
    try {
      await mealieAddRecipeTimelineEvent(slug, {
        recipeId: recipeRow?.id || null,
        subject: 'Made it',
        message: 'Marked as made from the family dashboard.'
      });
    } catch (e) {
      console.warn('[mealie] timeline event push failed:', e.message);
    }
  }

  return db.prepare('SELECT * FROM meal_completions WHERE recipe_slug = ?').get(slug);
}

export function unmarkMealDone(slug) {
  db.prepare('DELETE FROM meal_completions WHERE recipe_slug = ?').run(slug);
}

/* ───── Planned meals (calendar assignments) ────────────────────────── */

/**
 * Schedule a meal to a single day. Replaces any prior schedule for the same
 * recipe, both locally and in Mealie's meal plan. Mealie failures degrade
 * gracefully — the local row still saves.
 */
export async function planMeal(slug, mealDate) {
  // Surface any existing local entry to clean up its Mealie counterpart first
  const prior = db.prepare(
    'SELECT id, mealie_entry_id FROM planned_meals WHERE recipe_slug = ?'
  ).get(slug);
  if (prior?.mealie_entry_id && isConfigured()) {
    try { await mealieDeleteMealplan(prior.mealie_entry_id); }
    catch (e) { console.warn('[mealie] delete prior mealplan entry failed:', e.message); }
  }

  // Clear local
  db.prepare('DELETE FROM planned_meals WHERE recipe_slug = ?').run(slug);

  // Push to Mealie (best-effort)
  let mealieEntryId = null;
  if (isConfigured()) {
    const recipeRow = db.prepare('SELECT id FROM recipe_cache WHERE slug = ?').get(slug);
    if (recipeRow?.id) {
      try {
        const created = await mealieCreateMealplan({
          date: mealDate,
          entryType: 'dinner',
          recipeId: recipeRow.id
        });
        mealieEntryId = created?.id || null;
      } catch (e) {
        console.warn('[mealie] create mealplan entry failed:', e.message);
      }
    }
  }

  // Insert local with the Mealie id (if any)
  db.prepare(
    'INSERT INTO planned_meals (recipe_slug, meal_date, mealie_entry_id) VALUES (?, ?, ?)'
  ).run(slug, mealDate, mealieEntryId);

  return db.prepare(
    'SELECT * FROM planned_meals WHERE recipe_slug = ? AND meal_date = ?'
  ).get(slug, mealDate);
}

export async function unplanMealById(id) {
  const row = db.prepare('SELECT mealie_entry_id FROM planned_meals WHERE id = ?').get(id);
  if (row?.mealie_entry_id && isConfigured()) {
    try { await mealieDeleteMealplan(row.mealie_entry_id); }
    catch (e) { console.warn('[mealie] delete mealplan entry failed:', e.message); }
  }
  db.prepare('DELETE FROM planned_meals WHERE id = ?').run(id);
}

export async function unplanMealByDate(slug, mealDate) {
  const row = db.prepare(
    'SELECT mealie_entry_id FROM planned_meals WHERE recipe_slug = ? AND meal_date = ?'
  ).get(slug, mealDate);
  if (row?.mealie_entry_id && isConfigured()) {
    try { await mealieDeleteMealplan(row.mealie_entry_id); }
    catch (e) { console.warn('[mealie] delete mealplan entry failed:', e.message); }
  }
  db.prepare(
    'DELETE FROM planned_meals WHERE recipe_slug = ? AND meal_date = ?'
  ).run(slug, mealDate);
}

/** Planned meals for a date range, joined with recipe_cache for display. */
export function listPlannedMeals(startDate, endDate) {
  const rows = db.prepare(`
    SELECT
      p.id, p.recipe_slug, p.meal_date,
      r.name, r.image_url, r.prep_time, r.cook_time, r.total_time
    FROM planned_meals p
    LEFT JOIN recipe_cache r ON r.slug = p.recipe_slug
    WHERE p.meal_date BETWEEN ? AND ?
    ORDER BY p.meal_date, p.id
  `).all(startDate, endDate);
  return rows;
}

/** Dates a specific recipe is currently scheduled for. */
export function plannedDatesFor(slug) {
  return db.prepare(`
    SELECT id, meal_date FROM planned_meals WHERE recipe_slug = ? ORDER BY meal_date
  `).all(slug);
}

export function getCachedRecipe(slugOrId) {
  const row = db.prepare(`
    SELECT * FROM recipe_cache WHERE slug = ? OR id = ? LIMIT 1
  `).get(slugOrId, slugOrId);
  if (!row) return null;
  return {
    ...row,
    ingredients:  row.ingredients  ? safeJSON(row.ingredients,  []) : [],
    instructions: row.instructions ? safeJSON(row.instructions, []) : []
  };
}
function safeJSON(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

/**
 * Probe the Mealie API to detect version + which mealplan path works.
 * Returns rich diagnostic info so the admin UI can show useful detail.
 */
export async function testConnection() {
  // 1. Hit /api/app/about — confirms host + auth, exposes version
  let about;
  try {
    about = await mealieFetch('/api/app/about');
  } catch (e) {
    throw new MealieError(
      `Can't reach Mealie. ${e.status === 0 ? 'Network or URL problem.' : e.message}`,
      e.status || 0
    );
  }
  const version = about?.version || 'unknown';

  // 2. Probe each known mealplan path for THIS install
  const today = ymd(new Date());
  const tried = [];
  for (const path of MEALPLAN_PATHS) {
    try {
      await mealieFetch(`${path}?start_date=${today}&end_date=${today}&perPage=1`);
      workingMealplanPath = path;
      return { ok: true, version, mealplan_path: path, tried };
    } catch (e) {
      tried.push({ path, status: e.status, error: e.message });
      if (e.status !== 404) {
        throw new MealieError(`${path}: ${e.message}`, e.status);
      }
    }
  }
  // Reached only if every candidate path 404'd
  throw new MealieError(
    `Mealie ${version} is reachable, but no known mealplan endpoint matched. Tried: ${tried.map(t => t.path).join(', ')}`,
    404
  );
}

/**
 * Pull -7 → +14 days, replace cache for that range.
 */
export async function syncMealPlan() {
  if (!isConfigured()) return { skipped: true, reason: 'not configured' };

  const start = new Date(); start.setDate(start.getDate() - 7);
  const end   = new Date(); end.setDate(end.getDate() + 14);
  const startStr = ymd(start);
  const endStr   = ymd(end);

  let payload;
  try {
    payload = await getMealPlan(startStr, endStr);
  } catch (e) {
    if (e.status === 401) console.error('[mealie] auth failed — check token');
    return { error: e.message, status: e.status, synced_at: null };
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const insert = db.prepare(`
    INSERT INTO meal_plan_cache
    (meal_date, entry_type, recipe_id, recipe_name, recipe_slug, image_url, note_title, note_body, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const deleteRange = db.prepare(`DELETE FROM meal_plan_cache WHERE meal_date BETWEEN ? AND ?`);

  const tx = db.transaction(() => {
    deleteRange.run(startStr, endStr);
    for (const item of items) {
      const slug = item.recipe?.slug || null;
      insert.run(
        item.date,
        item.entryType || 'dinner',
        item.recipe?.id || null,
        item.recipe?.name || null,
        slug,
        imageUrlForRecipe(slug),
        item.title || null,
        item.text  || null
      );
    }
  });
  tx();

  // After the meal plan cache is fresh, walk unique recipes and pull details.
  let pool = { fetched: 0, failed: 0, removed: 0 };
  try {
    pool = await syncMealPoolRecipes();
  } catch (e) {
    console.error('[mealie] pool refresh failed:', e.message);
  }

  const synced_at = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('mealie_last_sync', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(synced_at));
  return { count: items.length, pool, synced_at };
}

/* ───── Cache readers (used by routes) ──────────────────────────────── */

const allowedTypes = () => {
  const types = getSetting('mealie_meal_types', ['breakfast','lunch','dinner','snack']);
  return Array.isArray(types) ? new Set(types) : new Set();
};

export function getTodaysMeals() {
  const today = ymd(new Date());
  const rows = db.prepare(`SELECT * FROM meal_plan_cache WHERE meal_date = ? ORDER BY entry_type`).all(today);
  const allow = allowedTypes();
  const out = {};
  for (const r of rows) {
    if (allow.size && !allow.has(r.entry_type)) continue;
    out[r.entry_type] = r;
  }
  return out;
}

export function getWeekMeals(daysFromToday = 7) {
  const start = ymd(new Date());
  const end = ymd(new Date(Date.now() + daysFromToday * 86400000));
  const rows = db.prepare(`
    SELECT * FROM meal_plan_cache
    WHERE meal_date BETWEEN ? AND ?
    ORDER BY meal_date, entry_type
  `).all(start, end);

  const allow = allowedTypes();
  const byDate = new Map();
  for (const r of rows) {
    if (allow.size && !allow.has(r.entry_type)) continue;
    if (!byDate.has(r.meal_date)) byDate.set(r.meal_date, { date: r.meal_date });
    byDate.get(r.meal_date)[r.entry_type] = r;
  }

  // Fill in any missing days between start..end so the UI sees a contiguous range
  const result = [];
  for (let i = 0; i <= daysFromToday; i++) {
    const d = ymd(new Date(Date.now() + i * 86400000));
    result.push(byDate.get(d) || { date: d });
  }
  return result;
}

export function getLastSync() {
  const fromSettings = getSetting('mealie_last_sync', null);
  if (fromSettings) return fromSettings;
  const row = db.prepare(`SELECT MAX(synced_at) AS at FROM meal_plan_cache`).get();
  return row?.at || null;
}
