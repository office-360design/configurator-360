const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.ROOF_TEST_BROWSER || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/editor-fixture', route => route.fulfill({ contentType: 'text/html', body: '<link rel="stylesheet" href="/roof-configurator/layout-editor.css"><body></body>' }));
  await page.goto('http://127.0.0.1:8080/editor-fixture');
  await page.evaluate(async () => {
    const { RoofLayoutEditor } = await import('/roof-configurator/js/layoutEditor.js?v=layout-20');
    window.editor = new RoofLayoutEditor({ pitch: 30 }, () => {});
    window.editor.open();
  });
  const previewEdges = await page.evaluate(async () => {
    const { drawAlignmentPreview } = await import('/roof-configurator/js/alignmentPreview.js?v=layout-20');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const layout = { version: 1, vertices: [
      { x: 0, z: 0, h: 0 }, { x: 2, z: 0, h: 0 },
      { x: 2, z: 2, h: 0 }, { x: 0, z: 2, h: 0 },
    ], boundary: [0, 1, 2, 3], faces: [[0, 1, 2], [0, 2, 3]] };
    drawAlignmentPreview(svg, layout, -1, layout.vertices[0]);
    const flatEdges = svg.querySelectorAll('path').length;
    const flatColors = new Set([...svg.querySelectorAll('polygon')].map(p => p.getAttribute('fill'))).size;
    layout.vertices[1].h = 1;
    drawAlignmentPreview(svg, layout, -1, layout.vertices[0]);
    return { flatEdges, flatColors, foldedEdges: svg.querySelectorAll('path').length };
  });
  assert.deepEqual(previewEdges, { flatEdges: 4, flatColors: 1, foldedEdges: 6 });
  const action = name => page.locator(`[data-action="${name}"]`);

  const original = await page.evaluate(() => window.editor.layout);
  await action('dormer').click();
  assert.ok(await page.locator('#dormerPreview').isVisible());
  assert.equal(await page.locator('.layout-dormer-outline').count(), 1);
  await page.locator('#dormerWidth').fill('8');
  assert.ok(await action('applyDormer').isDisabled());
  assert.deepEqual(await page.evaluate(() => window.editor.layout), original);
  await page.locator('#dormerWidth').fill('1.6');
  await page.locator('#dormerRise').fill('0.5');
  await action('pickDormer').click();
  const point = await page.locator('.layout-drawing > svg').evaluate(svg => {
    const e = window.editor;
    const p = new DOMPoint(400 + (0-e.center.x)*e.scale, 300+(-2.75-e.center.z)*e.scale).matrixTransform(svg.getScreenCTM());
    return {x:p.x, y:p.y};
  });
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.locator('#dormerZ').inputValue(), '-2.75');
  assert.ok(await action('applyDormer').isEnabled());
  await page.screenshot({path: '/tmp/dormer-editor-preview.png'});
  await action('applyDormer').click();
  const added = await page.evaluate(() => window.editor.layout);
  assert.ok(added.faces.length > original.faces.length);
  await action('undo').click();
  assert.deepEqual(await page.evaluate(() => window.editor.layout), original);
  await action('redo').click();
  assert.deepEqual(await page.evaluate(() => window.editor.layout), added);
  await page.setViewportSize({width:390,height:844});
  await action('dormer').click();
  await action('cancelDormer').click();
  assert.deepEqual(await page.evaluate(() => window.editor.layout), added);
  await action('apply').click();
  assert.deepEqual(await page.evaluate(() => window.editor.state.roofLayout), added);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS dormer placement, preview, invalid size, cancel, undo/redo and apply');
})().catch(error => { console.error(error); process.exit(1); });
