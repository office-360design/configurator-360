import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translator, SUPPORTED_LANGUAGES } from '../js/i18n.js';
import { debugCopy } from '../js/segmentationDebugCopy.js';

const LANGUAGES = ['en', 'ro', 'de', 'es', 'fr', 'it'];
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const tables = (path, names) => Function(`${read(path).replace(/^import .*$/gm, '').replace(/export /g, '')};return {${names}};`)();

test('Pavement translator covers every UI key in all six languages', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, LANGUAGES);
  const { keys, areaCopy, houseCopy, mapCopy, ...arrays } = tables('../js/i18n.js', 'keys,en,ro,de,es,fr,it,areaCopy,houseCopy,mapCopy');
  const all = [...keys, ...Object.keys(areaCopy.en), ...Object.keys(houseCopy.en), ...Object.keys(mapCopy.en)];
  for (const language of LANGUAGES) {
    assert.equal(arrays[language].length, keys.length, `${language} positional array`);
    for (const table of [areaCopy, houseCopy, mapCopy]) assert.deepEqual(Object.keys(table[language]).sort(), Object.keys(table.en).sort());
    for (const [i, key] of keys.entries()) assert.ok(arrays[language][i], `${language}/${key}`);
    for (const table of [areaCopy, houseCopy, mapCopy]) for (const key of Object.keys(table.en)) assert.ok(table[language][key], `${language}/${key}`);
    const t = translator(`${language}-XX`);
    for (const key of all) assert.equal(typeof t(key), 'string');
  }
  assert.equal(translator('es-ES')('title'), 'Diseñador de pavimentos');
  assert.equal(translator('fr-FR')('title'), 'Concepteur de pavage');
  assert.equal(translator('it-IT')('title'), 'Progettista di pavimentazioni');
});

test('Panel copy tables have identical keys in all six languages', () => {
  const shape = (value) => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value);
  for (const [path, name] of [['../js/analysisPanel.js', 'COPY'], ['../js/projectPanel.js', 'COPY'], ['../js/modelImportPanel.js', 'COPY'], ['../js/app.js', 'PHOTO_FLOW_COPY'], ['../js/app.js', 'AREA_EDITOR_COPY'], ['../js/app.js', 'SCALE_BADGE_COPY'], ['../js/app.js', 'SHARE_GEOMETRY_COPY']]) {
    const src = read(path), start = src.indexOf(`const ${name} = {`), end = src.indexOf('\n};', start);
    const table = Function(`return ${src.slice(src.indexOf('=', start) + 1, end + 3)}`)();
    assert.deepEqual(Object.keys(table), LANGUAGES, `${path} ${name} language order`);
    for (const language of LANGUAGES) assert.deepEqual(shape(table[language]), shape(table.en), `${name}/${language}`);
  }
  const en = debugCopy('en-US');
  for (const language of LANGUAGES.slice(1)) {
    const copy = debugCopy(`${language}-XX`);
    for (const key of Object.keys(en)) assert.ok(copy[key], `${language}/${key}`);
    assert.notEqual(copy.title === en.title && copy.help === en.help, true, `${language} debug copy is translated`);
  }
});
