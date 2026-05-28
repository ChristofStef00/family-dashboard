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

const VIEW_KEY = 'fd_view';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'dashboard'; } catch { return 'dashboard'; }
  });
  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  }, [view]);

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
