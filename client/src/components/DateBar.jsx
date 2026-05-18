import { useNow } from '../hooks/usePoll.js';

export default function DateBar({ timezone }) {
  const now = useNow(60_000);
  const dayName = new Intl.DateTimeFormat([], { weekday: 'long', timeZone: timezone || undefined }).format(now);
  const dateStr = new Intl.DateTimeFormat([], { month: 'long', day: 'numeric', timeZone: timezone || undefined }).format(now);

  return (
    <div className="flex flex-col">
      <span className="text-fg/50 uppercase tracking-[0.2em] text-sm font-medium">{dayName}</span>
      <span className="date-display mt-1">{dateStr}</span>
    </div>
  );
}
