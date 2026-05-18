import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const TYPES = [
  { value: '',                  label: 'All' },
  { value: 'chore_completed',   label: 'Chores' },
  { value: 'routine_completed', label: 'Routines' },
  { value: 'streak_awarded',    label: 'Streaks' },
  { value: 'reward_redeemed',   label: 'Redeems' },
  { value: 'reward_fulfilled',  label: 'Fulfilled' }
];

const TYPE_META = {
  chore_completed:    { emoji: '✅', color: '#86efac' },
  routine_completed:  { emoji: '⭐', color: '#fcd34d' },
  streak_awarded:     { emoji: '🏆', color: '#f59e0b' },
  reward_redeemed:    { emoji: '🎁', color: '#a78bfa' },
  reward_fulfilled:   { emoji: '✔️', color: '#34d399' }
};

function relativeTime(value) {
  if (!value) return '';
  // SQLite timestamps lack a TZ marker — treat as UTC.
  const iso = String(value).includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400)     return `${Math.round(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} days ago`;
  return new Intl.DateTimeFormat([], { month: 'short', day: 'numeric', year: 'numeric' }).format(t);
}

function absTime(value) {
  if (!value) return '';
  const iso = String(value).includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return new Intl.DateTimeFormat([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(t);
}

export default function ActivityLogPanel() {
  const [events,  setEvents]  = useState([]);
  const [members, setMembers] = useState([]);
  const [memberFilter, setMemberFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [evs, ms] = await Promise.all([
        api.activity({ member_id: memberFilter || null, type: typeFilter || null }),
        members.length ? Promise.resolve(members) : api.members()
      ]);
      setEvents(evs);
      if (!members.length) setMembers(ms);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [memberFilter, typeFilter]);

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Activity Log</h2>
          <p className="text-fg/50 text-sm mt-1">
            Recent events across chores, routines, streaks, and rewards. Newest first.
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-full px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-xs uppercase tracking-widest font-medium transition"
        >
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={memberFilter}
          onChange={e => setMemberFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 outline-none focus:border-white/30 text-sm cursor-pointer"
        >
          <option value="">Everyone</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <div className="flex items-center bg-white/[0.04] rounded-full p-0.5 border border-white/10 flex-wrap">
          {TYPES.map(t => {
            const on = t.value === typeFilter;
            return (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={[
                  'h-8 px-3 rounded-full text-xs uppercase tracking-widest font-medium transition',
                  on ? 'bg-white/15 text-fg' : 'text-fg/55 hover:text-fg/85'
                ].join(' ')}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
      )}

      {loading && events.length === 0 ? (
        <div className="text-fg/40 text-sm italic text-center py-6">Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-fg/40 text-sm italic text-center py-6">Nothing here yet.</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {events.map(ev => {
            const meta = TYPE_META[ev.type] || { emoji: '•', color: '#888' };
            const sign = ev.points > 0 ? '+' : ev.points < 0 ? '−' : '';
            const absPts = Math.abs(ev.points || 0);
            return (
              <li
                key={ev.id}
                className="rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2 flex items-center gap-3"
              >
                <span
                  className="h-8 w-8 rounded-full flex items-center justify-center text-sm shrink-0"
                  title={ev.type}
                  style={{ backgroundColor: `${meta.color}22`, border: `1px solid ${meta.color}55` }}
                >
                  {meta.emoji}
                </span>
                <span
                  className="h-8 w-8 rounded-full flex items-center justify-center text-base shrink-0"
                  style={{
                    backgroundColor: `${ev.member_color}33`,
                    border: `1px solid ${ev.member_color}66`
                  }}
                  title={ev.member_name}
                >
                  {ev.member_emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm break-words">
                    <span style={{ color: ev.member_color }} className="font-medium">{ev.member_name}</span>
                    <span className="text-fg/60"> · {ev.label}</span>
                  </div>
                  <div className="text-fg/40 text-xs" title={absTime(ev.when_at)}>
                    {relativeTime(ev.when_at)}
                  </div>
                </div>
                {ev.points !== 0 && (
                  <span
                    className={[
                      'text-sm font-semibold tabular-nums shrink-0',
                      ev.points > 0 ? 'text-emerald-300' : 'text-rose-300'
                    ].join(' ')}
                  >
                    {sign}{absPts} pts
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
