/**
 * Twemoji DOM replacement.
 *
 * React renders raw emoji characters into the DOM. Without intervention each
 * browser picks its own emoji font (Apple on Mac/Safari, Noto on Pi Chromium),
 * so the same kid's avatar looks different per device. Twemoji swaps each
 * emoji for an <img> pointing at a fixed SVG, so every screen matches.
 *
 * Everything here is local:
 *   - the library is an npm dependency, not a CDN <script>
 *   - the SVGs live in public/emoji/svg (see scripts/vendor-emoji.mjs)
 *
 * That matters because this runs on a wall-mounted Pi. The previous version
 * fetched each glyph from Iconify's CDN, which keys `fluent-emoji-flat` by
 * name ("woman") rather than codepoint ("1f469") — so every request 404'd,
 * and the retry/fallback path fought the MutationObserver in a loop that
 * rebuilt and destroyed every emoji on screen several times a second.
 *
 * The manifest is what makes that loop impossible now: we only ever build an
 * <img> for a codepoint we actually shipped. Anything else (an emoji someone
 * typed into a chore title, say) is left as text, so twemoji reports the node
 * unmodified, the DOM doesn't change, and no re-parse is triggered.
 */
import twemoji from '@twemoji/api/dist/twemoji.esm.js';
import manifest from './emoji-manifest.json';

const VENDORED = new Set(manifest);

// BASE_URL is '/' for the kiosk and '/admin/' for the admin app, so the same
// code resolves correctly under both mount points.
const EMOJI_BASE = `${import.meta.env.BASE_URL}emoji/`;

const PARSE_OPTS = {
  className: 'twemoji',
  // A `callback` fully replaces twemoji's own URL builder, so it has to return
  // the finished src. Returning null instead leaves the character as plain
  // text — twemoji marks the node unmodified and skips the DOM write entirely.
  callback: (icon) => (VENDORED.has(icon) ? `${EMOJI_BASE}svg/${icon}.svg` : null)
};

function safeParse() {
  if (typeof document === 'undefined') return;
  try {
    twemoji.parse(document.body, PARSE_OPTS);
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

let wired = false;

export function setupTwemoji() {
  if (typeof window === 'undefined' || wired) return;
  wired = true;

  safeParse();

  // Re-parse after React updates so newly rendered emoji get the same
  // treatment. Twemoji is idempotent — already-replaced glyphs are <img>
  // elements, not text, so repeat passes are cheap and change nothing.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Ignore our own replacements.
      if (m.target?.classList?.contains('twemoji')) continue;
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
}
