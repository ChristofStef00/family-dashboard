/**
 * Fire a celebration burst from a screen point.
 * Listened to by <CelebrationLayer /> mounted once in App.
 */
export function celebrate({ x, y, color = '#ffffff', emoji = '✨' }) {
  window.dispatchEvent(new CustomEvent('fd:celebrate', {
    detail: { x, y, color, emoji, id: Math.random().toString(36).slice(2) }
  }));
}

/** Convenience: derive origin from a DOM event's target. */
export function celebrateFromEvent(evt, opts) {
  const rect = evt.currentTarget?.getBoundingClientRect?.();
  if (!rect) return;
  celebrate({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    ...opts
  });
}

/**
 * Fire a sustained "you did it!" shower — 5 staggered bursts across the
 * upper half of the screen mixing the member's color with a win-emoji
 * set. ~1.2s total. Use for big moments (routine fully complete) where
 * a single tap-confetti burst would be too quiet.
 */
const SHOWER_EMOJIS = ['⭐', '🎉', '✨', '🏆', '🎊'];
export function celebrateShower({ color = '#ffffff' } = {}) {
  if (typeof window === 'undefined') return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const burstCount = 5;
  for (let i = 0; i < burstCount; i++) {
    const delay = i * 220 + Math.random() * 120;
    const x = (W * 0.15) + Math.random() * (W * 0.7);
    const y = (H * 0.18) + Math.random() * (H * 0.32);
    const emoji = SHOWER_EMOJIS[i % SHOWER_EMOJIS.length];
    setTimeout(() => celebrate({ x, y, color, emoji }), delay);
  }
}
