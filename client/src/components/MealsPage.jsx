import { useEffect, useMemo, useRef, useState } from 'react';
import { usePoll } from '../hooks/usePoll.js';
import { api } from '../lib/api.js';
import { fmtDuration } from '../lib/duration.js';

export default function MealsPage({ touchEnabled = false, mealieUrl = '' }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: pool } = usePoll(api.mealiePool, 5 * 60_000, [refreshKey]);
  const [selectedSlug, setSelectedSlug] = useState(null);

  const meals = pool?.meals || [];
  const configured = pool?.configured ?? false;

  // Auto-select the first meal on load, and re-select if the chosen one disappears
  useEffect(() => {
    if (!meals.length) { setSelectedSlug(null); return; }
    const exists = selectedSlug && meals.some(m => m.slug === selectedSlug);
    if (!exists) setSelectedSlug(meals[0].slug);
  }, [meals, selectedSlug]);

  const bump = () => setRefreshKey(k => k + 1);

  async function toggleDone(slug, currentlyDone) {
    if (currentlyDone) await api.mealUncomplete(slug);
    else                await api.mealComplete(slug);
    bump();
  }

  if (!configured) {
    return (
      <div className="card-pad h-full flex items-center justify-center text-center fade-in">
        <div>
          <div className="text-5xl mb-3">🍽️</div>
          <div className="text-fg/60">Mealie isn't connected yet.</div>
          <div className="text-fg/40 text-sm mt-1">
            Set it up in <strong>Admin → Meal Planning</strong>.
          </div>
        </div>
      </div>
    );
  }

  if (meals.length === 0) {
    return (
      <div className="card-pad h-full flex items-center justify-center text-center fade-in">
        <div>
          <div className="text-4xl mb-2">🛒</div>
          <div className="text-fg/60">No meals yet.</div>
          <div className="text-fg/40 text-sm mt-1">
            Add recipes to your meal plan in Mealie. Dates don't matter.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4 min-h-0 fade-in">
      <MealList
        meals={meals}
        selectedSlug={selectedSlug}
        onSelect={setSelectedSlug}
      />
      <div className="flex-1 min-w-0 min-h-0">
        {selectedSlug ? (
          <RecipeDetail
            slug={selectedSlug}
            done={meals.find(m => m.slug === selectedSlug)?.done || false}
            timesMade={meals.find(m => m.slug === selectedSlug)?.times_made || 0}
            lastMadeAt={meals.find(m => m.slug === selectedSlug)?.last_made_at || null}
            onToggleDone={() => {
              const m = meals.find(x => x.slug === selectedSlug);
              if (m) toggleDone(m.slug, m.done);
            }}
            onPlannedChanged={bump}
            touchEnabled={touchEnabled}
            mealieUrl={mealieUrl}
          />
        ) : (
          <div className="card-pad h-full flex flex-col items-center justify-center text-center fade-in">
            <div className="text-5xl mb-3">🍽️</div>
            <div className="text-fg/60">Select a meal</div>
            <div className="text-fg/40 text-sm mt-1">
              Tap a recipe on the left to see the details.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── Left column: list ───────────────────────────────────────────── */

function MealList({ meals, selectedSlug, onSelect }) {
  const doneCount = meals.filter(m => m.done).length;
  return (
    <aside className="card-pad w-[26rem] lg:w-[32rem] shrink-0 flex flex-col min-h-0 overflow-hidden">
      <header className="flex items-baseline justify-between mb-4 shrink-0">
        <h2 className="text-3xl font-light tracking-tight">Available Meals</h2>
        <span className="stat-label tabular-nums">
          {doneCount > 0 ? `${doneCount} / ${meals.length} made` : `${meals.length}`}
        </span>
      </header>
      <ul className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2.5">
        {meals.map(m => {
          const active = m.slug === selectedSlug;
          const prep  = fmtDuration(m.prep_time);
          const cook  = fmtDuration(m.cook_time || m.perform_time);
          const total = fmtDuration(m.total_time);
          return (
            <li key={m.slug}>
              <button
                onClick={() => onSelect(m.slug)}
                className={[
                  'relative w-full text-left px-5 py-4 flex flex-col justify-between gap-3 min-h-[8rem] rounded-2xl border transition active:scale-[0.99]',
                  active
                    ? 'bg-surface/[0.12] border-surface/25 shadow-[0_8px_24px_-12px_rgba(20,20,30,0.35)]'
                    : 'bg-surface/[0.04] border-surface/10 hover:bg-surface/[0.07] hover:border-surface/15',
                  m.done && 'opacity-65'
                ].filter(Boolean).join(' ')}
              >
                {m.planned_date && (
                  <span
                    className="absolute top-3 right-3 bg-orange-500 text-white text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full leading-none shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
                    title={`Scheduled · ${formatPlannedLabel(m.planned_date)}`}
                  >
                    {formatPlannedShort(m.planned_date)}
                  </span>
                )}
                <span className={[
                  'text-xl font-medium leading-snug break-words tracking-tight',
                  m.done && 'line-through decoration-2',
                  active ? 'text-fg' : 'text-fg/85',
                  m.planned_date && 'pr-16'  // leave room for the bubble
                ].filter(Boolean).join(' ')}>
                  {m.name}
                </span>
                <div className={[
                  'flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs tabular-nums',
                  active ? 'text-fg/70' : 'text-fg/50'
                ].join(' ')}>
                  {prep  && <span><span className="opacity-60 mr-1">prep</span>{prep}</span>}
                  {cook  && <span><span className="opacity-60 mr-1">cook</span>{cook}</span>}
                  {total && <span className={active ? 'text-fg/90' : 'text-fg/70'}><span className="opacity-60 mr-1">total</span>{total}</span>}
                  {!prep && !cook && !total && <span className="opacity-40 italic">—</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/* ───── Right column: recipe detail ─────────────────────────────────── */

function RecipeDetail({ slug, done, timesMade = 0, lastMadeAt, onToggleDone, onPlannedChanged, touchEnabled, mealieUrl }) {
  const [recipe, setRecipe] = useState(null);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    let cancelled = false;
    setRecipe(null);
    setError(null);
    api.mealieRecipe(slug)
      .then(r => { if (!cancelled) setRecipe(r); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [slug]);

  const externalLink = touchEnabled && mealieUrl
    ? `${mealieUrl.replace(/\/+$/, '')}/r/${slug}`
    : null;

  const prep  = fmtDuration(recipe?.prep_time);
  const cook  = fmtDuration(recipe?.cook_time || recipe?.perform_time);
  const total = fmtDuration(recipe?.total_time);

  const ingredients = useMemo(() => {
    if (!recipe?.ingredients) return [];
    return recipe.ingredients.map(formatIngredient).filter(Boolean);
  }, [recipe]);

  const instructions = useMemo(() => {
    if (!recipe?.instructions) return [];
    return recipe.instructions
      .map(s => (typeof s === 'string' ? s : s.text))
      .filter(Boolean);
  }, [recipe]);

  return (
    <div key={slug} className="card-pad h-full flex flex-col min-h-0 overflow-hidden fade-in">
      {error && <div className="text-rose-400 text-sm">{error}</div>}
      {!recipe && !error && <div className="text-fg/40 text-sm">Loading recipe…</div>}

      {recipe && (
        <>
          <header className="shrink-0 mb-4 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-3xl font-light tracking-tight leading-tight">
                {recipe.name}
              </h2>
              {recipe.description && (
                <p className="text-fg/55 text-sm mt-2 leading-relaxed">{recipe.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1 relative">
              <button
                onClick={onToggleDone}
                className={[
                  'rounded-full px-4 py-2 text-xs uppercase tracking-widest font-medium transition active:scale-95 flex items-center gap-2',
                  done
                    ? 'bg-fg text-bg hover:opacity-90'
                    : 'bg-surface/[0.08] text-fg/80 border border-surface/20 hover:bg-surface/15 hover:text-fg'
                ].join(' ')}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 12 10 17 19 8" />
                </svg>
                {done ? 'Made' : 'Mark as made'}
              </button>
              <AddToCalendarButton slug={slug} onChanged={onPlannedChanged} />
              {externalLink && (
                <a
                  href={externalLink}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 text-fg/50 hover:text-fg text-xs underline whitespace-nowrap"
                >
                  Open in Mealie ↗
                </a>
              )}
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-2 mb-5 shrink-0">
            {prep  && <DetailBadge label="Prep"   value={prep} />}
            {cook  && <DetailBadge label="Cook"   value={cook} />}
            {total && <DetailBadge label="Total"  value={total} accent />}
            {recipe.servings && <DetailBadge label="Serves" value={recipe.servings} />}
            {timesMade > 0 && (
              <span className="text-xs text-fg/50 ml-auto pl-2">
                Made {timesMade}× · last {relativeTime(lastMadeAt)}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
            <div className="flex flex-col min-h-0">
              <div className="stat-label mb-2">Ingredients</div>
              <ul className="overflow-y-auto pr-1 flex flex-col gap-1.5 text-sm">
                {ingredients.length === 0 && <li className="text-fg/40 italic">No ingredients listed.</li>}
                {ingredients.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-fg/30 mt-1">•</span>
                    <span className="text-fg/85 leading-snug">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col min-h-0">
              <div className="stat-label mb-2">Instructions</div>
              <ol className="overflow-y-auto pr-1 flex flex-col gap-3 text-sm">
                {instructions.length === 0 && <li className="text-fg/40 italic">No instructions listed.</li>}
                {instructions.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-fg/40 tabular-nums shrink-0">{i + 1}.</span>
                    <span className="text-fg/85 leading-relaxed whitespace-pre-wrap">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ───── Add to calendar (popover with day picker) ───────────────────── */

function AddToCalendarButton({ slug, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planned, setPlanned] = useState([]); // [{ id, meal_date }]
  const popRef = useRef(null);
  const btnRef = useRef(null);

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function loadPlanned() {
    try {
      const rows = await api.plannedDatesFor(slug);
      setPlanned(rows);
    } catch (e) { /* swallow — popover renders without overlap dots */ }
  }

  // Hydrate the scheduled state on mount and whenever the selected recipe
  // changes, so the button label correctly reads "Scheduled · …" without
  // requiring the user to open the popover first.
  useEffect(() => {
    setPlanned([]);   // clear stale state from the previous recipe
    loadPlanned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function toggleDay(dateStr) {
    setBusy(true);
    const sameDay = planned.some(p => p.meal_date === dateStr);
    try {
      if (sameDay) await api.unplanMealByDate(slug, dateStr);
      else         await api.planMeal(slug, dateStr);  // server replaces any prior assignment
      await loadPlanned();
      onChanged?.();
      setOpen(false);  // single-pick UX: close after the choice lands
    } finally {
      setBusy(false);
    }
  }

  const days = useMemo(() => buildUpcomingDays(14), []);
  const plannedDate = planned[0]?.meal_date || null;
  const hasAny = !!plannedDate;
  const plannedLabel = useMemo(() => {
    if (!plannedDate) return null;
    const d = new Date(`${plannedDate}T00:00:00`);
    return new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  }, [plannedDate]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        className={[
          'rounded-full px-4 py-2 text-xs uppercase tracking-widest font-medium transition active:scale-95 flex items-center gap-2',
          hasAny
            ? 'bg-orange-500 text-white border border-orange-500 hover:bg-orange-600'
            : 'bg-surface/[0.08] text-fg/80 border border-surface/20 hover:bg-surface/15 hover:text-fg'
        ].join(' ')}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8"  y1="2" x2="8"  y2="6" />
          <line x1="3"  y1="10" x2="21" y2="10" />
        </svg>
        {hasAny ? `Scheduled · ${plannedLabel}` : 'Add to calendar'}
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-full mt-2 z-30 w-80 card p-3 fade-in"
        >
          <div className="flex items-baseline justify-between mb-2 px-1">
            <span className="stat-label">Pick a day</span>
            {hasAny && (
              <span className="text-fg/40 text-xs">{plannedLabel}</span>
            )}
          </div>
          <ul className="max-h-72 overflow-y-auto flex flex-col gap-1">
            {days.map(d => {
              const isPlanned = plannedDate === d.iso;
              return (
                <li key={d.iso}>
                  <button
                    disabled={busy}
                    onClick={() => toggleDay(d.iso)}
                    className={[
                      'w-full flex items-center justify-between rounded-xl px-3 py-2 transition text-left',
                      isPlanned
                        ? 'bg-orange-500/30 text-fg hover:bg-orange-500/40'
                        : 'hover:bg-surface/[0.06] text-fg/85',
                      busy && 'opacity-60'
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="text-xs uppercase tracking-widest font-medium opacity-70 w-12">{d.weekday}</span>
                      <span className="text-base font-medium tabular-nums">{d.label}</span>
                      {d.relative && <span className="text-xs opacity-60">{d.relative}</span>}
                    </span>
                    <span
                      className={[
                        'h-5 w-5 rounded-full flex items-center justify-center text-[11px] shrink-0',
                        isPlanned
                          ? 'bg-orange-500 text-white'
                          : 'border border-surface/30 text-transparent'
                      ].join(' ')}
                    >
                      ✓
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function buildUpcomingDays(n) {
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    out.push({
      iso: isoDateLocal(d),
      weekday: new Intl.DateTimeFormat([], { weekday: 'short' }).format(d),
      label:   new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' }).format(d),
      relative: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : null
    });
  }
  return out;
}
function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "5 minutes ago" / "2 days ago" / "just now" — short relative time */
function relativeTime(value) {
  if (!value) return null;
  // SQLite timestamps come back as "YYYY-MM-DD HH:MM:SS" without a TZ marker.
  // Treat them as UTC since that's what datetime('now') produces.
  const iso = String(value).includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400)     return `${Math.round(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)} days ago`;
  return new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' }).format(t);
}

/** "Fri 8" — compact bubble label */
function formatPlannedShort(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const wk = new Intl.DateTimeFormat([], { weekday: 'short' }).format(d);
  return `${wk} ${d.getDate()}`;
}
/** "Fri May 8" — tooltip / full label */
function formatPlannedLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

function DetailBadge({ label, value, accent }) {
  return (
    <span className={[
      'inline-flex items-baseline gap-2 px-3 py-1.5 rounded-xl',
      accent ? 'bg-surface/15 text-fg' : 'bg-surface/[0.06] text-fg/75'
    ].join(' ')}>
      <span className="uppercase tracking-widest text-[10px] font-medium opacity-70">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </span>
  );
}

/* ───── Ingredient formatting ───────────────────────────────────────── */

function formatIngredient(ing) {
  if (typeof ing === 'string') return ing;
  if (!ing) return null;
  if (ing.display) return ing.display;
  const parts = [];
  if (ing.quantity)   parts.push(formatQty(ing.quantity));
  if (ing.unit?.name) parts.push(ing.unit.name);
  if (ing.food?.name) parts.push(ing.food.name);
  if (ing.note)       parts.push(ing.note);
  return parts.filter(Boolean).join(' ').trim() || null;
}

function formatQty(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return String(q);
  if (Number.isInteger(n)) return String(n);
  const frac = n % 1;
  const whole = Math.floor(n);
  const map = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.333: '⅓', 0.667: '⅔' };
  for (const [k, v] of Object.entries(map)) {
    if (Math.abs(frac - Number(k)) < 0.01) return whole ? `${whole} ${v}` : v;
  }
  return n.toFixed(2).replace(/\.?0+$/, '');
}
