import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const FREQUENCIES = ['daily', 'weekdays', 'custom'];

export default function RoutinePanel() {
  const [routines, setRoutines] = useState([]);
  const [members, setMembers]   = useState([]);
  const [editing, setEditing]   = useState(null);  // routine being edited (or 'new')
  const [error, setError]       = useState(null);

  async function refresh() {
    try {
      const [r, m] = await Promise.all([api.routines(), api.members()]);
      setRoutines(r);
      setMembers(m);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(form) {
    setError(null);
    try {
      if (editing === 'new') {
        await api.createRoutine(form);
      } else {
        // Update routine fields, then sync items (delete missing, update existing, add new)
        await api.updateRoutine(editing.id, {
          title: form.title,
          assignee_ids: form.assignee_ids,
          frequency: form.frequency,
          custom_days: form.custom_days,
          points: form.points,
          active: form.active
        });
        // Reconcile items
        const existingIds = new Set((editing.items || []).map(i => i.id));
        const formIds = new Set(form.items.filter(i => i.id).map(i => i.id));
        for (const old of (editing.items || [])) {
          if (!formIds.has(old.id)) await api.deleteRoutineItem(old.id);
        }
        for (let i = 0; i < form.items.length; i++) {
          const item = form.items[i];
          if (item.id && existingIds.has(item.id)) {
            await api.updateRoutineItem(item.id, { title: item.title, sort_order: i });
          } else if (item.title?.trim()) {
            await api.addRoutineItem(editing.id, { title: item.title, sort_order: i });
          }
        }
      }
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this routine?')) return;
    await api.deleteRoutine(id);
    refresh();
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Routines</h2>
          <p className="text-fg/50 text-sm mt-1">All-or-nothing checklists. Members earn the routine's points only when every item is checked off for the day.</p>
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
        <RoutineForm
          routine={editing === 'new' ? null : editing}
          members={members}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="flex flex-col gap-2 mt-3">
        {routines.map(r => (
          <li key={r.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{r.title}</div>
              <div className="text-fg/50 text-xs">
                +{r.points} pt · {r.frequency}
                {r.assignee_ids?.length ? ` · ${r.assignee_ids.length} kid${r.assignee_ids.length === 1 ? '' : 's'}` : ' · unassigned'}
                · {r.items?.length || 0} item{r.items?.length === 1 ? '' : 's'}
                {!r.active && ' · inactive'}
              </div>
            </div>
            <button onClick={() => setEditing(r)} className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest">Edit</button>
            <button onClick={() => remove(r.id)}  className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest">Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoutineForm({ routine, members, onSave, onCancel }) {
  const [title,       setTitle]       = useState(routine?.title || '');
  const [points,      setPoints]      = useState(routine?.points ?? 1);
  const [frequency,   setFrequency]   = useState(routine?.frequency || 'daily');
  const [customDays,  setCustomDays]  = useState(routine?.custom_days || []);
  const [assigneeIds, setAssigneeIds] = useState(routine?.assignee_ids || []);
  const [active,      setActive]      = useState(routine?.active ?? true);
  const [items,       setItems]       = useState(
    routine?.items?.length
      ? routine.items.map(i => ({ id: i.id, title: i.title }))
      : [{ id: null, title: '' }]
  );

  function updateItem(idx, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, title: value } : it));
  }
  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }
  function addItem() {
    setItems(prev => [...prev, { id: null, title: '' }]);
  }

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
          placeholder="e.g. Morning Routine"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Points awarded">
          <input
            type="number" min="0" value={points}
            onChange={e => setPoints(Number(e.target.value))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums"
          />
        </Field>
        <Field label="Frequency">
          <Pills options={FREQUENCIES} value={frequency} onChange={setFrequency} />
        </Field>
      </div>

      {frequency === 'custom' && (
        <Field label="Days">
          <div className="flex gap-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label, i) => (
              <button
                key={i} type="button" onClick={() => toggleDay(i)}
                className={[
                  'h-8 w-10 rounded-full text-xs uppercase tracking-widest font-medium transition',
                  customDays.includes(i) ? 'bg-white/15 text-fg' : 'bg-white/[0.04] text-fg/50 hover:text-fg/80'
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Assignees">
        <div className="flex flex-wrap gap-2">
          {members.map(m => {
            const on = assigneeIds.includes(m.id);
            return (
              <button
                key={m.id} type="button" onClick={() => toggleAssignee(m.id)}
                className="h-9 px-3 rounded-full flex items-center gap-1.5 text-sm transition border"
                style={on ? {
                  backgroundColor: m.color, color: '#0f0f13', borderColor: m.color
                } : { borderColor: `${m.color}55`, color: m.color }}
              >
                <span className="text-base leading-none">{m.emoji}</span>
                <span className="text-xs uppercase tracking-widest font-medium">{m.name}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Items">
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={item.id ?? `new-${i}`} className="flex items-center gap-2">
              <span className="text-fg/30 text-xs tabular-nums w-5 text-right">{i + 1}.</span>
              <input
                value={item.title} onChange={e => updateItem(i, e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
                placeholder="e.g. Brush teeth"
              />
              <button
                type="button" onClick={() => removeItem(i)}
                className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button" onClick={addItem}
          className="mt-2 text-fg/60 hover:text-fg text-xs uppercase tracking-widest"
        >
          + Add item
        </button>
      </Field>

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
            assignee_ids: assigneeIds,
            active,
            items: items.filter(i => i.title?.trim())
          })}
          disabled={!title.trim() || items.filter(i => i.title?.trim()).length === 0}
          className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-sm font-medium transition"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-fg/60 text-xs uppercase tracking-widest font-medium block mb-1.5">{label}</label>
      {children}
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
