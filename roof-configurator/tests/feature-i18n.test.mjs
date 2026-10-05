import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featureText } from '../js/featureI18n.js';
import { sheetPlanCsv, planRoofSheets, sheetProfiles } from '../js/sheetPlanner.js';
import { defaultLayout } from '../js/roofLayout.js';

test('all static geometry validation errors have Romanian and German translations', () => {
  for (const file of ['roofLayout', 'roofFeatures', 'roofWindows', 'presetLayout', 'sheetPlanner', 'layoutEditor', 'roofWindowTool', 'sheetPlannerUI']) {
    const source = readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8');
    for (const [, message] of source.matchAll(/new Error\('([^']+)'\)/g)) {
      for (const locale of ['ro-RO', 'de-DE']) assert.notEqual(featureText(locale, message), message, `${locale}: ${message}`);
    }
  }
});
test('dynamic messages translate nested errors and preserve identifiers', () => {
  assert.equal(featureText('de-DE', 'Window W12 selected'), 'Fenster W12 ausgewählt');
  assert.equal(featureText('ro-RO', 'Surface AB (points 1, 2, 3)'), 'Suprafața AB (punctele 1, 2, 3)');
  assert.equal(featureText('de-DE', 'This alignment would make an invalid roof: Points must be at least 5 cm apart.'),
    'Diese Ausrichtung würde ein ungültiges Dach erzeugen: Punkte müssen mindestens 5 cm auseinanderliegen.');
  assert.equal(featureText('en-US', 'Window W12 selected'), 'Window W12 selected');
  assert.equal(featureText('de-DE', 'A-1.2'), 'A-1.2');
});
test('translated CSV keeps all piece rows and numerical totals unchanged', () => {
  const plan = planRoofSheets(defaultLayout(), sheetProfiles.antic);
  const english = sheetPlanCsv(plan).split('\r\n');
  for (const locale of ['ro-RO', 'de-DE']) {
    const rows = sheetPlanCsv(plan, text => featureText(locale, text)).split('\r\n');
    assert.notEqual(rows[0], english[0]);
    assert.deepEqual(rows.slice(1, 1 + plan.totals.count), english.slice(1, 1 + plan.totals.count));
    assert.deepEqual(rows.slice(-6).map(row => row.split(',').at(-1)), english.slice(-6).map(row => row.split(',').at(-1)));
  }
});
