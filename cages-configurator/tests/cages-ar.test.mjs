import assert from 'node:assert/strict';
import test from 'node:test';
import { AR_COPY, arT } from '../../shared-ui/src/ar/i18n.js';
import { AR_PRODUCTS, arModelUrl, arPhoneUrl } from '../../shared-ui/src/ar/links.js';
import { isConfiguratorAREnabled } from '../../shared-ui/src/arPolicy.js';

test('cages is enabled in the shared AR policy and routes', () => {
  assert.ok(AR_PRODUCTS.includes('cages'));
  assert.equal(isConfiguratorAREnabled('cages', { viewAR: true }), true);
  assert.equal(isConfiguratorAREnabled('cages', { viewAR: false }), false);

  const id = 'a'.repeat(32);
  const phone = new URL(arPhoneUrl(id, 'android', 'ro-RO', 'https://360configurator.ro', 'cages'));
  assert.equal(phone.pathname, '/cages-configurator/ar.html');
  assert.equal(phone.searchParams.get('id'), id);
  assert.equal(phone.searchParams.get('mode'), 'android');
  assert.match(arModelUrl(id, 'glb', 'cages'), /\/cages\.glb\?/);
});

test('cages AR copy inherits the complete shared flow in every locale', () => {
  for (const locale of Object.keys(AR_COPY.hall)) {
    assert.deepEqual(Object.keys(AR_COPY.cages[locale]).sort(), Object.keys(AR_COPY.hall[locale]).sort());
    assert.match(arT('cages', locale, 'title'), /cage|carcasa/i);
    assert.match(arT('cages', locale, 'phoneTitle'), /cage|carcasa/i);
  }
});
