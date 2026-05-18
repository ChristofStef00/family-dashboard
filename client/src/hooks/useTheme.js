import { useEffect, useMemo, useState } from 'react';
import { useNow } from './usePoll.js';

const OVERRIDE_KEY = 'fd_theme_override';
const DIM_WAKE_KEY = 'fd_dim_wake_until';

function parseHM(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function nowMinutes(d) { return d.getHours() * 60 + d.getMinutes(); }

// True if `mins` lies inside [start, end), wrapping past midnight.
function inWindow(mins, start, end) {
  if (start == null || end == null) return false;
  if (start === end) return false;
  return start < end ? (mins >= start && mins < end) : (mins >= start || mins < end);
}

/** Returns { theme, mode, isDim, dimLevel, clockOnly, setMode, wake } */
export function useTheme(settings) {
  const now = useNow(30_000);
  const [override, setOverride] = useState(() => {
    try { return localStorage.getItem(OVERRIDE_KEY) || null; } catch { return null; }
  });
  const [wakeUntil, setWakeUntil] = useState(() => {
    try { return Number(localStorage.getItem(DIM_WAKE_KEY)) || 0; } catch { return 0; }
  });

  const mode = override || settings?.theme_mode || 'auto';

  const theme = useMemo(() => {
    if (mode === 'dark')  return 'dark';
    if (mode === 'light') return 'light';
    // auto: dark from theme_dark_start until theme_light_start
    const lightStart = parseHM(settings?.theme_light_start) ?? 7 * 60;
    const darkStart  = parseHM(settings?.theme_dark_start)  ?? 19 * 60;
    const m = nowMinutes(now);
    return inWindow(m, darkStart, lightStart) ? 'dark' : 'light';
  }, [mode, now, settings?.theme_light_start, settings?.theme_dark_start]);

  // Dim schedule
  const dimEnabled = settings?.dim_enabled === true || settings?.dim_enabled === 'true';
  const dimStart = parseHM(settings?.dim_start);
  const dimEnd   = parseHM(settings?.dim_end);
  const dimLevel = clamp01(Number(settings?.dim_level ?? 0.12));
  const clockOnly = settings?.dim_clock_only === true || settings?.dim_clock_only === 'true';
  const inDimWindow = dimEnabled && inWindow(nowMinutes(now), dimStart, dimEnd);
  const isDim = inDimWindow && Date.now() > wakeUntil;

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  function setMode(next) {
    setOverride(next === 'auto' ? null : next);
    try {
      if (next === 'auto') localStorage.removeItem(OVERRIDE_KEY);
      else localStorage.setItem(OVERRIDE_KEY, next);
    } catch { /* ignore */ }
  }

  function wake(durationMs = 30_000) {
    const until = Date.now() + durationMs;
    setWakeUntil(until);
    try { localStorage.setItem(DIM_WAKE_KEY, String(until)); } catch { /* ignore */ }
  }

  return { theme, mode, isDim, dimLevel, clockOnly, setMode, wake };
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0.12;
  return Math.min(1, Math.max(0, n));
}
