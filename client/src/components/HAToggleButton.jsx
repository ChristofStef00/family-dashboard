import HALogo from './HALogo.jsx';

// Toggle between the family dashboard and the embedded Home Assistant view.
//
// Two deliberately asymmetric variants:
//
//  - The way in sits faint and chromeless in the top-left corner, tucked above
//    the date bar. It is meant to be unobtrusive enough that kids don't go
//    poking at the smart-home controls.
//  - `floating` is the way back out: labelled and clearly visible, bottom-right
//    over the HA layer. Being stranded in HA is worse than being found, and
//    bottom-right keeps clear of HA's own top-left sidebar toggle. z-20 puts it
//    above page content but below the celebration/dim/message layers.
export default function HAToggleButton({ active, floating = false, onToggle }) {
  if (floating) {
    return (
      <button
        onClick={onToggle}
        title="Back to the family dashboard"
        aria-label="Family"
        className={[
          'fixed bottom-6 right-6 z-20 h-14 px-5 rounded-2xl border shrink-0',
          'flex items-center justify-center gap-2.5 transition active:scale-95',
          'shadow-[0_6px_24px_-10px_rgba(20,20,30,0.5)]',
          // Sits over Home Assistant's own UI, so it needs a solid background.
          'bg-bg border-surface/25 text-fg/85 hover:text-fg'
        ].join(' ')}
      >
        <span className="text-lg leading-none">←</span>
        <span className="text-sm uppercase tracking-widest font-medium">Family</span>
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      title="Open the smart-home dashboard"
      aria-label="Smart Home"
      className={[
        'fixed top-2 left-2 z-20 h-11 w-11 rounded-xl',
        'flex items-center justify-center transition active:scale-95',
        'opacity-[0.14] hover:opacity-90'
      ].join(' ')}
    >
      <HALogo className="h-7 w-7" />
    </button>
  );
}
