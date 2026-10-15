'use strict';

// EuPlatesc request signing and response verification (pure helpers).
const crypto = require('node:crypto');

const EUPLATESC_URL = 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php';
const CALLBACK_URL = 'https://europe-west1-configurator-360.cloudfunctions.net/euplatescCallback';

// EuPlatesc MAC: every value prefixed by its byte length ("-" for empty
// values), HMAC-MD5 with the hex-decoded merchant key, upper-case hex.
function euplatescMac(values, keyHex) {
  const data = values.map((value) => {
    const text = value == null ? '' : String(value);
    return text.length ? `${Buffer.byteLength(text, 'utf8')}${text}` : '-';
  }).join('');
  return crypto.createHmac('md5', Buffer.from(String(keyHex).trim(), 'hex')).update(data, 'utf8').digest('hex').toUpperCase();
}

function euplatescTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

// Signed request fields, in the order EuPlatesc hashes them.
function buildPaymentFields({ amount, currency, invoiceId, description, merchantId, key, customer = {}, now = new Date(), nonce }) {
  const fields = {
    amount: Number(amount).toFixed(2),
    curr: currency,
    invoice_id: invoiceId,
    order_desc: description,
    merch_id: merchantId,
    timestamp: euplatescTimestamp(now),
    nonce: nonce || crypto.randomBytes(16).toString('hex'),
  };
  fields.fp_hash = euplatescMac([fields.amount, fields.curr, fields.invoice_id, fields.order_desc, fields.merch_id, fields.timestamp, fields.nonce], key);
  if (customer.firstName) fields.fname = customer.firstName;
  if (customer.lastName) fields.lname = customer.lastName;
  if (customer.email) fields.email = customer.email;
  fields['ExtraData[successurl]'] = `${CALLBACK_URL}?mode=return`;
  fields['ExtraData[failedurl]'] = `${CALLBACK_URL}?mode=return`;
  fields['ExtraData[silenturl]'] = `${CALLBACK_URL}?mode=silent`;
  return fields;
}

// Response fields posted back by EuPlatesc (return and silent notification).
const RESPONSE_FIELDS = ['amount', 'curr', 'invoice_id', 'ep_id', 'merch_id', 'action', 'message', 'approval', 'timestamp', 'nonce'];
function verifyResponse(body, key) {
  const expected = euplatescMac(RESPONSE_FIELDS.map((name) => body?.[name]), key);
  const received = String(body?.fp_hash || '').toUpperCase();
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Test merchant accounts accept at most 1 USD per payment, so in test mode a
// symbolic amount is charged instead of the cart total.
const TEST_CHARGE = Object.freeze({ RON: 1, EUR: 0.5, USD: 0.5 });
function chargeAmount(total, currency, mode) {
  return mode === 'live' ? total : Math.min(total, TEST_CHARGE[currency] ?? 0.5);
}

// The browser returns to the page that started the payment, never elsewhere.
function safeReturnUrl(value, origin) {
  try {
    const url = new URL(String(value || ''));
    if (url.origin !== origin) return `${origin}/`;
    ['payment', 'paymentOrder'].forEach((name) => url.searchParams.delete(name));
    url.hash = '';
    return url.toString();
  } catch { return `${origin}/`; }
}

module.exports = { EUPLATESC_URL, TEST_CHARGE, chargeAmount, CALLBACK_URL, RESPONSE_FIELDS, euplatescMac, euplatescTimestamp, buildPaymentFields, verifyResponse, safeReturnUrl };
