import { useState } from 'react';
import { api } from '../lib/api.js';
import { usePoll } from '../hooks/usePoll.js';
import MemberCard from './MemberCard.jsx';

/**
 * Points page — two columns:
 *   ┌────────────┬────────────────┐
 *   │  BONUSES   │  MEMBERS       │
 *   └────────────┴────────────────┘
 *
 * Each bonus card shows a row of member avatars who haven't yet opted in.
 * Tapping an avatar opts that member in: the avatar disappears from this
 * card and the bonus appears on that member's MemberCard on the right.
 *
 * Single-claim bonuses lock once any member opts in — no further avatars
 * are tappable until the holder completes/unselects (the latter currently
 * happens server-side via the chore_completion's natural reset window).
 *
 * Reward goal management has been moved out of this page; a dedicated
 * Rewards screen will own it. Member goal bars still render on MemberCard
 * if a goal is already set.
 */
export default function PointsPage({ members = [], chores = [], routinesToday = [], bonusesToday = [], onChange }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onChange?.(); };

  const { data: bonuses = [] } = usePoll(api.bonusesAvailable, 30_000, [refreshKey]);

  // Only members flagged "show on Points page" appear here. Parents typically
  // opt out via the admin so the page stays focused on the kids.
  const visibleMembers = members.filter(m => m.show_in_points !== false);

  async function selectForMember(choreId, memberId) {
    await api.selectBonus(choreId, memberId);
    bump();
  }

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0 fade-in">
      <div className="lg:col-span-1 min-h-0">
        <BonusesPanel
          bonuses={bonuses || []}
          members={visibleMembers}
          onSelect={selectForMember}
        />
      </div>
      <section className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 auto-rows-fr gap-3 min-h-0 overflow-y-auto pr-1">
        {visibleMembers.map(m => (
          <div key={m.id} className="min-h-0">
            <MemberCard
              member={m}
              chores={chores.filter(c => c.assignee_ids?.includes(m.id))}
              routines={routinesToday.filter(r => r.member_id === m.id)}
              bonuses={bonusesToday.filter(b => b.member_id === m.id)}
              onChange={bump}
            />
          </div>
        ))}
        {visibleMembers.length === 0 && (
          <div className="col-span-full flex items-center justify-center text-fg/40 text-sm italic">
            Toggle "Show on Points page" on a family member in admin to populate this view.
          </div>
        )}
      </section>
    </div>
  );
}

/* ───── Bonuses panel ───────────────────────────────────────────────── */

function BonusesPanel({ bonuses, members, onSelect }) {
  // Hide fully-claimed bonuses entirely:
  //   - single-claim: removed once any visible member is selected
  //   - multi-claim:  removed once every visible member is selected
  // (selected_by from the server is already filtered to visible members.)
  const available = bonuses.filter(b => {
    const selected = new Set(b.selected_by || []);
    if (b.claim_mode === 'single') return selected.size === 0;
    return members.some(m => !selected.has(m.id));
  });

  return (
    <section className="card-pad flex flex-col min-h-0 overflow-hidden">
      <header className="flex items-baseline justify-between mb-4 shrink-0">
        <h2 className="text-2xl font-light tracking-tight">Bonuses</h2>
        <span className="stat-label">tap a member to claim</span>
      </header>
      {bonuses.length === 0 ? (
        <div className="text-fg/40 text-sm italic flex-1 flex items-center justify-center">
          No bonuses defined yet.
        </div>
      ) : available.length === 0 ? (
        <div className="text-fg/40 text-sm italic flex-1 flex items-center justify-center text-center">
          All bonuses are claimed.<br />Pop the × on a member's bonus to free one back up.
        </div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
          {available.map(b => (
            <li key={b.id}>
              <BonusCard bonus={b} members={members} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BonusCard({ bonus, members, onSelect }) {
  const selectedSet = new Set(bonus.selected_by || []);
  const isSingle = bonus.claim_mode === 'single';

  // Available = members who haven't yet opted in.
  // For single-claim bonuses, hide all avatars once any member has claimed.
  const available = isSingle && selectedSet.size > 0
    ? []
    : members.filter(m => !selectedSet.has(m.id));

  const claimedBy = isSingle && selectedSet.size > 0
    ? members.find(m => selectedSet.has(m.id))
    : null;

  return (
    <div className="rounded-2xl bg-surface/[0.04] border border-surface/10 p-4 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-lg leading-tight break-words">{bonus.title}</div>
          <div className="text-fg/40 text-[10px] uppercase tracking-widest mt-1">
            {bonus.frequency}{isSingle && ' · single-claim'}
          </div>
        </div>
        <div className="shrink-0 flex items-baseline gap-1.5 text-orange-400">
          <span className="text-3xl font-semibold tabular-nums tracking-tight leading-none">
            +{bonus.points}
          </span>
          <span className="text-xs uppercase tracking-widest font-medium opacity-70">
            pts
          </span>
        </div>
      </div>

      {claimedBy ? (
        <div className="flex items-center gap-2 text-sm text-fg/60">
          <span
            className="h-7 w-7 rounded-full flex items-center justify-center text-base shrink-0"
            style={{
              backgroundColor: `${claimedBy.color}33`,
              border: `1px solid ${claimedBy.color}66`
            }}
          >
            {claimedBy.emoji}
          </span>
          <span>
            Claimed by <span className="font-medium" style={{ color: claimedBy.color }}>{claimedBy.name}</span>
          </span>
        </div>
      ) : available.length === 0 ? (
        <div className="text-fg/40 text-sm italic">Everyone's claimed this one.</div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {available.map(m => (
            <button
              key={m.id}
              onClick={() => onSelect(bonus.id, m.id)}
              className="h-12 px-3 rounded-full flex items-center gap-2 text-sm transition active:scale-95 border-2 hover:shadow-md"
              style={{
                backgroundColor: `${m.color}22`,
                borderColor: `${m.color}88`,
                '--mem-color': m.color
              }}
              title={`Claim for ${m.name}`}
            >
              <span className="text-2xl leading-none">{m.emoji}</span>
              <span className="mem-text font-semibold tracking-tight">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
