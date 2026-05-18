import { db } from '../db/index.js';

/* ───── Date helpers ────────────────────────────────────────────────── */

export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

/**
 * Format a Date as SQLite's `datetime('now')` shape: "YYYY-MM-DD HH:MM:SS" UTC.
 * Needed for `awarded_at >= ?` comparisons since `Date.toISOString()` uses a
 * "T" separator and trailing "Z", which sorts wrong against `datetime('now')`
 * stored values (space < T lexically → false negatives on dedup).
 */
function toSqliteUTC(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/* ───── Point totals (single source of truth) ───────────────────────── */

/**
 * Per-member points totals across all award sources:
 *   chore_completions + routine_completions + streak_awards    (earned)
 *   reward_redemptions                                          (spent)
 * Returns rows of { member_id, earned, spent } for every member
 * (zero-rows for members who haven't earned/spent anything).
 */
export function getPointTotals() {
  return db.prepare(`
    SELECT m.id AS member_id,
           COALESCE(e.earned, 0) AS earned,
           COALESCE(s.spent,  0) AS spent
    FROM family_members m
    LEFT JOIN (
      SELECT member_id, SUM(p) AS earned FROM (
        SELECT member_id, points_awarded AS p FROM chore_completions
        UNION ALL
        SELECT member_id, points_awarded AS p FROM routine_completions
        UNION ALL
        SELECT member_id, points_awarded AS p FROM streak_awards
      ) GROUP BY member_id
    ) e ON e.member_id = m.id
    LEFT JOIN (
      SELECT member_id, SUM(point_cost) AS spent FROM reward_redemptions GROUP BY member_id
    ) s ON s.member_id = m.id
  `).all();
}

/** Map of member_id → { earned, spent, balance } for fast lookup. */
export function getPointTotalsMap() {
  const map = new Map();
  for (const r of getPointTotals()) {
    map.set(r.member_id, {
      earned:  r.earned,
      spent:   r.spent,
      balance: r.earned - r.spent
    });
  }
  return map;
}

/* ───── Streak helpers: vacation + scheduling + success ─────────────── */

/**
 * The set of "YYYY-MM-DD" strings that are vacation days for memberId.
 * Vacation date ranges with member_ids=[] cover everyone; otherwise only
 * the listed members. Inclusive on both ends.
 */
function vacationDaySet(memberId) {
  const out = new Set();
  const rows = db.prepare('SELECT member_ids, start_date, end_date FROM vacations').all();
  for (const v of rows) {
    let ids = [];
    try { ids = JSON.parse(v.member_ids || '[]'); } catch { /* tolerate corrupt */ }
    if (ids.length > 0 && !ids.includes(memberId)) continue;
    const start = new Date(`${v.start_date}T00:00:00`);
    const end   = new Date(`${v.end_date  }T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.add(ymd(d));
    }
  }
  return out;
}

/** Does this chore's frequency place it on this day-of-week? */
function choreFrequencyApplies(chore, date) {
  const dow = date.getDay();
  switch (chore.frequency) {
    case 'daily':   return true;
    case 'custom':  return Array.isArray(chore.custom_days) && chore.custom_days.includes(dow);
    // 'weekly' and 'once' have no clean per-day "due today" semantic — exclude
    // from streak scheduling so admins don't trip over surprising behaviour.
    default:        return false;
  }
}

function routineFrequencyApplies(routine, date) {
  const dow = date.getDay();
  switch (routine.frequency) {
    case 'daily':    return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'custom':   return Array.isArray(routine.custom_days) && routine.custom_days.includes(dow);
    default:         return false;
  }
}

/** Active chores assigned to memberId (parsed assignee_ids). */
function memberChores(memberId) {
  const rows = db.prepare(`
    SELECT id, frequency, custom_days, assignee_ids
    FROM chores
    WHERE active = 1 AND category = 'chore'
  `).all();
  const out = [];
  for (const r of rows) {
    let ids = [];
    try { ids = JSON.parse(r.assignee_ids || '[]'); } catch { /* skip */ }
    if (!ids.includes(memberId)) continue;
    out.push({
      ...r,
      custom_days: r.custom_days ? JSON.parse(r.custom_days) : null
    });
  }
  return out;
}

/** Active routines assigned to memberId. */
function memberRoutines(memberId) {
  const rows = db.prepare(`
    SELECT id, frequency, custom_days, assignee_ids
    FROM routines
    WHERE active = 1
  `).all();
  const out = [];
  for (const r of rows) {
    let ids = [];
    try { ids = JSON.parse(r.assignee_ids || '[]'); } catch { /* skip */ }
    if (!ids.includes(memberId)) continue;
    out.push({
      ...r,
      custom_days: r.custom_days ? JSON.parse(r.custom_days) : null
    });
  }
  return out;
}

/** Was this specific chore completed by this member on this date? */
function choreCompletedOn(choreId, memberId, dateStr) {
  const row = db.prepare(`
    SELECT 1 FROM chore_completions
    WHERE chore_id = ? AND member_id = ?
      AND date(completed_at, 'localtime') = ?
    LIMIT 1
  `).get(choreId, memberId, dateStr);
  return !!row;
}

/** Was this specific routine completed by this member on this date? */
function routineCompletedOn(routineId, memberId, dateStr) {
  const row = db.prepare(`
    SELECT 1 FROM routine_completions
    WHERE routine_id = ? AND member_id = ? AND completion_date = ?
    LIMIT 1
  `).get(routineId, memberId, dateStr);
  return !!row;
}

/**
 * Is the streak target "scheduled" for this member on `date`?
 *   - chore         → chore.frequency includes this DOW
 *   - routine       → routine.frequency includes this DOW
 *   - all_chores    → at least one assigned chore has this DOW scheduled
 *   - all_routines  → at least one assigned routine has this DOW scheduled
 */
function isScheduledOn(reward, memberId, date, ctx) {
  switch (reward.kind) {
    case 'chore': {
      if (!ctx.chore) return false;
      return choreFrequencyApplies(ctx.chore, date);
    }
    case 'routine': {
      if (!ctx.routine) return false;
      return routineFrequencyApplies(ctx.routine, date);
    }
    case 'all_chores':
      return ctx.chores.some(c => choreFrequencyApplies(c, date));
    case 'all_routines':
      return ctx.routines.some(r => routineFrequencyApplies(r, date));
    default:
      return false;
  }
}

/**
 * Was the streak target "successfully done" for this member on `date`?
 *   - chore         → one chore_completions row for that chore+date
 *   - routine       → one routine_completions row for that routine+date
 *   - all_chores    → every chore scheduled on `date` has a completion
 *   - all_routines  → every routine scheduled on `date` has a completion
 */
function isSuccessOn(reward, memberId, date, ctx) {
  const ds = ymd(date);
  switch (reward.kind) {
    case 'chore':
      return ctx.chore ? choreCompletedOn(ctx.chore.id, memberId, ds) : false;
    case 'routine':
      return ctx.routine ? routineCompletedOn(ctx.routine.id, memberId, ds) : false;
    case 'all_chores': {
      const due = ctx.chores.filter(c => choreFrequencyApplies(c, date));
      if (due.length === 0) return false;     // shouldn't get here, isScheduledOn = false
      return due.every(c => choreCompletedOn(c.id, memberId, ds));
    }
    case 'all_routines': {
      const due = ctx.routines.filter(r => routineFrequencyApplies(r, date));
      if (due.length === 0) return false;
      return due.every(r => routineCompletedOn(r.id, memberId, ds));
    }
    default:
      return false;
  }
}

/**
 * Pre-loads everything a streak walk needs for one (reward, member) pair so
 * the helpers don't re-query for each calendar day.
 */
function buildContext(reward, memberId) {
  const ctx = {
    chore:    null,
    routine:  null,
    chores:   [],
    routines: [],
    vacs:     vacationDaySet(memberId)
  };
  if (reward.kind === 'chore' && reward.chore_id) {
    const c = db.prepare(
      'SELECT id, frequency, custom_days FROM chores WHERE id = ? AND active = 1'
    ).get(reward.chore_id);
    if (c) ctx.chore = { ...c, custom_days: c.custom_days ? JSON.parse(c.custom_days) : null };
  }
  if (reward.kind === 'routine' && reward.routine_id) {
    const r = db.prepare(
      'SELECT id, frequency, custom_days FROM routines WHERE id = ? AND active = 1'
    ).get(reward.routine_id);
    if (r) ctx.routine = { ...r, custom_days: r.custom_days ? JSON.parse(r.custom_days) : null };
  }
  if (reward.kind === 'all_chores')   ctx.chores   = memberChores(memberId);
  if (reward.kind === 'all_routines') ctx.routines = memberRoutines(memberId);
  return ctx;
}

/* ───── Streak math (event-based, vacation-aware) ───────────────────── */

/**
 * Current run for (reward, member). Counts successful *occurrences*: days
 * that are scheduled for the streak target and don't fall inside a vacation.
 * Days with nothing scheduled (or vacation days) don't increment the streak
 * but also don't break it. Grace rule: if today is scheduled but not yet
 * done, the prior scheduled day still anchors the streak.
 *
 * Returns { streak, runStart } where runStart is the Date of the earliest
 * success in the current run (or null if streak = 0). Callers that just
 * want the number should use the legacy single-arg form.
 */
export function computeStreakWithStart(reward, memberId) {
  const ctx = buildContext(reward, memberId);
  const today = startOfToday();
  const days = [];                                    // scheduled, non-vacation; newest first

  for (let i = 0; i < 365 && days.length < 365; i++) {
    const d  = addDays(today, -i);
    if (ctx.vacs.has(ymd(d))) continue;
    if (!isScheduledOn(reward, memberId, d, ctx)) continue;
    days.push(d);
  }
  if (days.length === 0) return { streak: 0, runStart: null };

  let i = 0;
  if (sameDay(days[0], today) && !isSuccessOn(reward, memberId, days[0], ctx)) {
    i = 1;                                            // grace: today not yet done
  }

  let streak = 0;
  let runStart = null;
  for (; i < days.length; i++) {
    if (isSuccessOn(reward, memberId, days[i], ctx)) {
      streak++;
      runStart = days[i];                             // keep updating to the oldest success
    } else {
      break;
    }
  }
  return { streak, runStart };
}

/** Legacy single-number variant. */
export function computeStreak(reward, memberId) {
  return computeStreakWithStart(reward, memberId).streak;
}

/**
 * Longest historical run for (reward, member), walking forward through the
 * last 365 days. Vacation days and unscheduled days are skipped (neither
 * break the run nor extend it).
 */
export function computeBestStreak(reward, memberId) {
  const ctx = buildContext(reward, memberId);
  const today = startOfToday();
  let best = 0, run = 0;
  for (let i = 365; i >= 0; i--) {
    const d = addDays(today, -i);
    if (ctx.vacs.has(ymd(d))) continue;
    if (!isScheduledOn(reward, memberId, d, ctx)) continue;
    if (isSuccessOn(reward, memberId, d, ctx)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Did the streak target get fully done by this member today?
 * Mirrors isSuccessOn for today's date. Returns false if today isn't
 * scheduled for the target at all (so the display can show "not due today").
 */
export function isDoneToday(reward, memberId) {
  const ctx = buildContext(reward, memberId);
  const today = startOfToday();
  if (!isScheduledOn(reward, memberId, today, ctx)) return false;
  return isSuccessOn(reward, memberId, today, ctx);
}

/* ───── Streak award engine ─────────────────────────────────────────── */

/**
 * Resolves the eligible-member list for a streak reward.
 *   member_ids = [] → every visible (show_in_points=1) family member
 *   else            → the listed members
 */
export function streakRewardMembers(reward) {
  let ids = [];
  try { ids = JSON.parse(reward.member_ids || '[]'); } catch { /* tolerate */ }
  if (ids.length > 0) return ids;
  return db.prepare(
    'SELECT id FROM family_members WHERE show_in_points = 1 ORDER BY sort_order'
  ).all().map(r => r.id);
}

/**
 * Called after a chore OR routine completion. Picks up any active
 * streak_reward whose `kind` matches the completion (or is an aggregate that
 * includes it), recomputes the run, and inserts one streak_awards row per
 * fresh run that's just crossed its threshold.
 *
 *   ctx = { kind: 'chore',   chore_id }
 *       | { kind: 'routine', routine_id }
 *
 * Returns the array of newly-inserted awards, decorated with reward metadata.
 */
export function awardStreaksIfDue(memberId, ctx) {
  const candidates = pickCandidateRewards(memberId, ctx);
  if (!candidates.length) return [];

  const checkExisting = db.prepare(`
    SELECT id FROM streak_awards
    WHERE streak_reward_id = ? AND member_id = ? AND awarded_at >= ?
    LIMIT 1
  `);
  const insertAward = db.prepare(`
    INSERT INTO streak_awards (streak_reward_id, member_id, points_awarded, streak_value)
    VALUES (?, ?, ?, ?)
  `);

  const awarded = [];
  for (const r of candidates) {
    const { streak, runStart } = computeStreakWithStart(r, memberId);
    if (streak < r.threshold_days) continue;
    if (!runStart) continue;
    // Run-start = midnight local of the earliest success day in the run,
    // formatted to match the SQLite-stored awarded_at column for proper
    // lexical comparison.
    const rs = new Date(runStart);
    rs.setHours(0, 0, 0, 0);
    if (checkExisting.get(r.id, memberId, toSqliteUTC(rs))) continue;
    const info = insertAward.run(r.id, memberId, r.bonus_points || 0, streak);
    awarded.push({
      id: info.lastInsertRowid,
      streak_reward_id: r.id,
      member_id: memberId,
      kind: r.kind,
      points_awarded: r.bonus_points || 0,
      streak_value: streak,
      threshold_days: r.threshold_days
    });
  }
  return awarded;
}

/** Pulls active streak_rewards that match the completion ctx + member. */
function pickCandidateRewards(memberId, ctx) {
  // Match by kind:
  //   completing a chore   → kind='chore' with matching chore_id, OR kind='all_chores'
  //   completing a routine → kind='routine' with matching routine_id, OR kind='all_routines'
  let rows = [];
  if (ctx.kind === 'chore') {
    rows = db.prepare(`
      SELECT * FROM streak_rewards
      WHERE active = 1 AND (
        (kind = 'chore' AND chore_id = ?) OR (kind = 'all_chores')
      )
    `).all(ctx.chore_id);
  } else if (ctx.kind === 'routine') {
    rows = db.prepare(`
      SELECT * FROM streak_rewards
      WHERE active = 1 AND (
        (kind = 'routine' AND routine_id = ?) OR (kind = 'all_routines')
      )
    `).all(ctx.routine_id);
  }
  // Filter by member_ids targeting.
  return rows.filter(r => {
    let ids = [];
    try { ids = JSON.parse(r.member_ids || '[]'); } catch { /* */ }
    return ids.length === 0 || ids.includes(memberId);
  });
}

/* ───── Goal progress ───────────────────────────────────────────────── */

/**
 * Returns the member's current reward goal + progress, or null if no goal set.
 *   { reward_id, reward_title, point_cost, balance, progress_pct, redeemable }
 * progress = min(balance, cost) / cost.
 */
export function getGoalProgress(memberId, balanceOverride) {
  const row = db.prepare(`
    SELECT g.reward_id, g.selected_at,
           r.title AS reward_title, r.description, r.point_cost, r.active
    FROM member_reward_goals g
    JOIN rewards r ON r.id = g.reward_id
    WHERE g.member_id = ?
  `).get(memberId);
  if (!row) return null;

  let balance = balanceOverride;
  if (balance == null) {
    const totals = getPointTotalsMap().get(memberId) || { earned: 0, spent: 0, balance: 0 };
    balance = totals.balance;
  }
  const capped = Math.max(0, Math.min(balance, row.point_cost));
  const pct = row.point_cost > 0 ? Math.round((capped / row.point_cost) * 100) : 100;

  return {
    reward_id: row.reward_id,
    reward_title: row.reward_title,
    description: row.description,
    point_cost: row.point_cost,
    balance,
    progress_pct: pct,
    redeemable: balance >= row.point_cost,
    selected_at: row.selected_at
  };
}
