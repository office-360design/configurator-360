import assert from 'node:assert/strict';
import test from 'node:test';
import { toLeafletBounds, toLeafletLatLng } from '../src/map/leafletCoordinates.js';

test('route coordinates are converted from longitude-latitude to Leaflet order', () => {
  assert.deepEqual(toLeafletLatLng([26.1025, 44.4268]), [44.4268, 26.1025]);
});

test('route bounds are converted to Leaflet southwest-northeast corners', () => {
  assert.deepEqual(toLeafletBounds({
    minLon: 26.08,
    minLat: 44.41,
    maxLon: 26.14,
    maxLat: 44.45,
  }), [
    [44.41, 26.08],
    [44.45, 26.14],
  ]);
});
