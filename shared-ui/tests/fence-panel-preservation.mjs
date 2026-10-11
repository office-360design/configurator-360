/**
 * Native Chromium before/after comparison for the Fence panel adoption.
 * Run: node shared-ui/tests/fence-panel-preservation.mjs
 * Requires root Playwright dependencies and its Chromium browser.
 * FENCE_PANEL_BASELINE_DIR may provide an unpacked pre-adoption repository.
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
const baselineRef = '5f8e75e50c5c512148c21a2ca5325a37ae344820';
const baselineDir = process.env.FENCE_PANEL_BASELINE_DIR;
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

  // Mount FenceUI explicitly below so the test never starts auth or the 3D scene.
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
    await page.goto(`${origin}/${version}/fence-configurator/index.html`);
    await page.evaluate(async (version) => {
      const base = `/${version}/fence-configurator/js`;
      const { FenceUI } = await import(`${base}/ui.js`);
      const { createFenceState, deriveFenceMetrics } = await import(`${base}/state.js?v=platform-18`);
      const { buildFenceBom, fenceBomCsv } = await import(`${base}/bom.js?v=platform-18`);
      // Gate IDs use time and randomness; keep those deterministic in the test.
      Date.now = () => 1700000000000;
      let seed = 0;
      Math.random = () => (++seed % 1000) / 1000;
      window.calls = [];
      window.ui = new FenceUI(createFenceState(), new Proxy({}, {
        get: (_, key) => (...args) => window.calls.push([key, args]),
      }), 'en-US');
      window.snapshot = () => ({
        state: ui.captureState(),
        calls: window.calls,
        metrics: deriveFenceMetrics(ui.state),
        bom: buildFenceBom(ui.state, { locale: ui.locale }),
        csv: fenceBomCsv(ui.state, { locale: ui.locale, currency: ui.currency }),
        text: document.querySelector('aside').textContent,
        controls: [...document.querySelectorAll('input, select, output, button, [data-accordion]')]
          .map((element) => ({
            id: element.id,
            value: element.value,
            min: element.min,
            max: element.max,
            step: element.step,
            checked: element.checked,
            disabled: element.disabled,
            hidden: element.hidden,
            expanded: element.getAttribute('aria-expanded'),
            pressed: element.getAttribute('aria-pressed'),
            className: element.className,
          })),
      });
    }, version);
    pages.push(page);
  }

  let checks = 0;
  async function compare(label) {
    assert.deepEqual(
      await pages[1].evaluate(() => window.snapshot()),
      await pages[0].evaluate(() => window.snapshot()),
      label,
    );
    checks++;
  }
  async function act(label, fn, value) {
    for (const page of pages) await page.evaluate(fn, value);
    await compare(label);
  }
  await compare('Initial state');

  for (let index = 0; index < 5; index++) {
    await act('Accordion opens', (index) => {
      document.querySelectorAll('.accordion-toggle')[index].click();
    }, index);
    await act('Accordion closes', (index) => {
      document.querySelectorAll('.accordion-toggle')[index].click();
    }, index);
  }
  for (const page of pages) {
    await page.locator('.accordion-toggle').first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
  }
  await compare('Keyboard accordions');

  for (const units of ['metric', 'imperial']) {
    await act('Unit preferences', (units) => ui.setPreferences({ units }), units);
    for (const layout of ['straight', 'l', 'u', 'closed', 'closed5']) {
      await act('Layout choice', (layout) => {
        document.querySelector(`[data-layout="${layout}"]`).click();
      }, layout);
      for (const style of ['vertical', 'horizontal', 'privacy', 'mesh']) {
        await act('Panel choice', (style) => {
          document.querySelector(`[data-panel-style="${style}"]`).click();
        }, style);
      }
      for (const key of ['runA', 'runB', 'runC', 'runD', 'angleB', 'height', 'targetBayWidth', 'infillGap']) {
        await act('Range input timing', (key) => {
          const input = document.querySelector(`[data-control="${key}"] input[type="range"]`);
          input.value = String((Number(input.min) + Number(input.max)) / 2);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, key);
        await act('Number input waits for change', (key) => {
          const input = document.querySelector(`[data-control="${key}"] input[type="number"]`);
          input.value = input.min;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, key);
        await act('Number change commits', (key) => {
          const input = document.querySelector(`[data-control="${key}"] input[type="number"]`);
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, key);
      }
    }
  }
  for (const value of ['999', '-99', '', '8.25']) {
    await act('Number bounds', (value) => {
      const input = document.querySelector('[data-control="runA"] input[type="number"]');
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }
  // Native Enter triggers blur/change on a focused edited number field.
  for (const page of pages) {
    await page.locator('[data-control="runA"] input[type="number"]').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
  }
  await compare('Number Enter commits');

  for (const finish of ['anthracite', 'black', 'white', 'bronze', 'wood']) {
    await act('Finish choice', (finish) => document.querySelector(`[data-finish="${finish}"]`).click(), finish);
  }
  for (const foundation of ['concrete', 'baseplate']) {
    await act('Foundation', (foundation) => {
      const select = document.querySelector('#foundationType');
      select.value = foundation;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, foundation);
  }
  await act('Scenery', () => document.querySelector('#sceneryToggle').click());

  await act('Gate setup', () => ui.restoreState({
    ...ui.captureState(), layout: 'closed5', runA: 20, runB: 10, runC: 10,
    runD: 10, height: 1.8, targetBayWidth: 2, gates: [],
  }));
  for (let index = 0; index < 3; index++) {
    await act('Add gate', () => document.querySelector('#addGateButton').click());
  }
  for (const [field, value] of [['handing', 'left'], ['runId', 'e'], ['type', 'driveway'], ['position', '1']]) {
    await act(`Gate ${field}`, ([field, value]) => {
      const input = document.querySelector(`[data-gate-field="${field}"]`);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, [field, value]);
  }
  await act('Gate slider preview', () => {
    const input = document.querySelector('[data-gate-field="position"]');
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act('Remove gate', () => document.querySelector('[data-gate-remove]').click());
  await act('Gate capacity setup', () => ui.restoreState({
    ...ui.captureState(), layout: 'straight', runA: 2, targetBayWidth: 2, gates: [],
  }));
  await act('Fill last bay', () => document.querySelector('#addGateButton').click());
  await act('Full capacity prevents addition', () => document.querySelector('#addGateButton').click());
  for (const locale of ['ro-RO', 'de-DE', 'en-US']) {
    for (const currency of ['EUR', 'RON', 'USD']) {
      await act('Language and currency', ({ locale, currency }) => {
        ui.setLocale(locale);
        ui.setPreferences({ currency });
      }, { locale, currency });
    }
  }
  await act('BOM opens', () => document.querySelector('#bomOpenButton').click());
  for (const page of pages) assert.equal(await page.locator('#bomPanel').evaluate((el) => el.open), true);
  await act('BOM closes', () => document.querySelector('#bomDoneButton').click());
  console.log(`PASS: ${checks} before/after behavior comparisons including metrics, BOM and CSV`);

  // Inspect the new layout with all controls exposed, in each supported language.
  const after = pages[1];
  await after.evaluate(() => {
    ui.restoreState({ ...ui.captureState(), layout: 'closed5', runA: 20, runB: 10, runC: 10, runD: 10 });
    document.querySelectorAll('.accordion-section:not(.is-open) .accordion-toggle')
      .forEach((button) => button.click());
    document.activeElement?.blur();
  });
  for (const viewport of [
    { width: 1440, height: 900 }, { width: 800, height: 900 },
    { width: 390, height: 844 }, { width: 360, height: 740 },
    { width: 740, height: 420 },
  ]) {
    await after.setViewportSize(viewport);
    for (const dark of [false, true]) {
      for (const locale of ['en-US', 'ro-RO', 'de-DE']) {
        await after.evaluate(({ dark, locale }) => {
          document.body.classList.toggle('shared-ui-dark-mode', dark);
          ui.setLocale(locale);
        }, { dark, locale });
        const overflow = await after.evaluate(() => {
          const panel = document.querySelector('aside');
          return panel.scrollWidth > panel.clientWidth + 1;
        });
        assert.equal(overflow, false, `Panel overflow at ${viewport.width}, ${locale}, dark=${dark}`);
        const hiddenRun = await after.locator('#runDControl').evaluate((el) => getComputedStyle(el).display);
        assert.notEqual(hiddenRun, 'none', 'Fifth-side control remains visible');
        const gateLayout = await after.evaluate(() => {
          const row = document.querySelector('.gate-card .range-row--single');
          const slider = row.querySelector('input');
          const handing = document.querySelector('[data-gate-field="handing"]');
          return {
            fullWidth: slider.getBoundingClientRect().width >= row.clientWidth - 5,
            labelClear: handing.previousElementSibling.getBoundingClientRect().bottom
              <= handing.getBoundingClientRect().top,
          };
        });
        assert.deepEqual(gateLayout, { fullWidth: true, labelClear: true });
      }
    }
    console.log(`PASS: layout ${viewport.width}×${viewport.height}, light/dark, EN/RO/DE`);
  }
  assert.deepEqual(errors, [], 'No browser exceptions');
} finally {
  await browser?.close();
  server.close();
}
