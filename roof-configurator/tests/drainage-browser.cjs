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
    const {createDrainage, drainageRuns} = await import('/roof-configurator/js/drainage.js?v=drainage-50');
    const THREE = await import('three');
    const state = window.ROOF_CONFIGURATOR_API.captureState();
    const results = {};
    for (const roofType of ['gable','hip','shed','lshape','dormer']) {
      const config = {...state,roofType,drainagePosition:'both'};
      const group = createDrainage(config);
      results[roofType] = {runs:drainageRuns(config).length, pipes:group.children.filter(c=>c.name.startsWith('downpipe')).length};
      group.updateMatrixWorld(true);
      for (const pipe of group.children.filter(mesh=>mesh.name.startsWith('downpipe'))) {
        const [,run,id] = pipe.name.split('-');
        const positions = pipe.geometry.attributes.position;
        const inlet = new THREE.Vector3();
        for(let i=0;i<13;i++) inlet.add(new THREE.Vector3().fromBufferAttribute(positions,i));
        inlet.divideScalar(13);
        const collector = group.getObjectByName(`collector-${run}-${id}`);
        if (collector) {
          const bottom = collector.position.y-collector.geometry.parameters.height/2;
          if (Math.abs(inlet.y-bottom)>.015) throw Error('Detached corner outlet');
        } else {
          const gutter = group.getObjectByName(`gutter-${run}`);
          const local = gutter.worldToLocal(inlet.clone());
          const radius = config.drainageDiameter/2000*1.5;
          if (Math.abs(local.x)>.015 || Math.abs(local.y+radius)>.02) throw Error('Detached gutter outlet');
        }
      }
      for (const mesh of group.children) {
        if (mesh.name.startsWith('gutter')) {
          const up = new THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion);
          if (up.y < .5) throw Error('Gutter opening faces down');
        }
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
  await page.locator('#editDrainagePositions').click();
  const editor = page.locator('.layout-editor');
  const panel = page.locator('.editor-drainage');
  await panel.locator('.drain-edge').selectOption('0');
  await panel.locator('.drain-gutter').check();
  await panel.locator('[data-drain=clear]').click();
  await panel.locator('.drain-position').fill('35');
  await panel.locator('[data-drain=add]').click();
  assert.match(await panel.locator('.drain-pipe').innerText(), /35%/);
  await panel.locator('.drain-position').fill('60');
  await panel.locator('[data-drain=move]').click();
  assert.match(await panel.locator('.drain-pipe').innerText(), /60%/);
  await page.locator('.roof-layout-dialog [data-action=undo]').click();
  assert.match(await panel.locator('.drain-pipe').innerText(), /35%/);
  await page.locator('.roof-layout-dialog [data-action=redo]').click();
  await page.locator('.roof-layout-dialog [data-action=apply]').click();
  const placed = await page.evaluate(()=>window.ROOF_CONFIGURATOR_API.captureState());
  assert.deepEqual(placed.roofLayout.drainage.edges[0].pipes,[.6]);
  assert.equal(placed.showDrainage,true);
  await page.locator('#editDrainagePositions').click();
  assert.match(await panel.locator('.drain-pipe').innerText(), /60%/);
  await page.locator('.roof-layout-dialog [data-action=cancel]').first().click();
  const valley = await page.evaluate(async()=>{
    const {presetRoofLayout}=await import('/roof-configurator/js/presetLayout.js?v=layout-21');
    const {recommendedDrainage}=await import('/roof-configurator/js/drainageLayout.js?v=drainage-49');
    return recommendedDrainage(presetRoofLayout({...window.ROOF_CONFIGURATOR_API.captureState(),roofType:'lshape'})).filter(e=>e.valleyOutlet);
  });
  assert.equal(valley.length,2);
  assert.equal(valley.flatMap(e=>e.pipes).length,1);
  await page.evaluate(saved => window.ROOF_CONFIGURATOR_API.restoreState({...saved,roofType:'lshape',showDrainage:true,drainagePosition:'both'}),saved);
  await page.locator('#roofSidebarToggle').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:'/tmp/roof-drainage-corner-fixed.png'});
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS drainage settings, preset/custom geometry, pipe counts, disabled state and save/restore');
})().catch(error => {console.error(error);process.exit(1);});
