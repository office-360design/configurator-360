import assert from 'node:assert/strict';
import { state, deriveHallMetrics } from '../js/state.js?v=hall-production-1';
import { createHallTemplate, AGRICULTURAL_TEMPLATE_ID } from '../js/templates.js?v=hall-production-1';
import { normalizeOpening, validateOpenings, openingCounts } from '../js/openings.js?v=hall-production-1';
import { getHallMessages } from '../js/i18n.js?v=hall-production-1';

const before = structuredClone(state);
const first = createHallTemplate(AGRICULTURAL_TEMPLATE_ID, state);
const second = createHallTemplate(AGRICULTURAL_TEMPLATE_ID, state);
assert.deepEqual(state, before, 'Catalog generation does not modify the live hall.');
assert.notEqual(first, second);
assert.notEqual(first.openings, second.openings);
assert.equal('buildingUse' in first, false);
assert.equal(first.length, 30);
assert.equal(first.width, 18);
assert.equal(first.eaveHeight, 5.5);
assert.equal(first.pitch, 16);
assert.deepEqual(openingCounts(first), { window: 10, personnel: 2, garage: 2, vent: 4 });
assert.equal(new Set(first.openings.map((o) => o.id)).size, first.openings.length);
assert.equal(validateOpenings(first, 'en-US').valid, true);
for (const side of ['left', 'right']) {
  const windows = first.openings.filter((o) => o.side === side && o.type === 'window');
  assert.equal(windows.length, 5);
  windows.forEach((o) => { assert.equal(o.subtype, 'daylight-band'); assert.equal(o.width, 4.8); assert.equal(o.bottom, 4); });
}
for (const o of first.openings) {
  const snapshot = structuredClone(o);
  normalizeOpening(o, first);
  assert.deepEqual(o, snapshot, 'Template openings are already within legal configurator limits.');
  if (o.type === 'garage') assert(o.height + .47 < first.eaveHeight, 'Roller hood clears the eaves.');
}
const restored = JSON.parse(JSON.stringify(first));
assert.deepEqual(restored, first);
first.openings[0].width = 2.5;
assert.equal(second.openings[0].width, 4.8, 'A template is fresh on every use.');
const metrics = deriveHallMetrics(second);
assert.equal(metrics.frameCount, 6);
assert.equal(metrics.footprint, 540);
assert.equal(metrics.skylightCount, 8);
assert.equal(metrics.highBayFixtureCount, 10);
assert.equal(metrics.skylightArea, 12.42);
assert(metrics.netRoofArea < metrics.roofArea);
assert.throws(() => createHallTemplate('unknown', state), /Unknown hall template/);
for (const locale of ['en-US', 'ro-RO', 'de-DE']) {
 const messages = getHallMessages(locale);
 for (const key of ['templates.agricultural.name', 'templates.apply', 'templates.designNote', 'opening.vent', 'window.daylightBand', 'summary.metric.openings', 'bom.line.openingFraming']) assert(messages[key], `${locale}: ${key}`);
}
console.log('Agricultural template validated: dimensions, 18 openings, clearances, independent copies, JSON round-trip, services, and EN/RO/DE copy.');
