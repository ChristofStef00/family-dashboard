import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const KINDS = [
  { value: 'all_chores',   label: 'All chores'   },
  { value: 'all_routines', label: 'All routines' },
  { value: 'chore',        label: 'Specific chore'   },
  { value: 'routine',      label: 'Specific routine' }
];

function kindLabel(kind) {
  return KINDS.find(k => k.value === kind)?.label || kind;
}

export default function StreakRewardPanel() {
  const [rewards, setRewards] = useState([]);
  const [chores,  setChores]  = useState([]);
  const [routines, setRoutines] = useState([]);
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null);   // reward or 'new'
  const [error,   setError]   = useState(null);

  async function refresh() {
    try {
      const [s, c, r, m] = await Promise.all([
        api.streakRewards(), api.chores(), api.routines(), api.members()
      ]);
      setRewards(s);
      // Aggregate streaks only count daily/custom chores; reflect that in the picker.
      setChores(c.filter(x => x.category === 'chore' && (x.frequency === 'daily' || x.frequency === 'custom')));
      setRoutines(r);
      setMembers(m);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(form) {
    setError(null);
    try {
      if (editing === 'new') await api.createStreakReward(form);
      else                    await api.updateStreakReward(editing.id, form);
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this streak reward?')) return;
    await api.deleteStreakReward(id);
    refresh();
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Streaks</h2>
          <p className="text-fg/50 text-sm mt-1">
            Bonus points when a kid completes their target N times in a row. Days with nothing scheduled (or vacations) don't count or break the run.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 text-sm font-medium transition"
        >
          + Add
        </button>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
      )}

      {editing && (
        <StreakRewardForm
          reward={editing === 'new' ? null : editing}
          chores={chores}
          routines={routines}
          members={members}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="flex flex-col gap-2 mt-3">
        {rewards.map(r => {
          const target =
            r.kind === 'chore'        ? (chores.find(c => c.id === r.chore_id)?.title   || '(deleted chore)') :
            r.kind === 'routine'      ? (routines.find(x => x.id === r.routine_id)?.title || '(deleted routine)') :
            kindLabel(r.kind);
          const assigned = (r.member_ids || [])
            .map(id => members.find(m => m.id === id))
            .filter(Boolean);
          return (
            <li key={r.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-medium shrink-0 bg-white/12 text-fg/90">
                  {kindLabel(r.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm break-words">
                    {target} · {r.threshold_days}× → <span className="text-fg/95">+{r.bonus_points || 0} pts</span>
                  </div>
                  <div className="text-fg/50 text-xs break-words">
                    {assigned.length === 0 ? 'everyone' : assigned.map(m => m.name).join(', ')}
                    {!r.active && ' · inactive'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 sm:ml-auto self-end sm:self-auto">
                {assigned.length > 0 && (
                  <div className="flex items-center -space-x-1 shrink-0">
                    {assigned.map(m => (
                      <span
                        key={m.id}
                        className="h-6 w-6 rounded-full flex items-center justify-center text-sm border-2 border-black/30"
                        style={{ backgroundColor: `${m.color}33`, color: m.color }}
                        title={m.name}
                      >
                        {m.emoji}
                      </span>
                    ))}
                  </div>
                )}
                <button onClick={() => setEditing(r)} className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest">Edit</button>
                <button onClick={() => remove(r.id)}  className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest">Delete</button>
              </div>
            </li>
          );
        })}
        {rewards.length === 0 && (
          <li className="text-fg/40 text-sm italic text-center py-6">No streak rewards yet.</li>
        )}
      </ul>
    </section>
  );
}

function StreakRewardForm({ reward, chores, routines, members, onSave, onCancel }) {
  const [kind,         setKind]        = useState(reward?.kind || 'all_routines');
  const [choreId,      setChoreId]     = useState(reward?.chore_id   || (chores[0]?.id   || ''));
  const [routineId,    setRoutineId]   = useState(reward?.routine_id || (routines[0]?.id || ''));
  const [memberIds,    setMemberIds]   = useState(reward?.member_ids || []);
  const [threshold,    setThreshold]   = useState(reward?.threshold_days ?? 7);
  const [bonusPoints,  setBonusPoints] = useState(reward?.bonus_points    ?? 25);
  const [active,       setActive]      = useState(reward?.active ?? true);

  function toggleMember(id) {
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function submit() {
    const body = {
      kind,
      chore_id:   kind === 'chore'   ? Number(choreId)   || null : null,
      routine_id: kind === 'routine' ? Number(routineId) || null : null,
      member_ids: memberIds,
      threshold_days: Number(threshold) || 1,
      bonus_points: Number(bonusPoints) || 0,
      active
    };
    onSave(body);
  }

  const canSave =
    threshold > 0 && bonusPoints >= 0 &&
    (kind === 'chore'   ? !!choreId   :
     kind === 'routine' ? !!routineId : true);

  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/15 p-4 flex flex-col gap-4">
      <Field label="Kind" hint="What counts as one successful occurrence?">
        <Pills options={KINDS} value={kind} onChange={setKind} />
      </Field>

      {kind === 'chore' && (
        <Field label="Chore">
          <select
            value={choreId}
            onChange={e => setChoreId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm cursor-pointer w-full"
          >
            {chores.length === 0 && <option value="">(no daily/custom chores yet)</option>}
            {chores.map(c => (
              <option key={c.id} value={c.id}>{c.title} · {c.frequency}</option>
            ))}
          </select>
        </Field>
      )}

      {kind === 'routine' && (
        <Field label="Routine">
          <select
            value={routineId}
            onChange={e => setRoutineId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm cursor-pointer w-full"
          >
            {routines.length === 0 && <option value="">(no routines yet)</option>}
            {routines.map(r => (
              <option key={r.id} value={r.id}>{r.title} · {r.frequency}</option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Threshold (occurrences)">
          <input
            type="number" min="1" value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums"
          />
        </Field>
        <Field label="Bonus points">
          <input
            type="number" min="0" value={bonusPoints}
            onChange={e => setBonusPoints(Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums"
          />
        </Field>
      </div>

      <Field label="Members" hint="Empty = applies to every member shown on the Points page.">
        <div className="flex flex-wrap gap-2">
          {members.map(m => {
            const on = memberIds.includes(m.id);
            return (
              <button
                key={m.id} type="button" onClick={() => toggleMember(m.id)}
                className="h-9 px-3 rounded-full flex items-center gap-1.5 text-sm transition border active:scale-95"
                style={on ? {
                  backgroundColor: m.color, color: '#0f0f13', borderColor: m.color
                } : { borderColor: `${m.color}55`, color: m.color }}
              >
                <span className="text-base leading-none">{m.emoji}</span>
                <span className="text-xs uppercase tracking-widest font-medium">{m.name}</span>
              </button>
            );
          })}
          {members.length === 0 && <span className="text-fg/40 text-sm italic">Add a family member first.</span>}
        </div>
      </Field>

      <Field label="Active">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4 accent-fg/80" />
          <span className="text-sm text-fg/70">Counting toward streaks</span>
        </label>
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
        <button onClick={onCancel} className="rounded-full px-3 py-1.5 text-fg/60 hover:text-fg text-xs uppercase tracking-widest font-medium">Cancel</button>
        <button
          onClick={submit}
          disabled={!canSave}
          className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-sm font-medium transition"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-fg/60 text-xs uppercase tracking-widest font-medium block mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-fg/40 text-xs mt-1.5 leading-relaxed">{hint}</div>}
    </div>
  );
}

function Pills({ options, value, onChange }) {
  // Mobile: 2-col grid of squared-off buttons so 4-option pickers don't bunch.
  // Desktop (sm+): the original horizontal rounded-full pill bar.
  return (
    <div className="grid grid-cols-2 sm:flex sm:items-center bg-white/[0.04] rounded-2xl sm:rounded-full p-0.5 sm:w-fit border border-white/10 gap-0.5 sm:gap-0">
      {options.map(opt => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={[
              'h-9 sm:h-8 px-3 sm:px-4 rounded-xl sm:rounded-full text-xs uppercase tracking-widest font-medium transition',
              on ? 'bg-white/15 text-fg' : 'text-fg/50 hover:text-fg/80'
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
