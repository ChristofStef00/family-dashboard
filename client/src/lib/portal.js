/**
 * Fire a portal-transit animation that visually carries a "reward" from a
 * tapped element on one screen to a target member's card on another.
 * Listened to by <PortalLayer /> mounted once in App.
 *
 *   detail: {
 *     from:     { x, y },    // screen coords the orb spins out of
 *     color,                 // member color, drives the ring + orb tint
 *     label,                 // short text/emoji shown inside the orb
 *     memberId,              // PortalLayer hunts for [data-portal-target="member-${memberId}"]
 *   }
 */
export function sendThroughPortal({ from, color = '#ffffff', label = '🎁', memberId }) {
  window.dispatchEvent(new CustomEvent('fd:portal', {
    detail: { from, color, label, memberId }
  }));
}

export function portalFromEvent(evt, opts) {
  const rect = evt.currentTarget?.getBoundingClientRect?.();
  if (!rect) return;
  sendThroughPortal({
    from: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    ...opts
  });
}
