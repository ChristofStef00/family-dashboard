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
