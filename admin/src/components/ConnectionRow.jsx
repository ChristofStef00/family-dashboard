import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function ConnectionRow({ connection, onChange }) {
  const [open, setOpen]       = useState(false);
  const [calendars, setCals]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  // Track the working selection — derived from the API state but mutable.
  const [selected, setSelected] = useState(() => new Set(connection.selected_calendars || ['primary']));

  useEffect(() => {
    setSelected(new Set(connection.selected_calendars || ['primary']));
  }, [connection.selected_calendars]);

  async function loadCalendars() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listCalendars(connection.id);
      setCals(list);
      // Reconcile selection against the live list — keep IDs that exist, plus 'primary' alias if applicable.
      const validIds = new Set(list.map(c => c.id));
      const next = new Set();
      for (const id of selected) if (validIds.has(id) || id === 'primary') next.add(id);
      // If 'primary' is selected but not present, swap to the actual primary id.
      if (next.has('primary')) {
        const primary = list.find(c => c.primary);
        if (primary) { next.delete('primary'); next.add(primary.id); }
      }
      setSelected(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !calendars) await loadCalendars();
  }

  function toggleCalendar(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.saveCalendarSelection(connection.id, Array.from(selected));
      onChange?.();
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${connection.email}?`)) return;
    await api.disconnect(connection.id);
    onChange?.();
  }

  const dirty = !setsEqual(selected, new Set(connection.selected_calendars || []));

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-3 p-3">
        <span className="flex-1 truncate text-sm text-fg/80">{connection.email}</span>
        <span className="text-fg/40 text-xs uppercase tracking-widest hidden sm:inline">
          {connection.selected_calendars?.length || 1} cal{connection.selected_calendars?.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={toggleOpen}
          className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest transition"
        >
          {open ? 'Close' : 'Calendars'}
        </button>
        <button
          onClick={disconnect}
          className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest transition"
        >
          Disconnect
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 p-3">
          {loading && <div className="text-fg/40 text-sm py-2">Loading calendars…</div>}
          {error  && <div className="text-rose-400 text-sm py-2">{error}</div>}
          {calendars && (
            <>
              <ul className="flex flex-col max-h-64 overflow-y-auto pr-1">
                {calendars.map(c => {
                  const isSelected = selected.has(c.id) || (c.primary && selected.has('primary'));
                  return (
                    <li key={c.id}>
                      <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCalendar(c.id)}
                          className="h-4 w-4 accent-fg/80"
                        />
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: c.background_color || '#888' }}
                        />
                        <span className="text-sm truncate flex-1">
                          {c.summary_override || c.summary}
                        </span>
                        {c.primary && (
                          <span className="text-fg/40 text-[10px] uppercase tracking-widest">Primary</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-white/10">
                <span className="text-fg/40 text-xs mr-auto">
                  {selected.size} selected
                </span>
                <button
                  onClick={() => { setSelected(new Set(connection.selected_calendars || ['primary'])); setOpen(false); }}
                  className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className="rounded-full px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-30 text-xs uppercase tracking-widest font-medium transition"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
