import { useMemo, useState } from 'react';
import { useNow } from '../hooks/usePoll.js';
import { WMO_ICON } from '../lib/weather.js';

const WEEKDAYS_FULL  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function addDays(d, n)   { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function sameDay(a, b)   { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function dayKey(d)       { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtTime(d)      { return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(d); }
/** Compact "3p" / "9:30a" / "12p" — for tight calendar cells. */
function fmtTimeCompact(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'p' : 'a';
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function buildEventMap(events) {
  const map = new Map();
  for (const e of events) {
    const d = new Date(e.start_time);
    const k = dayKey(d);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  for (const list of map.values()) list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  return map;
}

export default function Calendar({
  events = [],
  weather,
  plannedMeals = [],
  view: viewProp,
  onViewChange
}) {
  const today = useNow(60_000);
  // Controlled when viewProp/onViewChange are passed; uncontrolled fallback otherwise.
  const [internalView, setInternalView] = useState('week');
  const view = viewProp ?? internalView;
  const setView = (next) => {
    if (onViewChange) onViewChange(next);
    else setInternalView(next);
  };
  const [offset, setOffset] = useState(0);    // weeks or months from current

  const ref = useMemo(() => {
    return view === 'week' ? addDays(today, offset * 7) : addMonths(today, offset);
  }, [today, view, offset]);

  const eventsByDay = useMemo(() => buildEventMap(events), [events]);

  // Group planned meals by ISO date string
  const mealsByDay = useMemo(() => {
    const map = new Map();
    for (const m of plannedMeals) {
      if (!map.has(m.meal_date)) map.set(m.meal_date, []);
      map.get(m.meal_date).push(m);
    }
    return map;
  }, [plannedMeals]);

  // Map "YYYY-MM-DD" → { code, hi, lo } from the weather payload
  const weatherByDay = useMemo(() => {
    const map = new Map();
    const d = weather?.daily;
    if (!d?.time) return map;
    for (let i = 0; i < d.time.length; i++) {
      map.set(d.time[i], {
        code: d.weather_code?.[i],
        hi:   d.temperature_2m_max?.[i],
        lo:   d.temperature_2m_min?.[i]
      });
    }
    return map;
  }, [weather]);

  const label = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(ref);
      const end = addDays(start, 6);
      const sameMonth = start.getMonth() === end.getMonth();
      const sameYear = start.getFullYear() === end.getFullYear();
      const startStr = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' }).format(start);
      const endStr = new Intl.DateTimeFormat([], sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' }).format(end);
      const yearStr = sameYear ? start.getFullYear() : `${start.getFullYear()}/${end.getFullYear()}`;
      return `${startStr} – ${endStr}, ${yearStr}`;
    }
    return new Intl.DateTimeFormat([], { month: 'long', year: 'numeric' }).format(ref);
  }, [view, ref]);

  function shift(delta) { setOffset(o => o + delta); }
  function goToday() { setOffset(0); }
  function setMode(m) {
    if (m === view) return;
    setView(m);
    setOffset(0);
  }

  return (
    <div className="card-pad h-full flex flex-col">
      <Toolbar
        label={label}
        view={view}
        atToday={offset === 0}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
        onSetView={setMode}
      />

      <div className="flex-1 min-h-0 mt-4">
        {view === 'week'
          ? <WeekGrid ref_={ref} today={today} eventsByDay={eventsByDay} weatherByDay={weatherByDay} mealsByDay={mealsByDay} />
          : <MonthGrid ref_={ref} today={today} eventsByDay={eventsByDay} mealsByDay={mealsByDay} />}
      </div>
    </div>
  );
}

function Toolbar({ label, view, atToday, onPrev, onNext, onToday, onSetView }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-2xl font-light tracking-tight truncate">{label}</h2>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <NavButton onClick={onPrev} aria-label="Previous">‹</NavButton>
        <button
          onClick={onToday}
          disabled={atToday}
          className={[
            'h-9 px-3 rounded-full text-xs uppercase tracking-widest font-medium transition',
            atToday
              ? 'bg-surface/[0.04] text-fg/30 cursor-default'
              : 'bg-surface/10 text-fg hover:bg-surface/15 active:scale-95'
          ].join(' ')}
        >
          Today
        </button>
        <NavButton onClick={onNext} aria-label="Next">›</NavButton>
        <div className="ml-2 flex items-center bg-surface/[0.04] rounded-full p-0.5">
          <ToggleButton active={view === 'week'}  onClick={() => onSetView('week')}>Week</ToggleButton>
          <ToggleButton active={view === 'month'} onClick={() => onSetView('month')}>Month</ToggleButton>
        </div>
      </div>
    </div>
  );
}

function NavButton({ children, ...rest }) {
  return (
    <button
      {...rest}
      className="h-9 w-9 rounded-full bg-surface/[0.05] text-fg/80 hover:bg-surface/15 hover:text-fg active:scale-95 text-xl leading-none flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function ToggleButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'h-8 px-3 rounded-full text-xs uppercase tracking-widest font-medium transition',
        active ? 'bg-surface/15 text-fg' : 'text-fg/50 hover:text-fg/80'
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function WeekGrid({ ref_, today, eventsByDay, weatherByDay, mealsByDay }) {
  const days = useMemo(() => {
    const start = startOfWeek(ref_);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [ref_]);

  return (
    <div className="grid grid-cols-7 gap-2 h-full">
      {days.map((d, i) => {
        const isToday = sameDay(d, today);
        const dayEvents = eventsByDay.get(dayKey(d)) || [];
        const wx = weatherByDay?.get(isoDate(d));
        const dayMeals = mealsByDay?.get(isoDate(d)) || [];
        return (
          <div
            key={i}
            className={[
              'rounded-2xl p-3 flex flex-col gap-2 min-h-0 overflow-hidden',
              isToday ? 'bg-surface/10 ring-1 ring-surface/30' : 'bg-surface/[0.03]'
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className={[
                  'text-sm uppercase tracking-widest font-medium shrink-0',
                  isToday ? 'text-fg' : 'text-fg/40'
                ].join(' ')}>
                  {WEEKDAYS_FULL[i]}
                </span>
                {wx && (
                  <span className="flex items-baseline gap-1 text-sm font-medium tabular-nums">
                    <span className="text-base leading-none translate-y-[1px]">{WMO_ICON[wx.code] || ''}</span>
                    <span className="text-fg/70">{Math.round(wx.hi)}°</span>
                    <span className="text-fg/25">/</span>
                    <span className="text-fg/40">{Math.round(wx.lo)}°</span>
                  </span>
                )}
              </div>
              <span className={[
                'text-3xl font-light tabular-nums leading-none shrink-0',
                isToday ? 'text-fg' : 'text-fg/70'
              ].join(' ')}>
                {d.getDate()}
              </span>
            </div>

            {dayMeals.length > 0 && (
              <div className="flex flex-col gap-1 shrink-0">
                {dayMeals.map(m => (
                  <div
                    key={m.id}
                    className="rounded-lg px-2 py-1 text-sm leading-tight bg-orange-500 text-white truncate font-medium"
                    title={m.name || m.recipe_slug}
                  >
                    {m.name || m.recipe_slug}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 overflow-y-auto pr-0.5 min-h-0">
              {dayEvents.length === 0 && dayMeals.length === 0 && <span className="text-fg/25 text-sm italic">—</span>}
              {dayEvents.map(ev => (
                <div
                  key={ev.id}
                  className="cal-event-card rounded-lg px-2.5 py-2 leading-tight"
                  style={{ borderLeft: `3px solid ${ev.color}`, '--ev-color': ev.color }}
                  title={ev.title}
                >
                  <div className="cal-event-title font-medium text-base break-words">
                    {ev.title}
                  </div>
                  {!ev.all_day && (
                    <div className="text-fg/55 text-sm tabular-nums mt-1">
                      {fmtTime(new Date(ev.start_time))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({ ref_, today, eventsByDay, mealsByDay }) {
  const grid = useMemo(() => {
    const first = startOfMonth(ref_);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [ref_]);
  const month = ref_.getMonth();

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {WEEKDAYS_SHORT.map((w, i) => (
          <div key={i} className="text-center text-fg/40 text-sm uppercase tracking-widest font-medium">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 flex-1">
        {grid.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = sameDay(d, today);
          const dayEvents = (eventsByDay.get(dayKey(d)) || []).slice(0, 3);
          const dayMeals  = (mealsByDay?.get(isoDate(d)) || []).slice(0, 2);
          return (
            <div
              key={i}
              className={[
                'rounded-xl p-2 flex flex-col gap-1 min-h-0',
                inMonth ? 'bg-surface/[0.025]' : 'opacity-30',
                isToday ? 'ring-1 ring-surface/40 bg-surface/10' : ''
              ].join(' ')}
            >
              <div className={['text-base font-medium tabular-nums', isToday ? 'text-fg' : 'text-fg/70'].join(' ')}>
                {d.getDate()}
              </div>
              <div className="flex flex-col gap-1 overflow-hidden">
                {dayMeals.map(m => (
                  <div
                    key={m.id}
                    className="text-xs leading-tight rounded px-1.5 py-0.5 bg-orange-500 text-white font-medium break-words"
                    title={m.name || m.recipe_slug}
                  >
                    {m.name || m.recipe_slug}
                  </div>
                ))}
                {dayEvents.map(ev => {
                  const time = !ev.all_day ? fmtTimeCompact(new Date(ev.start_time)) : null;
                  return (
                    <div
                      key={ev.id}
                      className="cal-event-card cal-event-title text-xs leading-tight rounded px-1.5 py-0.5 break-words"
                      style={{ borderLeft: `2px solid ${ev.color}`, '--ev-color': ev.color }}
                      title={`${time ? time + ' ' : ''}${ev.title}`}
                    >
                      {time && (
                        <span className="opacity-70 tabular-nums mr-1">{time}</span>
                      )}
                      {ev.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
