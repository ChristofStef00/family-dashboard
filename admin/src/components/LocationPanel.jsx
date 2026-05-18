import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const UNIT_OPTIONS  = [
  { value: 'fahrenheit', label: '°F' },
  { value: 'celsius',    label: '°C' }
];
const CLOCK_OPTIONS = [
  { value: 12, label: '12 hr' },
  { value: 24, label: '24 hr' }
];

export default function LocationPanel() {
  const [settings, setSettings] = useState(null);
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [busy,     setBusy]     = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState(null);

  async function loadSettings() {
    try { setSettings(await api.settings()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadSettings(); }, []);

  async function search(e) {
    e?.preventDefault?.();
    if (!query.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await api.geocode(query.trim());
      setResults(r.results || []);
      setSearched(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function pick(loc) {
    setError(null);
    const name = [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');
    try {
      await api.saveSettings({
        weather_lat: loc.latitude,
        weather_lon: loc.longitude,
        weather_location_name: name,
        timezone: loc.timezone
      });
      setResults([]);
      setQuery('');
      setSearched(false);
      await loadSettings();
    } catch (e) { setError(e.message); }
  }

  async function saveOne(key, value) {
    setError(null);
    try {
      await api.saveSettings({ [key]: value });
      await loadSettings();
    } catch (e) { setError(e.message); }
  }

  if (!settings) {
    return (
      <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
        <div className="text-fg/50 text-sm">Loading location settings…</div>
      </section>
    );
  }

  const locName  = settings.weather_location_name || '—';
  const tz       = settings.timezone || 'system default';
  const lat      = settings.weather_lat;
  const lon      = settings.weather_lon;
  const units    = settings.weather_units || 'fahrenheit';
  const clock    = Number(settings.clock_format) === 24 ? 24 : 12;

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-2xl font-light tracking-tight">Location &amp; Time</h2>
          <p className="text-fg/50 text-sm mt-1">
            Sets weather coordinates and the timezone the kiosk uses for the clock, date bar, and calendar.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
      )}

      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 mb-4">
        <div className="text-fg/50 text-xs uppercase tracking-widest font-medium mb-1.5">Current location</div>
        <div className="text-lg font-medium tracking-tight">{locName}</div>
        <div className="text-fg/55 text-sm mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>tz <span className="text-fg/80 font-mono text-xs">{tz}</span></span>
          {(lat != null && lon != null) && (
            <span className="tabular-nums">
              {Number(lat).toFixed(3)}, {Number(lon).toFixed(3)}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={search} className="flex items-stretch gap-2 mb-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="City, state — e.g. Lehi, UT or Detroit, Michigan"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-sm font-medium transition"
        >
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searched && results.length === 0 && !busy && (
        <div className="text-fg/40 text-sm italic mb-3">No matches — try a different spelling or include the state/country.</div>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {results.map(r => {
            const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
            return (
              <li key={`${r.latitude},${r.longitude}`}>
                <button
                  onClick={() => pick(r)}
                  className="w-full text-left rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 px-4 py-3 transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{label}</div>
                    <div className="text-fg/50 text-xs mt-0.5">
                      <span className="font-mono">{r.timezone}</span>
                      {' · '}
                      <span className="tabular-nums">{r.latitude.toFixed(3)}, {r.longitude.toFixed(3)}</span>
                      {r.population && <span> · pop {Intl.NumberFormat().format(r.population)}</span>}
                    </div>
                  </div>
                  <span className="text-fg/40 text-xs uppercase tracking-widest shrink-0">Pick</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/10">
        <Field label="Temperature">
          <Pills options={UNIT_OPTIONS} value={units} onChange={v => saveOne('weather_units', v)} />
        </Field>
        <Field label="Clock format">
          <Pills options={CLOCK_OPTIONS} value={clock} onChange={v => saveOne('clock_format', v)} />
        </Field>
      </div>
    </section>
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
        const on = opt.value === value;
        return (
          <button
            key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={[
              'h-8 px-4 rounded-full text-xs uppercase tracking-widest font-medium transition',
              on ? 'bg-white/15 text-fg' : 'text-fg/50 hover:text-fg/80'
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
