import assert from 'node:assert/strict';
import test from 'node:test';
import { buildValidationResults, calculateProject } from '../src/domain/calculations.js';
import { buildRouteSegments, interpolateRoute } from '../src/domain/geometry.js';
import { DEFAULT_STATE, GasConfiguratorStore } from '../src/state.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('default route produces coherent quantities', () => {
  const calculation = calculateProject(clone(DEFAULT_STATE));
  assert.ok(calculation.routeLengthM > 1_000);
  assert.ok(calculation.pipeLengthM > calculation.routeLengthM);
  assert.ok(calculation.excavationM3 > calculation.beddingM3);
  assert.ok(calculation.estimateHighEur > calculation.estimateLowEur);
});

test('a waypoint splits the nearest route segment and inherits its assumptions', () => {
  const initial = clone(DEFAULT_STATE);
  const store = new GasConfiguratorStore(initial);
  const coordinate = [
    (initial.route.points[0].coordinate[0] + initial.route.points[1].coordinate[0]) / 2,
    (initial.route.points[0].coordinate[1] + initial.route.points[1].coordinate[1]) / 2,
  ];

  assert.equal(store.addWaypoint(coordinate), true);
  const state = store.get();
  const segments = buildRouteSegments(state.route.points);
  assert.equal(state.route.points.length, 3);
  assert.equal(segments.length, 2);
  assert.ok(segments.every((segment) => state.segmentSettings[segment.id].groundType === 'common'));
  assert.equal(state.route.selectedPointId, state.route.points[1].id);
});

test('segment ground classification changes the preliminary estimate', () => {
  const store = new GasConfiguratorStore(clone(DEFAULT_STATE));
  const commonEstimate = calculateProject(store.get()).estimateMidEur;
  store.setSegmentSetting('groundType', 'hardRock');
  const rockEstimate = calculateProject(store.get()).estimateMidEur;
  assert.ok(rockEstimate > commonEstimate);
});

test('station interpolation remains within the route', () => {
  const state = clone(DEFAULT_STATE);
  const calculation = calculateProject(state);
  const station = interpolateRoute(state.route.points, calculation.routeLengthM / 2);
  assert.ok(station.ratio > 0 && station.ratio < 1);
  assert.equal(station.segment.id, 'a:b');
});

test('capacity and authorized review stay unresolved in the prototype', () => {
  const state = clone(DEFAULT_STATE);
  const validation = buildValidationResults(state, calculateProject(state));
  assert.equal(validation.find((item) => item.id === 'capacity').status, 'missing');
  assert.equal(validation.find((item) => item.id === 'authorization').status, 'missing');
  assert.equal(validation.find((item) => item.id === 'rule-pack').status, 'warning');
});
