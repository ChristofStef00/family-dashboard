import { useNow } from '../hooks/usePoll.js';

/**
 * Renders a black overlay during dim hours. Tap to wake briefly.
 * If `clockOnly`, also renders a faint clock above the overlay so glanceable info remains.
 */
export default function DimOverlay({ active, level = 0.12, clockOnly = true, format = 12, timezone, onWake }) {
  const now = useNow(active ? 1000 : 60_000);
  if (!active) return null;

  // level is "fraction of UI brightness still visible"; overlay opacity is the inverse.
  const overlayOpacity = Math.min(1, Math.max(0, 1 - level));

  const time = new Intl.DateTimeFormat([], {
    hour: 'numeric', minute: '2-digit',
    hour12: String(format) === '12',
    timeZone: timezone || undefined
  }).format(now);

  return (
    <>
      <div
        className="dim-overlay touchable"
        style={{ opacity: overlayOpacity }}
        onClick={() => onWake?.()}
        aria-label="Dimmed — tap to wake"
      />
      {clockOnly && (
        <div className="dim-clock" onClick={() => onWake?.()} style={{ pointerEvents: 'auto' }}>
          <div className="time-display select-none">{time}</div>
        </div>
      )}
    </>
  );
}
