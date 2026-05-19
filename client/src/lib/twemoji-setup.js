/**
 * Twemoji DOM replacement.
 *
 * React renders raw emoji characters into the DOM. Without intervention,
 * each browser picks its own emoji font (Apple on Mac/Safari, Noto on Pi
 * Chromium), which means the same kid's avatar looks different per device.
 *
 * Twemoji replaces every emoji codepoint with an `<img class="emoji">`
 * pointing at Twitter's SVG asset, so the rendering is identical on every
 * platform — same artwork, same colors, same shapes.
 *
 * The library is loaded as a global via `<script>` in index.html. Here we
 * wire it up to:
 *   1. Parse on first mount.
 *   2. Re-parse on a debounced MutationObserver so new emoji from React
 *      updates (member avatars, celebrations, etc.) get the same treatment.
 *
 * Twemoji is idempotent — it marks parsed text and skips it on subsequent
 * passes, so re-running is cheap.
 */

const PARSE_OPTS = {
  folder: 'svg',
  ext: '.svg',
  // Twitter's repo is archived but the SVG assets are still mirrored on jsdelivr.
  base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/',
  className: 'twemoji'
};

function safeParse() {
  if (typeof window === 'undefined' || !window.twemoji) return;
  try {
    window.twemoji.parse(document.body, PARSE_OPTS);
  } catch (_e) { /* swallow — emoji rendering shouldn't break the app */ }
}

let pending = 0;
function scheduleParse() {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    safeParse();
  });
}

export function setupTwemoji() {
  if (typeof window === 'undefined') return;

  // Wait for the deferred <script> to finish loading the global.
  const tryStart = () => {
    if (!window.twemoji) { setTimeout(tryStart, 50); return; }
    safeParse();

    // Watch for DOM updates (React re-renders).
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Skip mutations caused by our own emoji-replacement to avoid loops.
        if (m.target && m.target.classList && m.target.classList.contains('twemoji')) continue;
        if (m.addedNodes.length === 0 && m.type !== 'characterData') continue;
        scheduleParse();
        return;
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };
  tryStart();
}
