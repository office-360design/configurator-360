import assert from 'node:assert/strict';
import test from 'node:test';
import { directSolarLocationSelection, queryConfirmsHouseNumber, type SolarLocationCandidate } from '../src/solarLocation.js';

test('a complete numbered address confirms the matching geocoder result', () => {
  assert.equal(queryConfirmsHouseNumber('Strada Alexandru Vaida Voevod 53B, Cluj-Napoca', '53B'), true);
  const candidates: SolarLocationCandidate[] = [{
    candidate: 1,
    label: '53B Strada Alexandru Vaida Voevod, Cluj-Napoca, România',
    latitude: 46.772369,
    longitude: 23.627975,
    type: 'mall',
    houseNumber: '53B',
    exactAddressMatch: true,
  }];
  assert.deepEqual(directSolarLocationSelection(candidates), {
    locationMode: 'exact',
    exactLocationConsent: true,
    locationLat: 46.772369,
    locationLon: 23.627975,
    locationLabel: candidates[0].label,
  });
});

test('a city-only search still requires candidate confirmation', () => {
  assert.equal(queryConfirmsHouseNumber('Cluj-Napoca', '53B'), false);
  assert.equal(directSolarLocationSelection([{
    candidate: 1,
    label: 'Cluj-Napoca, România',
    latitude: 46.77,
    longitude: 23.59,
    type: 'city',
    houseNumber: '',
    exactAddressMatch: false,
  }]), null);
});
