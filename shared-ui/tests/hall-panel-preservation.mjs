/**
 * Compare the adopted Hall UI with its pre-extraction revision in Chromium.
 * Runs real HallUI, state, metrics and pricing with recorded scene callbacks.
 * No authentication, backend requests or WebGL scene are needed.
 *
 * npm install && npx playwright install chromium
 * node shared-ui/tests/hall-panel-preservation.mjs
 *
 * Optional: HALL_PANEL_BASELINE_DIR points to an unpacked baseline repository;
 * otherwise the baseline is read from Git. CHROMIUM_PATH selects a local browser.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baselineRef = 'c520a637b6b6dfe549ec0ba0b49e7dfb45b3fc3e';
const baselineDir = process.env.HALL_PANEL_BASELINE_DIR;
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

  // Mount HallUI explicitly below so the test never starts auth or the 3D scene.
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
    await page.goto(`${origin}/${version}/hall-configurator/index.html`);
    await page.evaluate(async (version) => {
      const base = `/${version}/hall-configurator/js`;
      const { HallUI } = await import(`${base}/ui.js`);
      const { state, deriveHallMetrics } = await import(`${base}/state.js?v=platform-18`);
      const { estimateHallPrice } = await import(`${base}/pricing.js?v=platform-18`);
      window.calls = [];
      window.hallState = structuredClone(state);
      window.ui = new HallUI(window.hallState, new Proxy({}, {
        get: (_, key) => (...args) => window.calls.push([key, args]),
      }), 'en-US');

      window.snapshot = () => ({
        state: window.hallState,
        calls: window.calls,
        metrics: deriveHallMetrics(window.hallState),
        price: estimateHallPrice(window.hallState),
        controls: [...document.querySelectorAll(
          'input, select, output, .accordion-section, .accordion-panel, .accordion-toggle',
        )].map((element) => ({
          id: element.id,
          value: element.value,
          checked: element.checked,
          hidden: element.hidden,
          expanded: element.getAttribute('aria-expanded'),
          className: element.className,
        })),
      });
    }, version);
    pages.push(page);
  }

  async function compareState(label) {
    assert.deepEqual(
      await pages[1].evaluate(() => window.snapshot()),
      await pages[0].evaluate(() => window.snapshot()),
      label,
    );
  }

  await compareState('Initial controls and state');
  const actions = await pages[0].evaluate(() => [
    ...[...document.querySelectorAll('.accordion-toggle')]
      .map((_, index) => ({ type: 'accordion', index })),
    ...[...document.querySelectorAll('[data-control] input')]
      .flatMap((_, index) => ['input', 'change', 'blur']
        .map((event) => ({ type: 'range', index, event }))),
    ...[...document.querySelectorAll('aside select')]
      .flatMap((element, index) => [...element.options]
        .map((option) => ({ type: 'select', index, value: option.value }))),
    ...[...document.querySelectorAll('input[type="checkbox"]')]
      .map((_, index) => ({ type: 'toggle', index })),
    ...[...document.querySelectorAll('.swatch')]
      .map((_, index) => ({ type: 'swatch', index })),
  ]);

  for (const action of actions) {
    for (const page of pages) {
      await page.evaluate((action) => {
        const { type, index, event, value } = action;
        if (type === 'accordion') {
          document.querySelectorAll('.accordion-toggle')[index].click();
        } else if (type === 'range') {
          const input = document.querySelectorAll('[data-control] input')[index];
          input.value = String((Number(input.min) + Number(input.max)) / 2);
          input.dispatchEvent(new Event(event, { bubbles: true }));
        } else if (type === 'select') {
          const select = document.querySelectorAll('aside select')[index];
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (type === 'toggle') {
          document.querySelectorAll('input[type="checkbox"]')[index].click();
        } else if (type === 'swatch') {
          document.querySelectorAll('.swatch')[index].click();
        }
      }, action);
    }
    await compareState(JSON.stringify(action));
  }

  // Native keyboard activation, dynamic bounds, empty and out-of-range numbers.
  for (const page of pages) {
    await page.locator('.accordion-toggle').first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
  }
  await compareState('Keyboard accordion activation');

  for (const value of ['999', '-99', '', '18.75']) {
    for (const page of pages) {
      await page.evaluate((value) => {
        const input = document.querySelector('[data-control="length"] input[type="number"]');
        input.max = '40';
        input.value = value;
        for (const event of ['input', 'change', 'blur']) {
          input.dispatchEvent(new Event(event, { bubbles: true }));
        }
      }, value);
    }
    await compareState(`Number limits: ${value}`);
  }

  for (const locale of ['ro-RO', 'de-DE', 'en-US']) {
    for (const page of pages) await page.evaluate((locale) => window.ui.setLocale(locale), locale);
    await compareState(`Locale: ${locale}`);
    assert.equal(
      await pages[1].locator('aside').innerText(),
      await pages[0].locator('aside').innerText(),
      `Translated panel: ${locale}`,
    );
  }
  console.log(`PASS: ${actions.length} interactions, keyboard, bounds and EN/RO/DE parity`);

  // Open every section to measure controls that normally start hidden.
  for (const page of pages) {
    await page.evaluate(() => {
      document.querySelectorAll('.accordion-section:not(.is-open) .accordion-toggle')
        .forEach((button) => button.click());
      document.activeElement?.blur();
    });
  }

  const viewports = [
    { width: 1440, height: 900 },
    { width: 800, height: 900 },
    { width: 390, height: 844 },
    { width: 740, height: 420 },
  ];
  for (const viewport of viewports) {
    for (const mode of ['light', 'body-dark', 'shell-dark']) {
      const snapshots = [];
      for (const page of pages) {
        await page.setViewportSize(viewport);
        await page.evaluate((mode) => {
          document.body.classList.toggle('shared-ui-dark-mode', mode === 'body-dark');
          document.querySelector('.app-shell').classList.toggle('is-dark-mode', mode === 'shell-dark');
        }, mode);
        await page.waitForTimeout(250);
        snapshots.push(await page.evaluate(() => [...document.querySelectorAll('body *')]
          .map((element) => {
            const style = getComputedStyle(element);
            return Object.fromEntries([...style]
              .filter((key) => !key.startsWith('--'))
              .map((key) => [key, style.getPropertyValue(key)]));
          })));
      }
      assert.deepEqual(snapshots[1], snapshots[0], `${viewport.width}×${viewport.height}, ${mode}`);
      console.log(`PASS: computed styles ${viewport.width}×${viewport.height}, ${mode}`);
    }
  }
  assert.deepEqual(errors, [], 'No browser exceptions');
} finally {
  await browser?.close();
  server.close();
}
