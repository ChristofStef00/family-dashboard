import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Edits the three settings that drive scripts/screen-scheduler.sh on the Pi:
 *   - screen_off_start         "HH:MM"  (default "23:00")
 *   - screen_on_time           "HH:MM"  (default "07:00")
 *   - screen_schedule_enabled  bool     (default true)
 *
 * The scheduler script polls /api/settings every 60 s, so changes take
 * effect within about a minute. No server route changes — the existing
 * generic PUT /api/settings handler stores any key.
 */
export default function DisplaySchedulePanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [saved, setSaved]     = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [offStart, setOffStart] = useState('23:00');
  const [onTime,   setOnTime]   = useState('07:00');

  async function load() {
    try {
      const s = await api.settings();
      const e = s.screen_schedule_enabled;
      setEnabled(e == null ? true : (e === true || e === 'true' || e === 1));
      setOffStart(s.screen_off_start || '23:00');
      setOnTime  (s.screen_on_time   || '07:00');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.saveSettings({
        screen_schedule_enabled: enabled,
        screen_off_start:        offStart,
        screen_on_time:          onTime
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 mt-8">
      <header className="mb-4">
        <h2 className="text-2xl font-light tracking-tight">Screen Schedule</h2>
        <p className="text-fg/50 text-sm mt-1">
          Turn the kiosk display off at night to save power. The Pi keeps running so calendar/Mealie sync continues — only HDMI output gets disabled. Wraps midnight automatically (e.g. 23:00 → 07:00).
        </p>
      </header>

      {error && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/30 px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
      )}

      {loading ? (
        <div className="text-fg/50 text-sm">Loading…</div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Active">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-fg/80"
              />
              <span className="text-sm text-fg/70">Turn the screen off automatically</span>
            </label>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Off at" hint="When the screen blanks at night.">
              <input
                type="time"
                value={offStart}
                onChange={e => setOffStart(e.target.value)}
                disabled={!enabled}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums w-full disabled:opacity-40"
              />
            </Field>
            <Field label="On at" hint="When the screen wakes back up.">
              <input
                type="time"
                value={onTime}
                onChange={e => setOnTime(e.target.value)}
                disabled={!enabled}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-white/30 text-sm tabular-nums w-full disabled:opacity-40"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
            {saved && <span className="text-emerald-300 text-xs uppercase tracking-widest">Saved</span>}
            <button
              onClick={save}
              disabled={busy}
              className="rounded-full px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 disabled:opacity-40 text-sm font-medium transition"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>

          <p className="text-fg/40 text-xs leading-relaxed">
            Changes take effect within about a minute (the Pi-side scheduler polls the server at 60s intervals). The dashboard's existing dim-mode (Location panel) is a separate, lighter feature — this one fully powers down the monitor.
          </p>
        </div>
      )}
    </section>
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
