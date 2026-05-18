import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function RewardPanel() {
  const [rewards, setRewards] = useState([]);
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null);   // reward being edited (or 'new')
  const [error, setError]     = useState(null);

  async function refresh() {
    try {
      const [r, m] = await Promise.all([api.rewards(), api.members()]);
      setRewards(r);
      setMembers(m);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(form) {
    setError(null);
    try {
      if (editing === 'new') {
        await api.createReward(form);
      } else {
        await api.updateReward(editing.id, form);
      }
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this reward?')) return;
    await api.deleteReward(id);
    refresh();
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Rewards</h2>
          <p className="text-fg/50 text-sm mt-1">
            Points sinks the kids spend toward. Leave assignees empty for a household-wide reward.
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
        <RewardForm
          reward={editing === 'new' ? null : editing}
          members={members}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="flex flex-col gap-2 mt-3">
        {rewards.map(r => {
          const assigned = (r.assignee_ids || [])
            .map(id => members.find(m => m.id === id))
            .filter(Boolean);
          return (
            <li
              key={r.id}
              className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3"
            >
              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-medium shrink-0 bg-white/12 text-fg/90 tabular-nums">
                {r.point_cost} pts
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.title}</div>
                <div className="text-fg/50 text-xs">
                  {assigned.length === 0
                    ? 'everyone'
                    : assigned.map(m => m.name).join(', ')}
                  {!r.active && ' · inactive'}
                </div>
              </div>
              {assigned.length > 0 && (
                <div className="flex items-center -space-x-1 shrink-0">
                  {assigned.map(m => (
                    <span
                      key={m.id}
                      className="h-6 w-6 rounded-full flex items-center justify-center text-sm border-2 border-black/30"
                      style={{
                        backgroundColor: `${m.color}33`,
                        color: m.color
                      }}
                      title={m.name}
                    >
                      {m.emoji}
                    </span>
                  ))}
                </div>
              )}
              <button onClick={() => setEditing(r)} className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest">Edit</button>
              <button onClick={() => remove(r.id)}  className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest">Delete</button>
            </li>
          );
        })}
        {rewards.length === 0 && (
          <li className="text-fg/40 text-sm italic text-center py-6">No rewards yet — add one above.</li>
        )}
      </ul>
    </section>
  );
}

function RewardForm({ reward, members, onSave, onCancel }) {
  const [title,       setTitle]       = useState(reward?.title || '');
  const [description, setDescription] = useState(reward?.description || '');
  const [pointCost,   setPointCost]   = useState(reward?.point_cost ?? 50);
  const [assigneeIds, setAssigneeIds] = useState(reward?.assignee_ids || []);
  const [active,      setActive]      = useState(reward?.active ?? true);

  function toggleAssignee(id) {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/15 p-4 flex flex-col gap-4">
      <Field label="Title">
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
        />
      </Field>

      <Field label="Description" hint="Optional. Shown on the Rewards screen.">
        <textarea
          value={description} onChange={e => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm resize-none"
        />
      </Field>

      <Field label="Point cost">
        <input
          type="number" min="0" value={pointCost}
          onChange={e => setPointCost(Number(e.target.value))}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums"
        />
      </Field>

      <Field
        label="Assignees"
        hint="Empty = available to every member on the Rewards screen. Pick specific members to limit it."
      >
        <div className="flex flex-wrap gap-2">
          {members.map(m => {
            const on = assigneeIds.includes(m.id);
            return (
              <button
                key={m.id} type="button" onClick={() => toggleAssignee(m.id)}
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
          <span className="text-sm text-fg/70">Show on Rewards screen</span>
        </label>
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
        <button onClick={onCancel} className="rounded-full px-3 py-1.5 text-fg/60 hover:text-fg text-xs uppercase tracking-widest font-medium">
          Cancel
        </button>
        <button
          onClick={() => onSave({
            title,
            description: description.trim() || null,
            point_cost: pointCost,
            assignee_ids: assigneeIds,
            active
          })}
          disabled={!title.trim()}
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
