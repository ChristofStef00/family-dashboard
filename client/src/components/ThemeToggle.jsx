const ICONS = {
  light: '☀',
  dark:  '☾',
  auto:  '◐'
};
const NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
const LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };

export default function ThemeToggle({ mode, onChange }) {
  return (
    <button
      onClick={() => onChange(NEXT[mode] || 'auto')}
      title={`Theme: ${LABEL[mode] || 'Auto'} (tap to cycle)`}
      className="h-9 w-9 rounded-full bg-surface/5 hover:bg-surface/15 active:scale-95 text-fg/70 hover:text-fg flex items-center justify-center text-base leading-none border border-surface/10"
    >
      <span>{ICONS[mode] || ICONS.auto}</span>
    </button>
  );
}
