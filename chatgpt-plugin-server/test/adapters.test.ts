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

test('creation preparation rejects silently omitted active choices', () => {
  assert.throws(
    () => buildState('fence', { layout: 'straight', runA: 8 }, { requireExplicit: true }),
    (error: unknown) => error instanceof ConfigurationError && error.field === 'height',
  );
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

test('solar exact location stores usable coordinates', () => {
  const exact = buildState('solar', { ...defaults('solar'), locationMode: 'exact', locationLat: 46.77, locationLon: 23.59, locationLabel: 'Cluj-Napoca' });
  assert.equal(exact.state.locationMode, 'exact');
  assert.equal(exact.state.locationLat, 46.77);
  assert.equal(exact.state.locationLon, 23.59);
});
