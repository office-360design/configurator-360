import assert from 'node:assert/strict';
import test from 'node:test';
import { directSolarLocationSelection, queryConfirmsHouseNumber, resolveSolarLocationAnswers, type SolarLocationCandidate } from '../src/solarLocation.js';

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

test('a numbered locationQuery is merged into Solar answers before preview construction', async () => {
  const candidate: SolarLocationCandidate = {
    candidate: 1,
    label: '6, Aleea Brateș, Cluj-Napoca, România',
    latitude: 46.7588857,
    longitude: 23.5449116,
    type: 'apartments',
    houseNumber: '6',
    exactAddressMatch: true,
  };
  const resolved = await resolveSolarLocationAnswers(
    { locationQuery: 'Aleea Brateș 6, Cluj-Napoca' },
    async () => [candidate],
  );
  assert.equal(resolved.answers.locationMode, 'exact');
  assert.equal(resolved.answers.exactLocationConsent, true);
  assert.equal(resolved.answers.locationLat, candidate.latitude);
  assert.equal(resolved.answers.locationLon, candidate.longitude);
  assert.equal(resolved.answers.locationLabel, candidate.label);
  assert.equal(resolved.confirmationRequired, false);
});

test('resolved coordinates remain exact even if a later model call omits locationMode', async () => {
  const resolved = await resolveSolarLocationAnswers({
    locationQuery: 'Aleea Brateș 6, Cluj-Napoca',
    locationLat: 46.7588857,
    locationLon: 23.5449116,
    locationLabel: '6, Aleea Brateș, Cluj-Napoca, România',
    exactLocationConsent: true,
  });
  assert.equal(resolved.answers.locationMode, 'exact');
  assert.equal(resolved.answers.locationLat, 46.7588857);
});
