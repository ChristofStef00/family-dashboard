/**
 * Format a Mealie duration value for display.
 * Mealie occasionally stores ISO 8601 ("PT30M", "PT1H30M") and occasionally
 * a plain numeric/string of minutes. Handle both.
 */
export function fmtDuration(value) {
  if (value == null || value === '') return null;

  // Plain number — assume minutes
  if (typeof value === 'number') return shortHM(value);

  const s = String(value).trim();
  if (/^\d+$/.test(s)) return shortHM(Number(s));

  // ISO 8601 duration "PT#H#M#S"
  const m = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(s);
  if (m) {
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    return shortHM(h * 60 + min);
  }
  // Anything else — just show as-is
  return s;
}

function shortHM(totalMin) {
  if (!totalMin || totalMin <= 0) return null;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h)      return `${h}h`;
  return `${m}m`;
}
