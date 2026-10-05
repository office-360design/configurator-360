const { clickTool } = require('./editor-tools.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROOF_TEST_BROWSER || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (process.env.ROOF_TEST_THREE) await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', route => route.fulfill({
    path: require('node:path').join(process.env.ROOF_TEST_THREE, route.request().url().split('three@0.169.0/')[1]), contentType: 'text/javascript',
  }));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8080/roof-configurator/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API);
  await page.locator('#sheetPlanOpenButton').click();
  assert.equal(await page.locator('.sheet-diagram').count(), 2);
  await page.locator('[name=preset]').selectOption('clasic');
  await page.locator('.sheet-primary').click();
  assert.equal(await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState().sheetPlanOptions.profile.usefulWidth), 1080);
  await page.locator('[data-sheet=close]').last().click();
  await page.locator('#editRoofLayout').click();
  await clickTool(page, 'dormer');
  await page.locator('[data-action=applyDormer]').click();
  await page.locator('.roof-layout-dialog [data-action=apply]').click();
  await page.locator('#sheetPlanOpenButton').click();
  assert.equal(await page.locator('.sheet-diagram').count(), 4);
  assert.ok(await page.locator('[data-sheet=csv]').isEnabled());
  await page.screenshot({ path: '/tmp/sheet-planner-integrated.png' });
  await page.locator('[data-sheet=close]').last().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#roofSidebarToggle').click();
  await page.screenshot({ path: '/tmp/sheet-planner-launch-mobile.png' });
  await page.locator('#sheetPlanOpenButton').click();
  assert.ok(await page.locator('.sheet-planner').isVisible());
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS integrated planner launch, shared settings, editable dormer geometry and mobile access');
})().catch(e => { console.error(e); process.exit(1); });
