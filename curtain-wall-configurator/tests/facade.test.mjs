import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_STATE, LIMITS, PRESETS, normalizeState } from '../js/facade.js';
import { MESSAGES, resolveLocale } from '../js/i18n.js';

test('state is normalised to the grid limits', () => {
  const S = normalizeState({ widths: [100, 9000], heights: [], rowTypes: ['x'], windLoad: 9, anchorSpacing: 1, qty: 0, glassTint: 'pink' });
  assert.deepEqual(S.widths, [LIMITS.width[0], LIMITS.width[1]]);
  assert.deepEqual(S.heights, DEFAULT_STATE.heights);
  assert.deepEqual(S.rowTypes, ['vision', 'vision', 'vision', 'vision']);
  assert.equal(S.windLoad, 3);
  assert.equal(S.anchorSpacing, LIMITS.anchorSpacing[0]);
  assert.equal(S.qty, 1);
  assert.equal(S.glassTint, DEFAULT_STATE.glassTint);
});

test('saved GUTMANN GCW 050 states load as Cortizo states', () => {
  const S = normalizeState({ version: 1, brand: 'gutmann', mullion: '150135', glazing: 'dgu-32', strip: '159301', widths: [1500, 1500] });
  for (const key of ['brand', 'mullion', 'glazing', 'strip']) assert.ok(!(key in S), key);
  assert.equal(S.version, 2);
  assert.deepEqual(S.widths, [1500, 1500]);
});

test('presets fit the limits', () => {
  for (const preset of Object.values(PRESETS)) {
    const S = normalizeState(preset);
    assert.deepEqual(S.widths, preset.widths);
    assert.deepEqual(S.heights, preset.heights);
  }
});

test('translations exist in every locale for every key used', () => {
  const sources = ['../js/app.js', '../js/cortizoUi.js', '../js/drawings.js', '../index.html'].map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const used = new Set([...sources.matchAll(/['"`]((?:cz|system|building|layer|tab|bom|unit|totals|perf|node|drawing|grid|profiles|glazing|tint|finish|order|section|preset|stage|toggle|explode)\.[\w.]+)['"`]/g)].map(m => m[1]).filter(k => !k.endsWith('.')));
  for (const locale of Object.keys(MESSAGES)) {
    for (const key of used) assert.ok(key in MESSAGES[locale], `${locale} lacks ${key}`);
    assert.deepEqual(Object.keys(MESSAGES[locale]).sort(), Object.keys(MESSAGES['ro-RO']).sort(), `${locale} key parity`);
  }
});

test('every locale has the same placeholders as English', () => {
  assert.deepEqual(Object.keys(MESSAGES), ['en-US', 'ro-RO', 'de-DE', 'es-ES', 'fr-FR', 'it-IT']);
  const vars = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const [locale, table] of Object.entries(MESSAGES)) {
    for (const [key, text] of Object.entries(MESSAGES['en-US'])) assert.deepEqual(vars(table[key]), vars(text), `${locale} ${key}`);
  }
});

test('resolveLocale recognises short and full codes', () => {
  for (const [input, expected] of [['en', 'en-US'], ['ro-RO', 'ro-RO'], ['de', 'de-DE'], ['es', 'es-ES'], ['es-ES', 'es-ES'], ['fr', 'fr-FR'], ['fr-FR', 'fr-FR'], ['it', 'it-IT'], ['it-IT', 'it-IT']]) {
    assert.equal(resolveLocale(input), expected);
  }
});
