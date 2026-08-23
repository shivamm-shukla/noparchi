/**
 * Drives the scanner through every outcome, on the smallest phone we support.
 *
 * This is the screen where being wrong costs money: a gatekeeper reads it in a
 * second with a queue behind them, and if the answer is unreadable or the
 * action is off the bottom of the screen, the car goes through on trust. None
 * of that is visible to a typecheck or an export - the modal renders fine at
 * desktop width and only fails on a short phone.
 *
 * Asserts, per outcome:
 *   - the headline renders, and is the right one
 *   - the two actions are fully on screen, not clipped
 *   - a refusal never auto-dismisses, and a clean pass always does
 *   - ALREADY_USED shows who cleared it, where and when
 *
 * Usage: npm run check:scanner   (with the dev server already running)
 */
import { chromium } from 'playwright';

const URL = process.env.CHECK_URL ?? 'http://localhost:8081/app/scanner';
const OUT = process.env.CHECK_OUT ?? null;

/** iPhone SE - the shortest screen this has to survive. */
const VIEWPORT = { width: 375, height: 667 };

const CASES = [
  { name: 'verified', code: 'NP-K4RT-8WQZ', headline: 'VERIFIED', autoCloses: true },
  {
    name: 'already used',
    code: 'NP-B3ZC-7PLM',
    headline: 'ALREADY USED',
    autoCloses: false,
    needsReuseFacts: true,
  },
  {
    name: 'expired',
    code: 'NP-Q9WE-5HJN',
    headline: 'TIME OVER',
    autoCloses: false,
    needsCollect: true,
  },
  { name: 'not paid', code: 'NP-T6NX-4RVB', headline: 'NOT PAID', autoCloses: false },
  { name: 'invalid', code: 'NP-ZZZZ-0000', headline: 'INVALID', autoCloses: false },
];

function inspect() {
  const text = document.body.innerText;
  const buttons = [...document.querySelectorAll('[role="button"]')];
  const onScreen = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.width > 0;
  };

  const actions = buttons.filter((b) => {
    const r = b.getBoundingClientRect();
    // The two full-width actions at the foot of the sheet.
    return r.width > VIEWPORT_WIDTH * 0.5 && r.height > 30;
  });

  return {
    text,
    headline: (text.match(/(VERIFIED|ALREADY USED|NOT PAID|TIME OVER|INVALID|NOT ALLOWED)/) ||
      [])[1] ?? null,
    actionCount: actions.length,
    allActionsOnScreen: actions.length > 0 && actions.every(onScreen),
    // Rendered text, so CSS uppercase is already applied.
    hasCollect: /COLLECT BEFORE EXIT/i.test(text),
    hasReuseFacts: /already cleared/i.test(text),
    isCountingDown: /Closing in \d+s/.test(text),
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
await page.addInitScript((w) => {
  window.VIEWPORT_WIDTH = w;
}, VIEWPORT.width);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(4000);

let failed = 0;
console.log(`\n  scanner · ${VIEWPORT.width}x${VIEWPORT.height} · ${URL}\n`);

for (const testCase of CASES) {
  await page.getByRole('textbox').first().fill(testCase.code);
  await page.getByRole('button', { name: /^(Verify|जांचें)$/ }).first().click();
  await page.waitForTimeout(1500);

  const r = await page.evaluate(inspect);
  const problems = [];

  if (r.headline !== testCase.headline) {
    problems.push(`headline was ${r.headline ?? 'missing'}, expected ${testCase.headline}`);
  }
  if (!r.allActionsOnScreen) {
    problems.push(`${r.actionCount} action(s) found, not all fully on screen`);
  }
  if (testCase.autoCloses && !r.isCountingDown) {
    problems.push('a clean pass should dismiss itself, but no countdown is showing');
  }
  if (!testCase.autoCloses && r.isCountingDown) {
    problems.push('a refusal must not auto-dismiss - the gatekeeper has to act on it');
  }
  if (testCase.needsCollect && !r.hasCollect) problems.push('overstay amount is not shown');
  if (testCase.needsReuseFacts && !r.hasReuseFacts) {
    problems.push('no record of who cleared this pass, where or when');
  }

  console.log(`  ${testCase.name.padEnd(13)} ${problems.length ? 'FAIL' : 'PASS'}`);
  problems.forEach((p) => console.log(`      - ${p}`));
  if (problems.length) failed++;

  if (OUT) await page.screenshot({ path: `${OUT}/scanner-${testCase.name.replace(/\s/g, '-')}.png` });

  const next = page.getByRole('button', { name: /Scan next pass|अगला पास/ }).first();
  if (await next.count()) await next.click().catch(() => {});
  await page.waitForTimeout(900);
}

await browser.close();
console.log(failed ? `\n  ${failed} of ${CASES.length} outcomes failed\n` : '\n  all outcomes pass\n');
process.exit(failed ? 1 : 0);
