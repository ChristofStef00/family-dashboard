import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { usePoll } from './hooks/usePoll.js';
import { useTheme } from './hooks/useTheme.js';
import Clock from './components/Clock.jsx';
import DateBar from './components/DateBar.jsx';
import Calendar from './components/Calendar.jsx';
import WeatherMini from './components/WeatherMini.jsx';
import QuoteBar from './components/QuoteBar.jsx';
import MessageOverlay from './components/MessageOverlay.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import DimOverlay from './components/DimOverlay.jsx';
import CelebrationLayer from './components/CelebrationLayer.jsx';
import PortalLayer from './components/PortalLayer.jsx';
import RoutineCompleteBanner from './components/RoutineCompleteBanner.jsx';
import ViewTabs from './components/ViewTabs.jsx';
import StreaksPage from './components/StreaksPage.jsx';
import MealsPage from './components/MealsPage.jsx';
import PointsPage from './components/PointsPage.jsx';
import RewardsPage from './components/RewardsPage.jsx';
import HAFrame from './components/HAFrame.jsx';
import HAToggleButton from './components/HAToggleButton.jsx';

const VIEW_KEY = 'fd_view';
const HA_MODE_KEY = 'fd_ha_mode';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'dashboard'; } catch { return 'dashboard'; }
  });
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  }, [view]);

  // Smart-home mode covers the screen with the embedded HA dashboard.
  const [haMode, setHaMode] = useState(() => {
    try { return localStorage.getItem(HA_MODE_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(HA_MODE_KEY, haMode ? '1' : '0'); } catch { /* ignore */ }
  }, [haMode]);

  // Mount the iframe on first use and keep it mounted thereafter, so flipping
  // back and forth is instant instead of reloading HA every time.
  const [haMounted, setHaMounted] = useState(haMode);
  useEffect(() => { if (haMode) setHaMounted(true); }, [haMode]);

  const CAL_VIEW_KEY = 'fd_cal_view';
  const [calendarView, setCalendarView] = useState(() => {
    try { return localStorage.getItem(CAL_VIEW_KEY) || 'month'; } catch { return 'month'; }
  });
  useEffect(() => {
    try { localStorage.setItem(CAL_VIEW_KEY, calendarView); } catch { /* ignore */ }
  }, [calendarView]);

  const { data: settings }      = usePoll(api.settings, 60_000);
  const { data: members = [] }  = usePoll(api.members, 30_000, [refreshKey]);
  const { data: chores = [] }   = usePoll(api.choresToday, 30_000, [refreshKey]);
  const { data: routinesToday = [] } = usePoll(api.routinesToday, 30_000, [refreshKey]);
  const { data: bonusesToday = [] }  = usePoll(() => api.bonusesToday(), 30_000, [refreshKey]);
  const { data: events = [] }   = usePoll(() => api.events(), 60_000);
  const { data: plannedMeals = [] } = usePoll(() => api.plannedMeals(), 60_000, [refreshKey]);
  const { data: weather }       = usePoll(api.weather, 30 * 60_000);
  const { data: quote }         = usePoll(api.quote, 60 * 60_000);
  const { data: messages = [] } = usePoll(api.messages, 5_000);

  const tz = settings?.timezone;
  const clockFormat = settings?.clock_format ?? 12;
  const { mode, isDim, dimLevel, clockOnly, setMode, wake } = useTheme(settings);
  const haUrl = settings?.ha_url || '';

  return (
    <div className="h-screen w-screen flex flex-col p-6 gap-4">
      <header className="flex items-end justify-between px-2 gap-6">
        <div className="flex items-end gap-8 shrink-0">
          <DateBar timezone={tz} />
          <div className="pb-1">
            <WeatherMini weather={weather} />
          </div>
        </div>
        <div className="flex-1 min-w-0 pb-2 px-4">
          <QuoteBar quote={quote} />
        </div>
        <div className="flex items-end gap-4 shrink-0">
          <Clock format={clockFormat} timezone={tz} />
          <div className="pb-2">
            <ThemeToggle mode={mode} onChange={setMode} />
          </div>
        </div>
      </header>

      {view === 'dashboard' ? (
        // Home is a full-bleed calendar; member cards live on Points / Rewards.
        <main className="flex-1 min-h-0">
          <Calendar
            events={events || []}
            weather={weather}
            plannedMeals={plannedMeals || []}
            view={calendarView}
            onViewChange={setCalendarView}
            clockFormat={clockFormat}
            timezone={tz}
          />
        </main>
      ) : view === 'meals' ? (
        <main className="flex-1 min-h-0">
          <MealsPage
            touchEnabled={settings?.mealie_touch_enabled === true || settings?.mealie_touch_enabled === 'true'}
            mealieUrl={settings?.mealie_url || ''}
          />
        </main>
      ) : view === 'points' ? (
        <main className="flex-1 min-h-0">
          <PointsPage
            members={members || []}
            chores={chores || []}
            routinesToday={routinesToday || []}
            bonusesToday={bonusesToday || []}
            onChange={bumpRefresh}
          />
        </main>
      ) : view === 'rewards' ? (
        <main className="flex-1 min-h-0">
          <RewardsPage
            members={members || []}
            onChange={bumpRefresh}
            onNavigate={setView}
          />
        </main>
      ) : (
        <main className="flex-1 min-h-0">
          <StreaksPage />
        </main>
      )}

      <footer className="flex justify-center">
        <ViewTabs view={view} onChange={setView} />
      </footer>

      {/* Deliberately faint and out of the way in the top-left corner — see
          HAToggleButton. Hidden entirely until an HA URL is configured. */}
      {haUrl && !haMode && (
        <HAToggleButton active={false} onToggle={() => setHaMode(true)} />
      )}

      {/* Smart-home mode is an opaque layer over the family dashboard rather
          than a swap, so the dashboard underneath keeps its state. Mounted on
          first use and kept mounted, so flipping back and forth is instant. */}
      {haMounted && (
        <div
          className={haMode ? 'fixed inset-0 z-10 bg-bg' : 'hidden'}
          aria-hidden={!haMode}
        >
          <HAFrame url={haUrl} />
        </div>
      )}

      {/* The way back out, floating above the HA layer. Rendered even with no
          URL configured so clearing it from the admin UI can't strand the
          kiosk in HA mode. */}
      {haMode && (
        <HAToggleButton active floating onToggle={() => setHaMode(false)} />
      )}

      <MessageOverlay messages={messages || []} />
      <CelebrationLayer />
      <PortalLayer />
      <RoutineCompleteBanner />

      <DimOverlay
        active={isDim}
        level={dimLevel}
        clockOnly={clockOnly}
        format={clockFormat}
        timezone={tz}
        onWake={() => wake(30_000)}
      />
    </div>
  );
}
