#!/usr/bin/env node
/**
 * Vendor the emoji artwork the front-ends need into each app's public/ dir.
 *
 * Why this exists: emoji used to be fetched per-glyph from Iconify's CDN at
 * runtime. That broke — the `fluent-emoji-flat` set is keyed by semantic name
 * ("woman"), not by codepoint ("1f469"), so every request 404'd, and the
 * error/retry path fought the MutationObserver in a loop that flickered the
 * whole screen. It also meant a kiosk with no internet had no emoji at all.
 *
 * Now the SVGs live in the repo. Run this script after adding new emoji to
 * the source (e.g. a new EMOJI_PRESETS entry) to pull down the new files:
 *
 *   npm run vendor:emoji
 *
 * It is the only thing that needs network access, and only when the emoji set
 * changes — the apps themselves never talk to a CDN.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['client/src', 'admin/src'];
const TARGETS = ['client', 'admin'];
const CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg';

/* ───── 1. find every emoji literal in the front-end source ───── */

function walk(p, out = []) {
  if (!existsSync(p)) return out;
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) walk(join(p, f), out);
    return out;
  }
  if (['.js', '.jsx', '.html'].includes(extname(p))) out.push(p);
  return out;
}

const EMOJI_RE = /(\p{RI}\p{RI}|\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}️?|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]|⃣)*)/gu;

/**
 * twemoji's own filename rule (grabTheRightIcon): drop VS16 unless the
 * sequence contains a ZWJ. Mirrored exactly so the files we save are the
 * ones twemoji.parse() asks for at runtime.
 */
const U200D = '‍';
const UFE0Fg = /️/g;
function toCodePoint(str) {
  const r = [];
  let p = 0, i = 0;
  while (i < str.length) {
    const c = str.charCodeAt(i++);
    if (p) { r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16)); p = 0; }
    else if (c >= 0xD800 && c <= 0xDBFF) p = c;
    else r.push(c.toString(16));
  }
  return r.join('-');
}
const twemojiName = (raw) =>
  toCodePoint(raw.indexOf(U200D) < 0 ? raw.replace(UFE0Fg, '') : raw);

const names = new Set();
for (const dir of SOURCES) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(EMOJI_RE)) {
      const raw = m[0];
      if (!raw || /^[0-9#*]$/.test(raw)) continue;
      if (!/\p{Extended_Pictographic}|\p{RI}/u.test(raw)) continue;
      const name = twemojiName(raw);
      if (/^[0-9a-f][0-9a-f-]*$/.test(name)) names.add(name);
    }
  }
}
const wanted = [...names].sort();
console.log(`Found ${wanted.length} distinct emoji in ${SOURCES.join(', ')}`);

/* ───── 2. download anything missing ───── */

const svgDir = (app) => join(ROOT, app, 'public', 'emoji', 'svg');
for (const app of TARGETS) mkdirSync(svgDir(app), { recursive: true });

const missing = wanted.filter(n => !existsSync(join(svgDir(TARGETS[0]), `${n}.svg`)));
if (missing.length) {
  console.log(`Downloading ${missing.length} new SVG(s)…`);
  const queue = [...missing];
  const failed = [];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const n = queue.shift();
      try {
        const res = await fetch(`${CDN}/${n}.svg`);
        if (!res.ok) { failed.push(`${n} (HTTP ${res.status})`); continue; }
        const body = await res.text();
        if (!body.startsWith('<svg')) { failed.push(`${n} (not an SVG)`); continue; }
        for (const app of TARGETS) writeFileSync(join(svgDir(app), `${n}.svg`), body);
      } catch (e) { failed.push(`${n} (${e.message})`); }
    }
  }));
  if (failed.length) {
    console.error(`\n${failed.length} could not be fetched — they will fall back to the\n` +
                  `platform's own emoji font, which is fine but looks different per device:`);
    for (const f of failed) console.error('  •', f);
  }
} else {
  console.log('All emoji already vendored.');
}

/* ───── 3. mirror into every target + write the manifest ───── */

// The manifest is what stops a missing glyph from causing a render loop: the
// runtime only builds an <img> for codepoints listed here, so an un-vendored
// emoji is left as plain text and never triggers a failed request.
const have = wanted.filter(n => existsSync(join(svgDir(TARGETS[0]), `${n}.svg`)));
for (const app of TARGETS) {
  for (const n of have) {
    const dest = join(svgDir(app), `${n}.svg`);
    if (!existsSync(dest)) writeFileSync(dest, readFileSync(join(svgDir(TARGETS[0]), `${n}.svg`)));
  }
  writeFileSync(
    join(ROOT, app, 'src', 'lib', 'emoji-manifest.json'),
    JSON.stringify(have, null, 0) + '\n'
  );
}

console.log(`✓ ${have.length} emoji vendored into ${TARGETS.map(t => `${t}/public/emoji/svg`).join(' and ')}`);
console.log(`✓ manifests written to ${TARGETS.map(t => `${t}/src/lib/emoji-manifest.json`).join(' and ')}`);
