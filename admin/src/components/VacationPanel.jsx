import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function formatRange(start, end) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (start === end) return new Intl.DateTimeFormat([], opts).format(s);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sFmt = new Intl.DateTimeFormat([], sameYear ? { month: 'short', day: 'numeric' } : opts).format(s);
  const eFmt = new Intl.DateTimeFormat([], opts).format(e);
  return `${sFmt} – ${eFmt}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function VacationPanel() {
  const [vacs, setVacs]       = useState([]);
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null);   // vacation or 'new'
  const [error, setError]     = useState(null);

  async function refresh() {
    try {
      const [v, m] = await Promise.all([api.vacations(), api.members()]);
      setVacs(v);
      setMembers(m);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(form) {
    setError(null);
    try {
      if (editing === 'new') await api.createVacation(form);
      else                    await api.updateVacation(editing.id, form);
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this vacation?')) return;
    await api.deleteVacation(id);
    refresh();
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Vacations</h2>
          <p className="text-fg/50 text-sm mt-1">
            Date ranges where streaks pause for the listed kids. Vacation days don't count toward or against a streak.
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
        <VacationForm
          vacation={editing === 'new' ? null : editing}
          members={members}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="flex flex-col gap-2 mt-3">
        {vacs.map(v => {
          const assigned = (v.member_ids || [])
            .map(id => members.find(m => m.id === id))
            .filter(Boolean);
          return (
            <li key={v.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{formatRange(v.start_date, v.end_date)}</div>
                <div className="text-fg/50 text-xs">
                  {assigned.length === 0 ? 'Everyone' : assigned.map(m => m.name).join(', ')}
                  {v.note ? ` · ${v.note}` : ''}
                </div>
              </div>
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
              <button onClick={() => setEditing(v)} className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest">Edit</button>
              <button onClick={() => remove(v.id)}  className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest">Delete</button>
            </li>
          );
        })}
        {vacs.length === 0 && (
          <li className="text-fg/40 text-sm italic text-center py-6">No vacations on the books.</li>
        )}
      </ul>
    </section>
  );
}

function VacationForm({ vacation, members, onSave, onCancel }) {
  const [startDate, setStartDate] = useState(vacation?.start_date || todayISO());
  const [endDate,   setEndDate]   = useState(vacation?.end_date   || todayISO());
  const [memberIds, setMemberIds] = useState(vacation?.member_ids || []);
  const [note,      setNote]      = useState(vacation?.note       || '');

  function toggleMember(id) {
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function submit() {
    onSave({
      member_ids: memberIds,
      start_date: startDate,
      end_date:   endDate,
      note: note.trim() || null
    });
  }

  const canSave = startDate && endDate && endDate >= startDate;

  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/15 p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input
            type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums"
          />
        </Field>
        <Field label="End">
          <input
            type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)}
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
        </div>
      </Field>

      <Field label="Note" hint="Optional — for your own reference.">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. Grandma's house"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
        />
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
