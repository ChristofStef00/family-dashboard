/**
 * Twemoji DOM replacement.
 *
 * React renders raw emoji characters into the DOM. Without intervention,
 * each browser picks its own emoji font (Apple on Mac/Safari, Noto on Pi
 * Chromium), which means the same kid's avatar looks different per device.
 *
 * Twemoji replaces every emoji codepoint with an `<img class="emoji">`
 * pointing at an SVG asset, so the rendering is identical on every platform
 * — same artwork, same colors, same shapes.
 *
 * The library is loaded as a global via `<script>` in index.html. Here we
 * wire it up to:
 *   1. Parse on first mount.
 *   2. Re-parse on a debounced MutationObserver so new emoji from React
 *      updates (member avatars, celebrations, etc.) get the same treatment.
 *   3. Retry icon loads that fail and fall back to the native glyph when the
 *      CDN can't serve one (see the error handler below).
 *
 * Twemoji is idempotent — it marks parsed text and skips it on subsequent
 * passes, so re-running is cheap.
 */

/**
 * Microsoft Fluent UI Emoji (the "flat" 2D variant) served by Iconify's
 * public CDN. Twemoji's URL builder uses base + folder + codepoint + ext,
 * which doesn't fit Iconify's `set:icon.svg` pattern — so we use a
 * `callback` instead to construct each URL ourselves.
 *
 * Fluent provides three variants:
 *   - fluent-emoji          (3D, glossy / iOS-like)
 *   - fluent-emoji-flat     (clean 2D illustration — what we use)
 *   - fluent-emoji-high-contrast (accessibility, monochrome)
 *
 * If you want to try a different set, change the prefix in `ICON_BASE`.
 */
const ICON_BASE = 'https://api.iconify.design/fluent-emoji-flat:';

// Iconify's public CDN throttles bursts of concurrent requests. A page full
// of emoji (member avatars + chores + bonuses) makes Twemoji fire dozens of
// SVG requests at once on load and on every React re-render; some get refused
// and flash a broken-image icon. We retry those a few times with staggered
// backoff, and if the CDN still won't serve a codepoint we record it here so
// the callback stops requesting it and lets the browser's native emoji font
// render the glyph instead (graceful, no permanent broken icon).
const MAX_RETRY = 4;
const failed = new Set();

// Normalize Twemoji's codepoint string to Iconify's fluent-emoji-flat alias
// scheme. Two mismatches both 404 → a flashing broken-image icon:
//   1. ZWJ sequences keep the VS16 selector (e.g. the rainbow flag
//      "1f3f3-fe0f-200d-1f308" or 👨‍⚕️ "1f468-200d-2695-fe0f"), but
//      Iconify's aliases omit "fe0f".
//   2. Keycaps drop leading zeros ("23-20e3" for #️⃣), but Iconify expects
//      the base codepoint zero-padded to 4 hex digits ("0023-20e3").
// Drop every "fe0f" segment and zero-pad each remaining segment to 4 digits.
function normalize(icon) {
  return icon
    .split('-')
    .filter(seg => seg !== 'fe0f')
    .map(seg => seg.padStart(4, '0'))
    .join('-');
}

const PARSE_OPTS = {
  className: 'twemoji',
  callback: (icon /*, options */) => {
    const name = normalize(icon);
    // Codepoint the CDN can't serve — return falsy so Twemoji leaves the
    // native emoji glyph in place rather than building a broken <img>.
    if (failed.has(name)) return null;
    return `${ICON_BASE}${name}.svg`;
  }
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

// Capture-phase error handler: <img> error events don't bubble, so we listen
// in the capture phase to catch every failed Twemoji icon. Retrying just
// re-points img.src (an attribute change the MutationObserver doesn't watch),
// so this never triggers a re-parse loop.
function onImgError(e) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.classList.contains('twemoji')) return;

  const url = img.src.split('?')[0];
  const tries = Number(img.dataset.twRetry || 0);
  if (tries < MAX_RETRY) {
    img.dataset.twRetry = String(tries + 1);
    // Stagger retries (with jitter) so the retry wave doesn't re-trigger the
    // same burst-throttling that caused the original failure.
    const delay = 200 * (tries + 1) + Math.random() * 250;
    setTimeout(() => { img.src = `${url}?r=${tries + 1}`; }, delay);
    return;
  }

  // Out of retries — record the codepoint and swap the broken <img> for its
  // native glyph. The text node re-parse that follows hits the `failed` guard
  // in the callback above, so the glyph stays put (no loop, no broken icon).
  const m = url.match(/fluent-emoji-flat:([^.]+)\.svg$/);
  if (m) failed.add(m[1]);
  const glyph = img.getAttribute('alt') || '';
  if (glyph) img.replaceWith(document.createTextNode(glyph));
}

let wired = false;

export function setupTwemoji() {
  if (typeof window === 'undefined' || wired) return;

  // Wait for the deferred <script> to finish loading the global.
  const tryStart = () => {
    if (!window.twemoji) { setTimeout(tryStart, 50); return; }
    wired = true;
    document.addEventListener('error', onImgError, true);
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
