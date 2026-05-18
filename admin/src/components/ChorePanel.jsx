import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const FREQUENCIES = ['daily', 'weekly', 'custom', 'once'];
const CATEGORIES  = ['chore', 'bonus'];
const CLAIM_MODES = ['multi', 'single'];

export default function ChorePanel() {
  const [chores, setChores]   = useState([]);
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null);   // chore being edited (or 'new')
  const [error, setError]     = useState(null);

  async function refresh() {
    try {
      const [c, m] = await Promise.all([api.chores(), api.members()]);
      setChores(c);
      setMembers(m);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(form) {
    setError(null);
    try {
      if (editing === 'new') {
        await api.createChore(form);
      } else {
        await api.updateChore(editing.id, form);
      }
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this chore?')) return;
    await api.deleteChore(id);
    refresh();
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Chores &amp; Bonuses</h2>
          <p className="text-fg/50 text-sm mt-1">Each chore awards points when completed. Mark as bonus to put it in the kid-pickable Bonuses list on the Points page.</p>
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
        <ChoreForm
          chore={editing === 'new' ? null : editing}
          members={members}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="flex flex-col gap-2 mt-3">
        {chores.map(c => (
          <li
            key={c.id}
            className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3"
          >
            <span
              className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-medium shrink-0"
              style={{
                backgroundColor: c.category === 'bonus' ? '#fb923c' : 'rgba(255,255,255,0.12)',
                color: c.category === 'bonus' ? '#0f0f13' : '#f0f0f5'
              }}
            >
              {c.category}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{c.title}</div>
              <div className="text-fg/50 text-xs">
                {c.points} pt · {c.frequency}
                {c.category === 'chore' && (
                  <span> · {c.assignee_ids?.length
                    ? `${c.assignee_ids.length} assignee${c.assignee_ids.length === 1 ? '' : 's'}`
                    : 'unassigned'}</span>
                )}
                {c.category === 'bonus' && (
                  <span> · {c.claim_mode === 'single' ? 'single-claim' : 'multi-claim'}</span>
                )}
                {!c.active && ' · inactive'}
              </div>
            </div>
            <button onClick={() => setEditing(c)} className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest">Edit</button>
            <button onClick={() => remove(c.id)}  className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest">Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChoreForm({ chore, members, onSave, onCancel }) {
  const [title,       setTitle]       = useState(chore?.title || '');
  const [points,      setPoints]      = useState(chore?.points ?? 5);
  const [frequency,   setFrequency]   = useState(chore?.frequency || 'daily');
  const [customDays,  setCustomDays]  = useState(chore?.custom_days || []);
  const [assigneeIds, setAssigneeIds] = useState(chore?.assignee_ids || []);
  const [category,    setCategory]    = useState(chore?.category || 'chore');
  const [claimMode,   setClaimMode]   = useState(chore?.claim_mode || 'multi');
  const [active,      setActive]      = useState(chore?.active ?? true);

  function toggleDay(d) {
    setCustomDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  }
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Points">
          <input
            type="number" min="0" value={points}
            onChange={e => setPoints(Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums"
          />
        </Field>
        <Field label="Category">
          <Pills options={CATEGORIES} value={category} onChange={setCategory} />
        </Field>
      </div>

      <Field label="Frequency">
        <Pills options={FREQUENCIES} value={frequency} onChange={setFrequency} />
      </Field>

      {frequency === 'custom' && (
        <Field label="Days">
          <div className="flex gap-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, i) => (
              <button
                key={i} type="button" onClick={() => toggleDay(i)}
                className={[
                  'h-8 w-10 rounded-full text-xs uppercase tracking-widest font-medium transition',
                  customDays.includes(i)
                    ? 'bg-white/15 text-fg'
                    : 'bg-white/[0.04] text-fg/50 hover:text-fg/80'
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {category === 'chore' && (
        <Field
          label="Assignees"
          hint="Only members in this list see the chore on their card."
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
      )}

      {category === 'bonus' && (
        <Field
          label="Claim mode"
          hint={claimMode === 'single'
            ? 'Only one member can claim this bonus at a time. Picking it for someone else transfers ownership.'
            : 'Multiple members can independently claim this bonus.'}
        >
          <select
            value={claimMode}
            onChange={e => setClaimMode(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm cursor-pointer"
          >
            <option value="multi">Multiple people</option>
            <option value="single">Single person</option>
          </select>
        </Field>
      )}

      <Field label="Active">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4 accent-fg/80" />
          <span className="text-sm text-fg/70">Show on dashboard</span>
        </label>
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
        <button onClick={onCancel} className="rounded-full px-3 py-1.5 text-fg/60 hover:text-fg text-xs uppercase tracking-widest font-medium">
          Cancel
        </button>
        <button
          onClick={() => onSave({
            title, points, frequency,
            custom_days: frequency === 'custom' ? customDays : null,
            assignee_ids: category === 'chore' ? assigneeIds : [],
            category,
            claim_mode: category === 'bonus' ? claimMode : 'multi',
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

function Pills({ options, value, onChange }) {
  return (
    <div className="flex items-center bg-white/[0.04] rounded-full p-0.5 w-fit border border-white/10">
      {options.map(opt => {
        const on = opt === value;
        return (
          <button
            key={opt} type="button" onClick={() => onChange(opt)}
            className={[
              'h-8 px-3 rounded-full text-xs uppercase tracking-widest font-medium transition',
              on ? 'bg-white/15 text-fg' : 'text-fg/50 hover:text-fg/80'
            ].join(' ')}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
