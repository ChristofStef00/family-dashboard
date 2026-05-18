import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function relativeTime(value) {
  if (!value) return 'never';
  const iso = String(value).includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400)     return `${Math.round(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} days ago`;
  return new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' }).format(t);
}

export default function IcsCalendarPanel() {
  const [subs, setSubs]       = useState([]);
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null);   // sub or 'new'
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);

  async function refresh() {
    try {
      const [s, m] = await Promise.all([api.icsSubscriptions(), api.members()]);
      setSubs(s);
      setMembers(m);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(form) {
    setError(null);
    try {
      if (editing === 'new') await api.createIcsSubscription(form);
      else                    await api.updateIcsSubscription(editing.id, form);
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this calendar subscription? Its events will be removed from the kiosk.')) return;
    await api.deleteIcsSubscription(id);
    refresh();
  }

  async function syncNow() {
    setBusy(true); setError(null);
    try {
      const r = await api.syncIcs();
      if (r.errors?.length) setError(`Sync finished with errors on ${r.errors.length} feed(s).`);
      refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-light tracking-tight">iCal / ICS Calendar Subscriptions</h2>
          <p className="text-fg/50 text-sm mt-1">
            Read-only calendar feeds — Google's "secret iCal address," Outlook ICS export, school sports schedules, etc.
            Events show on the kiosk in the assigned member's color. Refreshes every 15 minutes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncNow}
            disabled={busy}
            className="rounded-full px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-xs uppercase tracking-widest font-medium transition disabled:opacity-50"
          >
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            onClick={() => setEditing('new')}
            className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 text-sm font-medium transition"
          >
            + Add
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
      )}

      <details className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3 mb-4 text-sm">
        <summary className="cursor-pointer font-medium text-fg/80">Where do I get a Google Calendar iCal URL?</summary>
        <ol className="mt-3 list-decimal pl-5 space-y-1 text-fg/70 text-[13px] leading-relaxed">
          <li>Open <a className="underline" href="https://calendar.google.com" target="_blank" rel="noreferrer">Google Calendar</a> in a browser (not the app).</li>
          <li>Hover your calendar name in the left sidebar → three-dot menu → <b>Settings and sharing</b>.</li>
          <li>Scroll to <b>Integrate calendar</b>.</li>
          <li>Copy the <b>"Secret address in iCal format"</b> — the one that ends in <code>.ics</code>. Paste it below.</li>
        </ol>
        <p className="mt-2 text-fg/50 text-[12px]">Note: this URL is essentially a password for your calendar — keep it private. You can rotate it from the same Google Calendar page if it ever leaks.</p>
      </details>

      {editing && (
        <IcsForm
          sub={editing === 'new' ? null : editing}
          members={members}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="flex flex-col gap-2 mt-3">
        {subs.map(s => {
          const shared = !s.member_id;
          const chipColor = shared ? (s.color || '#9ca3af') : s.member_color;
          const chipEmoji = shared ? '📅' : s.member_emoji;
          return (
            <li key={s.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3">
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-lg shrink-0"
                style={{
                  backgroundColor: `${chipColor}33`,
                  border: `1px solid ${chipColor}66`
                }}
                title={shared ? 'Shared (no owner)' : (s.member_name || '')}
              >
                {chipEmoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{s.name}</div>
                <div className="text-fg/50 text-xs truncate">
                  {shared ? 'Shared' : s.member_name} · synced {relativeTime(s.last_synced_at)}
                  {!s.active && ' · paused'}
                </div>
                {s.last_error && (
                  <div className="text-rose-300/80 text-xs mt-0.5 truncate" title={s.last_error}>
                    ⚠ {s.last_error}
                  </div>
                )}
              </div>
              <button onClick={() => setEditing(s)} className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest">Edit</button>
              <button onClick={() => remove(s.id)}  className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest">Delete</button>
            </li>
          );
        })}
        {subs.length === 0 && (
          <li className="text-fg/40 text-sm italic text-center py-6">No calendar subscriptions yet.</li>
        )}
      </ul>
    </section>
  );
}

function IcsForm({ sub, members, onSave, onCancel }) {
  // memberId = '' means "shared (no owner)". A real member id is a number.
  const initialMember = sub
    ? (sub.member_id ? String(sub.member_id) : '')
    : (members[0]?.id ? String(members[0].id) : '');
  const [memberId, setMemberId] = useState(initialMember);
  const [name,     setName]     = useState(sub?.name  || '');
  const [url,      setUrl]      = useState(sub?.url   || '');
  const [color,    setColor]    = useState(sub?.color || '#9ca3af');
  const [active,   setActive]   = useState(sub?.active ?? true);

  const isShared = memberId === '';

  function submit() {
    onSave({
      member_id: isShared ? null : Number(memberId),
      name:      name.trim(),
      url:       url.trim(),
      color:     isShared ? color : null,
      active
    });
  }

  const canSave = name.trim() && url.trim() && /^https?:\/\//i.test(url.trim());

  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/15 p-4 flex flex-col gap-4">
      <Field label="Member" hint="Owned feeds render in that kid's color. Pick 'Shared' for a household calendar (school holidays, family events, etc).">
        <select
          value={memberId}
          onChange={e => setMemberId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm cursor-pointer w-full"
        >
          <option value="">📅 Shared (no member)</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>
          ))}
        </select>
      </Field>

      {isShared && (
        <Field label="Color" hint="Hue used for every event from this shared feed on the kiosk calendar.">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="h-10 w-16 rounded-lg bg-white/5 border border-white/10 cursor-pointer"
            />
            <input
              type="text"
              value={color}
              onChange={e => setColor(e.target.value)}
              placeholder="#9ca3af"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm font-mono"
            />
            <span
              className="h-10 w-10 rounded-full border border-white/15"
              style={{ backgroundColor: color }}
              title="preview"
            />
          </div>
        </Field>
      )}

      <Field label="Display name" hint="e.g. 'Renley school', 'Family events'.">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
        />
      </Field>

      <Field label="ICS URL" hint="Must start with https:// and end in .ics (or otherwise serve iCalendar data).">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm font-mono"
        />
      </Field>

      <Field label="Active">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="h-4 w-4 accent-fg/80"
          />
          <span className="text-sm text-fg/70">Sync this feed every 15 minutes</span>
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
