// Real DOM checks with a mocked analysis API; no uploads or model requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile(new URL('../js/analysisPanel.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div class="photo-flow-card"></div><aside class="sidebar"></aside>');
  await page.evaluate(async source => {
    const { mountAnalysisPanel } = await import('data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(source))));
    window.locale = 'en'; window.summary = null;
    window.analysisStatus = { phase: 'idle', busy: false };
    window.ui = mountAnalysisPanel({
      getLocale: () => locale, getStep: () => 'analyze',
      api: {
        getPhotoSource: () => ({ photoId: 'test-photo' }),
        getAnalysisStatus: () => analysisStatus, getModelImportSummary: () => summary,
      },
    });
  }, source);
  assert.equal(await page.locator('input[value=pavement]').isChecked(), true);
  assert.equal(await page.locator('input[value=grass]').isChecked(), false);
  assert.equal(await page.locator('input[value=dirt]').isChecked(), false);
  const notice = page.locator('[data-analysis-corner-notice]');
  assert.equal(await notice.isVisible(), false);
  await page.evaluate(() => {
    summary = { diagnostics: { maxCornersPerBoundary: 20, boundariesOverCornerTarget: 1 } };
    analysisStatus = { phase: 'ready', busy: false, summary }; ui.update();
  });
  assert.equal(await notice.isVisible(), true);
  assert.match(await notice.textContent(), /more than 20 corners/);
  for (const [language, text] of [['ro', '20 colțuri'], ['de', '20 Ecken']]) {
    await page.evaluate(language => { locale = language; ui.update(); }, language);
    assert.ok((await notice.textContent()).includes(text));
  }
  await page.evaluate(() => { analysisStatus.busy = true; ui.update(); });
  assert.equal(await notice.isVisible(), false);
  await page.evaluate(() => { summary = null; analysisStatus = { phase: 'idle', busy: false }; ui.update(); });
  assert.equal(await notice.isVisible(), false);
  await page.evaluate(() => {
    // A restored project's active summary must also show the notice.
    summary = { diagnostics: { maxCornersPerBoundary: 12, boundariesOverCornerTarget: 1 } };
    locale = 'en'; ui.update();
  });
  assert.equal(await notice.isVisible(), true);
  assert.match(await notice.textContent(), /more than 12 corners/);
  await page.evaluate(() => { summary.diagnostics.boundariesOverCornerTarget = 0; ui.update(); });
  assert.equal(await notice.isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: default targets, extra-corner notice, translations, busy/reset/reopened states, and no browser errors');
} finally {
  await browser.close();
}
