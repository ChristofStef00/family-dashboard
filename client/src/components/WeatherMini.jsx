import { WMO_ICON, describe } from '../lib/weather.js';

export default function WeatherMini({ weather }) {
  if (!weather?.current) {
    return <div className="text-fg/30 text-sm">—</div>;
  }
  const icon = WMO_ICON[weather.current.weather_code] || '🌡️';
  const condition = describe(weather.current.weather_code);
  const todayHi = weather.daily?.temperature_2m_max?.[0];
  const todayLo = weather.daily?.temperature_2m_min?.[0];

  return (
    <div className="flex items-center gap-3">
      <span className="text-4xl leading-none select-none">{icon}</span>
      <div className="flex flex-col leading-tight">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-extralight tabular-nums">
            {Math.round(weather.current.temperature_2m)}°
          </span>
          {todayHi != null && todayLo != null && (
            <span className="text-fg/50 text-sm tabular-nums">
              <span className="text-fg/70">{Math.round(todayHi)}°</span>
              <span className="mx-1 text-fg/30">/</span>
              <span>{Math.round(todayLo)}°</span>
            </span>
          )}
        </div>
        <span className="text-fg/50 text-xs uppercase tracking-widest">
          {condition || weather.location_name}
        </span>
      </div>
    </div>
  );
}
