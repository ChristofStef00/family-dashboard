const VIEWS = [
  { id: 'dashboard', label: 'Home',    icon: '◧' },
  { id: 'meals',     label: 'Meals',   icon: '🍽️' },
  { id: 'points',    label: 'Points',  icon: '⭐' },
  { id: 'rewards',   label: 'Rewards', icon: '🎁' },
  { id: 'streaks',   label: 'Streaks', icon: '🔥' }
];

export default function ViewTabs({ view, onChange }) {
  return (
    <div className="flex items-stretch gap-3">
      {VIEWS.map(v => {
        const active = v.id === view;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className={[
              'h-14 min-w-[8rem] px-6 rounded-2xl border transition active:scale-95 flex items-center justify-center gap-2.5',
              active
                ? 'bg-surface/15 border-surface/30 text-fg shadow-[0_4px_18px_-8px_rgba(20,20,30,0.35)]'
                : 'bg-surface/[0.04] border-surface/10 text-fg/60 hover:bg-surface/[0.08] hover:text-fg/85'
            ].join(' ')}
          >
            <span className="text-lg leading-none">{v.icon}</span>
            <span className="text-sm uppercase tracking-widest font-medium">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
