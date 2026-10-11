/**
 * Native Chromium before/after comparison for the Solar panel adoption.
 * Run: node shared-ui/tests/solar-panel-preservation.mjs
 * Requires root Playwright dependencies and its Chromium browser.
 * SOLAR_PANEL_BASELINE_DIR may provide an unpacked pre-adoption repository.
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
const baselineRef = 'e0df080b429140a8fc92248cd13bc7a3a706b5d0';
const baselineDir = process.env.SOLAR_PANEL_BASELINE_DIR;
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

  // Mount SolarUI explicitly below so the test never starts auth or the 3D scene.
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const pages = [];
  const errors = [];
  for (const version of ['before', 'after']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://**', route => route.abort());
    await page.goto(`${origin}/${version}/solar-configurator/index.html`);
    await page.evaluate(async (version) => {
      document.body.classList.add('shared-ui-mounted');
      const base = `/${version}/solar-configurator/js`;
      const { SolarUI } = await import(`${base}/ui.js`);
      const { state } = await import(`${base}/state.js?v=platform-18`);
      const { estimateToCsv } = await import(`${base}/estimate.js?v=platform-18`);
      window.calls = []; window.locationRequests = 0;
      window.addEventListener('solar-open-location-picker', () => window.locationRequests++);
      window.metrics = { footprint: 70, roofArea: 85, placedPanels: 12, systemKwp: 5.7, selectedSurfaces: [] };
      window.ui = new SolarUI({ ...structuredClone(state), simulationDate: '2026-06-21' }, options => {
        window.calls.push(options);
        ui.updateMetrics(metrics);
      });
      ui.updateMetrics(metrics);
      window.SOLAR_CONFIGURATOR_API = { captureState: () => ui.state };
      await import(`${base}/sidebarAccordion.js`);
      window.snapshot = () => ({
        state: ui.state, calls, locationRequests,
        estimate: ui.currentEstimate, simulation: ui.currentSimulation,
        csv: estimateToCsv(ui.currentEstimate, ui.state.locale),
        controls: [...document.querySelectorAll('.sidebar input, .sidebar select, .sidebar output, .sidebar button')].map(el => ({
          id: el.id, value: el.value, min: el.min, max: el.max, step: el.step,
          checked: el.checked, disabled: el.disabled, hidden: el.hidden, pressed: el.getAttribute('aria-pressed'),
        })),
        steps: [...document.querySelectorAll('.solar-config-step')].map(el => ({
          open: el.querySelector('.solar-step-toggle').getAttribute('aria-expanded'),
          hidden: el.querySelector('.solar-step-body').getAttribute('aria-hidden'),
          inert: el.querySelector('.solar-step-body').inert,
          summary: el.querySelector('.solar-step-summary').textContent,
        })),
        manualHidden: document.querySelector('#batteryManualControls').hidden,
      });
    }, version);
    pages.push(page);
  }
  let checks = 0;
  const compare = async (label) => {
    await Promise.all(pages.map(p => p.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))));
    assert.deepEqual(await pages[1].evaluate(() => snapshot()), await pages[0].evaluate(() => snapshot()), label);
    checks++;
  };
  const both = async (action, label) => { for (const page of pages) await action(page); await compare(label); };
  const open = async id => both(p => p.locator(`[data-solar-step="${id}"] .solar-step-toggle`).click(), `open ${id}`);
  const click = async selector => both(p => p.locator(selector).click(), selector);
  const value = async (selector, next, event = 'input') => both(p => p.locator(selector).evaluate((el, { next, event }) => {
    el.value = String(next); el.dispatchEvent(new Event(event, { bubbles: true }));
  }, { next, event }), `${selector} ${next} ${event}`);
  await compare('initial');
  for (const type of ['hip', 'shed', 'gable']) await click(`[data-roof-type="${type}"]`);
  for (const key of ['length', 'depth', 'pitch']) {
    for (const n of [-10, 12, 999]) await value(`[data-control="${key}"] input[type=number]`, n, 'change');
    await value(`[data-control="${key}"] input[type=range]`, 8);
  }
  await open('pv');
  for (const preset of ['compact450', 'premium490', 'standard475']) await both(p => p.selectOption('#modulePresetSelect', preset), preset);
  for (const side of ['front', 'back', 'both', 'best']) await click(`[data-roof-side="${side}"]`);
  for (const layout of ['2x3', '3x3', '5x5', '4x3']) await click(`[data-layout-preset="${layout}"]`);
  for (const orientation of ['landscape', 'portrait']) await click(`[data-module-orientation="${orientation}"]`);
  for (const id of ['panelCount', 'panelColumns']) for (const n of [-5, 7, 999]) await value(`#${id}Input`, n, 'change');
  await click('[data-roof-side="both"]'); await open('roof'); await click('[data-roof-type="shed"]');
  assert.equal(await pages[1].locator('[data-roof-side="both"]').isDisabled(), true);
  await open('energy');
  for (const key of ['single', 'three']) await click(`[data-grid-connection="${key}"]`);
  for (const key of ['dobrogea','muntenia','moldova','transylvania','northwest']) await click(`[data-region="${key}"]`);
  for (const key of ['away','partial','always','optimized']) await click(`[data-consumption-profile="${key}"]`);
  await value('#monthlyBillInput', 780); await value('#energyTariffInput', 1.8);
  await click('#exactLocationButton');
  await both(p => p.evaluate(() => {
    Object.assign(ui.state, { locationMode: 'exact', locationLabel: 'Test location', latitude: 44.4, longitude: 26.1 });
    ui.updateMetrics(metrics); window.dispatchEvent(new Event('solar-tools-state-change'));
  }), 'exact location summary');
  await open('storage');
  await click('label:has(#batteryAutoToggle)');
  await value('#batteryCapacityRange', 12); await value('#batteryCapacityInput', 99, 'change');
  await click('label:has(#batteryEnabledToggle)'); await click('label:has(#batteryEnabledToggle)');
  await click('label:has(#batteryAutoToggle)');
  await click('.advanced-pricing summary');
  for (const id of ['mountingPrice','installationPrice','paperworkPrice','batteryPrice','vatRate']) await value(`#${id}Input`, 30);
  await value('#vatRateInput', 99);
  for (const page of pages) {
    const toggles = page.locator('.solar-step-toggle');
    await toggles.nth(3).focus(); await page.keyboard.press('Home');
    assert.equal(await toggles.nth(0).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await toggles.nth(3).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.keyboard.press('End'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('360-configurator:solar:sidebar-step')), 'storage');
    assert.equal(await page.locator('.solar-step-toggle[aria-expanded="true"]').count(), 1);
  }
  await compare('keyboard');
  // Translation runs in place, including the new introductory copy.
  for (const locale of ['ro-RO', 'de-DE', 'en-US']) {
    await both(p => p.evaluate(locale => { window.SOLAR_SHELL_PREFERENCES = { locale }; ui.setPreferences(); }, locale), locale);
  }
  const after = pages[1];
  for (const width of [1280, 390, 320]) {
    await after.setViewportSize({ width, height: 900 });
    for (const dark of [false, true]) {
      await after.evaluate(dark => document.body.classList.toggle('shared-ui-dark-mode', dark), dark);
      for (const id of ['roof', 'pv', 'energy', 'storage']) {
        await after.locator(`[data-solar-step="${id}"] .solar-step-toggle`).click();
        await after.waitForTimeout(350);
        const overflow = await after.locator('.sidebar').evaluate(el => el.scrollWidth > el.clientWidth + 1);
        assert.equal(overflow, false, `${width} ${dark} ${id} overflow`);
      }
    }
  }
  if (process.env.SOLAR_SCREENSHOT) await after.screenshot({ path: process.env.SOLAR_SCREENSHOT });
  for (const wrapped of [false, true]) {
    await after.reload();
    await after.evaluate(async wrapped => {
      sessionStorage.setItem('360-configurator:solar:sidebar-step', 'energy');
      if (wrapped) {
        const sidebar = document.querySelector('.sidebar');
        const body = document.createElement('div');
        body.className = 'shared-configurator-panel__body';
        while (sidebar.firstChild) body.append(sidebar.firstChild);
        sidebar.append(body);
      }
      await import('/after/solar-configurator/js/sidebarAccordion.js');
    }, wrapped);
    assert.equal(await after.locator('.solar-config-step').count(), 4);
    assert.equal(await after.locator('[data-solar-step="energy"] .solar-step-toggle').getAttribute('aria-expanded'), 'true');
    await after.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await after.locator('.accordion-reveal').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS Solar: ${checks} before/after state, callback, estimate, simulation and control comparisons; keyboard and responsive checks.`);
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
