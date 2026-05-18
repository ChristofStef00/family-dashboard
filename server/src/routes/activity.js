import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

/**
 * Unified activity timeline. Reads existing tables — no new schema — and
 * UNIONs them into one chronological stream. Each event row carries:
 *
 *   { id, type, when_at, member_id, label, points, target_kind?, target_id? }
 *
 * `points` is signed: positive for earn (chore/routine/streak), negative for
 * spend (reward redemption), 0 for fulfillment (a parent acknowledgement;
 * no point delta — the points were already spent at redemption time).
 *
 * Members are joined client-side so the timeline query stays a single
 * UNION ALL with predictable performance.
 */
router.get('/', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const memberFilter = req.query.member_id ? Number(req.query.member_id) : null;
  const typeFilter   = req.query.type      ? String(req.query.type)      : null;

  // Filter pushdown: param 1 is the member_id (or 0 = no filter), param 2 is the type (or '' = no filter).
  const sql = `
    SELECT * FROM (
      SELECT 'chore_completed' AS type,
             cc.completed_at   AS when_at,
             cc.member_id      AS member_id,
             COALESCE(c.title, '(deleted chore)') AS label,
             cc.points_awarded AS points,
             ('chore-' || cc.id) AS id
      FROM chore_completions cc
      LEFT JOIN chores c ON c.id = cc.chore_id

      UNION ALL
      SELECT 'routine_completed',
             rc.completed_at,
             rc.member_id,
             COALESCE(r.title, '(deleted routine)'),
             rc.points_awarded,
             ('routine-' || rc.id)
      FROM routine_completions rc
      LEFT JOIN routines r ON r.id = rc.routine_id

      UNION ALL
      SELECT 'streak_awarded',
             sa.awarded_at,
             sa.member_id,
             (
               CASE sr.kind
                 WHEN 'chore'        THEN COALESCE(c.title, 'chore')   || ' × ' || sa.streak_value
                 WHEN 'routine'      THEN COALESCE(rt.title, 'routine') || ' × ' || sa.streak_value
                 WHEN 'all_chores'   THEN 'All chores × '   || sa.streak_value
                 WHEN 'all_routines' THEN 'All routines × ' || sa.streak_value
                 ELSE 'Streak × ' || sa.streak_value
               END
             ),
             sa.points_awarded,
             ('streak-' || sa.id)
      FROM streak_awards sa
      LEFT JOIN streak_rewards sr ON sr.id = sa.streak_reward_id
      LEFT JOIN chores   c  ON c.id  = sr.chore_id
      LEFT JOIN routines rt ON rt.id = sr.routine_id

      UNION ALL
      SELECT 'reward_redeemed',
             rr.redeemed_at,
             rr.member_id,
             COALESCE(r.title, '(deleted reward)'),
             -rr.point_cost,
             ('redeem-' || rr.id)
      FROM reward_redemptions rr
      LEFT JOIN rewards r ON r.id = rr.reward_id

      UNION ALL
      SELECT 'reward_fulfilled',
             rr.fulfilled_at,
             rr.member_id,
             COALESCE(r.title, '(deleted reward)'),
             0,
             ('fulfill-' || rr.id)
      FROM reward_redemptions rr
      LEFT JOIN rewards r ON r.id = rr.reward_id
      WHERE rr.fulfilled_at IS NOT NULL
    )
    WHERE (@member_filter = 0  OR member_id = @member_filter)
      AND (@type_filter   = '' OR type      = @type_filter)
    ORDER BY when_at DESC
    LIMIT @row_limit
  `;
  const rows = db.prepare(sql).all({
    member_filter: memberFilter || 0,
    type_filter:   typeFilter   || '',
    row_limit:     limit
  });

  // Enrich with member info (small table; one query is fine).
  const members = db.prepare('SELECT id, name, color, emoji FROM family_members').all();
  const byId = new Map(members.map(m => [m.id, m]));
  res.json(rows.map(r => ({
    ...r,
    member_name:  byId.get(r.member_id)?.name  || '(unknown)',
    member_color: byId.get(r.member_id)?.color || '#888',
    member_emoji: byId.get(r.member_id)?.emoji || '👤'
  })));
});

export default router;
