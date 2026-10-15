'use strict';

// Online card payment of the account cart through EuPlatesc (euplatesc.ro).
// The merchant ID and secret key live in Google Secret Manager; the browser
// only receives a signed form and never sees the key. The cart total is read
// from the server-side cart, so it cannot be changed by the client.

const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { Timestamp, getFirestore } = require('firebase-admin/firestore');
const { TENANT_ORIGIN_PATTERN, tenantOriginContext, tenantRecordMatchesHost } = require('./tenantDomains.cjs');
const { EUPLATESC_URL, buildPaymentFields, safeReturnUrl, verifyResponse } = require('./euplatesc.cjs');

const EUPLATESC_MID = defineSecret('EUPLATESC_MID');
const EUPLATESC_KEY = defineSecret('EUPLATESC_KEY');

const FUNCTION_REGION = 'europe-west1';
const RUNTIME_SERVICE_ACCOUNT = 'configurator-runtime@configurator-360.iam.gserviceaccount.com';
const PAYMENTS_COLLECTION = 'cartPayments';
const PRODUCTS = Object.freeze(['window', 'roof', 'pergola', 'hall', 'solar', 'fence', 'cardbox', 'bookshelf', 'chair', 'tiles']);
const CURRENCIES = new Set(['RON', 'EUR', 'USD']);
const FX_RATES_FROM_EUR = Object.freeze({ EUR: 1, USD: 1.09, RON: 4.98 });
const MAX_CART_ITEMS = 100;
const ORDER_ID_PATTERN = /^[A-Za-z0-9]{20}$/;
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const PUBLIC_ORIGINS = new Set([
  'https://360configurator.com', 'https://www.360configurator.com',
  'https://360configurator.ro', 'https://www.360configurator.ro',
  'https://360konfigurator.de', 'https://www.360konfigurator.de',
  'https://aks.360configurator.com',
]);
const DEVELOPMENT_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function convertMoney(amount, from, to) {
  return (Number(amount) / FX_RATES_FROM_EUR[from]) * FX_RATES_FROM_EUR[to];
}

function requestOrigin(request) {
  const header = String(request.rawRequest?.headers?.origin || '').trim();
  try { return new URL(header).origin; } catch { return ''; }
}

async function paymentScope(request) {
  const origin = requestOrigin(request);
  if (PUBLIC_ORIGINS.has(origin) || DEVELOPMENT_ORIGIN.test(origin)) return { origin, tenantSlug: '' };
  const tenantSlug = tenantOriginContext(origin)?.slug || '';
  if (!TENANT_SLUG_PATTERN.test(tenantSlug)) throw new HttpsError('permission-denied', 'Unsupported payment origin.');
  const snapshot = await getFirestore().collection('tenants').doc(tenantSlug).get();
  const tenant = snapshot.data() || {};
  if (!snapshot.exists || tenant.status !== 'active' || !tenantRecordMatchesHost(tenant, new URL(origin).hostname)) {
    throw new HttpsError('permission-denied', 'This customer tenant is not active.');
  }
  return { origin, tenantSlug };
}

function cartCollection(uid, product, tenantSlug) {
  const userRef = getFirestore().collection('users').doc(uid);
  return tenantSlug
    ? userRef.collection('tenantShoppingCart').doc(tenantSlug).collection('products').doc(product).collection('items')
    : userRef.collection('shoppingCart').doc(product).collection('items');
}

async function readCartTotal(uid, tenantSlug, currency) {
  const snapshots = await Promise.all(PRODUCTS.map((product) => cartCollection(uid, product, tenantSlug).limit(MAX_CART_ITEMS).get()));
  const items = [];
  snapshots.forEach((snapshot, index) => snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const amount = Number(data.priceAmount ?? data.costAmount);
    const itemCurrency = String(data.currency || '').trim().toUpperCase();
    if (!data.s || !Number.isFinite(amount) || amount < 0 || !CURRENCIES.has(itemCurrency)) return;
    items.push({ key: doc.id, productId: PRODUCTS[index], name: String(data.n || data.name || PRODUCTS[index]).slice(0, 120), amount: convertMoney(amount, itemCurrency, currency) });
  }));
  const total = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  return { items, total };
}

const CALLABLE_OPTIONS = {
  region: FUNCTION_REGION,
  serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  cors: [...PUBLIC_ORIGINS, DEVELOPMENT_ORIGIN, TENANT_ORIGIN_PATTERN],
  enforceAppCheck: false,
  timeoutSeconds: 60,
  memory: '256MiB',
};

exports.createCartPayment = onCall({ ...CALLABLE_OPTIONS, secrets: [EUPLATESC_MID, EUPLATESC_KEY] }, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Google login is required.');
  const currency = String(request.data?.currency || 'RON').trim().toUpperCase();
  if (!CURRENCIES.has(currency)) throw new HttpsError('invalid-argument', 'Unsupported payment currency.');
  const { origin, tenantSlug } = await paymentScope(request);
  const { items, total } = await readCartTotal(uid, tenantSlug, currency);
  if (!items.length || total <= 0) throw new HttpsError('failed-precondition', 'The shopping cart is empty.');

  const ref = getFirestore().collection(PAYMENTS_COLLECTION).doc();
  const email = String(request.auth?.token?.email || '').slice(0, 320);
  const [firstName = '', ...rest] = String(request.auth?.token?.name || '').trim().split(/\s+/);
  const description = `360Configurator · ${items.length} ${items.length === 1 ? 'configuration' : 'configurations'}`.slice(0, 120);
  const fields = buildPaymentFields({
    amount: total, currency, invoiceId: ref.id, description,
    merchantId: EUPLATESC_MID.value().trim(), key: EUPLATESC_KEY.value(),
    customer: { firstName, lastName: rest.join(' '), email },
  });
  await ref.create({
    v: 1, uid, tenantSlug: tenantSlug || null, origin,
    returnUrl: safeReturnUrl(request.data?.returnUrl, origin),
    amount: fields.amount, currency, description,
    items: items.map(({ key, productId, name, amount }) => ({ key, productId, name, amount: Math.round(amount * 100) / 100 })),
    status: 'pending', createdAt: Timestamp.now(),
  });
  logger.info('EuPlatesc payment created.', { event: 'payment-created', orderId: ref.id, uid, amount: fields.amount, currency, itemCount: items.length });
  return { orderId: ref.id, action: EUPLATESC_URL, fields };
});

exports.getCartPayment = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Google login is required.');
  const orderId = String(request.data?.orderId || '');
  if (!ORDER_ID_PATTERN.test(orderId)) throw new HttpsError('invalid-argument', 'Invalid order.');
  const snapshot = await getFirestore().collection(PAYMENTS_COLLECTION).doc(orderId).get();
  const data = snapshot.data();
  if (!snapshot.exists || data.uid !== uid) throw new HttpsError('not-found', 'Payment not found.');
  return { orderId, status: data.status, amount: data.amount, currency: data.currency, message: data.bankMessage || null, epId: data.epId || null };
});

// EuPlatesc posts the result twice: to the browser return URL and to the
// silent notification URL. Both are verified and recorded idempotently.
exports.euplatescCallback = onRequest({ region: FUNCTION_REGION, serviceAccount: RUNTIME_SERVICE_ACCOUNT, secrets: [EUPLATESC_MID, EUPLATESC_KEY], cors: false, timeoutSeconds: 30, memory: '256MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const silent = req.query.mode === 'silent';
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const orderId = String(body.invoice_id || '');
  const ref = ORDER_ID_PATTERN.test(orderId) ? getFirestore().collection(PAYMENTS_COLLECTION).doc(orderId) : null;
  const snapshot = ref ? await ref.get() : null;
  const order = snapshot?.exists ? snapshot.data() : null;
  const valid = req.method === 'POST' && order && verifyResponse(body, EUPLATESC_KEY.value())
    && String(body.merch_id) === EUPLATESC_MID.value().trim()
    && String(body.amount) === order.amount && String(body.curr) === order.currency;
  if (!valid) {
    logger.warn('Rejected EuPlatesc callback.', { event: 'payment-callback-invalid', orderId: orderId || null, silent, method: req.method });
    if (silent) { res.status(400).send('INVALID'); return; }
    res.redirect(303, order?.returnUrl ? `${order.returnUrl}${order.returnUrl.includes('?') ? '&' : '?'}payment=invalid` : 'https://www.360configurator.com/');
    return;
  }
  const paid = String(body.action) === '0';
  const status = paid ? 'paid' : 'failed';
  // Never downgrade a paid order if a late duplicate arrives.
  if (order.status !== 'paid') {
    await ref.update({
      status, epId: String(body.ep_id || ''), bankMessage: String(body.message || '').slice(0, 200),
      approval: String(body.approval || ''), action: String(body.action || ''),
      [silent ? 'notifiedAt' : 'returnedAt']: Timestamp.now(),
    });
  }
  logger.info('EuPlatesc callback recorded.', { event: 'payment-callback', orderId, status, silent, epId: String(body.ep_id || '') });
  if (silent) { res.status(200).send('OK'); return; }
  const finalStatus = order.status === 'paid' ? 'paid' : status;
  const join = order.returnUrl.includes('?') ? '&' : '?';
  res.redirect(303, `${order.returnUrl}${join}payment=${finalStatus === 'paid' ? 'success' : 'failed'}&paymentOrder=${orderId}`);
});

