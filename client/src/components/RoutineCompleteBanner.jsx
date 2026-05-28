import { useEffect, useState } from 'react';

/**
 * Top-of-screen toast that pops in for ~1.8 s whenever a kid finishes a
 * routine. Listens for the `fd:routine-complete` window event fired by
 * MemberCard's routine-item toggle handler. Pairs with the confetti
 * shower (lib/celebrate.js → celebrateShower) for a noticeable
 * "you did it!" moment instead of a single quiet ⭐ burst.
 */
export default function RoutineCompleteBanner() {
  const [toast, setToast] = useState(null);    // { key, member_name, member_color, member_emoji, routine_title, points }

  useEffect(() => {
    let hideTimer = null;
    function onComplete(e) {
      const d = e.detail || {};
      setToast({
        key: Math.random().toString(36).slice(2),
        member_name:  d.member_name  || '',
        member_color: d.member_color || '#ffffff',
        member_emoji: d.member_emoji || '⭐',
        routine_title: d.routine_title || 'Routine',
        points: d.points ?? 0
      });
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setToast(null), 1800);
    }
    window.addEventListener('fd:routine-complete', onComplete);
    return () => {
      window.removeEventListener('fd:routine-complete', onComplete);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      key={toast.key}
      className="routine-complete-banner"
      style={{
        '--banner-color': toast.member_color,
        // Slightly stronger tinted background built off the member's color.
        backgroundColor: `${toast.member_color}26`,
        borderColor: `${toast.member_color}88`
      }}
      aria-live="polite"
    >
      <span
        className="rcb-emoji"
        style={{
          backgroundColor: `${toast.member_color}33`,
          borderColor: `${toast.member_color}66`
        }}
      >
        {toast.member_emoji}
      </span>
      <span className="rcb-text">
        <span className="rcb-name" style={{ color: toast.member_color }}>
          {toast.member_name}
        </span>
        <span className="rcb-detail">
          {' · '}{toast.routine_title} complete
          {toast.points > 0 && <span className="rcb-pts" style={{ color: toast.member_color }}>{' · +' + toast.points + ' pt' + (toast.points === 1 ? '' : 's')}</span>}
        </span>
      </span>
    </div>
  );
}
