const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOF_TEST_BROWSER || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (process.env.ROOF_TEST_THREE) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', route => {
      const file = route.request().url().split('three@0.169.0/')[1];
      return route.fulfill({ path: path.join(process.env.ROOF_TEST_THREE, file), contentType: 'text/javascript' });
    });
  }
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
  await page.goto('http://127.0.0.1:8080/roof-configurator/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API, { timeout: 30000 });
  assert.equal(await page.locator('.intro-section').innerText(), 'Configure your roof');



  await page.locator('[aria-controls="roofPanelDrainage"]').click();
  await page.locator('#showDrainage').check();
  await page.locator('#drainageDiameter').selectOption('120');
  await page.locator('#drainagePosition').selectOption('start');
  await page.locator('#drainageColor').selectOption('roof');
  const saved = await page.evaluate(() => window.ROOF_CONFIGURATOR_API.captureState());
  assert.equal(saved.showDrainage, true);
  assert.equal(saved.drainageDiameter, 120);
  assert.equal(saved.drainagePosition, 'start');
  const geometry = await page.evaluate(async () => {
    const {createDrainage, drainageRuns} = await import('/roof-configurator/js/drainage.js?v=drainage-48');
    const state = window.ROOF_CONFIGURATOR_API.captureState();
    const results = {};
    for (const roofType of ['gable','hip','shed','lshape','dormer']) {
      const config = {...state,roofType,drainagePosition:'both'};
      const group = createDrainage(config);
      results[roofType] = {runs:drainageRuns(config).length, pipes:group.children.filter(c=>c.name.startsWith('downpipe')).length};
      for (const mesh of group.children) {
        if (!Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)) throw Error('Invalid drainage mesh');
      }
    }
    const {defaultLayout} = await import('/roof-configurator/js/roofLayout.js?v=layout-21');
    results.layout = drainageRuns({...state,roofType:'layout',roofLayout:defaultLayout()}).length;
    results.off = createDrainage({...state,showDrainage:false}).children.length;
    results.sketch = createDrainage({...state,roofType:'sketch'}).children.length;
    return results;
  });
  assert.deepEqual(geometry.gable,{runs:2,pipes:4});
  assert.deepEqual(geometry.hip,{runs:4,pipes:8});
  assert.deepEqual(geometry.shed,{runs:1,pipes:2});
  assert.ok(geometry.lshape.runs>=2);
  assert.ok(geometry.dormer.runs>=2);
  assert.equal(geometry.layout,2);
  assert.equal(geometry.off,0);
  assert.equal(geometry.sketch,0);
  await page.locator('#showDrainage').uncheck();
  await page.evaluate(saved=>window.ROOF_CONFIGURATOR_API.restoreState(saved),saved);
  assert.equal(await page.locator('#showDrainage').isChecked(),true);
  assert.equal(await page.locator('#drainageDiameter').inputValue(),'120');
  await page.screenshot({path:'/tmp/roof-drainage.png'});
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS drainage settings, preset/custom geometry, pipe counts, disabled state and save/restore');
})().catch(error => {console.error(error);process.exit(1);});
