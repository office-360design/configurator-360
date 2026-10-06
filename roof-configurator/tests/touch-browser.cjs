const { clickTool } = require('./editor-tools.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROOF_TEST_BROWSER,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/test-three/**', route => route.fulfill({
    path: require('node:path').join(process.env.ROOF_TEST_THREE, route.request().url().split('/test-three/')[1]), contentType: 'text/javascript',
  }));
  await page.route('**/i18n-fixture', route => route.fulfill({ contentType: 'text/html', body:
    '<meta name="viewport" content="width=device-width, initial-scale=1"><script type="importmap">{"imports":{"three":"/test-three/build/three.module.js"}}</script><link rel="stylesheet" href="/roof-configurator/layout-editor.css"><link rel="stylesheet" href="/roof-configurator/sheet-planner.css"><style>body{font-family:Arial}</style>' }));
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
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([id,x,y]) => ({id,x,y}))});
  const box = await page.locator('.layout-drawing').boundingBox();
  assert.ok(box.height >= 480);
  const x = box.x+box.width/2, y = box.y+120;
  const original = await page.evaluate(() => JSON.stringify(editor.layout));
  const before = await page.evaluate(() => ({span:editor.span,center:{...editor.center}}));
  await touch('touchStart', [[1,x-35,y],[2,x+35,y]]);
  await touch('touchMove', [[1,x-55,y+25],[2,x+75,y+25]]);
  await touch('touchEnd', []);
  assert.ok(await page.evaluate(span => editor.span < span, before.span));
  assert.notDeepEqual(await page.evaluate(() => editor.center),before.center);
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  assert.equal(await page.evaluate(() => editor.history.length),0);
  await clickTool(page,'draw');
  await touch('touchStart', [[1,x-30,y]]);
  await touch('touchStart', [[1,x-30,y],[2,x+30,y]]);
  await touch('touchMove', [[1,x-40,y+20],[2,x+40,y+20]]);
  await touch('touchEnd', [[1,x-40,y+20]]);
  await touch('touchMove', [[1,x-20,y+40]]);
  await touch('touchEnd', []);
  assert.deepEqual(await page.evaluate(() => editor.path),[{x:0,z:0}]);
  await touch('touchStart', [[1,x,y]]);
  await touch('touchEnd', []);
  assert.equal(await page.evaluate(() => editor.path.length),2);
  await page.locator('[data-action=select]').click();
  await clickTool(page,'fit');
  const point = await page.evaluate(() => {
    const p=editor.layout.vertices[0];
    return new DOMPoint(400+(p.x-editor.center.x)*editor.scale,300+(p.z-editor.center.z)*editor.scale).matrixTransform(editor.svg.getScreenCTM()).toJSON();
  });
  await touch('touchStart', [[1,point.x,point.y]]);
  await touch('touchMove', [[1,point.x-15,point.y]]);
  await touch('touchEnd', []);
  assert.notEqual(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  await page.locator('[data-action=undo]').click();
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  await touch('touchStart', [[1,point.x,point.y]]);
  await touch('touchMove', [[1,point.x-15,point.y]]);
  await touch('touchStart', [[1,point.x-15,point.y],[2,point.x+50,point.y]]);
  await touch('touchMove', [[1,point.x-30,point.y],[2,point.x+70,point.y]]);
  await touch('touchCancel', []);
  assert.equal(await page.evaluate(() => JSON.stringify(editor.layout)),original);
  assert.equal(await page.evaluate(() => editor.history.length),0);
  await page.screenshot({path:'/tmp/roof-touch-mobile.png'});
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS mobile touch: pinch/pan, drawing taps, point drag, second-finger rollback and cancellation');
})().catch(error => { console.error(error); process.exit(1); });
