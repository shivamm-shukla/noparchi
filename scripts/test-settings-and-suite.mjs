import { chromium, devices } from 'playwright';

const BASE_URL = process.env.CHECK_URL ?? 'http://localhost:8081';

async function runTests() {
  console.log('\n🚀 Starting comprehensive test suite...\n');
  const browser = await chromium.launch();
  let errorsFound = 0;

  // ---------------------------------------------------------------------------
  // Test 1: Desktop Master/Detail Settings Layout
  // ---------------------------------------------------------------------------
  console.log('🖥️  Test 1: Settings Desktop Layout (1200x800)');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE_URL}/app/settings`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const panes = [
      'Business',
      'Brand',
      'Exit gates',
      'Payments & delivery',
      'Pass types & prices',
      'Gatekeepers',
      'Appearance',
    ];

    for (const pane of panes) {
      const paneEl = page.getByText(pane, { exact: false }).first();
      const visible = await paneEl.isVisible();
      if (!visible) {
        console.error(`  ❌ Pane "${pane}" not visible on desktop sidebar`);
        errorsFound++;
      } else {
        console.log(`  ✓ Pane "${pane}" found`);
      }
    }

    console.log('  Testing pane switching:');
    for (const pane of panes) {
      await page.getByText(pane, { exact: false }).first().click();
      await page.waitForTimeout(400);
      console.log(`  ✓ Switched to pane: ${pane}`);
    }

    console.log('  Testing Appearance theme toggle on Desktop:');
    await page.getByText('Appearance', { exact: false }).first().click();
    await page.waitForTimeout(400);

    const darkBtn = page.getByText('Dark', { exact: true }).first();
    if (await darkBtn.isVisible()) {
      await darkBtn.click();
      await page.waitForTimeout(600);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      console.log(`  ✓ Dark theme active: ${isDark}`);
      if (!isDark) {
        console.error('  ❌ Failed to switch to dark theme');
        errorsFound++;
      }

      const lightBtn = page.getByText('Light', { exact: true }).first();
      await lightBtn.click();
      await page.waitForTimeout(600);
    }

    console.log('  Testing Language switch on Desktop:');
    const hiBtn = page.getByText('हिन्दी', { exact: true }).first();
    if (await hiBtn.isVisible()) {
      await hiBtn.click();
      await page.waitForTimeout(800);
      const hasDevanagari = await page.evaluate(() => /[ऀ-ॿ]/.test(document.body.innerText));
      console.log(`  ✓ Hindi translated text rendered: ${hasDevanagari}`);
      if (!hasDevanagari) {
        console.error('  ❌ Failed to switch language to Hindi');
        errorsFound++;
      }

      const enBtn = page.getByText('English', { exact: true }).first();
      await enBtn.click();
      await page.waitForTimeout(800);
    }

    if (consoleErrors.length > 0) {
      console.warn(`  ⚠️ Browser console errors captured:`, consoleErrors);
    }
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // Test 2: Mobile Compact Drill-Down Settings Layout (iPhone 12 Pro)
  // ---------------------------------------------------------------------------
  console.log('\n📱 Test 2: Settings Mobile Layout (iPhone 12 Pro)');
  {
    const page = await browser.newPage({ ...devices['iPhone 12 Pro'] });
    await page.goto(`${BASE_URL}/app/settings`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const businessRow = page.getByText('Business', { exact: false }).first();
    if (!(await businessRow.isVisible())) {
      console.error('  ❌ Master menu list not visible on mobile');
      errorsFound++;
    } else {
      console.log('  ✓ Master menu list visible on mobile');
    }

    console.log('  Testing mobile drill-down into Exit gates:');
    await page.getByText('Exit gates', { exact: false }).first().click();
    await page.waitForTimeout(600);

    const backBtn = page.getByRole('button', { name: /Settings|सेटिंग्स/ }).first();
    if (await backBtn.isVisible()) {
      console.log('  ✓ Back button visible in detail view');
    } else {
      console.error('  ❌ Back button not found in mobile detail view');
      errorsFound++;
    }

    const gateIntro = page.getByText('Every scan is recorded against', { exact: false }).first();
    if (await gateIntro.isVisible()) {
      console.log('  ✓ Gates detail pane rendered content properly');
    } else {
      console.error('  ❌ Gates detail content not found');
      errorsFound++;
    }

    await backBtn.click();
    await page.waitForTimeout(600);
    const backToMenu = await page.getByText('Gatekeepers', { exact: false }).first().isVisible();
    console.log(`  ✓ Returned to Master menu: ${backToMenu}`);
    if (!backToMenu) {
      console.error('  ❌ Failed to return to master menu from detail view');
      errorsFound++;
    }

    await page.close();
  }

  // ---------------------------------------------------------------------------
  // Test 3: Other Tabs Sanity (Dashboard, Ledger, Scanner)
  // ---------------------------------------------------------------------------
  console.log('\n🔍 Test 3: Cross-Tab Health Check');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

    // 1. Dashboard
    await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const revenueStat = await page.getByText('Revenue today', { exact: false }).first().isVisible();
    console.log(`  ✓ Dashboard rendered stat cards: ${revenueStat}`);
    if (!revenueStat) errorsFound++;

    // 2. Ledger
    await page.goto(`${BASE_URL}/app/ledger`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const ledgerHeader = await page.getByText('All time', { exact: false }).first().isVisible() ||
      await page.getByPlaceholder('Search pass code', { exact: false }).first().isVisible();
    console.log(`  ✓ Ledger screen rendered properly: ${ledgerHeader}`);
    if (!ledgerHeader) errorsFound++;

    // 3. Scanner
    await page.goto(`${BASE_URL}/app/scanner`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const scannerTitle = await page.getByText('Ready to scan', { exact: false }).first().isVisible() ||
      await page.getByText('Offline ready', { exact: false }).first().isVisible() ||
      await page.getByText('Camera', { exact: false }).first().isVisible();
    console.log(`  ✓ Scanner screen rendered properly: ${scannerTitle}`);
    if (!scannerTitle) errorsFound++;

    await page.close();
  }

  await browser.close();

  console.log('\n========================================');
  if (errorsFound === 0) {
    console.log('🎉 ALL TESTS PASSED! No regressions found.');
  } else {
    console.error(`💥 ${errorsFound} test failures detected.`);
  }
  console.log('========================================\n');
  process.exit(errorsFound ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
