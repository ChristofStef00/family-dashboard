import { useEffect, useState } from 'react';

const PARTICLE_COUNT = 18;
const EMOJI_COUNT = 6;
const DURATION_MS = 1100;

let nextKey = 0;

function makeParticles(burst) {
  const list = [];
  // colored dots
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + Math.random() * 0.6;
    const dist  = 80 + Math.random() * 130;
    const size  = 6  + Math.random() * 8;
    list.push({
      key: ++nextKey,
      kind: 'dot',
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      gravity: 60 + Math.random() * 80,
      size,
      rot: (Math.random() - 0.5) * 720,
      color: burst.color
    });
  }
  // emoji sprinkles
  const emojis = [burst.emoji, '✨', '🎉', '⭐️', '✨', '🎊'];
  for (let i = 0; i < EMOJI_COUNT; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const dist  = 90 + Math.random() * 120;
    list.push({
      key: ++nextKey,
      kind: 'emoji',
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      gravity: 100 + Math.random() * 100,
      size: 22 + Math.random() * 14,
      rot: (Math.random() - 0.5) * 360,
      char: emojis[i % emojis.length]
    });
  }
  return list;
}

export default function CelebrationLayer() {
  const [bursts, setBursts] = useState([]);

  useEffect(() => {
    function onCelebrate(e) {
      const burst = e.detail;
      const particles = makeParticles(burst);
      const id = burst.id;
      setBursts(prev => [...prev, { id, x: burst.x, y: burst.y, particles }]);
      setTimeout(() => {
        setBursts(prev => prev.filter(b => b.id !== id));
      }, DURATION_MS + 50);
    }
    window.addEventListener('fd:celebrate', onCelebrate);
    return () => window.removeEventListener('fd:celebrate', onCelebrate);
  }, []);

  return (
    <div className="celebration-layer" aria-hidden>
      {bursts.map(b => (
        <div key={b.id} className="celebration-origin" style={{ left: b.x, top: b.y }}>
          {b.particles.map(p => (
            <span
              key={p.key}
              className={p.kind === 'dot' ? 'celebration-dot' : 'celebration-emoji'}
              style={{
                '--tx': `${p.tx}px`,
                '--ty': `${p.ty}px`,
                '--gy': `${p.gravity}px`,
                '--rot': `${p.rot}deg`,
                '--size': `${p.size}px`,
                '--dur': `${DURATION_MS}ms`,
                ...(p.kind === 'dot' ? { backgroundColor: p.color } : null)
              }}
            >
              {p.kind === 'emoji' ? p.char : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
