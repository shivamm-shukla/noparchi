/**
 * Loads the running app at a phone width and asserts the things a build cannot.
 *
 * Two classes of bug got through a green typecheck and a healthy export before
 * this existed:
 *
 *   1. A top bar whose fixed-width children came to more than the viewport.
 *      React Native Web clips rather than scrolls, so `scrollWidth` stayed
 *      exactly 390 while the action button sat on top of the brand mark and the
 *      business name was squeezed to nothing. Overlap has to be measured
 *      between elements, not against the document.
 *
 *   2. Devanagari inheriting Latin letter-spacing. `tracking-wider` opens up an
 *      uppercase label and prises apart a Hindi word, and nothing in the type
 *      system knows the difference.
 *
 * Usage: npm run check:layout   (with the dev server already running)
 */
import { chromium, devices } from 'playwright';

const URL = process.env.CHECK_URL ?? 'http://localhost:8081/app';
const DEVICE = process.env.CHECK_DEVICE ?? 'iPhone 12 Pro';
const OUT = process.env.CHECK_OUT ?? null;

/** Runs inside the page. Keep it self-contained - it is serialised across. */
function inspect() {
  const vw = document.documentElement.clientWidth;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const overlaps = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  const leaves = [...document.querySelectorAll('div')].filter(
    (e) => e.children.length === 0 && e.textContent.trim() && e.getBoundingClientRect().width
  );

  // Anything visible that is cut off by a clipping ancestor.
  const clipped = [];
  for (const el of [...document.querySelectorAll('div,img')]) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) {
      clipped.push({ text: (el.textContent || '').trim().slice(0, 30), right: Math.round(r.right) });
    }
  }

  /*
    Landmarks in the top bar that must never sit on top of one another.
    React Native Web only emits role/aria when a component asks for it, so
    these are found by role - which is also why the primary action had to be
    given accessibilityRole before it could be checked at all.
  */
  const inTopBar = (el) => el.getBoundingClientRect().top < 300;
  const parts = [];
  const add = (name, el) => el && parts.push({ name, ...box(el) });
  add('brand mark', [...document.querySelectorAll('[role="img"]')].find(inTopBar));
  add('account name', leaves.find((e) => inTopBar(e) && /^[A-Z][a-z]+$/.test(e.textContent.trim())));
  add('sign out', [...document.querySelectorAll('[role="button"]')].find((e) => /Sign out|साइन आउट/.test(e.getAttribute('aria-label') || '')));
  add(
    'screen action',
    [...document.querySelectorAll('[role="button"]')].find((e) => {
      if (!inTopBar(e)) return false;
      const label = e.getAttribute('aria-label') || '';
      // Everything that is not one of the always-present chrome controls.
      return label && !/Sign out|साइन आउट|Language|भाषा|Dark|Light|डार्क|लाइट/.test(label);
    })
  );

  const collisions = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      if (overlaps(parts[i], parts[j])) collisions.push(`${parts[i].name} × ${parts[j].name}`);

  // Letter-spacing must be Latin-only.
  const devanagari = /[ऀ-ॿ]/;
  const spacedHindi = [];
  let hindiNodes = 0;
  let trackedLatin = 0;
  for (const el of leaves) {
    const raw = getComputedStyle(el).letterSpacing;
    const px = raw === 'normal' ? 0 : parseFloat(raw) || 0;
    if (devanagari.test(el.textContent)) {
      hindiNodes++;
      if (Math.abs(px) > 0.01) spacedHindi.push(`"${el.textContent.trim().slice(0, 28)}" ${raw}`);
    } else if (px > 0.01) trackedLatin++;
  }

  return {
    viewport: vw,
    clipped: clipped.slice(0, 6),
    clippedCount: clipped.length,
    landmarks: parts.map((p) => p.name),
    collisions,
    hindiNodes,
    spacedHindi,
    trackedLatin,
    dark: document.documentElement.classList.contains('dark'),
    hindi: devanagari.test(document.body.innerText),
  };
}

/*
  Theme and language are set through the preferences the app boots from, not by
  clicking chrome.

  This used to hunt for the compact toggles in the top bar, which made the check
  break the moment those toggles moved - and they did move: on a phone they now
  live only in Settings -> Appearance, because repeating them in the bar cost the
  business name half its width. A check that fails when a control is relocated is
  testing the control, and what this file is for is testing the layout.

  Both contexts persist to AsyncStorage, which on web is plain localStorage under
  the same key, so seeding it before the bundle evaluates is the same thing the
  user's second visit does.
*/
const THEME_KEY = '@noparchi/theme/v1';
const LANGUAGE_KEY = '@noparchi/language/v1';

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices[DEVICE], isMobile: false, hasTouch: false });

const load = async (theme, lang) => {
  await page.addInitScript(
    ([themeKey, themeValue, langKey, langValue]) => {
      try {
        window.localStorage.setItem(themeKey, themeValue);
        window.localStorage.setItem(langKey, langValue);
      } catch {
        // A browser with storage disabled still renders; the assertions below
        // will report the theme as not switched rather than crashing here.
      }
    },
    [THEME_KEY, theme, LANGUAGE_KEY, lang]
  );
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
};

let failed = 0;
console.log(`\n  ${DEVICE} · ${URL}\n`);
for (const [theme, lang] of [['light', 'en'], ['dark', 'en'], ['dark', 'hi'], ['light', 'hi']]) {
  await load(theme, lang);
  const r = await page.evaluate(inspect);

  const problems = [];
  if (r.dark !== (theme === 'dark')) problems.push('theme did not switch');
  if (r.hindi !== (lang === 'hi')) problems.push('language did not switch');
  if (r.collisions.length) problems.push(`overlap: ${r.collisions.join(', ')}`);
  if (r.clippedCount) problems.push(`${r.clippedCount} element(s) cut off at the viewport edge`);
  if (lang === 'hi' && r.hindiNodes < 5) problems.push('almost no Hindi rendered');
  for (const required of ['brand mark', 'account name', 'screen action'])
    if (!r.landmarks.includes(required))
      problems.push(`landmark not found: ${required} (the overlap check cannot see it)`);
  if (r.spacedHindi.length) problems.push(`Devanagari letter-spaced: ${r.spacedHindi.slice(0, 3).join('; ')}`);

  console.log(`  ${theme.padEnd(5)} ${lang}  ${problems.length ? 'FAIL' : 'PASS'}`);
  console.log(`        landmarks=[${r.landmarks}] hindiNodes=${r.hindiNodes} trackedLatin=${r.trackedLatin}`);
  problems.forEach((p) => console.log(`        - ${p}`));
  if (problems.length) failed++;

  if (OUT) await page.screenshot({ path: `${OUT}/layout-${theme}-${lang}.png` });
}

await browser.close();
console.log(failed ? `\n  ${failed} of 4 combinations failed\n` : '\n  all 4 combinations pass\n');
process.exit(failed ? 1 : 0);
