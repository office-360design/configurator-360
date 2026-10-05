import assert from 'node:assert/strict';
import { state, deriveHallMetrics } from '../js/state.js?v=hall-storage-1';
import { HALL_TEMPLATES, AGRICULTURAL_TEMPLATE_ID, COMMERCIAL_TEMPLATE_ID, createHallTemplate } from '../js/templates.js?v=hall-storage-1';
import { normalizeOpening, normalizeOpenings, validateOpenings, openingLabel } from '../js/openings.js?v=hall-storage-1';
import { COMMERCIAL_DEFAULTS, normalizeCommercialFeatures, commercialLayout } from '../js/commercial.js?v=hall-storage-1';
import { getHallMessages } from '../js/i18n.js?v=hall-storage-1';
import { estimateHallPrice } from '../js/pricing.js?v=hall-storage-1';

const initial = structuredClone(state);
const a = createHallTemplate(COMMERCIAL_TEMPLATE_ID, state);
const b = createHallTemplate(COMMERCIAL_TEMPLATE_ID, state);
assert.deepEqual(state, initial);
assert.equal(HALL_TEMPLATES.length, 3);
assert.equal(new Set(HALL_TEMPLATES.map(t => t.id)).size, 3);
assert.deepEqual([a.width, a.length, a.eaveHeight, a.pitch], [24, 18, 4.5, 8]);
assert.equal(a.openings.length, 12);
assert.equal(a.openings.filter(o => o.type === 'window' && o.subtype === 'shopfront').length, 8);
assert.equal(a.openings.filter(o => o.type === 'entrance').length, 2);
assert.equal(validateOpenings(a, 'en-US').valid, true);
for (const o of a.openings) {
  const old = structuredClone(o); normalizeOpening(o, a); assert.deepEqual(o, old);
  if (o.type === 'garage') assert(o.bottom + o.height + .47 < a.eaveHeight);
}
assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
a.openings[0].width = 1;
assert.equal(b.openings[0].width, 4.15);
assert.equal(b.wallBracingLayout, 'rear-service');
const metrics = deriveHallMetrics(b), layout = commercialLayout(b);
assert.equal(metrics.footprint, 432); assert.equal(metrics.highBayFixtureCount, 8);
assert.equal(metrics.skylightCount, 0); assert.equal(metrics.frameCount, 4);
assert.equal(layout.canopyArea, 14.4); assert.equal(layout.apronArea, 72);
assert.equal(layout.displayCount, 4); assert.equal(layout.checkoutCount, 1);
assert(layout.signArea > 0 && layout.signBottom >= 3.4);
const narrow = { ...structuredClone(b), width: 8, length: 10 };
normalizeOpenings(narrow); assert.equal(commercialLayout(narrow).displayCount, 0);
assert(commercialLayout(narrow).canopyWidth <= 7);
const noSpace = { ...structuredClone(b), eaveHeight: 3 };
normalizeOpenings(noSpace); assert.equal(commercialLayout(noSpace).canopyArea, 0); assert.equal(commercialLayout(noSpace).signArea, 0);
const old = { signText: null, commercialAccent: 'bad', lightingStyle: 'bad' }; normalizeCommercialFeatures(old);
assert.equal(old.signText, 'SHOWROOM'); assert.equal(old.commercialAccent, COMMERCIAL_DEFAULTS.commercialAccent);
assert.equal(old.entranceCanopy, false);
assert.equal(old.lightingStyle, 'high-bay');
const agri = createHallTemplate(AGRICULTURAL_TEMPLATE_ID, b);
for (const key of ['entranceCanopy', 'facadeSign', 'customerApron', 'retailDisplays']) assert.equal(agri[key], false, `${key} leaked from commercial to agricultural`);
assert.equal(agri.wallBracingLayout, 'end-bays'); assert.equal(agri.lightingStyle, 'high-bay');
assert.equal(agri.openings.length, 18); assert.equal('buildingUse' in b, false);
for (const locale of ['en-US','ro-RO','de-DE']) {
  const messages=getHallMessages(locale);
  for(const template of HALL_TEMPLATES) for(const suffix of ['name','intro','previewAlt',...template.features]) assert(messages[`${template.copyPrefix}.${suffix}`]);
  const price=estimateHallPrice(structuredClone(b), null, locale);
  assert(Number.isFinite(price.total) && price.total>0);
  for(const o of b.openings.filter(o=>o.type==='entrance'||o.subtype==='shopfront')) assert(!openingLabel(o,locale).includes('undefined'));
}
console.log('Commercial template: 432 m², 12 valid openings, 8 lights; independent state, bounds, options, legacy defaults, agri switching, localized pricing/copy and JSON round-trip passed.');
