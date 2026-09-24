/**
 * Native Chromium before/after comparison for the Roof panel adoption.
 * Run: node shared-ui/tests/roof-panel-preservation.mjs
 * Requires root Playwright dependencies and its Chromium browser.
 * ROOF_PANEL_BASELINE_DIR may provide an unpacked pre-adoption repository.
 * CHROMIUM_PATH may select an installed browser.
 * Scene callbacks are recorded; WebGL and backend services are not started.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baselineRef = '4e1a47086aea7cafb448c156c97fbc724147a704';
const baselineDir = process.env.ROOF_PANEL_BASELINE_DIR;
const fileCache = new Map();

function readFixture(version, path) {
  const key = `${version}/${path}`;
  if (fileCache.has(key)) return fileCache.get(key);

  let content = version === 'before' && !baselineDir
    ? execFileSync('git', ['show', `${baselineRef}:${path}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    : readFileSync(resolve(version === 'before' ? baselineDir : root, path), 'utf8');

  // Mount RoofUI explicitly below so the test never starts auth or the 3D scene.
  if (path.endsWith('.html')) {
    content = content.replace(/<script\b[\s\S]*?<\/script>/g, '');
  }
  fileCache.set(key, content);
  return content;
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const [, version, ...segments] = url.pathname.split('/');
    const path = segments.join('/');
    if (!['before', 'after'].includes(version) || path.includes('..')) {
      response.writeHead(404).end();
      return;
    }
    const content = readFixture(version, path);
    const type = path.endsWith('.css') ? 'text/css'
      : path.endsWith('.js') ? 'text/javascript' : 'text/html';
    response.setHeader('Content-Type', type);
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const pages = [];
  const errors = [];
  for (const version of ['before', 'after']) {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/${version}/roof-configurator/index.html`);
    await page.evaluate(async (version) => {
      document.body.classList.add('shared-ui-mounted', 'roof-sidebar-ready');
      const base = `/${version}/roof-configurator/js`;
      const { RoofUI } = await import(`${base}/ui.js`);
      const { state } = await import(`${base}/state.js?v=platform-18`);
      const { bomToCsv } = await import(`${base}/bom.js?v=platform-18`);
      window.calls = [];
      // Fixed model metrics isolate the UI/BOM contract from WebGL geometry.
      window.metrics = { footprint: 70, roofArea: 85, ridgeElevation: 5, approximate: false };
      window.ui = new RoofUI(structuredClone(state), (options) => {
        window.calls.push(options);
        ui.updateMetrics(window.metrics);
      });
      ui.setPreferences();
      ui.applyStateToControls();
      ui.updateMetrics(window.metrics);
      window.snapshot = () => ({
        state: ui.state,
        calls: window.calls,
        bom: ui.currentBom,
        csv: bomToCsv(ui.currentBom, ui.state.locale),
        controls: [...document.querySelectorAll('input, select, output, [data-roof-type], .swatch')]
          .map((el) => ({
            id: el.id, value: el.value, min: el.min, max: el.max, step: el.step,
            checked: el.checked, disabled: el.disabled,
            pressed: el.getAttribute('aria-pressed'), selected: el.classList.contains('selected'),
            label: el.getAttribute('aria-label'),
          })),
        custom: ['customPlanPanel', 'customViewerNotice', 'customPlanFile', 'customPlanDropzone']
          .map((id) => document.getElementById(id).hidden),
        text: ['viewerTitle', 'pitchRuleNote', 'customPlanFileName', 'customPlanFileMeta', 'headerEstimateTotal']
          .map((id) => document.getElementById(id).textContent),
      });
    }, version);
    pages.push(page);
  }
  let checks = 0;
  async function compare(label) {
    assert.deepEqual(await pages[1].evaluate(() => snapshot()), await pages[0].evaluate(() => snapshot()), label);
    checks++;
  }
  async function act(label, fn, value) {
    for (const page of pages) await page.evaluate(fn, value);
    await compare(label);
  }
  await compare('Initial state');
  for (const units of ['metric', 'imperial']) {
    await act('Units', (units) => { ui.state.units = units; ui.setPreferences(); }, units);
    for (const type of ['gable', 'hip', 'shed', 'lshape', 'dormer', 'custom']) {
      await act('Roof type', (type) => document.querySelector(`[data-roof-type="${type}"]`).click(), type);
    }
    for (const key of ['length', 'depth', 'wallHeight', 'pitch', 'overhang']) {
      await act('Slider input', (key) => {
        const el = document.querySelector(`[data-control="${key}"] input[type="range"]`);
        el.value = String((Number(el.min) + Number(el.max)) / 2);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, key);
      for (const value of ['', '99999', '-5', '12.5']) {
        for (const event of ['input', 'change', 'blur']) {
          await act('Number timing and limits', ({ key, value, event }) => {
            const el = document.querySelector(`[data-control="${key}"] input[type="number"]`);
            el.value = value;
            el.dispatchEvent(new Event(event, { bubbles: true }));
          }, { key, value, event });
        }
      }
    }
  }
  for (const covering of ['generic', 'roca', 'teclado']) {
    await act('Covering pitch minimum', (covering) => {
      ui.state.pitch = 5;
      const select = document.querySelector('#coveringSelect');
      select.value = covering;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, covering);
  }
  for (let index = 0; index < 5; index++) {
    await act('Color', (index) => document.querySelectorAll('.swatch')[index].click(), index);
  }
  await act('Technical edges', () => document.querySelector('#wireframeToggle').click());
  for (const page of pages) {
    await page.locator('#customPlanInput').setInputFiles({
      name: 'roof-plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test plan'),
    });
    // Playwright's synthetic file timestamp differs between pages.
    await page.evaluate(() => { ui.state.customPlan.lastModified = 1700000000000; });
  }
  await compare('Custom plan upload');
  await act('Remove custom plan', () => document.querySelector('#customPlanRemove').click());
  await act('Drop custom plan', () => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['plan'], 'drawing.dxf', { type: 'image/vnd.dxf', lastModified: 1700000000000 }));
    document.querySelector('#customPlanDropzone').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
  });
  await act('Return to generated roof', () => document.querySelector('[data-roof-type="gable"]').click());
  for (const locale of ['en-US', 'ro-RO', 'de-DE']) {
    for (const currency of ['RON', 'EUR', 'USD']) {
      await act('Language and currency', ({ locale, currency }) => {
        ui.state.locale = locale; ui.state.currency = currency; ui.setPreferences();
      }, { locale, currency });
    }
  }
  await act('Exclude BOM', () => document.querySelector('#bomExcludeAll').click());
  await act('Include BOM', () => document.querySelector('#bomIncludeAll').click());
  await act('Toggle BOM line', () => document.querySelector('[data-bom-line-toggle]').click());
  await act('Restore controls', () => { ui.state.roofType = 'hip'; ui.applyStateToControls(); });
  console.log(`PASS: ${checks} before/after behavior comparisons, including units, pitch limits, upload and BOM`);

  const after = pages[1];
  const modelBeforeAccordions = await after.evaluate(() => ({ state: ui.state, calls }));
  for (const section of ['type', 'dimensions', 'covering']) {
    const button = after.locator(`[data-accordion="${section}"] .accordion-toggle`);
    await button.focus();
    const expanded = await button.getAttribute('aria-expanded');
    await after.keyboard.press('Enter');
    assert.notEqual(await button.getAttribute('aria-expanded'), expanded);
    await after.keyboard.press('Space');
    assert.equal(await button.getAttribute('aria-expanded'), expanded);
  }
  assert.deepEqual(await after.evaluate(() => ({ state: ui.state, calls })), modelBeforeAccordions);
  await after.evaluate(() => {
    document.querySelectorAll('.accordion-section:not(.is-open) .accordion-toggle').forEach((el) => el.click());
  });
  for (const viewport of [
    { width: 1440, height: 950 }, { width: 800, height: 900 },
    { width: 390, height: 844 }, { width: 360, height: 740 }, { width: 740, height: 420 },
  ]) {
    await after.setViewportSize(viewport);
    for (const locale of ['en-US', 'ro-RO', 'de-DE']) {
      for (const dark of [false, true]) {
        await after.evaluate(({ locale, dark }) => {
          document.body.classList.toggle('shared-ui-dark-mode', dark);
          ui.state.locale = locale; ui.setPreferences();
        }, { locale, dark });
        const result = await after.evaluate(() => ({
          overflow: document.querySelector('aside').scrollWidth > document.querySelector('aside').clientWidth + 1,
          headings: [...document.querySelectorAll('.accordion-toggle > span')].map((el) => el.textContent),
          title: document.querySelector('#roofPanelTitle').textContent,
          panels: [...document.querySelectorAll('.accordion-panel')].map((el) => getComputedStyle(el).display),
        }));
        assert.equal(result.overflow, false, `${viewport.width}, ${locale}, dark=${dark}`);
        assert(result.panels.every((display) => display !== 'none'));
        const labels = {
          'en-US': ['Roof type', 'Dimensions', 'Covering'],
          'ro-RO': ['Tip acoperiș', 'Dimensiuni', 'Învelitoare'],
          'de-DE': ['Dachform', 'Abmessungen', 'Dacheindeckung'],
        };
        assert.deepEqual(result.headings, labels[locale]);
        assert.equal(result.title, { 'en-US': 'Roof settings', 'ro-RO': 'Setări acoperiș', 'de-DE': 'Dacheinstellungen' }[locale]);
      }
    }
    console.log(`PASS: ${viewport.width}×${viewport.height}, light/dark, EN/RO/DE`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.close();
}
