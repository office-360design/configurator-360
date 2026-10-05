const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROOF_TEST_BROWSER,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (process.env.ROOF_TEST_THREE) await page.route('**/test-three/**', route => route.fulfill({
    path: require('node:path').join(process.env.ROOF_TEST_THREE, route.request().url().split('/test-three/')[1]),
    contentType: 'text/javascript',
  }));
  if (process.env.ROOF_TEST_THREE) await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', route => route.fulfill({
    path: require('node:path').join(process.env.ROOF_TEST_THREE, route.request().url().split('three@0.169.0/')[1]),
    contentType: 'text/javascript',
  }));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/window-fixture', route => route.fulfill({ contentType: 'text/html', body:
    '<script type="importmap">{"imports":{"three":"/test-three/build/three.module.js"}}</script><link rel="stylesheet" href="/roof-configurator/layout-editor.css"><style>body{font-family:Arial}</style>' }));
  await page.goto('http://127.0.0.1:8080/window-fixture');
  await page.evaluate(async () => {
    const { RoofLayoutEditor } = await import('/roof-configurator/js/layoutEditor.js');
    const { footprintLayout } = await import('/roof-configurator/js/roofLayout.js?v=layout-21');
    const layout = footprintLayout([{x:0,z:0},{x:8,z:0},{x:8,z:6},{x:0,z:6}]);
    layout.vertices.forEach(p => { p.h = p.z * .5; });
    window.roofState = { roofType: 'layout', roofLayout: layout };
    window.editor = new RoofLayoutEditor(window.roofState, () => {});
    window.editor.open();
  });
  await page.locator('[data-action=window]').click();
  await page.locator('[data-window=x]').fill('3');
  await page.locator('[data-window=z]').fill('3');
  assert.ok(await page.locator('[data-window=save]').isEnabled());
  assert.equal(await page.locator('.layout-roof-window').count(), 1);
  await page.locator('[data-window=save]').click();
  assert.equal(await page.evaluate(() => editor.layout.roofWindows.length), 1);
  await page.locator('[data-action=undo]').click();
  assert.equal(await page.locator('.layout-roof-window').count(), 0);
  await page.locator('[data-action=redo]').click();
  await page.locator('.layout-roof-window').click();
  assert.equal(await page.locator('.layout-roof-window.selected').count(), 1);
  assert.match(await page.locator('[data-window=heading]').innerText(), /W1 selected/);
  await page.locator('[data-window=widthSlider]').fill('1.2');
  assert.equal(await page.locator('[data-window=width]').inputValue(), '1.2');
  await page.locator('[data-window=width]').fill('1');
  assert.equal(await page.locator('[data-window=widthSlider]').inputValue(), '1');
  await page.locator('[data-window=x]').fill('3.13');
  await page.locator('[data-window=z]').fill('3.12');
  await page.locator('[data-window=snapNow]').click();
  assert.equal(await page.locator('[data-window=x]').inputValue(), '3.250');
  assert.equal(await page.locator('[data-window=z]').inputValue(), '3.000');
  await page.locator('[data-move="1,0"]').click();
  assert.equal(await page.locator('[data-window=x]').inputValue(), '3.500');
  await page.locator('[data-window=snap]').check();
  const windowBox = await page.locator('.layout-roof-window.selected').boundingBox();
  await page.mouse.move(windowBox.x + windowBox.width / 2, windowBox.y + windowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(windowBox.x + windowBox.width / 2 + 18, windowBox.y + windowBox.height / 2, { steps: 3 });
  await page.mouse.up();
  const moved = Number(await page.locator('[data-window=x]').inputValue());
  assert.ok(moved > 3.5 && Math.abs(moved / .25 - Math.round(moved / .25)) < 1e-8);
  // A centre window must not hide the surface letter.
  await page.locator('[data-window=x]').fill('4');
  await page.locator('[data-window=z]').fill('3');
  const labelBox = await page.locator('.layout-surface-label').boundingBox();
  const openingBox = await page.locator('.layout-roof-window.selected').boundingBox();
  assert.ok(labelBox.x + labelBox.width < openingBox.x || labelBox.x > openingBox.x + openingBox.width ||
    labelBox.y + labelBox.height < openingBox.y || labelBox.y > openingBox.y + openingBox.height);
  await page.locator('[data-window=x]').fill('3');
  await page.locator('[data-window=save]').click();
  assert.equal(await page.evaluate(() => editor.layout.roofWindows[0].width), 1);
  await page.locator('[data-action=window]').click();
  await page.locator('[data-window=x]').fill('3.1');
  await page.locator('[data-window=z]').fill('3');
  assert.ok(await page.locator('[data-window=save]').isDisabled());
  assert.match(await page.locator('[data-window=status]').innerText(), /overlap/);
  await page.locator('[data-window=x]').fill('6');
  await page.locator('[data-window=save]').click();
  await page.locator('[data-action=apply]').click();
  await page.evaluate(() => { roofState.roofLayout = JSON.parse(JSON.stringify(roofState.roofLayout)); editor.open(); });
  assert.equal(await page.locator('.layout-roof-window').count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action=window]').click();
  await page.locator('[data-window=selection]').selectOption('0');
  await page.locator('[data-window=remove]').click();
  assert.equal(await page.locator('.layout-roof-window').count(), 1);
  await page.screenshot({ path: '/tmp/roof-window-mobile.png' });
  if (process.env.ROOF_TEST_THREE) {
    await page.locator('[data-action=apply]').click();
    await page.setViewportSize({ width: 1200, height: 900 });
    const results = await page.evaluate(async () => {
      const THREE = await import('three');
      const { buildRoofModel } = await import('/roof-configurator/js/roofFactory.js');
      const { state } = await import('/roof-configurator/js/state.js?v=layout-21');
      const { roofWindowGeometry } = await import('/roof-configurator/js/roofWindows.js?v=windows-24');
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(1200, 900); document.body.append(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe5edf4);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8292a0, 3));
      const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(8, 15, 8); scene.add(light);
      const camera = new THREE.PerspectiveCamera(45, 1200 / 900, .1, 100);
      camera.position.set(10, 13, 12); camera.lookAt(0, 3, 0);
      const results = [];
      for (const covering of ['generic', 'roca', 'teclado']) {
        const roof = buildRoofModel({ ...state, ...roofState, covering });
        scene.add(roof.group); roof.group.updateMatrixWorld(true);
        const window = roofWindowGeometry(roofState.roofLayout)[0];
        const normal = new THREE.Vector3(window.normal.x, window.normal.y, window.normal.z);
        const p = window.point(0, 0);
        const centre = new THREE.Vector3(p.x - 4, p.h + state.wallHeight + .05, p.z - 3);
        const ray = new THREE.Raycaster(centre.clone().addScaledVector(normal, 2), normal.clone().negate(), 0, 4);
        const roofFaces = roof.group.children.filter(mesh => mesh.name.startsWith('drawn-slope-'));
        results.push({ covering, windows: roof.group.children.filter(g => g.name.startsWith('roof-window-')).length,
          coveringHits: ray.intersectObjects(roofFaces, true).length });
        renderer.render(scene, camera);
        if (covering !== 'teclado') scene.remove(roof.group);
      }
      return results;
    });
    for (const result of results) { assert.equal(result.windows, 1); assert.equal(result.coveringHits, 0); }
    await page.screenshot({ path: '/tmp/roof-window-3d.png' });
    await page.goto('http://127.0.0.1:8080/roof-configurator/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API);
    await page.locator('#editRoofLayout').click();
    await page.locator('[data-action=window]').click();
    await page.locator('[data-window=x]').fill('-2');
    await page.locator('[data-window=z]').fill('-1.7');
    await page.locator('[data-window=save]').click();
    await page.locator('[data-action=apply]').click();
    const restored = await page.evaluate(() => {
      const api = window.ROOF_CONFIGURATOR_API;
      const saved = JSON.parse(JSON.stringify(api.captureState()));
      return saved.roofLayout.roofWindows.length === 1 && api.restoreState(saved);
    });
    assert.ok(restored, 'Full configurator restores window geometry');
    await page.locator('#sheetPlanOpenButton').click();
    assert.equal(await page.locator('.sheet-diagram').count(), 2);
    await page.locator('[data-sheet=close]').last().click();
    await page.screenshot({ path: '/tmp/roof-window-integrated.png' });
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS roof windows add, edit, overlap, undo/redo, persistence, mobile and delete');
})().catch(e => { console.error(e); process.exit(1); });
