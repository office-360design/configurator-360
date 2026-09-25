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
    const { RoofLayoutEditor } = await import('/roof-configurator/js/layoutEditor.js?v=layout-18');
    window.editor = new RoofLayoutEditor({ pitch: 30 }, () => {});
    window.editor.open();
  });
  const action = name => page.locator(`[data-action="${name}"]`);
  const checkBounds = async () => {
    const result = await page.evaluate(() => {
      const dialog = document.querySelector('dialog');
      return { fits: dialog.scrollWidth <= dialog.clientWidth + 1, footer: dialog.querySelector('footer').getBoundingClientRect().bottom <= innerHeight };
    });
    assert.deepEqual(result, { fits: true, footer: true });
  };
  await checkBounds();
  const drawing = await page.locator('.layout-drawing').boundingBox();
  for (const name of ['undo', 'redo', 'fit', 'zoomIn', 'zoomOut']) {
    const box = await action(name).boundingBox();
    assert.ok(box.x >= drawing.x && box.y >= drawing.y && box.y < drawing.y + 60);
  }
  assert.ok(await action('undo').isDisabled());
  const originalView = await page.evaluate(() => ({ center: window.editor.center, layout: window.editor.layout }));
  for (const method of ['tool', 'middle', 'space']) {
    if (method === 'tool') await action('pan').click();
    const canvas = page.locator('.layout-drawing > svg');
    await canvas.focus();
    if (method === 'space') await page.keyboard.down('Space');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: method === 'middle' ? 'middle' : 'left' });
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 4 });
    await page.mouse.up({ button: method === 'middle' ? 'middle' : 'left' });
    if (method === 'space') await page.keyboard.up('Space');
    const moved = await page.evaluate(() => ({ center: window.editor.center, layout: window.editor.layout }));
    assert.ok(moved.center.x < originalView.center.x && moved.center.z < originalView.center.z);
    assert.deepEqual(moved.layout, originalView.layout);
    assert.ok(await action('undo').isDisabled());
    if (method === 'tool') await action('pan').click();
    await action('fit').click();
    assert.deepEqual(await page.evaluate(() => window.editor.center), originalView.center);
  }

  assert.equal(await page.locator('.layout-triangle').count(), 0);
  await action('slopeArrows').click();
  assert.equal(await page.locator('.layout-slope-arrow').count(), 4);
  assert.equal(await action('slopeArrows').getAttribute('aria-pressed'), 'true');
  assert.ok(await action('undo').isDisabled(), 'Overlay does not change roof history');
  await action('slopeArrows').click();
  assert.equal(await page.locator('.layout-slope-arrow').count(), 0);
  await action('slopeArrows').click();
  for (const kind of ['point', 'edge']) {
    if (kind === 'point') await page.locator('#layoutPointSelect').selectOption('2');
    else {
      const middle = await page.locator('.layout-drawing > svg').evaluate(svg => {
        const p = new DOMPoint(400, 300).matrixTransform(svg.getScreenCTM());
        return { x: p.x, y: p.y };
      });
      await page.mouse.click(middle.x, middle.y);
    }
    await action('pickSplitFaces').click();
    const clickSurface = async index => {
      const box = await page.locator('.layout-surface-label').nth(index).boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    await clickSurface(1);
    assert.ok(await action('splitPlace').isDisabled(), 'Cannot detach every adjoining surface');
    await clickSurface(0);
    assert.deepEqual(await page.locator('#layoutSplitFaces input:checked').evaluateAll(inputs => inputs.map(input => input.value)), ['1']);
    await action('zoomIn').click();
    assert.equal(await page.locator('.detach-selected').count(), 1);
    await action('splitPlace').click();
    assert.equal(await page.evaluate(() => window.editor.layout.vertices.length), kind === 'point' ? 7 : 8);
    await action('undo').click();
    await action('fit').click();
  }

  await action('split').click();
  assert.equal(await page.locator('.division-eligible').count(), 6);
  const first = await page.locator('.division-eligible').first().boundingBox();
  await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
  assert.equal(await page.locator('.division-path').count(), 1);
  assert.equal(await page.locator('.division-eligible').count(), 4);
  await action('select').click();
  await action('insert').click();
  const position = await page.locator('.layout-drawing > svg').evaluate(svg => {
    const editor = window.editor;
    const p = new DOMPoint(400 + (-2 - editor.center.x) * editor.scale,
      300 + (-2 - editor.center.z) * editor.scale).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.click(position.x, position.y);
  assert.equal(await page.evaluate(() => window.editor.layout.vertices.length), 7);
  assert.equal(await page.locator('#layoutPointSelect').inputValue(), '6');
  await action('undo').click();
  assert.equal(await page.evaluate(() => window.editor.layout.vertices.length), 6);
  await action('redo').click();
  assert.equal(await page.evaluate(() => window.editor.layout.vertices.length), 7);
  await action('undo').click();

  await action('zoomIn').click();
  const zoomed = await page.evaluate(() => window.editor.span);
  await action('zoomOut').click();
  assert.ok(await page.evaluate(() => window.editor.span) > zoomed);
  await action('fit').click();
  await page.locator('#layoutPointSelect').selectOption('0');
  await page.locator('#layoutH').fill('1');
  await action('point').click();
  assert.equal(await page.locator('.layout-triangle').count(), 1);
  await action('undo').click();
  await action('redo').click();
  assert.equal(await page.evaluate(() => window.editor.layout.vertices[0].h), 1);
  await page.getByRole('button', { name: 'Coordinates help', exact: true }).focus();
  assert.equal(await page.locator('.layout-tip:popover-open').count(), 1);
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('dialog').isVisible());
  assert.ok((await page.locator('.layout-mode-hint').boundingBox()).y < 850);
  await page.getByRole('button', { name: 'Coordinates help', exact: true }).click();
  assert.equal(await page.locator('.layout-tip:popover-open').count(), 1);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: '/tmp/roof-editor-desktop.png' });
  for (const viewport of [{ width: 1024, height: 768 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport);
    await checkBounds();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await action('pan').click();
  const touchBefore = await page.evaluate(() => ({ center: window.editor.center, layout: window.editor.layout }));
  const touchCanvas = await page.locator('.layout-drawing > svg').boundingBox();
  const touchX = touchCanvas.x + touchCanvas.width / 2, touchY = touchCanvas.y + touchCanvas.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX + 40, y: touchY + 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchAfter = await page.evaluate(() => ({ center: window.editor.center, layout: window.editor.layout }));
  assert.ok(touchAfter.center.x < touchBefore.center.x);
  assert.deepEqual(touchAfter.layout, touchBefore.layout);
  await action('pan').click();
  await action('fit').click();

  await checkBounds();
  await page.screenshot({ path: '/tmp/roof-editor-mobile.png' });
  await page.locator('.layout-setup summary').click();
  await page.locator('#layoutExample').selectOption('lshape');
  await action('example').click();
  assert.match(await page.locator('.layout-summary').textContent(), /6 surfaces/);
  assert.equal(await page.locator('.layout-triangle').count(), 0);
  assert.deepEqual(await page.locator('.layout-surface-label').allTextContents(), ['A', 'B', 'C', 'D', 'E', 'F']);
  await page.locator('#layoutPointSelect').selectOption('0');
  await action('meet').click();
  assert.match(await page.locator('#meetTarget').textContent(), /Surface A/);
  assert.equal(await page.locator('.layout-meet legend').count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await action('pickTarget').click();
  const surface = await page.locator('.layout-surface-label').first().boundingBox();
  await page.mouse.click(surface.x + surface.width / 2, surface.y + surface.height / 2);
  assert.equal(await page.locator('#meetTarget').inputValue(), '0');
  await page.screenshot({ path: '/tmp/roof-meet-heading.png' });
  await action('cancelMeet').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const icon = await page.locator('[data-action="insert"] .layout-tool-icon').boundingBox();
  const label = await page.locator('[data-action="insert"] .layout-tool-label').boundingBox();
  assert.ok(label.x - (icon.x + icon.width) >= 6);
  await page.screenshot({ path: '/tmp/roof-surface-letters.png' });


  await page.locator('[data-action="cancel"]').last().click();
  for (const roofType of ['gable', 'shed', 'hip', 'lshape', 'dormer']) {
    await page.evaluate(type => {
      Object.assign(window.editor.state, { roofType: type, length: 10, depth: 7, pitch: 30, overhang: 0.45, wallHeight: 3 });
      window.editor.open();
    }, roofType);
    assert.ok(await page.locator('.layout-surface-label').count() > 0);
    await page.locator('[data-action="cancel"]').last().click();
    assert.equal(await page.evaluate(() => window.editor.state.roofType), roofType);
  }
  await page.evaluate(() => { window.editor.state.roofType = 'shed'; window.editor.open(); });
  await action('apply').click();
  assert.equal(await page.evaluate(() => window.editor.state.roofType), 'layout');
  assert.equal(await page.evaluate(() => window.editor.state.roofLayout.faces.length), 1);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS editor desktop/mobile layout, zoom, history, help and examples');
})().catch(error => { console.error(error); process.exit(1); });
