import { db } from './index.js';

const tx = db.transaction(() => {
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM family_members').get().n;
  if (memberCount > 0) {
    console.log('• family_members already populated, skipping member seed');
  } else {
    const insertMember = db.prepare(
      'INSERT INTO family_members (name, color, emoji, sort_order) VALUES (?, ?, ?, ?)'
    );
    const members = [
      ['Mom',   '#f9a8d4', '👩', 0],
      ['Dad',   '#93c5fd', '👨', 1],
      ['Ava',   '#fde68a', '🧒', 2],
      ['Liam',  '#a7f3d0', '👦', 3]
    ];
    for (const m of members) insertMember.run(...m);
    console.log(`✓ seeded ${members.length} family members`);
  }

  const choreCount = db.prepare('SELECT COUNT(*) AS n FROM chores').get().n;
  if (choreCount === 0) {
    const insertChore = db.prepare(
      'INSERT INTO chores (title, assignee_ids, frequency, custom_days, points, category) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const ids = db.prepare('SELECT id FROM family_members ORDER BY sort_order').all().map(r => r.id);
    const all = JSON.stringify(ids);
    const kids = JSON.stringify(ids.slice(2));
    const EVERY_DAY = JSON.stringify([0, 1, 2, 3, 4, 5, 6]);
    // Regular chores — 'custom' frequency with custom_days driving which
    // weekdays they appear. Daily = every day; weekly = a single chosen day.
    insertChore.run('Make the bed',         kids, 'custom', EVERY_DAY, 5,  'chore');
    insertChore.run('Empty dishwasher',     all,  'custom', EVERY_DAY, 10, 'chore');
    insertChore.run('Take out trash',       JSON.stringify([ids[1]]), 'custom', JSON.stringify([1]), 15, 'chore'); // Mondays
    // Available bonuses (kids opt-in via the Points page) — keep daily/weekly.
    insertChore.run('Vacuum living room',   all,  'weekly', null, 25, 'bonus');
    insertChore.run('Caught being kind',    all,  'daily',  null, 25, 'bonus');
    insertChore.run('Helped without being asked', all, 'daily', null, 30, 'bonus');
    console.log('✓ seeded chores (3 chores + 3 bonuses)');
  }

  const routineCount = db.prepare('SELECT COUNT(*) AS n FROM routines').get().n;
  if (routineCount === 0) {
    const ids  = db.prepare('SELECT id FROM family_members ORDER BY sort_order').all().map(r => r.id);
    const kids = JSON.stringify(ids.slice(2));
    const r = db.prepare(
      'INSERT INTO routines (title, assignee_ids, frequency, points) VALUES (?, ?, ?, ?)'
    ).run('Morning Routine', kids, 'daily', 1);
    const insertItem = db.prepare(
      'INSERT INTO routine_items (routine_id, title, sort_order) VALUES (?, ?, ?)'
    );
    ['Brush teeth', 'Get dressed', 'Eat breakfast', 'Brush hair']
      .forEach((title, i) => insertItem.run(r.lastInsertRowid, title, i));
    console.log('✓ seeded Morning Routine for kids');
  }

  const rewardCount = db.prepare('SELECT COUNT(*) AS n FROM rewards').get().n;
  if (rewardCount === 0) {
    const insertReward = db.prepare(
      'INSERT INTO rewards (title, description, point_cost) VALUES (?, ?, ?)'
    );
    insertReward.run('30 min screen time', 'Extra screen time on a tablet or TV', 50);
    insertReward.run('Pick dinner',        'Choose tonight\'s dinner',            100);
    insertReward.run('Movie night',        'Pick the family movie',               150);
    insertReward.run('Ice cream trip',     'Family ice cream outing',             300);
    console.log('✓ seeded rewards');
  }

  const streakCount = db.prepare('SELECT COUNT(*) AS n FROM streak_rewards').get().n;
  if (streakCount === 0) {
    const choreByTitle = (t) => db.prepare('SELECT id FROM chores WHERE title = ?').get(t)?.id;
    const insertStreak = db.prepare(`
      INSERT INTO streak_rewards (chore_id, member_id, threshold_days, reward_title, reward_description, bonus_points)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const brush = choreByTitle('Brush teeth (AM/PM)');
    const bed   = choreByTitle('Make the bed');
    const dish  = choreByTitle('Empty dishwasher');
    if (brush) insertStreak.run(brush, null, 7,  'Pick a treat',     'Choose a snack from the pantry',  20);
    if (bed)   insertStreak.run(bed,   null, 14, 'Movie night pick', 'Pick the family movie tonight',   50);
    if (dish)  insertStreak.run(dish,  null, 30, 'Special outing',   'Choose a fun family outing',     150);
    console.log('✓ seeded streak rewards');
  }

  const upsertSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING'
  );
  const defaults = [
    ['theme_mode',           'auto'],          // 'dark' | 'light' | 'auto'
    ['theme_light_start',    '07:00'],         // when auto switches to light
    ['theme_dark_start',     '19:00'],         // when auto switches to dark
    ['dim_enabled',          'true'],
    ['dim_start',            '23:00'],
    ['dim_end',              '06:30'],
    ['dim_level',            '0.12'],          // 0 = fully black, 1 = no dim
    ['dim_clock_only',       'true'],          // show just clock during dim
    ['clock_format',         '"12"'],
    ['timezone',             'America/Los_Angeles'],
    ['weather_lat',          '37.7749'],
    ['weather_lon',          '-122.4194'],
    ['weather_units',        'fahrenheit'],
    ['weather_location_name','San Francisco'],
    ['screensaver_idle_sec', '120'],
    ['slideshow_interval_sec','10'],
    ['font_scale',           '1.0'],
    ['layout_widgets',       JSON.stringify(['calendar','weather','chores','agenda','quote'])],
    ['mealie_url',            ''],
    ['mealie_token',          ''],
    ['mealie_cookbook_slug',  ''],
    ['mealie_touch_enabled',  'false']
  ];
  for (const [k, v] of defaults) upsertSetting.run(k, v);
  console.log('✓ default settings ensured');
});

tx();
console.log('Seed complete.');
