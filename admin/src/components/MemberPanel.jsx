import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// A handful of nice pastels matching the existing seed palette.
const COLOR_SWATCHES = [
  '#f9a8d4', '#fbcfe8', '#f0abfc', '#c4b5fd',
  '#93c5fd', '#7dd3fc', '#67e8f9', '#6ee7b7',
  '#a7f3d0', '#bef264', '#fde68a', '#fed7aa',
  '#fca5a5', '#9ca3af'
];

// Avatar options. Every emoji here has been verified to have a
// `fluent-emoji-flat` glyph on Iconify's CDN — so nothing in this picker
// renders as a broken image on the dashboard.
const EMOJI_PRESETS = [
  // People — kids
  '👶', '🧒', '👧', '👦',
  // People — adults
  '👩', '👨', '🧑',
  // People — hair variants
  '👩‍🦰', '👨‍🦰', '👩‍🦱', '👨‍🦱', '👩‍🦳', '👨‍🦳',
  // People — older
  '👵', '👴', '🧓',
  // Fantasy / heroes
  '👸', '🤴', '🦸', '🦹', '🧙', '🧚', '🧝', '🧞',
  // Spooky / sci-fi
  '🤖', '👻', '👽', '🎃',
  // Animals — mammals
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐵', '🐺', '🐴',
  '🦄', '🐘', '🦒', '🦓', '🦘', '🦔', '🦝', '🦦',
  '🦥', '🐪',
  // Animals — birds / reptiles / sea / bugs
  '🐔', '🐧', '🦆', '🦅', '🦉',
  '🐸', '🐊', '🐢', '🦖',
  '🐝', '🦋',
  '🐬', '🐳', '🐙', '🦈', '🐟',
  // Magic objects
  '🌟', '⭐', '✨', '🌈', '🚀', '🌞', '🌚', '🌜'
];

export default function MemberPanel() {
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null);   // member object or 'new'
  const [error, setError]     = useState(null);

  async function refresh() {
    try { setMembers(await api.members()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function save(form) {
    setError(null);
    try {
      if (editing === 'new') await api.createMember(form);
      else                   await api.updateMember(editing.id, form);
      setEditing(null);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function remove(member) {
    const confirmed = confirm(
      `Delete ${member.name}?\n\nThis will also clear their chore completions, routine checks, bonus selections, and goal. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.deleteMember(member.id);
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function move(member, direction) {
    const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(m => m.id === member.id);
    const swap = sorted[idx + direction];
    if (!swap) return;
    try {
      await api.updateMember(member.id, { sort_order: swap.sort_order });
      await api.updateMember(swap.id,    { sort_order: member.sort_order });
      refresh();
    } catch (e) { setError(e.message); }
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Family Members</h2>
          <p className="text-fg/50 text-sm mt-1">Each member gets their own card on the dashboard. Color flows through to their chips, points bar, and celebration confetti.</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 text-sm font-medium transition"
        >
          + Add member
        </button>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
      )}

      {editing && (
        <MemberForm
          member={editing === 'new' ? null : editing}
          existingCount={members.length}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="flex flex-col gap-2 mt-3">
        {members.map((m, i) => (
          <li
            key={m.id}
            className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-3"
          >
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{
                backgroundColor: `${m.color}33`,
                border: `1px solid ${m.color}66`
              }}
            >
              {m.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate" style={{ color: m.color }}>
                {m.name}
              </div>
              <div className="text-fg/50 text-xs tabular-nums">
                {m.points ?? 0} pts · {m.points_earned ?? 0} earned · {m.points_spent ?? 0} spent
                {m.show_in_points === false && (
                  <span className="ml-2 text-fg/40 normal-case tracking-normal">· hidden from Points</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => move(m, -1)} disabled={i === 0}
                className="h-7 w-7 rounded-full bg-white/[0.05] disabled:opacity-25 hover:bg-white/15 text-fg/70 transition"
                title="Move up"
              >↑</button>
              <button
                onClick={() => move(m, 1)} disabled={i === members.length - 1}
                className="h-7 w-7 rounded-full bg-white/[0.05] disabled:opacity-25 hover:bg-white/15 text-fg/70 transition"
                title="Move down"
              >↓</button>
            </div>
            <button onClick={() => setEditing(m)}  className="text-fg/60 hover:text-fg text-xs uppercase tracking-widest ml-1">Edit</button>
            <button onClick={() => remove(m)}     className="text-fg/40 hover:text-rose-400 text-xs uppercase tracking-widest">Delete</button>
          </li>
        ))}
        {members.length === 0 && (
          <li className="text-fg/40 italic text-sm py-4 text-center">No family members yet — add the first one.</li>
        )}
      </ul>
    </section>
  );
}

/* ───── Form ────────────────────────────────────────────────────────── */

function MemberForm({ member, existingCount, onSave, onCancel }) {
  const [name,  setName]  = useState(member?.name  || '');
  const [color, setColor] = useState(member?.color || COLOR_SWATCHES[0]);
  const [emoji, setEmoji] = useState(member?.emoji || EMOJI_PRESETS[0]);
  const [sort,  setSort]  = useState(member?.sort_order ?? existingCount);
  const [showInPoints, setShowInPoints] = useState(
    member?.show_in_points == null ? true : !!member.show_in_points
  );

  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/15 p-4 flex flex-col gap-4">
      <Field label="Name">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          placeholder="e.g. Ava"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
        />
      </Field>

      <Field label="Avatar">
        <div className="flex items-start gap-4 flex-wrap">
          <div
            className="h-14 w-14 rounded-full flex items-center justify-center text-3xl shrink-0"
            style={{
              backgroundColor: `${color}33`,
              border: `1px solid ${color}66`
            }}
          >
            {emoji || '🙂'}
          </div>
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {EMOJI_PRESETS.map(e => (
              <button
                key={e} type="button" onClick={() => setEmoji(e)}
                className={[
                  'h-9 w-9 rounded-full flex items-center justify-center text-xl transition',
                  emoji === e ? 'bg-white/15 ring-1 ring-white/30' : 'bg-white/[0.04] hover:bg-white/10'
                ].join(' ')}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field label="Color">
        <div className="flex items-center gap-3 flex-wrap">
          {COLOR_SWATCHES.map(c => (
            <button
              key={c} type="button" onClick={() => setColor(c)}
              className={[
                'h-9 w-9 rounded-full transition',
                color === c ? 'ring-2 ring-offset-2 ring-offset-[#1a1a1f]' : ''
              ].join(' ')}
              style={{
                backgroundColor: c,
                ...(color === c ? { boxShadow: `0 0 0 2px ${c}` } : null)
              }}
              aria-label={c}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="h-9 w-9 rounded-full bg-transparent cursor-pointer ml-1 border border-white/10"
            aria-label="Custom color"
          />
          <span className="text-fg/40 text-xs font-mono ml-1">{color}</span>
        </div>
      </Field>

      <Field label="Points page">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showInPoints}
            onChange={e => setShowInPoints(e.target.checked)}
            className="h-4 w-4 accent-fg/80"
          />
          <span className="text-sm text-fg/70">
            Show this member on the Points page
          </span>
        </label>
        <div className="text-fg/40 text-xs mt-1.5">
          Turn off for parents — they'll still appear elsewhere on the dashboard, just not in bonus claims or the Points members strip.
        </div>
      </Field>

      <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
        <button onClick={onCancel} className="rounded-full px-3 py-1.5 text-fg/60 hover:text-fg text-xs uppercase tracking-widest font-medium">
          Cancel
        </button>
        <button
          onClick={() => onSave({
            name: name.trim(), color, emoji: emoji || '🙂',
            sort_order: sort, show_in_points: showInPoints
          })}
          disabled={!name.trim()}
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
