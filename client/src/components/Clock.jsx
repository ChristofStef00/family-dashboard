import { useNow } from '../hooks/usePoll.js';

export default function Clock({ format = 12, timezone }) {
  const now = useNow(1000);
  const hour12 = String(format) === '12';

  const opts = {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: timezone || undefined
  };
  const formatter = new Intl.DateTimeFormat([], opts);
  const parts = formatter.formatToParts(now);
  const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
  const ampm = parts.find(p => p.type === 'dayPeriod')?.value || '';

  return (
    <div className="flex items-baseline gap-3">
      <span className="time-display">{time}</span>
      {hour12 && ampm && (
        <span className="text-fg/50 text-2xl font-light tracking-widest uppercase">{ampm}</span>
      )}
    </div>
  );
}
