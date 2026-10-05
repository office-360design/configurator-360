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
  await page.evaluate(() => changeLocale('en-US'));
  const clickPlan = async (x, z) => {
    const point = await page.evaluate(({x,z}) => {
      return new DOMPoint(400 + (x - editor.center.x) * editor.scale,
        300 + (z - editor.center.z) * editor.scale).matrixTransform(editor.svg.getScreenCTM()).toJSON();
    }, {x,z});
    await page.mouse.click(point.x, point.y);
  };
  const original = await page.evaluate(() => JSON.stringify(editor.layout));
  await clickTool(page, 'extend');
  await clickPlan(4, 8);
  assert.match(await page.locator('.layout-feedback').innerText(), /Choose an outer perimeter edge/);
  await clickPlan(4, 6);
  assert.equal(await page.locator('.layout-perimeter-target').count(), 1);
  await clickPlan(4, 4);
  assert.match(await page.locator('.layout-feedback').innerText(), /outside the current perimeter/);
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)), original);
  await clickPlan(4, 8);
  assert.equal(await page.evaluate(() => editor.layout.boundary.length), 5);
  assert.equal(await page.evaluate(() => editor.layout.vertices.at(-1).h), 4);
  assert.ok(await page.locator('.layout-feedback').isHidden());
  await page.locator('[data-action=undo]').click();
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)), original);
  await page.locator('[data-action=redo]').click();
  assert.equal(await page.evaluate(() => editor.layout.boundary.length), 5);
  await page.locator('[data-action=apply]').click();
  assert.equal(await page.evaluate(() => state.roofLayout.boundary.length), 5);
  await page.evaluate(() => { editor.open(); changeLocale('de-DE'); });
  assert.equal(await page.locator('[data-action=extend] .layout-tool-label').innerText(), 'Umriss bearbeiten');
  await page.setViewportSize({ width: 390, height: 844 });
  await clickTool(page, 'extend');
  assert.ok(await page.locator('[data-tool-group=perimeter]').isVisible());
  assert.equal(await page.locator('.roof-layout-dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS perimeter extension: edge selection, invalid points, slope height, undo/redo, apply/reopen, translation and mobile');
})().catch(error => { console.error(error); process.exit(1); });
