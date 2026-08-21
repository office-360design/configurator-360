'use strict';

const { onInit } = require('firebase-functions/v2/core');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { randomBytes } = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const { initializeApp } = require('firebase-admin/app');
const { AggregateField, FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore');

// Firebase CLI loads this module during deployment to discover exported functions.
// Defer Admin/Monitoring initialization until the deployed runtime starts so
// discovery does not initialize Google services on the developer machine.
let db;
let monitoringAuth;
onInit(() => {
  initializeApp();
  db = getFirestore();
  monitoringAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/monitoring.read'],
  });
});

const PROJECT_ID = 'configurator-360';
const SHARES_COLLECTION = 'sharedConfigurations';
const SYSTEM_COLLECTION = 'sharedConfigurationSystem';
const APP_CHECK_USAGE_DOCUMENT = 'appCheckUsage';
const FIRESTORE_RECORD_VERSION = 1;
const ALLOWED_PRODUCTS = new Set(['window', 'roof', 'pergola', 'hall', 'solar', 'fence']);
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;       // 200 MiB
const CLEANUP_CHUNK_BYTES = 1 * 1024 * 1024;     // 1 MiB
const MAX_SINGLE_SHARE_BYTES = 850_000;           // headroom below Firestore's document limit
const SHARE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_QUERY_BATCH = 400;
const FUNCTION_REGION = 'europe-west1';
const RUNTIME_SERVICE_ACCOUNT = 'configurator-runtime@configurator-360.iam.gserviceaccount.com';

// reCAPTCHA Enterprise / App Check budget policy.
const RECAPTCHA_ASSESSMENT_METRIC = 'recaptchaenterprise.googleapis.com/assessment_count';
const RECAPTCHA_MONTHLY_HARD_CAP = 9_500;
const RECAPTCHA_WARNING_THRESHOLDS = Object.freeze([8_000, 9_000, 9_400]);
const USAGE_STATUS_CACHE_MS = 60 * 1000;
const MONITORING_FAILURE_FALLBACK_MS = 10 * 60 * 1000;

function utf8ByteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

function normalizeProductType(value) {
  return String(value ?? '').trim().toLowerCase();
}

function generateShareId() {
  return randomBytes(12).toString('base64url');
}

function validateSharePayload(productType, stateJson) {
  const product = normalizeProductType(productType);
  if (!ALLOWED_PRODUCTS.has(product)) {
    throw new HttpsError('invalid-argument', 'Unsupported configurator type.');
  }
  if (typeof stateJson !== 'string' || stateJson.length === 0) {
    throw new HttpsError('invalid-argument', 'The shared configuration is empty.');
  }

  const sizeBytes = utf8ByteLength(stateJson);
  if (sizeBytes > MAX_SINGLE_SHARE_BYTES) {
    throw new HttpsError(
      'resource-exhausted',
      `This configuration is too large to share (${sizeBytes} bytes).`,
    );
  }

  try {
    const parsed = JSON.parse(stateJson);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
  } catch {
    throw new HttpsError('invalid-argument', 'The shared configuration is not valid JSON.');
  }

  return { product, sizeBytes };
}

function utcMonthWindow(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return {
    month,
    startMs: Date.UTC(year, monthIndex, 1, 0, 0, 0, 0),
    nextMonthMs: Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0),
  };
}

function timestampMillis(value) {
  return value?.toMillis ? value.toMillis() : 0;
}

function usageDocumentRef() {
  return db.collection(SYSTEM_COLLECTION).doc(APP_CHECK_USAGE_DOCUMENT);
}

async function currentStoredBytes(collection) {
  const snapshot = await collection.aggregate({
    totalBytes: AggregateField.sum('sizeBytes'),
  }).get();
  return Number(snapshot.data().totalBytes || 0);
}

async function deleteOldestUntilFreed(collection, bytesToFree, protectedShareId) {
  let freedBytes = 0;
  let deletedCount = 0;

  while (freedBytes < bytesToFree) {
    const oldest = await collection
      .orderBy('createdAt', 'asc')
      .limit(CLEANUP_QUERY_BATCH)
      .get();

    if (oldest.empty) break;

    const batch = db.batch();
    let batchDeleteCount = 0;

    for (const doc of oldest.docs) {
      if (doc.id === protectedShareId) continue;

      const data = doc.data();
      const bytes = Number.isFinite(Number(data.sizeBytes))
        ? Math.max(0, Number(data.sizeBytes))
        : utf8ByteLength(data.s);

      batch.delete(doc.ref);
      batchDeleteCount += 1;
      deletedCount += 1;
      freedBytes += bytes;

      if (freedBytes >= bytesToFree) break;
    }

    if (batchDeleteCount === 0) break;
    await batch.commit();
  }

  return { freedBytes, deletedCount };
}

async function readMonthlyRecaptchaAssessments(startMs, endMs) {
  // Use the Monitoring REST API through google-auth-library. This avoids another
  // large runtime dependency while still using the function's service-account
  // credentials and the monitoring.read OAuth scope.
  const authClient = await monitoringAuth.getClient();
  const baseUrl = `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries`;
  let pageToken = '';
  let total = 0;

  do {
    const params = {
      filter: `metric.type="${RECAPTCHA_ASSESSMENT_METRIC}"`,
      'interval.startTime': new Date(startMs).toISOString(),
      'interval.endTime': new Date(endMs).toISOString(),
      // assessment_count is a DELTA metric with separate series per key/status.
      // Sum into hourly buckets and reduce across every matching series so the
      // threshold covers all reCAPTCHA Enterprise assessments in this project.
      'aggregation.alignmentPeriod': '3600s',
      'aggregation.perSeriesAligner': 'ALIGN_SUM',
      'aggregation.crossSeriesReducer': 'REDUCE_SUM',
      view: 'FULL',
      pageSize: 1000,
    };
    if (pageToken) params.pageToken = pageToken;

    const response = await authClient.request({
      url: baseUrl,
      method: 'GET',
      params,
    });

    const series = response.data?.timeSeries || [];
    for (const timeSeries of series) {
      for (const point of timeSeries.points || []) {
        const raw = point.value?.int64Value ?? point.value?.doubleValue ?? 0;
        const value = Number(raw);
        if (Number.isFinite(value)) total += value;
      }
    }

    pageToken = String(response.data?.nextPageToken || '');
  } while (pageToken);

  return Math.max(0, Math.round(total));
}

function internalWarningLevel(count) {
  if (count >= RECAPTCHA_MONTHLY_HARD_CAP) return 'hard-cap';
  if (count >= 9_400) return 'critical';
  if (count >= 9_000) return 'high';
  if (count >= 8_000) return 'warning';
  return 'normal';
}

function publicProtectionStatus(data, reasonOverride = '') {
  const fallback = Boolean(data.legacyFallbackEnabled)
    && timestampMillis(data.fallbackUntil) > Date.now();
  return {
    mode: fallback ? 'legacy' : 'app-check',
    reason: reasonOverride || String(data.modeReason || (fallback ? 'monthly-safety-fallback' : 'within-monthly-budget')),
    month: String(data.month || utcMonthWindow().month),
    hardCap: RECAPTCHA_MONTHLY_HARD_CAP,
    fallbackUntilMs: fallback ? timestampMillis(data.fallbackUntil) : null,
  };
}

async function refreshRecaptchaUsageStatus({ force = false } = {}) {
  const ref = usageDocumentRef();
  const nowMs = Date.now();
  const window = utcMonthWindow(nowMs);
  const snapshot = await ref.get();
  const previous = snapshot.exists ? snapshot.data() || {} : {};
  const sameMonth = previous.month === window.month;
  const previousCheckedMs = timestampMillis(previous.lastCheckedAt);
  const previousFallbackUntilMs = timestampMillis(previous.fallbackUntil);

  // If the 9,500 hard cap was already confirmed for this month, never call the
  // reCAPTCHA/App Check path again before the next UTC month begins.
  if (
    sameMonth
    && previous.legacyFallbackEnabled === true
    && previous.modeReason === 'monthly-hard-cap'
    && previousFallbackUntilMs > nowMs
  ) {
    return publicProtectionStatus(previous);
  }

  if (
    !force
    && sameMonth
    && Number.isFinite(Number(previous.assessmentCount))
    && previousCheckedMs > nowMs - USAGE_STATUS_CACHE_MS
  ) {
    return publicProtectionStatus(previous);
  }

  if (!sameMonth && previous.month) {
    logger.info('reCAPTCHA App Check monthly protection automatically reopened.', {
      event: 'recaptcha-protection-auto-restored',
      previousMonth: previous.month,
      newMonth: window.month,
      previousAssessmentCount: Number(previous.assessmentCount || 0),
      previousFallbackWasActive: Boolean(previous.legacyFallbackEnabled),
    });
  }

  try {
    const assessmentCount = await readMonthlyRecaptchaAssessments(window.startMs, nowMs);
    const priorWarnings = sameMonth && Array.isArray(previous.warningThresholdsSent)
      ? previous.warningThresholdsSent.map(Number).filter(Number.isFinite)
      : [];
    const warningsSent = new Set(priorWarnings);

    for (const threshold of RECAPTCHA_WARNING_THRESHOLDS) {
      if (assessmentCount >= threshold && !warningsSent.has(threshold)) {
        logger.warn('reCAPTCHA Enterprise monthly assessment usage warning.', {
          event: 'recaptcha-assessment-usage-warning',
          month: window.month,
          assessmentCount,
          warningThreshold: threshold,
          hardCap: RECAPTCHA_MONTHLY_HARD_CAP,
        });
        warningsSent.add(threshold);
      }
    }

    const hardCapReached = assessmentCount >= RECAPTCHA_MONTHLY_HARD_CAP;
    const wasHardCapFallback = sameMonth
      && previous.legacyFallbackEnabled === true
      && previous.modeReason === 'monthly-hard-cap';

    if (hardCapReached && !wasHardCapFallback) {
      logger.warn('reCAPTCHA monthly hard cap reached; Share switched to the reCAPTCHA-free fallback until next month.', {
        event: 'recaptcha-hard-cap-fallback-activated',
        month: window.month,
        assessmentCount,
        hardCap: RECAPTCHA_MONTHLY_HARD_CAP,
        fallbackUntilMs: window.nextMonthMs,
      });
    }

    const nextState = {
      month: window.month,
      assessmentCount,
      hardCap: RECAPTCHA_MONTHLY_HARD_CAP,
      warningLevel: internalWarningLevel(assessmentCount),
      warningThresholdsSent: [...warningsSent].sort((a, b) => a - b),
      legacyFallbackEnabled: hardCapReached,
      fallbackUntil: Timestamp.fromMillis(window.nextMonthMs),
      modeReason: hardCapReached ? 'monthly-hard-cap' : 'within-monthly-budget',
      lastCheckedAt: Timestamp.now(),
      // Never reset this flag here. The first successfully App Check-protected
      // share sets it to true; thereafter direct Firestore creates are allowed
      // only during an explicit fallback window.
      secureModeActive: previous.secureModeActive === true,
    };

    if (!sameMonth) {
      nextState.monthStartedAt = Timestamp.fromMillis(window.startMs);
      nextState.lastModeChangedAt = Timestamp.now();
      nextState.lastAutoRestoredAt = Timestamp.now();
    } else if (Boolean(previous.legacyFallbackEnabled) !== hardCapReached) {
      nextState.lastModeChangedAt = Timestamp.now();
    }
    if (hardCapReached && !wasHardCapFallback) {
      nextState.hardCapActivatedAt = Timestamp.now();
    }

    await ref.set(nextState, { merge: true });
    return publicProtectionStatus(nextState);
  } catch (error) {
    // Availability wins if Monitoring is temporarily unavailable, but safety wins
    // on cost: use the existing reCAPTCHA-free path for ten minutes and retry
    // later rather than creating unmetered assessments while blind to usage.
    const fallbackUntilMs = Math.min(window.nextMonthMs, nowMs + MONITORING_FAILURE_FALLBACK_MS);
    const failureState = {
      month: window.month,
      hardCap: RECAPTCHA_MONTHLY_HARD_CAP,
      warningLevel: 'monitoring-unavailable',
      legacyFallbackEnabled: true,
      fallbackUntil: Timestamp.fromMillis(fallbackUntilMs),
      modeReason: 'monitoring-unavailable',
      lastCheckedAt: Timestamp.now(),
      lastMonitoringErrorAt: Timestamp.now(),
      secureModeActive: previous.secureModeActive === true,
    };
    await ref.set(failureState, { merge: true });

    logger.warn('Could not read reCAPTCHA assessment usage; Share temporarily switched to the reCAPTCHA-free fallback.', {
      event: 'recaptcha-monitoring-unavailable-fallback',
      month: window.month,
      fallbackUntilMs,
      error: String(error?.message || error),
    });

    return publicProtectionStatus(failureState);
  }
}

// Public on purpose. The browser must ask this BEFORE App Check is initialized;
// protecting this endpoint with App Check would consume the assessment that this
// endpoint exists to decide whether we are still allowed to spend.
exports.getShareProtectionStatus = onCall(
  {
    region: FUNCTION_REGION,
    serviceAccount: RUNTIME_SERVICE_ACCOUNT,
    enforceAppCheck: false,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async () => refreshRecaptchaUsageStatus(),
);

exports.createSharedConfiguration = onCall(
  {
    region: FUNCTION_REGION,
    serviceAccount: RUNTIME_SERVICE_ACCOUNT,
    enforceAppCheck: true,
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 180,
    memory: '256MiB',
  },
  async (request) => {
    const stateJson = request.data?.stateJson;
    const { product, sizeBytes } = validateSharePayload(request.data?.productType, stateJson);
    const collection = db.collection(SHARES_COLLECTION);

    const currentBytes = await currentStoredBytes(collection);
    const projectedBytes = currentBytes + sizeBytes;

    if (projectedBytes > MAX_TOTAL_BYTES) {
      const overflowBytes = projectedBytes - MAX_TOTAL_BYTES;
      const bytesToFree = Math.max(CLEANUP_CHUNK_BYTES, overflowBytes);
      const cleanup = await deleteOldestUntilFreed(collection, bytesToFree, '');
      const afterCleanupBytes = await currentStoredBytes(collection);

      if (afterCleanupBytes + sizeBytes > MAX_TOTAL_BYTES) {
        throw new HttpsError(
          'resource-exhausted',
          'Shared configuration storage is temporarily full. Please try again.',
        );
      }

      logger.info('Shared configuration FIFO cleanup completed before secure write.', {
        event: 'shared-configuration-prewrite-quota-cleanup',
        requestedBytesToFree: bytesToFree,
        freedBytes: cleanup.freedBytes,
        deletedCount: cleanup.deletedCount,
        totalBytesAfterCleanup: afterCleanupBytes,
        incomingShareBytes: sizeBytes,
        limitBytes: MAX_TOTAL_BYTES,
      });
    }

    // Reaching this point already proves a valid App Check token. Mark the rollout
    // active before writing the share so direct Firestore creation is closed from
    // this moment onward except during a server-authorized fallback window.
    await usageDocumentRef().set({
      secureModeActive: true,
      secureModeActivatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const createdAt = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + SHARE_LIFETIME_MS);
    const documentData = {
      v: FIRESTORE_RECORD_VERSION,
      p: product,
      s: stateJson,
      sizeBytes,
      createdAt,
      expiresAt,
      quotaVersion: 2,
    };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const shareId = generateShareId();
      try {
        await collection.doc(shareId).create(documentData);

        return {
          id: shareId,
          expiresAtMs: expiresAt.toMillis(),
          sizeBytes,
        };
      } catch (error) {
        if (Number(error?.code) === 6 || String(error?.code) === 'already-exists') continue;
        logger.error('Secure share creation failed.', error);
        throw new HttpsError('internal', 'The shared configuration could not be stored.');
      }
    }

    throw new HttpsError('aborted', 'Could not allocate a unique share id. Please try again.');
  },
);


// ---------------------------------------------------------------------------
// Private per-user saved configurations
// ---------------------------------------------------------------------------
const USER_SAVED_CONFIGURATION_VERSION = 1;
const MAX_SAVED_CONFIGURATION_BYTES = 850_000;
const MAX_SAVED_CONFIGURATION_NAME_LENGTH = 80;
const SAVED_CONFIGURATION_LIST_LIMIT = 100;

function requireAuthenticatedUid(request) {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Google login is required.');
  return uid;
}

function validateSavedConfigurationId(value, { optional = false } = {}) {
  const id = String(value || '').trim();
  if (!id && optional) return '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'Invalid saved configuration id.');
  }
  return id;
}

function validateSavedConfigurationPayload(productType, name, stateJson) {
  const product = normalizeProductType(productType);
  if (!ALLOWED_PRODUCTS.has(product)) {
    throw new HttpsError('invalid-argument', 'Unsupported configurator type.');
  }

  const projectName = String(name || '').trim();
  if (!projectName || projectName.length > MAX_SAVED_CONFIGURATION_NAME_LENGTH) {
    throw new HttpsError('invalid-argument', 'The project name is invalid.');
  }

  if (typeof stateJson !== 'string' || !stateJson.length) {
    throw new HttpsError('invalid-argument', 'The saved configuration is empty.');
  }
  const sizeBytes = utf8ByteLength(stateJson);
  if (sizeBytes > MAX_SAVED_CONFIGURATION_BYTES) {
    throw new HttpsError('resource-exhausted', 'This configuration is too large to save.');
  }
  try {
    const parsed = JSON.parse(stateJson);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
  } catch {
    throw new HttpsError('invalid-argument', 'The saved configuration is not valid JSON.');
  }

  return { product, projectName, sizeBytes };
}

function userSavedItemsCollection(uid, product) {
  return db
    .collection('users')
    .doc(uid)
    .collection('savedConfigurations')
    .doc(product)
    .collection('items');
}

const USER_CONFIGURATION_CALLABLE_OPTIONS = Object.freeze({
  region: FUNCTION_REGION,
  serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  // Saved configurations authenticate with the Google/Firebase ID token. App
  // Check remains deliberately disabled here so reCAPTCHA assessments stay
  // exclusive to the Share action, as required by the monthly assessment policy.
  enforceAppCheck: false,
  timeoutSeconds: 30,
  memory: '256MiB',
});

exports.saveUserConfiguration = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const uid = requireAuthenticatedUid(request);
    const stateJson = request.data?.stateJson;
    const { product, projectName, sizeBytes } = validateSavedConfigurationPayload(
      request.data?.productType,
      request.data?.name,
      stateJson,
    );
    const requestedId = validateSavedConfigurationId(request.data?.id, { optional: true });
    const collection = userSavedItemsCollection(uid, product);
    const ref = requestedId ? collection.doc(requestedId) : collection.doc();
    const existing = await ref.get();
    const now = Timestamp.now();
    const createdAt = existing.exists && existing.data()?.createdAt
      ? existing.data().createdAt
      : now;

    await ref.set({
      v: USER_SAVED_CONFIGURATION_VERSION,
      p: product,
      n: projectName,
      s: stateJson,
      sizeBytes,
      createdAt,
      updatedAt: now,
    });

    return {
      id: ref.id,
      name: projectName,
      productType: product,
      sizeBytes,
      createdAtMs: createdAt.toMillis(),
      updatedAtMs: now.toMillis(),
    };
  },
);

exports.listUserConfigurations = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const uid = requireAuthenticatedUid(request);
    const product = normalizeProductType(request.data?.productType);
    if (!ALLOWED_PRODUCTS.has(product)) {
      throw new HttpsError('invalid-argument', 'Unsupported configurator type.');
    }

    const snapshot = await userSavedItemsCollection(uid, product)
      .orderBy('updatedAt', 'desc')
      .limit(SAVED_CONFIGURATION_LIST_LIMIT)
      .select('n', 'createdAt', 'updatedAt', 'sizeBytes')
      .get();

    return {
      items: snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: String(data.n || ''),
          sizeBytes: Number(data.sizeBytes || 0),
          createdAtMs: timestampMillis(data.createdAt),
          updatedAtMs: timestampMillis(data.updatedAt),
        };
      }),
    };
  },
);

exports.getUserConfiguration = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const uid = requireAuthenticatedUid(request);
    const product = normalizeProductType(request.data?.productType);
    if (!ALLOWED_PRODUCTS.has(product)) {
      throw new HttpsError('invalid-argument', 'Unsupported configurator type.');
    }
    const id = validateSavedConfigurationId(request.data?.id);
    const snapshot = await userSavedItemsCollection(uid, product).doc(id).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'Saved configuration not found.');
    const data = snapshot.data() || {};

    return {
      id: snapshot.id,
      name: String(data.n || ''),
      productType: product,
      stateJson: String(data.s || ''),
      sizeBytes: Number(data.sizeBytes || 0),
      createdAtMs: timestampMillis(data.createdAt),
      updatedAtMs: timestampMillis(data.updatedAt),
    };
  },
);

exports.deleteUserConfiguration = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const uid = requireAuthenticatedUid(request);
    const product = normalizeProductType(request.data?.productType);
    if (!ALLOWED_PRODUCTS.has(product)) {
      throw new HttpsError('invalid-argument', 'Unsupported configurator type.');
    }
    const id = validateSavedConfigurationId(request.data?.id);
    await userSavedItemsCollection(uid, product).doc(id).delete();
    return { id, deleted: true };
  },
);

// Direct-Firestore shares remain the explicit no-reCAPTCHA fallback. The rules
// permit them before App Check is activated for the first time and, afterwards,
// only while the server-controlled fallback window is active. This trigger keeps
// that path under the same 200 MiB FIFO quota and 90-day lifetime policy.
exports.enforceSharedConfigurationQuota = onDocumentCreated(
  {
    document: `${SHARES_COLLECTION}/{shareId}`,
    region: FUNCTION_REGION,
    serviceAccount: RUNTIME_SERVICE_ACCOUNT,
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 180,
    memory: '256MiB',
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const shareId = event.params.shareId;
    const data = snapshot.data();

    // Protected callable writes are already quota/lifetime annotated.
    if (
      Number(data.quotaVersion) >= 2
      && Number.isFinite(Number(data.sizeBytes))
      && data.createdAt
      && data.expiresAt
    ) {
      return;
    }

    const serializedState = data.s;
    if (typeof serializedState !== 'string' || serializedState.length === 0) {
      logger.warn(`Deleting invalid shared configuration ${shareId}: missing state string.`);
      await snapshot.ref.delete();
      return;
    }

    const sizeBytes = utf8ByteLength(serializedState);
    if (sizeBytes > MAX_SINGLE_SHARE_BYTES) {
      logger.warn(`Deleting oversized shared configuration ${shareId}.`, {
        event: 'shared-configuration-oversize-delete',
        shareId,
        sizeBytes,
        maxBytes: MAX_SINGLE_SHARE_BYTES,
      });
      await snapshot.ref.delete();
      return;
    }

    const createdAt = snapshot.createTime || Timestamp.now();
    const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + SHARE_LIFETIME_MS);
    await snapshot.ref.update({
      sizeBytes,
      createdAt,
      expiresAt,
      quotaVersion: 1,
    });

    const collection = db.collection(SHARES_COLLECTION);
    const totalBytes = await currentStoredBytes(collection);

    if (totalBytes <= MAX_TOTAL_BYTES) {
      logger.info('Legacy/fallback share stored within quota.', {
        event: 'shared-configuration-fallback-stored',
        shareId,
        sizeBytes,
        totalBytes,
        limitBytes: MAX_TOTAL_BYTES,
      });
      return;
    }

    const overflowBytes = totalBytes - MAX_TOTAL_BYTES;
    const bytesToFree = Math.max(CLEANUP_CHUNK_BYTES, overflowBytes);
    const cleanup = await deleteOldestUntilFreed(collection, bytesToFree, shareId);
    const remainingBytes = await currentStoredBytes(collection);

    logger.info('Shared configuration FIFO quota cleanup completed.', {
      event: 'shared-configuration-quota-cleanup',
      shareId,
      totalBytesBeforeCleanup: totalBytes,
      requestedBytesToFree: bytesToFree,
      freedBytes: cleanup.freedBytes,
      deletedCount: cleanup.deletedCount,
      totalBytesAfterCleanup: remainingBytes,
      limitBytes: MAX_TOTAL_BYTES,
    });

    if (remainingBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Shared configuration quota cleanup incomplete: ${remainingBytes} bytes remain ` +
        `above the ${MAX_TOTAL_BYTES}-byte limit.`,
      );
    }
  },
);
