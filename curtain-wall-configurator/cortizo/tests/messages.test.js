// Mesajele motorului în cele șase limbi: aceleași chei, aceiași parametri, toate textele din reguli
// traduse, și niciun mesaj al motorului fără text în vreo limbă (pe exemple normale și pe cazuri limită).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createEngine } from '../src/engine.js';
import { loadData } from '../src/load-node.js';
import { MESSAGES, MESSAGE_LOCALES, DATA_TEXT } from '../src/messages.js';
import { formatMessage, dataText, messageLocale } from '../src/format.js';
import { EXAMPLES } from './examples.js';

const data = loadData();
const engine = createEngine(data);
const placeholders = (s) => [...s.matchAll(/\{(\w+)[^}]*\}/g)].map((m) => m[1]).sort().join(',');

test('fiecare limbă are aceleași chei și aceiași parametri ca engleza', () => {
  const en = MESSAGES['en-US'];
  for (const locale of MESSAGE_LOCALES) {
    const table = MESSAGES[locale];
    assert.deepEqual(Object.keys(table).sort(), Object.keys(en).sort(), locale);
    for (const [key, text] of Object.entries(table)) {
      assert.ok(text.trim(), `${locale} ${key} e gol`);
      assert.equal(placeholders(text), placeholders(en[key]), `${locale} ${key}`);
    }
  }
});

test('toate cheile folosite în motor și în configurator există', () => {
  const sources = ['src/engine.js', ...readdirSync(new URL('../src/core/', import.meta.url)).map((f) => `src/core/${f}`), '../js/cortizo.js']
    .map((p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')).join('\n');
  const keys = new Set([...sources.matchAll(/(?:M|m)\('([a-z]+\.[a-zA-Z.]+)'/g), ...sources.matchAll(/key: '([a-z]+\.[a-zA-Z.]+)'/g), ...sources.matchAll(/'((?:check|field|note|bom|support)\.[a-zA-Z.]+)'/g)].map((m) => m[1]));
  for (const id of ['slope', 'mullion', 'transom', 'joint', 'fields', 'clipPitch', 'anchors', 'cutting']) keys.add(`check.${id}`);
  for (const key of keys) assert.ok(key in MESSAGES['en-US'], `lipsește ${key}`);
});

test('textele din reguli care ajung pe ecran sunt traduse în toate limbile', () => {
  const shown = new Set();
  for (const [name, R] of Object.entries(data.rules)) {
    if (R.principle) shown.add(R.principle);
    (R.caps || []).forEach((c) => c.label && shown.add(c.label));
    (R.glass_frame?.cleats || []).forEach((c) => shown.add(c.option));
    (R.glazing_variants || []).forEach((v) => shown.add(v.variant));
    Object.values(R).forEach((v) => (v?.profiles || []).forEach?.((p) => p?.role && shown.add(p.role)));
    if (name === 'common') R.mullion_transom_joints.forEach((j) => shown.add(j.label));
  }
  Object.keys(EXAMPLES).forEach((id) => engine.options(id).forEach((o) => shown.add(o.variant)));
  for (const text of shown) {
    assert.ok(DATA_TEXT[text], `lipsește traducerea pentru „${text}”`);
    for (const locale of MESSAGE_LOCALES) assert.ok(DATA_TEXT[text][locale]?.trim(), `${locale}: „${text}”`);
  }
});

// Toate mesajele unui rezultat, ca să fie compuse în fiecare limbă.
function messagesOf(R) {
  return [
    ...R.checks.flatMap((c) => [c.title, c.text]), ...R.notes,
    ...R.fields.flatMap((f) => [f.label, ...f.notes, f.supports?.label].filter(Boolean)),
    ...R.cuts.flatMap((c) => c.notes), ...R.accessories.flatMap((a) => [a.desc, ...a.rules]),
  ];
}

const projects = () => {
  const out = [];
  for (const [id, base] of Object.entries(EXAMPLES)) {
    for (const option of engine.options(id)) {
      const fields = [{ row: 0, col: 0, type: 'window' }, { row: 1, col: 2, type: 'panel' }];
      out.push({ ...base, glass: { ...base.glass, variant: option.variant }, fields });
      // cazuri limită: vânt mare, module late, geam gros și greu, ancoraje rare, pantă în afara intervalului
      out.push({ ...base, grid: { widths: [4200, 900], heights: [3800, 600], anchorSpacing: 9000 }, loads: { ...base.loads, windKPa: 3.2, slopeDeg: id === 'SKY' ? 55 : undefined }, glass: { ...base.glass, variant: option.variant, totalMm: 60, panesMm: 40, chamberMm: 24 }, fields, options: { ...base.options, allowReinforcement: true, clipFix: 'ensamblare', skyTransomJoint: 'inclined_cover' } });
    }
  }
  return out;
};

test('fiecare mesaj al motorului se compune în fiecare limbă, fără chei sau parametri lipsă', () => {
  let count = 0;
  for (const project of projects()) {
    const R = engine.compute(project);
    // Șirurile simple sunt descrieri din catalog (desc_en), nu mesaje ale motorului.
    for (const message of messagesOf(R).filter((m) => typeof m !== 'string')) {
      for (const locale of MESSAGE_LOCALES) {
        const text = formatMessage(locale, message);
        assert.ok(text && !/\{\w+/.test(text), `${locale} ${project.system}: ${JSON.stringify(message)} → ${text}`);
        if (message && typeof message === 'object' && 'key' in message) assert.ok(message.key in MESSAGES[locale], message.key);
        count++;
      }
    }
  }
  assert.ok(count > 1000, `doar ${count} mesaje verificate`);
});

test('numerele urmează limba, iar paginile nu primesc separator de mii', () => {
  const m = { key: 'check.mullion.ok', params: { code: 'COR-9803', depth: 105, ix: 180.34, need: 176.5, reserve: 2.2 } };
  assert.match(formatMessage('ro-RO', m), /Ix 180,3 cm⁴ ≥ 176,5 cm⁴/);
  assert.match(formatMessage('en-US', m), /Ix 180\.3 cm⁴ ≥ 176\.5 cm⁴/);
  assert.match(formatMessage('de-DE', { key: 'bom.collar', params: { page: 1029 } }), /S\. 1029\)/);
  assert.equal(formatMessage('es-ES', { key: 'check.anchors.summary', params: { spans: 2, axes: [{ key: 'check.anchors.axis', params: { axis: 1, n: 2, ref: '999183' } }, { key: 'check.anchors.axisOver', params: { axis: 2, max: 3 } }] } }), '2 vano(s) por montante · M1: 2 × 999183 · M2: más de 3 anclajes');
  assert.equal(dataText('es-ES', 'Capac în H'), 'Tapeta en H');
  assert.equal(dataText('fr-FR', 'text necunoscut'), 'text necunoscut');
  assert.equal(messageLocale('it'), 'it-IT');
  assert.equal(messageLocale('pt-PT'), 'en-US');
});
