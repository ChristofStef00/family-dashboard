import { useState } from 'react';
import { api } from '../lib/api.js';
import { celebrateFromEvent, celebrateShower } from '../lib/celebrate.js';

export default function MemberCard({
  member,
  chores = [],
  routines = [],     // [{ routine_id, routine_title, points, items: [{id,title,checked}], completed }]
  bonuses = [],      // [{ id, title, points, frequency, completed }]
  onChange
}) {
  // Track which row just flipped so we can pop its checkbox
  const [popKey, setPopKey] = useState(null);
  const popFor = (key) => {
    setPopKey(key);
    setTimeout(() => setPopKey(null), 350);
  };

  async function toggleChore(c, evt) {
    const done = c.completed_by.includes(member.id);
    if (done) {
      await api.uncompleteChore(c.id, member.id);
    } else {
      celebrateFromEvent(evt, { color: member.color, emoji: member.emoji });
      popFor(`chore:${c.id}`);
      const r = await api.completeChore(c.id, member.id);
      // Streak award celebration — bigger if any awards came back
      if (r?.awards?.length) {
        celebrateFromEvent(evt, { color: member.color, emoji: '🏆' });
      }
    }
    onChange?.();
  }

  async function toggleBonus(b, evt) {
    if (b.completed) {
      // Bonuses use the same chore_completion store, so reuse uncompleteChore
      await api.uncompleteChore(b.id, member.id);
    } else {
      celebrateFromEvent(evt, { color: member.color, emoji: '✨' });
      popFor(`bonus:${b.id}`);
      await api.completeChore(b.id, member.id);
    }
    onChange?.();
  }

  // "X" on a bonus row releases it back to the picker (and removes it from
  // this member's card). Doesn't affect any prior completion / awarded points.
  async function unselectBonus(b) {
    await api.unselectBonus(b.id, member.id);
    onChange?.();
  }

  async function toggleRoutineItem(routine, item, evt) {
    if (item.checked) {
      await api.uncheckRoutineItem(item.id, member.id);
    } else {
      popFor(`item:${item.id}`);
      const res = await api.checkRoutineItem(item.id, member.id);
      // Routine just completed for the day → shower of confetti from the
      // top half of the screen + a top-of-screen "X · Routine complete"
      // banner via the global event listener in RoutineCompleteBanner.
      if (res?.awarded) {
        celebrateShower({ color: member.color });
        window.dispatchEvent(new CustomEvent('fd:routine-complete', {
          detail: {
            member_name:   member.name,
            member_color:  member.color,
            member_emoji:  member.emoji,
            routine_title: routine.routine_title,
            points:        res.awarded.points
          }
        }));
      }
      // Streak award fired alongside the routine completion → bigger burst.
      if (res?.awards?.length) {
        celebrateFromEvent(evt, { color: member.color, emoji: '🏆' });
      }
    }
    onChange?.();
  }

  async function redeemGoal() {
    if (!member.goal?.redeemable) return;
    await api.redeemReward(member.goal.reward_id, member.id);
    onChange?.();
  }

  const empty = chores.length === 0 && bonuses.length === 0 && routines.length === 0;
  const choresDoneCount = chores.filter(c => c.completed_by.includes(member.id)).length;

  return (
    <div
      data-portal-target={`member-${member.id}`}
      className="card-pad h-full flex flex-col min-h-0 overflow-hidden"
    >
      <header className="flex items-center gap-3 shrink-0 mb-4">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{
            backgroundColor: `${member.color}33`,
            border: `1px solid ${member.color}66`
          }}
        >
          {member.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mem-text font-medium break-words text-base" style={{ '--mem-color': member.color }}>
            {member.name}
          </div>
          <div className="text-fg/50 text-xs tabular-nums">
            {member.points ?? 0} pts
            {chores.length > 0 && (
              <span className="ml-2">· {choresDoneCount}/{chores.length} chores</span>
            )}
          </div>
        </div>
      </header>

      {member.goal && (
        <GoalBar
          goal={member.goal}
          memberId={member.id}
          color={member.color}
          onRedeem={redeemGoal}
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 mt-1">
        {empty ? (
          <div className="text-fg/40 text-sm text-center py-6">All clear ✨</div>
        ) : (
          // Divider down the middle: routines stagger left/right in reading
          // order (R0 top-left, R1 top-right, R2 below R0, …), chores stack
          // under the left side, bonuses stack under the right side.
          <div className="flex gap-4 min-h-full">
            <div className="flex-1 min-w-0 pr-4 border-r border-surface/10 flex flex-col gap-4">
              {routines.filter((_, i) => i % 2 === 0).map(r => (
                <RoutineSection
                  key={r.routine_id}
                  routine={r}
                  color={member.color}
                  popKey={popKey}
                  onToggleItem={(item, evt) => toggleRoutineItem(r, item, evt)}
                />
              ))}
              {chores.length > 0 && (
                <section>
                  <div className="stat-label mb-2">Chores</div>
                  <ul className="flex flex-col gap-1">
                    {chores.map(c => {
                      const done = c.completed_by.includes(member.id);
                      return (
                        <li key={c.id}>
                          <ToggleRow
                            done={done}
                            color={member.color}
                            onClick={(e) => toggleChore(c, e)}
                            label={c.title}
                            meta={`${c.points} pt${c.points === 1 ? '' : 's'}`}
                            popping={popKey === `chore:${c.id}`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {routines.filter((_, i) => i % 2 === 1).map(r => (
                <RoutineSection
                  key={r.routine_id}
                  routine={r}
                  color={member.color}
                  popKey={popKey}
                  onToggleItem={(item, evt) => toggleRoutineItem(r, item, evt)}
                />
              ))}
              {bonuses.length > 0 && (
                <section>
                  <div className="stat-label mb-2 text-orange-300">Bonuses</div>
                  <ul className="flex flex-col gap-1">
                    {bonuses.map(b => (
                      <li key={b.id}>
                        <BonusRow
                          done={b.completed}
                          color="#fb923c"  /* orange-400 to match calendar bonus chips */
                          onToggle={(e) => toggleBonus(b, e)}
                          onRemove={() => unselectBonus(b)}
                          label={b.title}
                          meta={`${b.points} pt${b.points === 1 ? '' : 's'}`}
                          popping={popKey === `bonus:${b.id}`}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── Goal progress bar ───────────────────────────────────────────── */

function GoalBar({ goal, memberId, color, onRedeem }) {
  const { reward_title, point_cost, balance, progress_pct, redeemable } = goal;
  const shown = Math.min(balance, point_cost);
  return (
    <div
      data-portal-target={`goal-${memberId}`}
      className="shrink-0 mb-3 rounded-xl p-3 bg-surface/[0.04] border border-surface/10"
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="stat-label leading-none">Goal</div>
          <div className="font-medium text-sm mt-0.5 break-words">{reward_title}</div>
        </div>
        <div className="text-xs tabular-nums text-fg/60 shrink-0">
          <span className="text-fg/90">{shown}</span> / {point_cost}
        </div>
      </div>
      <div className="h-2 rounded-full bg-surface/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${progress_pct}%`,
            backgroundColor: color,
            boxShadow: redeemable ? `0 0 12px ${color}99` : 'none'
          }}
        />
      </div>
      {redeemable && (
        <button
          onClick={onRedeem}
          className="w-full mt-2 rounded-full text-[11px] uppercase tracking-widest font-medium py-1.5 active:scale-[0.98] transition"
          style={{ backgroundColor: color, color: '#0f0f13' }}
        >
          Redeem
        </button>
      )}
    </div>
  );
}

/* ───── Routine section (checklist with combined point award) ───────── */

function RoutineSection({ routine, color, popKey, onToggleItem }) {
  const total = routine.items.length;
  const done  = routine.items.filter(i => i.checked).length;
  const allDone = total > 0 && done === total;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <div className="stat-label">{routine.routine_title}</div>
        <div className={[
          'text-xs tabular-nums',
          allDone ? '' : 'text-fg/40'
        ].join(' ')}
          style={allDone ? { color } : undefined}
        >
          {done}/{total} · +{routine.points} pt{routine.points === 1 ? '' : 's'}
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {routine.items.map(item => (
          <li key={item.id}>
            <ToggleRow
              done={item.checked}
              color={color}
              onClick={(e) => onToggleItem(item, e)}
              label={item.title}
              popping={popKey === `item:${item.id}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───── Bonus row (toggle + remove) ─────────────────────────────────── */

function BonusRow({ done, color, onToggle, onRemove, label, meta, popping }) {
  return (
    <div className="w-full flex items-center gap-2 rounded-lg hover:bg-surface/[0.03] transition group">
      <button
        onClick={onToggle}
        className="flex-1 min-w-0 flex items-center gap-3 py-1.5 text-left active:scale-[0.99] transition"
      >
        <span
          className={[
            'h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs',
            popping ? 'chore-pop' : ''
          ].join(' ')}
          style={{
            backgroundColor: done ? color : 'transparent',
            color: done ? '#0f0f13' : color,
            border: `1.5px solid ${color}${done ? 'ff' : '66'}`
          }}
        >
          {done ? '✓' : ''}
        </span>
        <span className={[
          'flex-1 min-w-0 break-words text-base',
          done ? 'text-fg/40 line-through' : 'text-fg/90'
        ].join(' ')}>
          {label}
        </span>
        {meta && (
          <span className={['text-xs tabular-nums shrink-0', done ? 'text-fg/30' : 'text-fg/40'].join(' ')}>
            {meta}
          </span>
        )}
      </button>
      <button
        onClick={onRemove}
        title="Release back to bonus list"
        aria-label="Release"
        className="h-7 w-7 rounded-full flex items-center justify-center text-fg/40 hover:text-rose-400 hover:bg-surface/[0.06] active:scale-95 transition shrink-0 mr-1 text-base leading-none"
      >
        ✕
      </button>
    </div>
  );
}

/* ───── Toggle row (used by chores, routine items) ──────────────────── */

function ToggleRow({ done, color, onClick, label, meta, popping }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-1.5 text-left rounded-lg hover:bg-surface/[0.03] active:scale-[0.99] transition"
    >
      <span
        className={[
          'h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs',
          popping ? 'chore-pop' : ''
        ].join(' ')}
        style={{
          backgroundColor: done ? color : 'transparent',
          color: done ? '#0f0f13' : color,
          border: `1.5px solid ${color}${done ? 'ff' : '66'}`
        }}
      >
        {done ? '✓' : ''}
      </span>
      <span className={[
        'flex-1 min-w-0 truncate text-base',
        done ? 'text-fg/40 line-through' : 'text-fg/90'
      ].join(' ')}>
        {label}
      </span>
      {meta && (
        <span className={['text-xs tabular-nums shrink-0', done ? 'text-fg/30' : 'text-fg/40'].join(' ')}>
          {meta}
        </span>
      )}
    </button>
  );
}
