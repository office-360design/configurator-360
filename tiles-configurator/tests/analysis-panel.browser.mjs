// Real DOM checks with a mocked analysis API; no uploads or model requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile(new URL('../js/analysisPanel.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath:process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div class="photo-flow-card"></div><aside class="sidebar"></aside>');
  await page.evaluate(async source => {
    const { mountAnalysisPanel } = await import('data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(source))));
    window.locale = 'en'; window.summary = null; window.calls=[];
    window.analysisStatus = { phase: 'idle', busy: false };
    window.ui = mountAnalysisPanel({
      getLocale: () => locale, getStep: () => 'analyze',
      api: {
        getPhotoSource: () => ({ photoId: 'test-photo' }),
        getAnalysisStatus: () => analysisStatus, getModelImportSummary: () => summary,
        getPavingState: () => ({areaRegions:[]}),
        runPhotoAnalysis: options => calls.push({action:'run',options}),
        restoreDetectedArea: options => calls.push({action:'restore',options}),
      },
    });
  }, source);
  assert.equal(await page.locator('input[value=pavement]').isChecked(), true);
  assert.equal(await page.locator('input[value=grass]').isChecked(), false);
  assert.equal(await page.locator('input[value=dirt]').isChecked(), false);
  const outside=page.locator('[data-analysis-outside]');
  assert.equal(await outside.isChecked(),true);
  await outside.uncheck();
  assert.equal(await page.evaluate(()=>calls.length),0);
  await page.locator('[data-analyze]').click();
  assert.deepEqual(await page.evaluate(()=>calls[0]),{action:'run',options:{replaceExisting:false,targets:['pavement'],includeOutsideGroundSupport:false}});
  await outside.check();
  await page.evaluate(()=>{analysisStatus.canRestore=true;ui.update();});
  await page.locator('[data-restore]').click();
  assert.deepEqual(await page.evaluate(()=>calls[1]),{action:'restore',options:{replaceExisting:false,targets:['pavement'],includeOutsideGroundSupport:true}});
  for(const language of ['ro','de','es','fr','it']) {
    await page.evaluate(language=>{locale=language;ui.update();},language);
    assert.notEqual(await page.locator('[data-analysis-outside-label]').textContent(),'Include pavement outside the estimated ground plane');
  }
  await page.evaluate(()=>{locale='en';ui.update();});
  const notice = page.locator('[data-analysis-corner-notice]');
  assert.equal(await notice.isVisible(), false);
  await page.evaluate(() => {
    summary = { diagnostics: { maxCornersPerBoundary: 20, boundariesOverCornerTarget: 1, extrapolatedPixels:100 } };
    analysisStatus = { phase: 'ready', busy: false, summary }; ui.update();
  });
  assert.equal(await notice.isVisible(), true);
  assert.match(await notice.textContent(), /more than 20 corners/);
  assert.equal(await page.locator('[data-analysis-outside-notice]').isVisible(),true);
  for (const [language, text] of [['ro', '20 colțuri'], ['de', '20 Ecken']]) {
    await page.evaluate(language => { locale = language; ui.update(); }, language);
    assert.ok((await notice.textContent()).includes(text));
  }
  await page.evaluate(() => { analysisStatus.busy = true; ui.update(); });
  assert.equal(await notice.isVisible(), false);
  assert.equal(await outside.isDisabled(),true);
  assert.equal(await page.locator('[data-analysis-outside-notice]').isVisible(),false);
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
  console.log('PASS: default targets and ground support option, run/restore choices, notices, six languages, busy/reset/reopened states, and no browser errors');
} finally {
  await browser.close();
}
