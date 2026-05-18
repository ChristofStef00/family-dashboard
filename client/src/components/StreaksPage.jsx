import { useMemo } from 'react';
import { usePoll } from '../hooks/usePoll.js';
import { api } from '../lib/api.js';

export default function StreaksPage() {
  const { data: progress = [] } = usePoll(api.streakProgress, 30_000);

  // Group by member, preserving order from API (already sorted by sort_order)
  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of progress || []) {
      if (!map.has(p.member_id)) {
        map.set(p.member_id, {
          member: { id: p.member_id, name: p.member_name, color: p.member_color, emoji: p.member_emoji },
          rows: []
        });
      }
      map.get(p.member_id).rows.push(p);
    }
    return [...map.values()];
  }, [progress]);

  if ((progress || []).length === 0) {
    return (
      <div className="card-pad h-full flex flex-col items-center justify-center text-center">
        <div className="text-5xl mb-3">🏆</div>
        <div className="text-fg/60 text-base">No streak rewards yet.</div>
        <div className="text-fg/40 text-sm mt-1">Add some under Admin → Earn → Streak Rewards.</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1 flex flex-col gap-5">
      {grouped.map(({ member, rows }) => (
        <MemberStreakSection key={member.id} member={member} rows={rows} />
      ))}
    </div>
  );
}

function MemberStreakSection({ member, rows }) {
  return (
    <section className="card-pad">
      <header className="flex items-center gap-3 mb-4">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: `${member.color}33`, border: `1px solid ${member.color}66` }}
        >
          {member.emoji}
        </div>
        <div className="mem-text text-2xl font-light tracking-tight" style={{ '--mem-color': member.color }}>
          {member.name}
        </div>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map(r => (
          <StreakCard key={r.streak_reward_id + ':' + r.member_id} row={r} color={member.color} />
        ))}
      </ul>
    </section>
  );
}

function StreakCard({ row, color }) {
  const pct = Math.min(100, Math.round((row.current_streak / row.threshold_days) * 100));
  const unlocked = row.unlocked;
  const aboutToBreak = !row.done_today && row.current_streak > 0;

  return (
    <li
      style={{ '--mem-color': color }}
      className={[
        'rounded-2xl p-4 flex flex-col gap-3 border transition relative overflow-hidden',
        unlocked
          ? 'bg-surface/[0.07] border-surface/20'
          : 'bg-surface/[0.03] border-surface/10'
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-base font-medium leading-tight break-words">
          {row.target_title || row.chore_title}
        </div>
        {unlocked && (
          <span className="mem-text text-xs font-medium uppercase tracking-widest shrink-0">
            🏆 Unlocked
          </span>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-2xl font-light tabular-nums leading-none flex items-baseline gap-1">
            <span className="mem-text">{row.current_streak}</span>
            <span className="text-fg/30 text-base"> / {row.threshold_days}</span>
            <span className="text-fg/40 text-sm ml-1">streak</span>
          </div>
          {row.bonus_points > 0 && (
            <span className="mem-text text-sm font-semibold tabular-nums">+{row.bonus_points} pts</span>
          )}
        </div>

        <div className="h-2 rounded-full bg-surface/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: color,
              boxShadow: unlocked ? `0 0 12px ${color}99` : 'none'
            }}
          />
        </div>

        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-fg/40">
            Best: <span className="tabular-nums">{row.best_streak}</span>
          </span>
          {aboutToBreak ? (
            <span className="text-amber-400/80">⚠ Not done today</span>
          ) : row.done_today ? (
            <span className="mem-text">🔥 On fire</span>
          ) : (
            <span className="text-fg/30">—</span>
          )}
        </div>
      </div>
    </li>
  );
}
