'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { createHash, randomBytes } = require('node:crypto');
const logger = require('firebase-functions/logger');
const { tenantOriginContext, tenantRecordMatchesHost } = require('./tenantDomains.cjs');
const { FORMATS, LIFETIME_MS, ARRequestError, reject, requireId, validateAsset, parseRange, quotaDecision } = require('./hall-ar-core.cjs');

const PROJECT_ID = 'configurator-360';
const BUCKET_NAME = `${PROJECT_ID}-hall-ar`;
const SESSIONS = 'hallARSessions';
const RATE_LIMITS = 'hallARRateLimits';
// Retain the deployed bucket, collection, function names and Hall URLs.
// Window and Pergola assets share the same private, expiring infrastructure.
const ROOT = 'hall-ar/v1/';
const PRODUCTS = new Set(['hall', 'window', 'pergola', 'fence']);
function productPath(id, format, product) { return `${ROOT}${id}/${product}.${format}`; }
function validStoredAsset(id, data) {
  return /^[A-Za-z0-9_-]{32}$/.test(id) && PRODUCTS.has(data.product)
    && Object.hasOwn(FORMATS, data.format)
    && data.objectPath === productPath(id, data.format, data.product);
}
const PUBLIC_ORIGINS = new Set([
  'https://360configurator.com', 'https://www.360configurator.com',
  'https://360configurator.ro', 'https://www.360configurator.ro',
  'https://360konfigurator.de', 'https://www.360konfigurator.de', 'https://aks.360configurator.com',
]);
const DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const OPTIONS = {
  region: 'europe-west1', serviceAccount: 'configurator-runtime@configurator-360.iam.gserviceaccount.com',
  invoker: 'public', timeoutSeconds: 120, memory: '512MiB', maxInstances: 4, concurrency: 4,
};
function errorResponse(res, error) {
  if (res.headersSent) { res.destroy(); return; }
  res.removeHeader('Content-Length');
  res.removeHeader('Content-Disposition');
  res.removeHeader('ETag');
  res.set('Content-Type', 'application/json; charset=utf-8');
  const known = error instanceof ARRequestError;
  if (!known) logger.error('Hall AR service failure', { code: String(error?.code || ''), message: String(error?.message || '') });
  res.status(known ? error.status : 503).set('Cache-Control', 'no-store').json({
    error: { code: known ? error.code : 'service-unavailable', message: known ? error.message : 'AR storage is temporarily unavailable. Please try again.' },
  });
}
async function allowPublisher(origin, product) {
  if (PUBLIC_ORIGINS.has(origin) || DEV_ORIGIN.test(origin)) return;
  const context = tenantOriginContext(origin);
  if (context) {
    const snap = await getFirestore().collection('tenants').doc(context.slug).get();
    const tenant = snap.data() || {};
    if (snap.exists && tenant.status === 'active' && tenantRecordMatchesHost(tenant, context.hostname) && tenant.configurators?.[product] === true) return;
  }
  reject(403, 'origin-denied', 'AR publication is not allowed from this website.');
}
async function consumeQuota(req, bytes, now) {
  // Network-level abuse budget, not an authenticated user identity. The direct
  // cloudfunctions.net route adds a final client hop; never use a caller's first
  // forwarded entry. Shared proxies/NATs may share this budget. The separate
  // global budget still caps stored bytes if a network key changes.
  const forwarded = String(req.get('x-forwarded-for') || '').split(',').map(v => v.trim()).filter(Boolean);
  const ip = forwarded.at(-1) || req.ip || 'unknown';
  const day = new Date(now).toISOString().slice(0, 10), hour = Math.floor(now / 3600000);
  const digest = createHash('sha256').update(`${PROJECT_ID}|${day}|${ip}`).digest('hex');
  const collection = getFirestore().collection(RATE_LIMITS);
  const refs = [collection.doc(`ip-${hour}-${digest}`), collection.doc(`global-${day}`)];
  await getFirestore().runTransaction(async tx => {
    const docs = await Promise.all(refs.map(ref => tx.get(ref)));
    const user = quotaDecision(docs[0].data(), bytes, 12, 160 * 1024 * 1024);
    const global = quotaDecision(docs[1].data(), bytes, 300, 1024 * 1024 * 1024);
    const purgeAt = Timestamp.fromMillis(now + 3 * LIFETIME_MS);
    tx.set(refs[0], { ...user, purgeAt }); tx.set(refs[1], { ...global, purgeAt });
  });
}

exports.publishHallAR = onRequest({ ...OPTIONS, cors: false }, async (req, res) => {
  res.set('Vary', 'Origin'); res.set('Cache-Control', 'no-store');
  try {
    const origin = String(req.get('origin') || '');
    // Product is a query parameter so OPTIONS can check the same tenant entitlement.
    // Omission means Hall for QR dialogs already deployed before this update.
    const product = req.query.product === undefined ? 'hall' : req.query.product;
    if (!PRODUCTS.has(product)) reject(400, 'invalid-product', 'AR is not enabled for this configurator.');
    await allowPublisher(origin, product);
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Hall-AR-Format');
    res.set('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') reject(405, 'method-not-allowed', 'Use POST to publish an AR model.');
    const format = String(req.get('x-hall-ar-format') || '');
    if (!Object.hasOwn(FORMATS, format)) reject(400, 'invalid-format', 'Choose Android or iOS.');
    if (String(req.get('content-type') || '').split(';')[0] !== 'application/octet-stream') reject(415, 'invalid-type', 'A binary AR model is required.');
    const body = req.rawBody;
    if (!Buffer.isBuffer(body) || body.length < 128) reject(400, 'invalid-model', 'The AR model is empty.');
    if (body.length > FORMATS[format].maxBytes) reject(413, 'model-too-large', 'This configuration is too detailed for mobile AR.');
    const now = Date.now();
    // Charge attempts, not just successful publications: invalid files cannot
    // bypass the byte/count budgets. No client-controlled filenames or bucket paths.
    await consumeQuota(req, body.length, now);
    const asset = validateAsset(format, body);
    const id = randomBytes(24).toString('base64url');
    const objectPath = productPath(id, format, product);
    const file = getStorage().bucket(BUCKET_NAME).file(objectPath);
    const expiresAtMs = now + LIFETIME_MS;
    try {
      await file.save(body, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: {
        contentType: FORMATS[format].type, cacheControl: 'private, max-age=300',
        contentDisposition: `inline; filename="${product}.${format}"`,
        metadata: { expiresAt: String(expiresAtMs), sha256: asset.sha256 },
      } });
      await getFirestore().collection(SESSIONS).doc(id).create({
        product, format, byteLength: asset.size, sha256: asset.sha256, objectPath,
        createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(expiresAtMs),
        purgeAt: Timestamp.fromMillis(now + 3 * LIFETIME_MS),
      });
    } catch (error) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw error;
    }
    res.status(201).json({ id, product, format, byteLength: asset.size, expiresAtMs });
  } catch (error) { errorResponse(res, error); }
});

// These random, expiring capability links must work without cookies or login:
// native Google/Apple viewers fetch the model from their own HTTP clients.
exports.getHallAR = onRequest({ ...OPTIONS, cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Range');
  res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag');
  res.set('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) reject(405, 'method-not-allowed', 'Use GET to open an AR model.');
    const id = requireId(req.query.id);
    const snap = await getFirestore().collection(SESSIONS).doc(id).get();
    if (!snap.exists) reject(404, 'not-found', 'AR session not found. Create a new QR code in the configurator.');
    const data = snap.data();
    if (!data.expiresAt?.toMillis || data.expiresAt.toMillis() <= Date.now()) reject(410, 'expired', 'This AR link has expired. Create a new QR code in the configurator.');
    if (!validStoredAsset(id, data)) reject(404, 'not-found', 'AR session not found.');
    const expiresAtMs = data.expiresAt.toMillis();
    if (req.query.asset !== '1') {
      res.set('Cache-Control', 'no-store').json({ id, product: data.product, format: data.format, byteLength: data.byteLength, expiresAtMs });
      return;
    }
    res.set('Accept-Ranges', 'bytes');
    let range;
    try { range = parseRange(req.get('range'), data.byteLength); } catch (error) {
      res.set('Content-Range', `bytes */${data.byteLength}`); throw error;
    }
    res.set('Content-Type', FORMATS[data.format].type);
    res.set('Content-Disposition', `inline; filename="${data.product}.${data.format}"`);
    res.set('ETag', `"${data.sha256}"`);
    // No proxy/CDN may keep a model past the declared link lifetime.
    res.set('Cache-Control', `private, max-age=${Math.max(0, Math.min(300, Math.floor((expiresAtMs-Date.now())/1000)))}`);
    res.set('Content-Length', String(range ? range.end - range.start + 1 : data.byteLength));
    if (range) res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${data.byteLength}`);
    if (req.method === 'HEAD') { res.end(); return; }
    const file = getStorage().bucket(BUCKET_NAME).file(data.objectPath);
    // Send one bounded response, not a streamed response: gen-2 Functions allow
    // 32 MB non-streaming but only 10 MB streaming. USDZ has a 24 MiB cap here.
    const [bytes] = await file.download(range || {});
    const expected = range ? range.end - range.start + 1 : data.byteLength;
    if (bytes.length !== expected) throw new Error('Stored AR asset length mismatch');
    res.end(bytes);
  } catch (error) { errorResponse(res, error); }
});

exports.cleanupHallAR = onSchedule({
  region: OPTIONS.region, serviceAccount: OPTIONS.serviceAccount, schedule: 'every 60 minutes',
  timeoutSeconds: 300, memory: '256MiB', maxInstances: 1, retryCount: 2,
}, async () => {
  const db = getFirestore(), bucket = getStorage().bucket(BUCKET_NAME);
  let removed = 0;
  for (let page = 0; page < 8; page++) {
    const docs = await db.collection(SESSIONS).where('expiresAt', '<=', Timestamp.now()).limit(100).get();
    if (docs.empty) break;
    for (const doc of docs.docs) {
      const data = doc.data();
      if (validStoredAsset(doc.id, data)) {
        await bucket.file(data.objectPath).delete({ ignoreNotFound: true });
      }
      await doc.ref.delete(); removed++;
    }
  }
  logger.info('Expired Hall AR assets removed', { count: removed });
});
