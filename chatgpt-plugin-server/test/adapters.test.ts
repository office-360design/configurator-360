import assert from 'node:assert/strict';
import test from 'node:test';
import { answersFromState, buildState, ConfigurationError, mergeRevision } from '../src/adapters.js';
import { CATALOG, PRODUCT_IDS, type JsonObject } from '../src/catalog.js';

function defaults(product: typeof PRODUCT_IDS[number]) {
  return Object.fromEntries(CATALOG[product].questions.map(question => [question.id, question.default])) as JsonObject;
}

for (const product of PRODUCT_IDS) {
  test(`${product} builds a serializable state from its complete questionnaire`, () => {
    const built = buildState(product, defaults(product));
    assert.ok(Object.keys(built.state).length > 3);
    assert.doesNotThrow(() => JSON.stringify(built.state));
    assert.equal(built.assumptions.length, 0);
  });

  test(`${product} revisions preserve unchanged answers`, () => {
    const original = buildState(product, defaults(product));
    const first = CATALOG[product].questions[0];
    const next = mergeRevision(product, original.answers, { [first.id]: first.default });
    assert.deepEqual(next.answers, original.answers);
  });

  test(`${product} can extract customer answers from state`, () => {
    const original = buildState(product, defaults(product));
    const extracted = answersFromState(product, original.state);
    assert.ok(Object.keys(extracted).length > 0);
  });
}

test('roof covering compatibility is enforced', () => {
  assert.throws(() => buildState('roof', { ...defaults('roof'), covering: 'teclado', pitch: 10 }), ConfigurationError);
});

test('out-of-range values are rejected', () => {
  assert.throws(() => buildState('fence', { ...defaults('fence'), height: 10 }), ConfigurationError);
});

test('fence rejects incomplete gate placement', () => {
  assert.throws(() => buildState('fence', { ...defaults('fence'), gates: [{ type: 'driveway', run: 'a' }] }), (error: unknown) => error instanceof ConfigurationError && error.field === 'gates');
});

test('creation preparation rejects silently omitted active choices', () => {
  assert.throws(
    () => buildState('fence', { layout: 'straight', runA: 8 }, { requireExplicit: true }),
    (error: unknown) => error instanceof ConfigurationError && error.field === 'height',
  );
});

test('optional viewer and pricing controls may use documented defaults', () => {
  const supplied = defaults('solar');
  for (const question of CATALOG.solar.questions.filter(question => !question.required)) delete supplied[question.id];
  assert.doesNotThrow(() => buildState('solar', supplied, { requireExplicit: true }));
});

test('pergola accessories are placed in the current grid state', () => {
  const built = buildState('pergola', {
    ...defaults('pergola'), widthMm: 6000, depthMm: 6000, spotlightCount: 13, heaterCount: 3,
    rainSensor: true, windSensor: true, speaker: true, outlet: true,
  });
  const accessories = built.state.accessories as JsonObject;
  assert.equal(Object.values(accessories.spotlights as Record<string, number>).reduce((sum, count) => sum + count, 0), 13);
  assert.equal(Object.values(accessories.heaters as Record<string, { first: boolean; second: boolean }>).reduce((sum, heater) => sum + Number(heater.first) + Number(heater.second), 0), 3);
  const sensors = accessories.sensors as Record<string, { enabled: boolean; pole: string }>;
  assert.equal(sensors.rain.enabled, true);
  assert.equal(sensors.wind.enabled, true);
  assert.notEqual(sensors.rain.pole, sensors.wind.pole);
});

test('pergola night preview maps to the live environment state', () => {
  const built = buildState('pergola', { ...defaults('pergola'), nightPreview: true });
  assert.equal((built.state.environment as JsonObject).night, true);
});

test('hall uses live building and climate values', () => {
  const built = buildState('hall', { ...defaults('hall'), buildingUse: 'cold', climateSystem: 'frozen', showCladding: false, explodedView: true, nightPreview: true });
  assert.equal(built.state.buildingUse, 'cold');
  assert.equal(built.state.climateSystem, 'frozen');
  assert.equal(built.state.nightPreview, true);
  assert.equal(built.state.showCladding, false);
  assert.equal(built.state.explode, 100);
});

test('hall rejects overlapping openings', () => {
  assert.throws(() => buildState('hall', { ...defaults('hall'), openings: [
    { type: 'garage', side: 'front', width: 4, height: 4, offset: 0, bottom: 0 },
    { type: 'personnel', side: 'front', width: 1, height: 2.1, offset: 1, bottom: 0 },
  ] }), (error: unknown) => error instanceof ConfigurationError && error.field === 'openings');
});

test('solar exact location stores usable coordinates', () => {
  const exact = buildState('solar', { ...defaults('solar'), locationMode: 'exact', exactLocationConsent: true, locationLat: 46.77, locationLon: 23.59, locationLabel: 'Cluj-Napoca', roofBearingDeg: 210 });
  assert.equal(exact.state.locationMode, 'exact');
  assert.equal(exact.state.locationLat, 46.77);
  assert.equal(exact.state.locationLon, 23.59);
  assert.equal(exact.state.northDirection, 210);
});

test('solar exact-location draft never substitutes Bucharest before candidate confirmation', () => {
  const draft = buildState('solar', { locationMode: 'exact' });
  assert.equal(draft.state.locationMode, 'region');
  assert.equal(draft.state.locationLat, null);
  assert.equal(draft.state.locationLon, null);
  assert.equal(draft.assumptions.some(item => item.includes('44.4268') || item.includes('26.1025')), false);
  assert.equal(draft.assumptions.some(item => item.includes('awaiting a confirmed address-search result')), true);
});

test('window two-sash request maps to the live two-opening-sash layout', () => {
  const built = buildState('window', { ...defaults('window'), layoutId: 'vertical-sash-sash' });
  assert.equal(built.state.layoutId, 'vertical-sash-sash');
  assert.equal(built.state.windowLayout, 'vertical-sash-sash');
});

test('solar rejects unavailable shed roof planes', () => {
  assert.throws(() => buildState('solar', { ...defaults('solar'), roofType: 'shed', roofSide: 'both' }), (error: unknown) => error instanceof ConfigurationError && error.field === 'roofSide');
});

test('window rejects incompatible CAD profile selections', () => {
  assert.throws(() => buildState('window', { ...defaults('window'), profileSetId: '2_6_Oeffnungselemnt_Vertikal' }), (error: unknown) => error instanceof ConfigurationError && error.field === 'profileSetId');
});
