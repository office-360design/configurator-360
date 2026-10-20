const { clickTool } = require('./editor-tools.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const EXPECT = {
  csv: { "en-US": /Slope,Piece/, "ro-RO": /Apă,Piesă/, "de-DE": /Dachfläche,Teil/, "es-ES": /Faldón,Pieza/, "fr-FR": /Pan,Pièce/, "it-IT": /Falda,Pezzo/ },
  svg: { "en-US": /Unfolded/, "ro-RO": /Plan desfășurat/, "de-DE": /Abgewickelter/, "es-ES": /Plan de corte desplegado/, "fr-FR": /Plan de découpe déplié/, "it-IT": /Piano di taglio sviluppato/ },
  print: { "en-US": /Combined order list/, "ro-RO": /Listă de comandă cumulată/, "de-DE": /Zusammengefasste Bestellliste/, "es-ES": /Lista de pedido combinada/, "fr-FR": /Liste de commande globale/, "it-IT": /Distinta d'ordine complessiva/ },
  sheetButton: { "en-US": /Sheet cutting plan/, "ro-RO": /Plan de debitare/, "de-DE": /Zuschnittplan/, "es-ES": /Plan de corte de chapas/, "fr-FR": /Plan de découpe des tôles/, "it-IT": /Piano di taglio delle lamiere/ },
  layoutCard: { "en-US": "Draw whole roof", "ro-RO": "Desenează întregul acoperiș", "de-DE": "Ganzes Dach zeichnen", "es-ES": "Dibujar el tejado", "fr-FR": "Dessiner la toiture", "it-IT": "Disegnare il tetto" },
  layoutTitle: { "en-US": "Draw your roof", "ro-RO": "Desenează acoperișul", "de-DE": "Dach zeichnen", "es-ES": "Dibuje su tejado", "fr-FR": "Dessinez votre toiture", "it-IT": "Disegni il Suo tetto" },
  estimate: { "en-US": "Not estimated", "ro-RO": "Neestimat", "de-DE": "Nicht geschätzt", "es-ES": "Sin estimar", "fr-FR": "Non estimé", "it-IT": "Non stimato" },
};
const LOCALES = ["ro-RO", "de-DE", "es-ES", "fr-FR", "it-IT", "en-US"];
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
  assert.equal(await page.locator('#layoutTitle').innerText(), 'Desenează acoperișul');
  await clickTool(page, 'window');
  assert.equal(await page.locator('[data-window=save]').innerText(), 'Adaugă fereastra');
  assert.match(await page.locator('[data-window=status]').innerText(), /Fă clic/);
  await page.locator('[data-window=x]').fill('3');
  await page.locator('[data-window=z]').fill('3');
  await page.locator('[data-window=widthSlider]').fill('1.2');
  await page.locator('[data-window=save]').click();
  await page.locator('.layout-roof-window').click();
  await page.evaluate(() => changeLocale('de-DE'));
  assert.equal(await page.locator('[data-window=heading]').innerText(), 'Fenster W1 ausgewählt');
  assert.equal(await page.locator('[data-window=widthSlider]').getAttribute('aria-label'), 'Fensterbreite (m)');
  assert.equal(await page.locator('[data-window=width]').inputValue(), '1.2');
  assert.equal(await page.locator('[data-window=save]').innerText(), 'Fenster aktualisieren');
  assert.match(await page.locator('[data-window=gridNote]').innerText(), /Rasterschritt/);
  await page.locator('[data-window=width]').fill('5');
  assert.match(await page.locator('[data-window=status]').innerText(), /Dachfensterbreite/);
  await page.locator('[data-window=width]').fill('1.2');
  await page.evaluate(() => changeLocale('en-US'));
  assert.equal(await page.locator('[data-window=heading]').innerText(), 'Window W1 selected');
  await page.locator('[data-window=cancel]').click();
  await clickTool(page, 'dormer');
  await page.locator('#dormerWidth').fill('9');
  await page.evaluate(() => changeLocale('ro-RO'));
  assert.match(await page.locator('#dormerResult').innerText(), /Folosește o lățime/);
  await page.evaluate(() => { editor.dialog.close(); planner.open(); });
  assert.equal(await page.locator('#sheetPlanTitle').innerText(), 'Plan de debitare a tablei');
  assert.match(await page.locator('.sheet-status').innerText(), /ape.*foi/);
  assert.match(await page.locator('.sheet-report-summary h2').innerText(), /Profil de 350 mm · Plan de debitare/);
  const count = await page.evaluate(() => planner.plan.totals.count);
  await page.locator('[name=offset]').fill('100');
  await page.evaluate(() => changeLocale('de-DE'));
  assert.ok(await page.locator('[data-sheet=csv]').isDisabled());
  assert.equal(await page.locator('[name=offset]').inputValue(), '100');
  assert.equal(await page.evaluate(() => planner.plan.totals.count), count);
  assert.match(await page.locator('.sheet-update-note').innerText(), /Einstellungen geändert/);
  await page.locator('.sheet-primary').click();
  assert.ok(await page.locator('[data-sheet=csv]').isEnabled());
  assert.match(await page.locator('.sheet-report-summary h2').innerText(), /Zuschnittplan/);
  assert.match(await page.locator('.sheet-diagram').first().getAttribute('aria-label'), /Abgewickelter Zuschnittplan/);
  assert.match(await page.locator('.sheet-diagram title').first().textContent(), /Bestelllänge/);
  assert.match(await page.locator('.sheet-stats article').nth(2).innerText(), /\d,\d/);
  for (const locale of LOCALES) {
    await page.evaluate(locale => changeLocale(locale), locale);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-sheet=csv]').click()]);
    const csv = await fs.readFile(await download.path(), 'utf8');
    assert.match(csv, EXPECT.csv[locale]);
    const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-slope-svg]').first().click()]);
    const svg = await fs.readFile(await svgDownload.path(), 'utf8');
    assert.match(svg, EXPECT.svg[locale]);
    await page.evaluate(() => {
      planner.print();
      window.printCalled = false;
      document.querySelector('iframe').contentWindow.print = () => { window.printCalled = true; };
    });
    await page.waitForFunction(() => window.printCalled);
    const printed = await page.locator('iframe').evaluate(frame => ({ lang: frame.contentDocument.documentElement.lang, text: frame.contentDocument.body.textContent }));
    assert.equal(printed.lang, locale);
    assert.match(printed.text, EXPECT.print[locale]);
    await page.evaluate(() => document.querySelector('iframe').remove());
  }
  // Switching while closed must translate on reopening, without resetting the roof.
  await page.evaluate(() => { planner.dialog.close(); changeLocale('de-DE'); editor.open(); });
  assert.equal(await page.locator('#layoutTitle').innerText(), 'Dach zeichnen');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('[data-action=apply]').isVisible());
  const overflow = await page.locator('.roof-layout-dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1);
  assert.equal(overflow, false);
  // Exercise the real shared-preference event and launch controls as well.
  await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', route => route.fulfill({
    path: require('node:path').join(process.env.ROOF_TEST_THREE, route.request().url().split('three@0.169.0/')[1]), contentType: 'text/javascript',
  }));
  // The guest region lookup resolves late and would reapply its default locale
  // over the synthetic preference events below.
  await page.route('**/api/region-defaults**', route => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:8080/roof-configurator/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ROOF_CONFIGURATOR_API && window.ROOF_SHELL_PREFERENCES);
  await page.waitForLoadState('networkidle');
  for (const locale of LOCALES) {
    await page.evaluate(locale => window.dispatchEvent(new CustomEvent('roof-preference-change', { detail: { preferences: { locale } } })), locale);
    assert.match(await page.locator('#sheetPlanOpenButton').textContent(), EXPECT.sheetButton[locale]);
    assert.equal(await page.locator('[data-roof-type=layout] span').innerText(), EXPECT.layoutCard[locale]);
    await page.locator('#editRoofLayout').click();
    assert.equal(await page.locator('#layoutTitle').innerText(), EXPECT.layoutTitle[locale]);
    await page.locator('.roof-layout-dialog [data-action=apply]').click();
    assert.equal(await page.locator('#headerEstimateTotal').innerText(), EXPECT.estimate[locale]);
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Feature i18n browser checks passed: RO/DE/ES/FR/IT/EN, live drafts, sliders, errors, stale plans, CSV/SVG/print, mobile.');
})().catch(error => { console.error(error); process.exit(1); });
