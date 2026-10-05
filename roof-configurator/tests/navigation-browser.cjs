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
  const screen = async (x,z) => page.evaluate(({x,z}) => new DOMPoint(400+(x-editor.center.x)*editor.scale,300+(z-editor.center.z)*editor.scale).matrixTransform(editor.svg.getScreenCTM()).toJSON(), {x,z});
  const start = await screen(4,3);
  const center = await page.evaluate(() => ({...editor.center}));
  await page.mouse.move(start.x,start.y);
  await page.mouse.down();
  await page.mouse.move(start.x+60,start.y+30,{steps:5});
  await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(() => editor.center),center);
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  assert.equal(await page.evaluate(() => editor.history.length),0);
  const anchorScreen = await screen(5,3);
  anchorScreen.x = Math.round(anchorScreen.x); anchorScreen.y = Math.round(anchorScreen.y);
  await page.mouse.move(anchorScreen.x,anchorScreen.y);
  const before = await page.evaluate(p => ({ span:editor.span, point:editor.rawPointer({clientX:p.x,clientY:p.y}) }),anchorScreen);
  await page.mouse.wheel(0,-100);
  await page.waitForFunction(span => editor.span < span,before.span);
  const after = await page.evaluate(p => editor.rawPointer({clientX:p.x,clientY:p.y}),anchorScreen);
  assert.ok(Math.abs(before.point.x-after.x)<1e-8 && Math.abs(before.point.z-after.z)<1e-8);
  await page.mouse.wheel(0,100);
  await page.waitForFunction(span => Math.abs(editor.span-span)<1e-6,before.span);
  const vertex = await screen(0,0);
  await page.mouse.move(vertex.x,vertex.y); await page.mouse.down();
  await page.mouse.move(vertex.x-25,vertex.y,{steps:4}); await page.mouse.up();
  assert.notEqual(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  await page.locator('[data-action=undo]').click();
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  await clickTool(page,'draw');
  const drawAt = await screen(3,2);
  await page.mouse.click(drawAt.x,drawAt.y);
  assert.equal(await page.evaluate(() => editor.path.length),1);
  await page.mouse.wheel(0,-100);
  assert.equal(await page.evaluate(() => editor.path.length),1);
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS left-drag pan, cursor-anchored wheel zoom, unchanged geometry/history, point dragging and drawing');
})().catch(error => { console.error(error); process.exit(1); });
