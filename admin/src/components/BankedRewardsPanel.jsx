import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function BankedRewardsPanel() {
  const [redemptions, setRedemptions] = useState([]);
  const [error, setError]             = useState(null);

  async function refresh() {
    try { setRedemptions(await api.redemptions()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function markDone(id) {
    if (!confirm('Mark this reward as handed over?')) return;
    try { await api.fulfillRedemption(id); refresh(); } catch (e) { setError(e.message); }
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Banked Rewards</h2>
          <p className="text-fg/50 text-sm mt-1">
            Rewards the kids have redeemed but you haven't fulfilled yet. Mark each one done after handing it over.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
      )}

      {redemptions.length === 0 ? (
        <div className="text-fg/40 text-sm italic text-center py-6">Nothing to follow up on.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {redemptions.map(r => (
            <li
              key={r.id}
              className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3"
            >
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{
                  backgroundColor: `${r.member_color}33`,
                  border: `1px solid ${r.member_color}66`
                }}
              >
                {r.member_emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.reward_title}</div>
                <div className="text-fg/50 text-xs">
                  <span style={{ color: r.member_color }}>{r.member_name}</span>
                  {' · '}
                  {new Date(r.redeemed_at).toLocaleDateString()}
                  {' · '}{r.point_cost} pts
                </div>
              </div>
              <button
                onClick={() => markDone(r.id)}
                className="rounded-full px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-200 text-xs uppercase tracking-widest font-medium transition"
              >
                Mark done
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
