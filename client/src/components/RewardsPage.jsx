import { useState } from 'react';
import { api } from '../lib/api.js';
import { usePoll } from '../hooks/usePoll.js';
import { portalFromEvent } from '../lib/portal.js';
import { celebrateFromEvent } from '../lib/celebrate.js';

export default function RewardsPage({ members = [], onChange, onNavigate }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirming, setConfirming] = useState(null);   // redemption row to confirm
  const bump = () => { setRefreshKey(k => k + 1); onChange?.(); };

  const { data: rewards = [] }     = usePoll(api.rewards,     30_000, [refreshKey]);
  const { data: goalsData }        = usePoll(api.goals,       30_000, [refreshKey]);
  const { data: redemptions = [] } = usePoll(api.redemptions, 30_000, [refreshKey]);

  async function confirmFulfill() {
    if (!confirming) return;
    const target = confirming;
    setConfirming(null);
    try { await api.fulfillRedemption(target.id); } finally { bump(); }
  }

  const visibleMembers = members.filter(m => m.show_in_points !== false);
  const activeRewards  = (rewards || [])
    .filter(r => r.active)
    .slice()
    .sort((a, b) => a.point_cost - b.point_cost);

  const goalByMember = new Map(
    (goalsData?.goals || []).map(g => [g.member_id, g.reward_id])
  );

  async function pickGoal(reward, member, evt) {
    const balance = member.points ?? 0;
    const affordable = balance >= reward.point_cost;
    // Affordable picks get an extra confetti burst at the tap point before
    // the portal carries the goal across to their card.
    if (affordable) {
      celebrateFromEvent(evt, { color: member.color, emoji: '🎉' });
    }
    portalFromEvent(evt, {
      color: member.color,
      label: '🎁',
      memberId: member.id
    });
    try {
      await api.setMemberGoal(member.id, reward.id);
    } finally {
      bump();
      setTimeout(() => onNavigate?.('points'), 380);
    }
  }

  return (
    <section className="h-full card-pad flex flex-col min-h-0 overflow-hidden fade-in">
      <header className="flex items-baseline justify-between mb-4 shrink-0">
        <h2 className="text-3xl font-light tracking-tight">Available Rewards</h2>
        <span className="stat-label">tap a reward to save toward it</span>
      </header>

      {activeRewards.length === 0 ? (
        <div className="text-fg/40 text-base italic flex-1 flex items-center justify-center text-center">
          No rewards defined yet — add some in admin.
        </div>
      ) : visibleMembers.length === 0 ? (
        <div className="text-fg/40 text-base italic flex-1 flex items-center justify-center text-center">
          Toggle "Show on Points page" on a family member in admin to populate this view.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
          {visibleMembers.map(m => {
            const memberRewards = activeRewards.filter(r =>
              !r.assignee_ids || r.assignee_ids.length === 0 || r.assignee_ids.includes(m.id)
            );
            return (
              <MemberRewardRow
                key={m.id}
                member={m}
                rewards={memberRewards}
                currentGoalId={goalByMember.get(m.id)}
                onPick={pickGoal}
              />
            );
          })}
        </div>
      )}

      <BankedRewardsStrip
        redemptions={redemptions || []}
        onTap={setConfirming}
      />

      {confirming && (
        <RedeemConfirmModal
          redemption={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmFulfill}
        />
      )}
    </section>
  );
}

/* ───── Per-member row: avatar + bar + reward flags ──────────────────── */

function MemberRewardRow({ member, rewards, currentGoalId, onPick }) {
  const balance = member.points ?? 0;
  const maxCost = rewards.reduce((m, r) => Math.max(m, r.point_cost), 0);
  const fillPct = maxCost > 0 ? Math.min(100, (balance / maxCost) * 100) : 0;

  return (
    <div className="rounded-2xl bg-surface/[0.04] border border-surface/10 px-5 py-3">
      <div className="flex items-center gap-3">
        <div
          className="h-11 w-11 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{
            backgroundColor: `${member.color}33`,
            border: `1px solid ${member.color}66`
          }}
        >
          {member.emoji}
        </div>
        <div className="min-w-0 flex-1 flex items-baseline gap-3">
          <div className="mem-text font-medium text-lg leading-none" style={{ '--mem-color': member.color }}>
            {member.name}
          </div>
          <div className="text-fg/55 text-sm tabular-nums">
            {balance} pts
          </div>
        </div>
      </div>

      {rewards.length === 0 ? (
        <div className="text-fg/40 text-sm italic py-4 text-center">
          No rewards assigned yet.
        </div>
      ) : (
        // Vertical padding needs to fit the label-above + disc, no "pts" tail.
        // Extra right padding leaves room for the priciest flag's label, since
        // it sits at the bar's right edge and the label can extend ~90px past
        // its disc center.
        <div className="relative pt-14 pb-6 pl-8 pr-24">
          <div className="relative h-5 rounded-full bg-surface/[0.08]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${fillPct}%`,
                backgroundColor: member.color,
                boxShadow: `0 0 16px ${member.color}aa`
              }}
            />

            {rewards.map(r => {
              const pct = maxCost > 0 ? (r.point_cost / maxCost) * 100 : 0;
              const affordable = balance >= r.point_cost;
              const isGoal     = currentGoalId === r.id;
              return (
                <RewardFlag
                  key={r.id}
                  reward={r}
                  pct={pct}
                  color={member.color}
                  affordable={affordable}
                  isGoal={isGoal}
                  onClick={(e) => onPick(r, member, e)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───── A single reward flag positioned along the bar ────────────────── */

function RewardFlag({ reward, pct, color, affordable, isGoal, onClick }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 group active:scale-95 transition flex flex-col items-center"
      style={{ left: `${pct}%` }}
      title={`Save toward ${reward.title}`}
    >
      <span className="absolute bottom-full mb-2 text-center flex flex-col items-center w-[180px]">
        <span
          className={[
            'text-sm font-medium leading-tight break-words px-1',
            affordable ? 'text-fg/95' : 'text-fg/55'
          ].join(' ')}
        >
          {reward.title}
        </span>
        {isGoal && (
          <span className="mem-text text-[10px] uppercase tracking-widest font-semibold mt-0.5" style={{ '--mem-color': color }}>
            ★ saving
          </span>
        )}
      </span>

      <span
        className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold tabular-nums shadow-md transition"
        style={
          affordable
            ? {
                backgroundColor: color,
                color: '#0f0f13',
                border: `3px solid ${color}`,
                boxShadow: `0 0 22px ${color}cc`
              }
            : {
                backgroundColor: 'rgba(20, 20, 26, 0.85)',
                color: 'rgba(255,255,255,0.6)',
                border: `3px solid rgba(255,255,255,0.22)`
              }
        }
      >
        {reward.point_cost}
      </span>
    </button>
  );
}

/* ───── Banked rewards: horizontal list of recent redemptions ────────── */

function BankedRewardsStrip({ redemptions, onTap }) {
  if (redemptions.length === 0) return null;
  return (
    <div className="shrink-0 mt-4 pt-4 border-t border-surface/10">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-3xl font-light tracking-tight">Banked Rewards</h2>
        <span className="stat-label">tap to redeem</span>
      </header>
      <ul className="flex items-stretch gap-3 overflow-x-auto pb-1">
        {redemptions.map(r => (
          <li key={r.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onTap(r)}
              className="rounded-2xl border px-5 py-4 flex items-center gap-4 active:scale-[0.98] hover:brightness-110 transition"
              style={{
                backgroundColor: `${r.member_color}1a`,
                borderColor: `${r.member_color}55`
              }}
            >
              <span
                className="h-14 w-14 rounded-full flex items-center justify-center text-3xl shrink-0"
                style={{
                  backgroundColor: `${r.member_color}33`,
                  border: `1px solid ${r.member_color}66`
                }}
              >
                {r.member_emoji}
              </span>
              <div className="min-w-0 text-left">
                <div className="font-medium text-lg leading-tight break-words max-w-[14rem]">
                  {r.reward_title}
                </div>
                <div
                  className="mem-text text-sm uppercase tracking-widest font-medium mt-1"
                  style={{ '--mem-color': r.member_color }}
                >
                  {r.member_name}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───── Redeem confirmation modal ────────────────────────────────────── */

function RedeemConfirmModal({ redemption, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 fade-in"
      onClick={onCancel}
    >
      <div
        className="card-pad max-w-md w-full flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span
            className="h-14 w-14 rounded-full flex items-center justify-center text-3xl shrink-0"
            style={{
              backgroundColor: `${redemption.member_color}33`,
              border: `1px solid ${redemption.member_color}66`
            }}
          >
            {redemption.member_emoji}
          </span>
          <div className="min-w-0">
            <div className="mem-text font-medium text-xl leading-tight" style={{ '--mem-color': redemption.member_color }}>
              {redemption.member_name}
            </div>
            <div className="text-fg/65 text-base mt-0.5 break-words">
              {redemption.reward_title}
            </div>
          </div>
        </div>

        <h3 className="text-3xl font-light tracking-tight">Redeem?</h3>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="rounded-full px-6 py-2.5 text-fg/70 hover:text-fg hover:bg-surface/[0.06] text-sm font-medium uppercase tracking-widest transition"
          >
            No
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full px-6 py-2.5 text-sm font-medium uppercase tracking-widest transition active:scale-95"
            style={{
              backgroundColor: redemption.member_color,
              color: '#0f0f13'
            }}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
