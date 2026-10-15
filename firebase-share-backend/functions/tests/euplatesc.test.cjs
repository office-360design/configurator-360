'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildPaymentFields, euplatescMac, euplatescTimestamp, safeReturnUrl, verifyResponse, RESPONSE_FIELDS } = require('../euplatesc.cjs');

const KEY = '00112233445566778899AABBCCDDEEFF00112233';

test('MAC prefixes each value with its byte length and uses "-" for empty values', () => {
  const data = '41.00' + '3RON' + '-' + '4ăbc';
  const expected = crypto.createHmac('md5', Buffer.from(KEY, 'hex')).update(data, 'utf8').digest('hex').toUpperCase();
  assert.equal(euplatescMac(['1.00', 'RON', '', 'ăbc'], KEY), expected, 'ă counts as two bytes');
  assert.match(euplatescMac(['x'], KEY), /^[0-9A-F]{32}$/);
});

test('request fields are signed in the documented order', () => {
  const now = new Date(Date.UTC(2026, 9, 15, 8, 5, 9));
  const fields = buildPaymentFields({ amount: 539.4, currency: 'RON', invoiceId: 'A'.repeat(20), description: 'Test', merchantId: '44840000000', key: KEY, now, nonce: 'n1', customer: { email: 'a@b.ro' } });
  assert.equal(fields.amount, '539.40');
  assert.equal(fields.timestamp, '20261015080509');
  assert.equal(euplatescTimestamp(now), '20261015080509');
  assert.equal(fields.fp_hash, euplatescMac(['539.40', 'RON', 'A'.repeat(20), 'Test', '44840000000', '20261015080509', 'n1'], KEY));
  assert.equal(fields.email, 'a@b.ro');
  assert.match(fields['ExtraData[silenturl]'], /euplatescCallback\?mode=silent$/);
});

test('responses verify only with the right key and untouched values', () => {
  const body = { amount: '539.40', curr: 'RON', invoice_id: 'A'.repeat(20), ep_id: 'EP1', merch_id: '44840000000', action: '0', message: 'Approved', approval: '123456', timestamp: '20261015080600', nonce: 'n2' };
  body.fp_hash = euplatescMac(RESPONSE_FIELDS.map(name => body[name]), KEY);
  assert.equal(verifyResponse(body, KEY), true);
  assert.equal(verifyResponse({ ...body, amount: '1.00' }, KEY), false, 'tampered amount');
  assert.equal(verifyResponse({ ...body, action: '1' }, KEY), false, 'tampered result');
  assert.equal(verifyResponse(body, KEY.replace('00', '01')), false, 'wrong key');
  assert.equal(verifyResponse({ ...body, fp_hash: '' }, KEY), false);
});

test('return URLs stay on the origin that started the payment', () => {
  assert.equal(safeReturnUrl('https://www.360configurator.com/window-configurator/?payment=failed&x=1#a', 'https://www.360configurator.com'), 'https://www.360configurator.com/window-configurator/?x=1');
  assert.equal(safeReturnUrl('https://evil.example/phish', 'https://www.360configurator.com'), 'https://www.360configurator.com/');
  assert.equal(safeReturnUrl('not a url', 'http://127.0.0.1:8080'), 'http://127.0.0.1:8080/');
});
