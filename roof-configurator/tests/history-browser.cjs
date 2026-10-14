const { clickTool } = require('./editor-tools.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROOF_TEST_BROWSER,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/test-three/**', route => route.fulfill({
    path: require('node:path').join(process.env.ROOF_TEST_THREE, route.request().url().split('/test-three/')[1]), contentType: 'text/javascript',
  }));
  await page.route('**/i18n-fixture', route => route.fulfill({ contentType: 'text/html', body:
    '<script type="importmap">{"imports":{"three":"/test-three/build/three.module.js"}}</script><link rel="stylesheet" href="/roof-configurator/layout-editor.css"><link rel="stylesheet" href="/roof-configurator/sheet-planner.css"><style>body{font-family:Arial}</style>' }));
  await page.goto('http://127.0.0.1:8080/i18n-fixture');
  await page.evaluate(async () => {
    const { RoofLayoutEditor } = await import('/roof-configurator/js/layoutEditor.js');
    const { SheetPlannerUI } = await import('/roof-configurator/js/sheetPlannerUI.js');
    const { footprintLayout } = await import('/roof-configurator/js/roofLayout.js?v=layout-21');
    const layout = footprintLayout([{x:0,z:0},{x:8,z:0},{x:8,z:6},{x:0,z:6}]);
    layout.vertices.forEach(p => { p.h = p.z * .5; });
    window.state = { locale: 'ro-RO', roofType: 'layout', roofLayout: layout };
    window.editor = new RoofLayoutEditor(state, () => {});
    window.planner = new SheetPlannerUI(state);
    window.changeLocale = locale => { state.locale = locale; window.dispatchEvent(new CustomEvent('roof-locale-applied', { detail: { locale } })); };
    editor.open();
  });
  const original = await page.evaluate(() => JSON.stringify(editor.layout));
  await page.locator('#layoutPointSelect').selectOption('0');
  await page.locator('#layoutH').fill('1');
  await page.locator('[data-action=point]').click();
  const edited = await page.evaluate(() => JSON.stringify(editor.layout));
  await page.locator('[data-action=apply]').click();
  await page.evaluate(() => editor.open());
  assert.ok(await page.locator('[data-action=undo]').isEnabled());
  await page.locator('[data-action=undo]').click();
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  await page.locator('[data-action=apply]').click();
  await page.evaluate(() => editor.open());
  assert.ok(await page.locator('[data-action=redo]').isEnabled());
  await page.locator('[data-action=redo]').click();
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),edited);
  // Cancel must restore the applied roof AND its redo branch.
  await page.locator('.roof-layout-dialog footer [data-action=cancel]').click();
  await page.evaluate(() => editor.open());
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  assert.ok(await page.locator('[data-action=redo]').isEnabled());
  await page.locator('#layoutPointSelect').selectOption('1');
  await page.locator('#layoutH').fill('2');
  await page.locator('[data-action=point]').click();
  assert.ok(await page.locator('[data-action=redo]').isDisabled());
  await page.keyboard.press('Escape');
  await page.evaluate(() => editor.open());
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  assert.ok(await page.locator('[data-action=redo]').isEnabled());
  // Editing another externally loaded roof must not reuse the previous timeline.
  await page.evaluate(() => { editor.dialog.close(); state.roofLayout.vertices[0].h = 2; editor.open(); });
  assert.ok(await page.locator('[data-action=undo]').isDisabled());
  assert.ok(await page.locator('[data-action=redo]').isDisabled());
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS history across Apply/reopen, redo after applied undo, Cancel/Escape rollback and external roof isolation');
})().catch(error => { console.error(error); process.exit(1); });
