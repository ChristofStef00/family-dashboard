import { useEffect, useState } from 'react';
import { getToken, clearToken } from './lib/auth.js';
import Login from './components/Login.jsx';
import CalendarSetup from './components/CalendarSetup.jsx';
import MealieSettings from './components/MealieSettings.jsx';
import MemberPanel from './components/MemberPanel.jsx';
import RoutinePanel from './components/RoutinePanel.jsx';
import ChorePanel from './components/ChorePanel.jsx';
import RewardPanel from './components/RewardPanel.jsx';
import BankedRewardsPanel from './components/BankedRewardsPanel.jsx';
import LocationPanel from './components/LocationPanel.jsx';
import DisplaySchedulePanel from './components/DisplaySchedulePanel.jsx';
import StreakRewardPanel from './components/StreakRewardPanel.jsx';
import VacationPanel from './components/VacationPanel.jsx';
import ActivityLogPanel from './components/ActivityLogPanel.jsx';
import IcsCalendarPanel from './components/IcsCalendarPanel.jsx';

const SECTION_KEY = 'fd_admin_section';

const SECTIONS = [
  { id: 'family', label: 'Family', icon: '👪',
    blurb: 'People on the dashboard.' },
  { id: 'earn',   label: 'Earn',   icon: '✅',
    blurb: 'How kids earn points — routines and chores.' },
  { id: 'spend',  label: 'Spend',  icon: '🎁',
    blurb: 'What points buy and what is waiting to be handed over.' },
  { id: 'setup',  label: 'Setup',  icon: '⚙️',
    blurb: 'Location, calendar, and meal-plan integrations.' },
  { id: 'activity', label: 'Activity', icon: '📜',
    blurb: 'Everything the kids have earned, spent, and unlocked, newest first.' }
];

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [section, setSection] = useState(() => {
    try { return localStorage.getItem(SECTION_KEY) || 'family'; } catch { return 'family'; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(SECTION_KEY, section); } catch { /* ignore */ }
  }, [section]);

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  function logout() {
    clearToken();
    setAuthed(false);
  }

  function pickSection(id) {
    setSection(id);
    setDrawerOpen(false);
  }

  const current = SECTIONS.find(s => s.id === section) || SECTIONS[0];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Hamburger — only renders below md */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden h-9 w-9 rounded-xl bg-white/[0.06] hover:bg-white/15 flex items-center justify-center text-fg/80 transition shrink-0"
            aria-label="Open menu"
          >
            <span className="text-xl leading-none">☰</span>
          </button>
          <h1 className="text-lg font-medium tracking-tight truncate">Family Dashboard · Admin</h1>
        </div>
        <div className="flex items-center gap-3 text-sm shrink-0">
          <a
            href="/"
            className="text-fg/50 hover:text-fg transition"
            title="Open kiosk display"
          >
            Display ↗
          </a>
          <button
            onClick={logout}
            className="text-fg/50 hover:text-fg transition"
          >
            Lock
          </button>
        </div>
      </header>

      {/* Desktop: horizontal button row (md and up) */}
      <nav className="hidden md:block max-w-3xl mx-auto px-6 pt-6">
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {SECTIONS.map(s => {
            const active = s.id === section;
            return (
              <button
                key={s.id}
                onClick={() => pickSection(s.id)}
                className={[
                  'h-12 px-5 rounded-2xl border transition active:scale-95 flex items-center gap-2 shrink-0',
                  active
                    ? 'bg-white/15 border-white/30 text-fg shadow-[0_4px_18px_-8px_rgba(0,0,0,0.5)]'
                    : 'bg-white/[0.04] border-white/10 text-fg/60 hover:text-fg hover:bg-white/[0.08]'
                ].join(' ')}
              >
                <span className="text-lg leading-none">{s.icon}</span>
                <span className="text-sm uppercase tracking-widest font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-fg/45 text-sm mt-3">{current.blurb}</p>
      </nav>

      {/* Mobile: current section label + blurb (below md) */}
      <div className="md:hidden max-w-3xl mx-auto px-4 pt-4 pb-1">
        <div className="flex items-center gap-2 text-fg/80">
          <span className="text-lg leading-none">{current.icon}</span>
          <h2 className="text-base font-medium uppercase tracking-widest">{current.label}</h2>
        </div>
        <p className="text-fg/45 text-sm mt-2">{current.blurb}</p>
      </div>

      {/* Mobile drawer (below md) */}
      <div
        className={[
          'md:hidden fixed inset-0 z-40 transition-opacity',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        ].join(' ')}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          className={[
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#0f0f13] border-r border-white/10 p-4 transition-transform',
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          ].join(' ')}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-fg/55 text-xs uppercase tracking-widest font-medium">Sections</span>
            <button
              onClick={() => setDrawerOpen(false)}
              className="h-8 w-8 rounded-full bg-white/[0.05] hover:bg-white/15 flex items-center justify-center text-fg/70"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {SECTIONS.map(s => {
              const active = s.id === section;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => pickSection(s.id)}
                    className={[
                      'w-full h-12 px-4 rounded-2xl border transition flex items-center gap-3',
                      active
                        ? 'bg-white/15 border-white/30 text-fg'
                        : 'bg-white/[0.04] border-white/10 text-fg/65 hover:text-fg hover:bg-white/[0.08]'
                    ].join(' ')}
                  >
                    <span className="text-lg leading-none shrink-0">{s.icon}</span>
                    <span className="text-sm uppercase tracking-widest font-medium">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
        {section === 'family' && (
          <MemberPanel />
        )}
        {section === 'earn' && (
          <>
            <RoutinePanel />
            <ChorePanel />
            <StreakRewardPanel />
          </>
        )}
        {section === 'spend' && (
          <>
            <RewardPanel />
            <BankedRewardsPanel />
          </>
        )}
        {section === 'setup' && (
          <>
            <LocationPanel />
            <DisplaySchedulePanel />
            <VacationPanel />
            <IcsCalendarPanel />
            <CalendarSetup />
            <MealieSettings />
          </>
        )}
        {section === 'activity' && (
          <ActivityLogPanel />
        )}
      </main>
    </div>
  );
}
