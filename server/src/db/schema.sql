-- Family Dashboard SQLite schema
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS family_members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  color       TEXT    NOT NULL DEFAULT '#9ca3af',
  emoji       TEXT    NOT NULL DEFAULT '🙂',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_tokens (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id          INTEGER NOT NULL,
  email              TEXT    NOT NULL,
  access_token       TEXT    NOT NULL,
  refresh_token      TEXT,
  expiry             INTEGER NOT NULL,
  scope              TEXT,
  selected_calendars TEXT    NOT NULL DEFAULT '["primary"]', -- JSON array of Google calendar IDs
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE,
  UNIQUE (member_id, email)
);

-- member_id is nullable: events from "shared" ICS subscriptions (no owner)
-- store NULL here and the row's `color` column carries their hue instead.
CREATE TABLE IF NOT EXISTS calendar_events (
  id            TEXT PRIMARY KEY,
  member_id     INTEGER,
  calendar_id   TEXT    NOT NULL,
  title         TEXT    NOT NULL,
  description   TEXT,
  location      TEXT,
  start_time    TEXT    NOT NULL,
  end_time      TEXT    NOT NULL,
  all_day       INTEGER NOT NULL DEFAULT 0,
  color         TEXT,                              -- per-event override; falls back to member.color, then to a neutral default
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_member ON calendar_events(member_id);
CREATE INDEX IF NOT EXISTS idx_events_calendar ON calendar_events(calendar_id);

-- Lightweight read-only calendar feeds (Google's "secret iCal address",
-- Outlook ICS export, etc.). Events flow into calendar_events with a
-- composite id of "ics:<sub_id>:<vevent_uid>" so they don't collide with
-- OAuth-sourced events.
-- member_id is nullable. If set, events render in that kid's color on the
-- kiosk. If null (a "shared" calendar — household events, school holidays,
-- etc.), the subscription's own `color` is used for every event.
CREATE TABLE IF NOT EXISTS ics_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER,
  name            TEXT    NOT NULL,
  url             TEXT    NOT NULL,
  color           TEXT,                                 -- hex; used when member_id IS NULL
  active          INTEGER NOT NULL DEFAULT 1,
  last_synced_at  TEXT,
  last_error      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ics_subscriptions_member ON ics_subscriptions(member_id);

CREATE TABLE IF NOT EXISTS chores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  description   TEXT,
  assignee_ids  TEXT    NOT NULL DEFAULT '[]',  -- JSON array of member ids
  frequency     TEXT    NOT NULL DEFAULT 'daily', -- daily | weekly | custom
  custom_days   TEXT,                              -- JSON array 0-6 (Sun-Sat) for custom
  points        INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chore_completions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chore_id      INTEGER NOT NULL,
  member_id     INTEGER NOT NULL,
  completed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  points_awarded INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_completions_member ON chore_completions(member_id);
CREATE INDEX IF NOT EXISTS idx_completions_completed_at ON chore_completions(completed_at);

CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,
  point_cost  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_id   INTEGER NOT NULL,
  member_id   INTEGER NOT NULL,
  point_cost  INTEGER NOT NULL,
  redeemed_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS photos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  filename  TEXT    NOT NULL,
  path      TEXT    NOT NULL,
  caption   TEXT,
  added_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- The `tasks` table has been removed; the dropping is handled in db/index.js
-- so existing databases can clean up their old data.

-- ===== Routines =========================================================
-- Multiple admin-defined morning/evening checklists. All-or-nothing scoring:
-- when every item in a routine is checked for the day, the routine awards
-- its `points` value once.

CREATE TABLE IF NOT EXISTS routines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  assignee_ids TEXT    NOT NULL DEFAULT '[]',     -- JSON array of member ids
  frequency    TEXT    NOT NULL DEFAULT 'daily',  -- daily | weekdays | custom
  custom_days  TEXT,                              -- JSON [0..6] for custom
  points       INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routine_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id  INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_routine_items_routine ON routine_items(routine_id);

CREATE TABLE IF NOT EXISTS routine_item_checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL,
  member_id   INTEGER NOT NULL,
  check_date  TEXT    NOT NULL,                   -- YYYY-MM-DD (local)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (item_id, member_id, check_date),
  FOREIGN KEY (item_id)   REFERENCES routine_items(id)  ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_routine_item_checks_member_date ON routine_item_checks(member_id, check_date);

CREATE TABLE IF NOT EXISTS routine_completions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id      INTEGER NOT NULL,
  member_id       INTEGER NOT NULL,
  completion_date TEXT    NOT NULL,               -- YYYY-MM-DD
  points_awarded  INTEGER NOT NULL DEFAULT 0,
  completed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (routine_id, member_id, completion_date),
  FOREIGN KEY (routine_id) REFERENCES routines(id)         ON DELETE CASCADE,
  FOREIGN KEY (member_id)  REFERENCES family_members(id)   ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_routine_completions_member ON routine_completions(member_id);

-- ===== Streak awards (ledger) ===========================================
-- Inserted exactly once per consecutive run when a streak hits its threshold.
-- Flows into the member's points total via the scoring service.
CREATE TABLE IF NOT EXISTS streak_awards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  streak_reward_id INTEGER NOT NULL,
  member_id        INTEGER NOT NULL,
  points_awarded   INTEGER NOT NULL,
  streak_value     INTEGER NOT NULL,
  awarded_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (streak_reward_id) REFERENCES streak_rewards(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id)        REFERENCES family_members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_streak_awards_member ON streak_awards(member_id);

-- ===== Bonus selections =================================================
-- A bonus chore (chores.category='bonus') only appears on a member's card
-- after they opt in to working on it via the Points page.
CREATE TABLE IF NOT EXISTS member_bonus_selections (
  member_id   INTEGER NOT NULL,
  chore_id    INTEGER NOT NULL,
  selected_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, chore_id),
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE,
  FOREIGN KEY (chore_id)  REFERENCES chores(id)         ON DELETE CASCADE
);

-- ===== Reward goals =====================================================
-- A single active goal per member ("the thing they're saving up for").
CREATE TABLE IF NOT EXISTS member_reward_goals (
  member_id   INTEGER PRIMARY KEY,
  reward_id   INTEGER NOT NULL,
  selected_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE,
  FOREIGN KEY (reward_id) REFERENCES rewards(id)        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_plan_cache (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_date   TEXT NOT NULL,                     -- YYYY-MM-DD
  entry_type  TEXT NOT NULL,                     -- breakfast | lunch | dinner | snack | side
  recipe_id   TEXT,
  recipe_name TEXT,
  recipe_slug TEXT,
  image_url   TEXT,
  note_title  TEXT,                              -- for "note"-type entries (e.g. "Leftovers")
  note_body   TEXT,
  synced_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meal_plan_date ON meal_plan_cache(meal_date);
CREATE INDEX IF NOT EXISTS idx_meal_plan_date_type ON meal_plan_cache(meal_date, entry_type);

CREATE TABLE IF NOT EXISTS recipe_cache (
  id            TEXT PRIMARY KEY,                  -- Mealie recipe UUID
  slug          TEXT,
  name          TEXT,
  description   TEXT,
  image_url     TEXT,
  prep_time     TEXT,
  cook_time     TEXT,
  total_time    TEXT,
  perform_time  TEXT,
  servings      INTEGER,
  ingredients   TEXT,                              -- JSON array
  instructions  TEXT,                              -- JSON array
  cookbook_slug TEXT,                              -- which cookbook this was synced from
  cached_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recipe_cache_slug ON recipe_cache(slug);
-- idx_recipe_cache_cookbook is created in db/index.js after ensureColumn runs,
-- because the column may not exist yet on upgraded databases.

-- "I made this" log for meals from the pool. Slug-keyed so it survives
-- recipe edits in Mealie. Pruned during sync when a recipe leaves the pool.
CREATE TABLE IF NOT EXISTS meal_completions (
  recipe_slug  TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A user-assigned meal day. Mirrored into Mealie's meal plan (mealie_entry_id
-- holds the remote primary key so we can DELETE on unschedule). One meal can
-- only be on one day, but the schema allows multi-day for forward-compat.
CREATE TABLE IF NOT EXISTS planned_meals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_slug     TEXT NOT NULL,
  meal_date       TEXT NOT NULL,                    -- YYYY-MM-DD
  mealie_entry_id TEXT,                             -- Mealie mealplan UUID (null if Mealie write failed)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (recipe_slug, meal_date)
);
CREATE INDEX IF NOT EXISTS idx_planned_meals_date ON planned_meals(meal_date);

-- Append-only log of "I made this" events. Survives unmarking so we can
-- compute a last-made timestamp + total times made per recipe.
CREATE TABLE IF NOT EXISTS meal_completion_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_slug TEXT NOT NULL,
  made_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_meal_completion_log_slug ON meal_completion_log(recipe_slug);
CREATE INDEX IF NOT EXISTS idx_meal_completion_log_made_at ON meal_completion_log(made_at);

-- Streaks: bonus points granted when a kid hits an "X in a row" run.
-- `kind` selects what counts as one occurrence:
--   'chore'         → a specific chore completed (chore_id required)
--   'routine'       → a specific routine completed (routine_id required)
--   'all_chores'    → every scheduled chore for that day done by the member
--   'all_routines'  → every scheduled routine for that day done by the member
-- `member_ids` is a JSON array; [] = applies to every visible (show_in_points=1) member.
-- `threshold_days` keeps its name for compatibility but is "successful occurrences"
-- semantically; days with no scheduled work (or vacations) don't count or break.
CREATE TABLE IF NOT EXISTS streak_rewards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT    NOT NULL DEFAULT 'chore',
  chore_id        INTEGER,
  routine_id      INTEGER,
  member_ids      TEXT    NOT NULL DEFAULT '[]',
  threshold_days  INTEGER NOT NULL,
  bonus_points    INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chore_id)   REFERENCES chores(id)   ON DELETE CASCADE,
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_streak_rewards_chore   ON streak_rewards(chore_id);
-- idx_streak_rewards_routine is created in db/index.js migrate() so it runs
-- AFTER the v2 rebuild on existing DBs (which adds the routine_id column).

-- Vacations pause streaks: dates between start_date and end_date (inclusive)
-- don't count toward or against any streak for the listed members.
-- `member_ids` JSON array; [] = applies to every visible member.
CREATE TABLE IF NOT EXISTS vacations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_ids  TEXT    NOT NULL DEFAULT '[]',
  start_date  TEXT    NOT NULL,
  end_date    TEXT    NOT NULL,
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vacations_dates ON vacations(start_date, end_date);

CREATE TABLE IF NOT EXISTS display_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message    TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_expires ON display_messages(expires_at);
