import { useEffect, useState } from 'react';

const ENTER_MS = 650;
const EXIT_MS  = 900;

/**
 * Global overlay that performs a two-stage "portal" transition.
 *
 * Stage 1 (enter): orb shrinks/spins into a closing ring at the source.
 * Stage 2 (exit):  ring re-opens at the destination element
 *                  (`[data-portal-target="member-${memberId}"]`) and the orb
 *                  spins out of it. If the destination isn't in the DOM yet
 *                  (still mid view-switch) we rAF-poll up to ~1s then fall
 *                  back to screen center.
 */
export default function PortalLayer() {
  const [phase, setPhase] = useState(null);
  // { stage, x, y, color, label, key }

  useEffect(() => {
    function onPortal(e) {
      const { from, color, label, memberId } = e.detail;
      const key = Math.random().toString(36).slice(2);
      setPhase({ stage: 'enter', x: from.x, y: from.y, color, label, key });

      // Late in the enter animation, find the destination element.
      // Prefer the GoalBar (rendered once member.goal lands from the refetch);
      // fall back to the MemberCard root if the goal hasn't rendered yet, then
      // to screen center as a last resort.
      const startHuntAt = ENTER_MS - 120;
      setTimeout(() => {
        let attempts = 0;
        const emit = (x, y) => {
          setPhase({ stage: 'exit', x, y, color, label, key: key + '-out' });
          setTimeout(() => setPhase(null), EXIT_MS + 60);
        };
        const find = () => {
          const goal = document.querySelector(`[data-portal-target="goal-${memberId}"]`);
          if (goal) {
            const r = goal.getBoundingClientRect();
            return emit(r.left + r.width / 2, r.top + r.height / 2);
          }
          if (++attempts < 60) return requestAnimationFrame(find);
          // GoalBar never showed up — settle for the MemberCard, then center.
          const card = document.querySelector(`[data-portal-target="member-${memberId}"]`);
          if (card) {
            const r = card.getBoundingClientRect();
            return emit(r.left + r.width / 2, r.top + r.height / 2);
          }
          emit(window.innerWidth / 2, window.innerHeight / 2);
        };
        find();
      }, startHuntAt);
    }

    window.addEventListener('fd:portal', onPortal);
    return () => window.removeEventListener('fd:portal', onPortal);
  }, []);

  if (!phase) return null;

  return (
    <div className="portal-layer" aria-hidden>
      <div
        key={phase.key}
        className={`portal-frame portal-${phase.stage}`}
        style={{
          left: phase.x,
          top:  phase.y,
          '--portal-color': phase.color
        }}
      >
        <div className="portal-ring" />
        <div className="portal-orb" style={{ backgroundColor: phase.color }}>
          {phase.label}
        </div>
      </div>
    </div>
  );
}
