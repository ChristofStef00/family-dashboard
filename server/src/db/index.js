import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/family.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function migrate() {
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  // Idempotent column additions for upgrades from older DBs
  ensureColumn('calendar_tokens', 'selected_calendars',
    `selected_calendars TEXT NOT NULL DEFAULT '["primary"]'`);
  ensureColumn('recipe_cache', 'perform_time',  'perform_time TEXT');
  ensureColumn('recipe_cache', 'ingredients',   'ingredients TEXT');
  ensureColumn('recipe_cache', 'instructions',  'instructions TEXT');
  ensureColumn('recipe_cache', 'cookbook_slug', 'cookbook_slug TEXT');
  ensureColumn('planned_meals', 'mealie_entry_id', 'mealie_entry_id TEXT');
  // Categorize chores: existing rows default to 'chore', admin can flip to 'bonus'.
  ensureColumn('chores', 'category', "category TEXT NOT NULL DEFAULT 'chore'");
  // Bonuses can be single-claim (only one member can hold it) or multi-claim
  // (every member can independently). Default 'multi' preserves prior behavior.
  ensureColumn('chores', 'claim_mode', "claim_mode TEXT NOT NULL DEFAULT 'multi'");
  // Whether a member appears on the Points page (parents typically opt out).
  ensureColumn('family_members', 'show_in_points', 'show_in_points INTEGER NOT NULL DEFAULT 1');
  // Per-member reward assignment. [] = available to every visible member.
  ensureColumn('rewards', 'assignee_ids', `assignee_ids TEXT NOT NULL DEFAULT '[]'`);
  // When a parent has handed over the IRL reward, mark the redemption fulfilled.
  // Points stay spent — this flag only controls visibility in the banked list.
  ensureColumn('reward_redemptions', 'fulfilled_at', 'fulfilled_at TEXT');
  // streak_rewards v2: kind/routine_id/member_ids — SQLite can't DROP NOT NULL
  // on chore_id in place, so rebuild the table if the old shape is detected.
  migrateStreakRewardsV2();
  // streak_rewards v3: drop the unused reward_title/reward_description columns
  // (streaks are now just bonus-point boosts; no reward label).
  migrateStreakRewardsV3();
  // calendar_events + ics_subscriptions: make member_id nullable and add a
  // `color` column so "shared" calendars (no owner) can render correctly.
  migrateCalendarSharedCalendars();
  // Indexes that depend on columns added by ensureColumn must be created here.
  db.exec('CREATE INDEX IF NOT EXISTS idx_recipe_cache_cookbook ON recipe_cache(cookbook_slug)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_chores_category       ON chores(category)');
  // The tasks table was removed when we moved to routines+chores+bonuses+rewards.
  // Drop it here so existing DBs clean up; safe & idempotent.
  db.exec('DROP TABLE IF EXISTS tasks');
}

function migrateStreakRewardsV2() {
  const cols = db.prepare('PRAGMA table_info(streak_rewards)').all();
  if (cols.length === 0) return;                       // fresh install: schema.sql already created new shape

  if (!cols.some(c => c.name === 'kind')) {
    // Old shape detected — rebuild the table with the v2 column set.
    db.exec(`
      CREATE TABLE streak_rewards_new (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        kind               TEXT    NOT NULL DEFAULT 'chore',
        chore_id           INTEGER,
        routine_id         INTEGER,
        member_ids         TEXT    NOT NULL DEFAULT '[]',
        threshold_days     INTEGER NOT NULL,
        reward_title       TEXT    NOT NULL,
        reward_description TEXT,
        bonus_points       INTEGER NOT NULL DEFAULT 0,
        active             INTEGER NOT NULL DEFAULT 1,
        created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (chore_id)   REFERENCES chores(id)   ON DELETE CASCADE,
        FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE
      );
      INSERT INTO streak_rewards_new
        (id, kind, chore_id, routine_id, member_ids,
         threshold_days, reward_title, reward_description, bonus_points, active, created_at)
      SELECT id, 'chore', chore_id, NULL,
             CASE WHEN member_id IS NULL THEN '[]' ELSE json_array(member_id) END,
             threshold_days, reward_title, reward_description, bonus_points, active, created_at
      FROM streak_rewards;
      DROP TABLE streak_rewards;
      ALTER TABLE streak_rewards_new RENAME TO streak_rewards;
      CREATE INDEX IF NOT EXISTS idx_streak_rewards_chore ON streak_rewards(chore_id);
    `);
    console.log('[migrate] streak_rewards rebuilt to v2 (kind / routine_id / member_ids)');
  }

  // Always make sure the routine_id index exists (idempotent; covers fresh
  // installs since the index isn't in schema.sql for the existing-DB safety
  // reason explained there).
  db.exec('CREATE INDEX IF NOT EXISTS idx_streak_rewards_routine ON streak_rewards(routine_id);');
}

function migrateStreakRewardsV3() {
  const cols = db.prepare('PRAGMA table_info(streak_rewards)').all();
  if (cols.length === 0) return;
  // Only run if the legacy columns still exist.
  if (!cols.some(c => c.name === 'reward_title')) return;

  db.exec(`
    CREATE TABLE streak_rewards_new (
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
    INSERT INTO streak_rewards_new
      (id, kind, chore_id, routine_id, member_ids, threshold_days, bonus_points, active, created_at)
    SELECT id, kind, chore_id, routine_id, member_ids, threshold_days, bonus_points, active, created_at
    FROM streak_rewards;
    DROP TABLE streak_rewards;
    ALTER TABLE streak_rewards_new RENAME TO streak_rewards;
    CREATE INDEX IF NOT EXISTS idx_streak_rewards_chore   ON streak_rewards(chore_id);
    CREATE INDEX IF NOT EXISTS idx_streak_rewards_routine ON streak_rewards(routine_id);
  `);
  console.log('[migrate] streak_rewards stripped of legacy reward_title/reward_description columns');
}

function migrateCalendarSharedCalendars() {
  // ─── calendar_events: drop NOT NULL on member_id, add `color` column. ──
  const evCols = db.prepare('PRAGMA table_info(calendar_events)').all();
  if (evCols.length > 0) {
    const memberCol = evCols.find(c => c.name === 'member_id');
    const hasColor  = evCols.some(c => c.name === 'color');
    const needsRebuild = memberCol && memberCol.notnull === 1;
    if (needsRebuild) {
      db.exec(`
        CREATE TABLE calendar_events_new (
          id            TEXT PRIMARY KEY,
          member_id     INTEGER,
          calendar_id   TEXT    NOT NULL,
          title         TEXT    NOT NULL,
          description   TEXT,
          location      TEXT,
          start_time    TEXT    NOT NULL,
          end_time      TEXT    NOT NULL,
          all_day       INTEGER NOT NULL DEFAULT 0,
          color         TEXT,
          updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
        );
        INSERT INTO calendar_events_new
          (id, member_id, calendar_id, title, description, location, start_time, end_time, all_day, color, updated_at)
        SELECT id, member_id, calendar_id, title, description, location, start_time, end_time, all_day, NULL, updated_at
        FROM calendar_events;
        DROP TABLE calendar_events;
        ALTER TABLE calendar_events_new RENAME TO calendar_events;
        CREATE INDEX IF NOT EXISTS idx_events_start    ON calendar_events(start_time);
        CREATE INDEX IF NOT EXISTS idx_events_member   ON calendar_events(member_id);
        CREATE INDEX IF NOT EXISTS idx_events_calendar ON calendar_events(calendar_id);
      `);
      console.log('[migrate] calendar_events: member_id nullable + color column');
    } else if (!hasColor) {
      // Already nullable (newer install) but missing the color column — additive fix.
      db.exec('ALTER TABLE calendar_events ADD COLUMN color TEXT');
    }
  }

  // ─── ics_subscriptions: same treatment if it exists. ───────────────────
  const subCols = db.prepare('PRAGMA table_info(ics_subscriptions)').all();
  if (subCols.length > 0) {
    const memberCol = subCols.find(c => c.name === 'member_id');
    const hasColor  = subCols.some(c => c.name === 'color');
    const needsRebuild = memberCol && memberCol.notnull === 1;
    if (needsRebuild) {
      db.exec(`
        CREATE TABLE ics_subscriptions_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          member_id       INTEGER,
          name            TEXT    NOT NULL,
          url             TEXT    NOT NULL,
          color           TEXT,
          active          INTEGER NOT NULL DEFAULT 1,
          last_synced_at  TEXT,
          last_error      TEXT,
          created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (member_id) REFERENCES family_members(id) ON DELETE CASCADE
        );
        INSERT INTO ics_subscriptions_new
          (id, member_id, name, url, color, active, last_synced_at, last_error, created_at)
        SELECT id, member_id, name, url, NULL, active, last_synced_at, last_error, created_at
        FROM ics_subscriptions;
        DROP TABLE ics_subscriptions;
        ALTER TABLE ics_subscriptions_new RENAME TO ics_subscriptions;
        CREATE INDEX IF NOT EXISTS idx_ics_subscriptions_member ON ics_subscriptions(member_id);
      `);
      console.log('[migrate] ics_subscriptions: member_id nullable + color column');
    } else if (!hasColor) {
      db.exec('ALTER TABLE ics_subscriptions ADD COLUMN color TEXT');
    }
  }
}

migrate();
