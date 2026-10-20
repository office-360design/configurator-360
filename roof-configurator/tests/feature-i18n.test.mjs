import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featureText, featureLocale, FEATURE_LOCALES } from '../js/featureI18n.js';
import { sheetPlanCsv, planRoofSheets, sheetProfiles } from '../js/sheetPlanner.js';
import { defaultLayout } from '../js/roofLayout.js';

test('all static geometry validation errors have Romanian, German, Spanish, French and Italian translations', () => {
  for (const file of ['perimeter', 'roofLayout', 'roofFeatures', 'roofWindows', 'presetLayout', 'sheetPlanner', 'layoutEditor', 'roofWindowTool', 'sheetPlannerUI']) {
    const source = readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8');
    for (const [, message] of source.matchAll(/new Error\('([^']+)'\)/g)) {
      for (const locale of ['ro-RO', 'de-DE', 'es-ES', 'fr-FR', 'it-IT']) assert.notEqual(featureText(locale, message), message, `${locale}: ${message}`);
    }
  }
});
test('dynamic messages translate nested errors and preserve identifiers', () => {
  assert.equal(featureText('de-DE', 'Window W12 selected'), 'Fenster W12 ausgewählt');
  assert.equal(featureText('ro-RO', 'Surface AB (points 1, 2, 3)'), 'Suprafața AB (punctele 1, 2, 3)');
  assert.equal(featureText('de-DE', 'This alignment would make an invalid roof: Points must be at least 5 cm apart.'),
    'Diese Ausrichtung würde ein ungültiges Dach erzeugen: Punkte müssen mindestens 5 cm auseinanderliegen.');
  assert.equal(featureText('es-ES', 'Window W12 selected'), 'Ventana W12 seleccionada');
  assert.equal(featureText('fr-FR', 'Window W12 selected'), 'Fenêtre W12 sélectionnée');
  assert.equal(featureText('it-IT', 'Window W12 selected'), 'Finestra W12 selezionata');
  assert.equal(featureText('es-ES', 'Surface AB (points 1, 2, 3)'), 'Superficie AB (puntos 1, 2, 3)');
  assert.equal(featureText('it-IT', 'This alignment would make an invalid roof: Points must be at least 5 cm apart.'),
    'Questo allineamento renderebbe il tetto non valido: I punti devono distare almeno 5 cm.');
  assert.equal(featureText('fr-FR', 'This alignment would make an invalid roof: Points must be at least 5 cm apart.'),
    'Cet alignement produirait une toiture non valide : Les points doivent être espacés d\'au moins 5 cm.');
  assert.equal(featureText('en-US', 'Window W12 selected'), 'Window W12 selected');
  assert.equal(featureText('de-DE', 'A-1.2'), 'A-1.2');
});
test('translated CSV keeps all piece rows and numerical totals unchanged', () => {
  const plan = planRoofSheets(defaultLayout(), sheetProfiles.antic);
  const english = sheetPlanCsv(plan).split('\r\n');
  for (const locale of ['ro-RO', 'de-DE', 'es-ES', 'fr-FR', 'it-IT']) {
    const rows = sheetPlanCsv(plan, text => featureText(locale, text)).split('\r\n');
    assert.notEqual(rows[0], english[0]);
    assert.deepEqual(rows.slice(1, 1 + plan.totals.count), english.slice(1, 1 + plan.totals.count));
    assert.deepEqual(rows.slice(-6).map(row => row.split(',').at(-1)), english.slice(-6).map(row => row.split(',').at(-1)));
  }
});
test('every feature row has a column for each of the six locales', () => {
  assert.deepEqual(FEATURE_LOCALES, ['en-US', 'ro-RO', 'de-DE', 'es-ES', 'fr-FR', 'it-IT']);
  for (const [input, expected] of [['es', 'es-ES'], ['fr-FR', 'fr-FR'], ['it_IT', 'it-IT'], ['de-AT', 'de-DE'], ['ro', 'ro-RO'], ['en-GB', 'en-US']]) {
    assert.equal(featureLocale(input), expected);
  }
  const source = readFileSync(new URL('../js/featureI18n.js', import.meta.url), 'utf8');
  const blocks = [...source.matchAll(/entries\(`\n([\s\S]*?)\n`\);/g)].map(match => match[1]);
  const rows = blocks.flatMap(block => block.split('\n'));
  assert.ok(rows.length > 500, `expected more than 500 rows, got ${rows.length}`);
  const placeholders = text => (text.match(/\{\d+\}/g) || []).sort().join();
  for (const row of rows) {
    const columns = row.split('|');
    assert.equal(columns.length, 6, row);
    for (const column of columns) {
      assert.ok(column.trim(), row);
      assert.equal(placeholders(column), placeholders(columns[0]), row);
    }
    for (const [index, locale] of FEATURE_LOCALES.entries()) {
      if (index) assert.equal(featureText(locale, columns[0]), columns[index], `${locale}: ${columns[0]}`);
    }
  }
});
