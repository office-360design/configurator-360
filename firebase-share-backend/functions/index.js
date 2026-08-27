'use strict';

const { onInit } = require('firebase-functions/v2/core');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { createHash, randomBytes } = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { AggregateField, FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore');

// Firebase CLI loads this module during deployment to discover exported functions.
// Defer Admin/Monitoring initialization until the deployed runtime starts so
// discovery does not initialize Google services on the developer machine.
let db;
let adminAuth;
let monitoringAuth;
let mailerSignerAuth;
let identityToolkitAuth;
let gmailAccessTokenCache = { token: '', expiresAtMs: 0 };
onInit(() => {
  initializeApp();
  db = getFirestore();
  adminAuth = getAuth();
  monitoringAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/monitoring.read'],
  });
  mailerSignerAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  identityToolkitAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
});

const PROJECT_ID = 'configurator-360';
const SHARES_COLLECTION = 'sharedConfigurations';
const SYSTEM_COLLECTION = 'sharedConfigurationSystem';
const APP_CHECK_USAGE_DOCUMENT = 'appCheckUsage';
const FIRESTORE_RECORD_VERSION = 1;
const ALLOWED_PRODUCTS = new Set(['window', 'roof', 'pergola', 'hall', 'solar', 'fence']);

// Tier-1 tenant provisioning.
const TENANTS_COLLECTION = 'tenants';
const TENANT_PUBLIC_COLLECTION = 'tenantPublic';
const TENANT_PROVISIONING_ADMINS_COLLECTION = 'tenantProvisioningAdmins';
const TENANT_SCHEMA_VERSION = 1;
const TENANT_PLAN_GO_LIVE_NOW = 'go_live_now';
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const TENANT_COMPANY_NAME_MAX_LENGTH = 120;
const TENANT_LOGO_MAX_BYTES = 200_000;
const TENANT_ADMIN_LIST_LIMIT = 500;
const TENANT_STATUSES = new Set(['active', 'suspended']);
const TENANT_ADMIN_ORIGIN = 'https://www.360configurator.com';
const TENANT_ADMIN_DEVELOPMENT_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const RESERVED_TENANT_SLUGS = new Set([
  'www',
  'aks',
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'cdn',
  'demo',
  'dev',
  'ftp',
  'mail',
  'staging',
  'static',
  'status',
  'support',
  'test',
]);
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;       // 200 MiB
const CLEANUP_CHUNK_BYTES = 1 * 1024 * 1024;     // 1 MiB
const MAX_SINGLE_SHARE_BYTES = 850_000;           // headroom below Firestore's document limit
const SHARE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_QUERY_BATCH = 400;
const FUNCTION_REGION = 'europe-west1';
const RUNTIME_SERVICE_ACCOUNT = 'configurator-runtime@configurator-360.iam.gserviceaccount.com';
const DOMAIN_AUTH_HANDOFFS_COLLECTION = 'domainAuthHandoffs';
const DOMAIN_AUTH_HANDOFF_LIFETIME_MS = 5 * 60 * 1000;
const DOMAIN_AUTH_HANDOFF_CLEANUP_LIMIT = 100;
const DOMAIN_AUTH_HANDOFF_ID_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const ALLOWED_CONFIGURATOR_ORIGINS = new Set([
  'https://360configurator.com',
  'https://www.360configurator.com',
  'https://360configurator.ro',
  'https://www.360configurator.ro',
  'https://360konfigurator.de',
  'https://www.360konfigurator.de',
  'https://aks.360configurator.com',
]);
const USER_CONFIGURATION_DEVELOPMENT_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

// Marketing-site contact form.
const CONTACT_RATE_LIMIT_COLLECTION = 'contactSubmissionRateLimits';
const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CONTACT_RATE_LIMIT_MAX_ATTEMPTS = 5;
const CONTACT_RATE_LIMIT_BLOCK_MS = 30 * 60 * 1000;
const CONTACT_RATE_LIMIT_TTL_MS = 24 * 60 * 60 * 1000;
const CONTACT_ALLOWED_ORIGINS = Object.freeze([
  'https://360configurator.com',
  'https://www.360configurator.com',
  'https://360configurator.ro',
  'https://www.360configurator.ro',
  'https://360konfigurator.de',
  'https://www.360konfigurator.de',
  'https://aks.360configurator.com',
]);
const CONTACT_DEVELOPMENT_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const CONTACT_ALLOWED_LANGUAGES = new Set(['en', 'ro', 'de']);
const CONTACT_DESTINATIONS = Object.freeze({
  ro: 'office@360configurator.ro',
  en: 'office@360configurator.com',
  de: 'office@360configurator.com',
});
const CONTACT_FROM = '360Configurator Website <office@360configurator.com>';
const CONTACT_FALLBACK_FROM = '360Configurator Website <office@360design.ro>';
const CONTACT_WORKSPACE_USER = 'office@360design.ro';
const CONTACT_MAILER_SERVICE_ACCOUNT = 'configurator-mailer@configurator-360.iam.gserviceaccount.com';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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

// ---------------------------------------------------------------------------
// Marketing website contact form
// ---------------------------------------------------------------------------

function isAllowedContactOrigin(origin) {
  const normalized = String(origin || '').trim().replace(/\/$/, '');
  return CONTACT_ALLOWED_ORIGINS.includes(normalized)
    || CONTACT_DEVELOPMENT_ORIGIN.test(normalized);
}

function sanitizeSingleLine(value, maxLength) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.slice(0, maxLength);
}

function sanitizeMessage(value, maxLength) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

function validEmail(value) {
  if (!value || value.length > 254 || /[\r\n]/.test(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateContactPayload(data, requestOrigin) {
  const name = sanitizeSingleLine(data?.name, 120);
  const email = sanitizeSingleLine(data?.email, 254).toLowerCase();
  const company = sanitizeSingleLine(data?.company, 160);
  const phone = sanitizeSingleLine(data?.phone, 60);
  const configuratorInterest = sanitizeSingleLine(data?.configuratorInterest, 160);
  const message = sanitizeMessage(data?.message, 5000);
  const language = sanitizeSingleLine(data?.language, 8).toLowerCase();
  const sourcePageValue = sanitizeSingleLine(data?.sourcePage, 2048);
  if (!name || !email || !company || !message || !language || !sourcePageValue) {
    throw new HttpsError('invalid-argument', 'Please complete all required contact fields.');
  }
  if (!validEmail(email)) {
    throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  }
  if (!CONTACT_ALLOWED_LANGUAGES.has(language)) {
    throw new HttpsError('invalid-argument', 'Unsupported contact form language.');
  }

  let sourcePage;
  try {
    sourcePage = new URL(sourcePageValue);
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid contact form source page.');
  }
  if (!['https:', 'http:'].includes(sourcePage.protocol)) {
    throw new HttpsError('invalid-argument', 'Invalid contact form source page.');
  }
  if (sourcePage.origin !== requestOrigin) {
    throw new HttpsError('permission-denied', 'The contact form source page is not allowed.');
  }

  // The path is enough to identify the source page. Drop query strings and
  // fragments so campaign parameters or accidental personal data never enter
  // the email/logging pipeline through the URL.
  sourcePage.search = '';
  sourcePage.hash = '';

  return {
    name,
    email,
    company,
    phone,
    configuratorInterest,
    message,
    language,
    sourcePage: sourcePage.toString(),
    sourceHost: sourcePage.hostname,
  };
}

function contactClientIp(rawRequest) {
  const forwarded = String(rawRequest?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || String(rawRequest?.ip || rawRequest?.socket?.remoteAddress || 'unknown');
}

function contactRateLimitKey(rawRequest) {
  return createHash('sha256')
    .update(`contact-rate-limit:v1:${contactClientIp(rawRequest)}`)
    .digest('hex');
}

async function enforceContactRateLimit(rawRequest) {
  const nowMs = Date.now();
  const ref = db.collection(CONTACT_RATE_LIMIT_COLLECTION).doc(contactRateLimitKey(rawRequest));
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() || {} : {};
    const windowStartMs = timestampMillis(existing.windowStart);
    const blockedUntilMs = timestampMillis(existing.blockedUntil);
    const existingCount = Math.max(0, Number(existing.count || 0));

    if (blockedUntilMs > nowMs) {
      return { allowed: false, retryAfterMs: blockedUntilMs - nowMs };
    }

    const windowExpired = !windowStartMs || windowStartMs <= nowMs - CONTACT_RATE_LIMIT_WINDOW_MS;
    const windowStart = windowExpired ? Timestamp.fromMillis(nowMs) : existing.windowStart;
    const count = windowExpired ? 1 : existingCount + 1;
    const blocked = count > CONTACT_RATE_LIMIT_MAX_ATTEMPTS;
    const blockedUntil = blocked
      ? Timestamp.fromMillis(nowMs + CONTACT_RATE_LIMIT_BLOCK_MS)
      : null;

    transaction.set(ref, {
      count,
      windowStart,
      lastAttemptAt: Timestamp.fromMillis(nowMs),
      blockedUntil,
      expiresAt: Timestamp.fromMillis(nowMs + CONTACT_RATE_LIMIT_TTL_MS),
    }, { merge: false });

    return {
      allowed: !blocked,
      retryAfterMs: blocked ? CONTACT_RATE_LIMIT_BLOCK_MS : 0,
    };
  });

  if (!result.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      'Too many contact form attempts. Please try again later.',
      { retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000) },
    );
  }
}

function contactEmailText(contact) {
  const labels = {
    en: 'English',
    ro: 'Romanian',
    de: 'German',
  };
  const optionalPhone = contact.phone || 'Not provided';
  const optionalInterest = contact.configuratorInterest || 'Not provided';
  return [
    'New 360Configurator website enquiry',
    '',
    `Name: ${contact.name}`,
    `Email: ${contact.email}`,
    `Company: ${contact.company}`,
    `Phone: ${optionalPhone}`,
    `Configurator interest: ${optionalInterest}`,
    `Language: ${labels[contact.language]} (${contact.language})`,
    `Source page: ${contact.sourcePage}`,
    '',
    'Message:',
    contact.message,
  ].join('\n');
}

function encodeMimeSubject(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function encodeMimeMessage({ from, to, replyTo, subject, text }) {
  const normalizedText = String(text || '').replace(/\r?\n/g, '\r\n');
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    normalizedText,
  ].join('\r\n');

  return Buffer.from(mime, 'utf8').toString('base64url');
}

async function delegatedGmailAccessToken() {
  const nowMs = Date.now();
  if (gmailAccessTokenCache.token && gmailAccessTokenCache.expiresAtMs > nowMs + 5 * 60 * 1000) {
    return gmailAccessTokenCache.token;
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  const jwtPayload = JSON.stringify({
    iss: CONTACT_MAILER_SERVICE_ACCOUNT,
    sub: CONTACT_WORKSPACE_USER,
    scope: GMAIL_SEND_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });

  const signerClient = await mailerSignerAuth.getClient();
  const signResponse = await signerClient.request({
    url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(CONTACT_MAILER_SERVICE_ACCOUNT)}:signJwt`,
    method: 'POST',
    data: { payload: jwtPayload },
  });
  const signedJwt = String(signResponse.data?.signedJwt || '');
  if (!signedJwt) {
    throw new Error('Google IAM Credentials did not return a signed JWT.');
  }

  const tokenResponse = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });
  if (!tokenResponse.ok) {
    logger.error('Could not exchange the delegated Workspace JWT for a Gmail access token.', {
      event: 'contact-gmail-token-error',
      providerStatus: tokenResponse.status,
      impersonatedUserDomain: CONTACT_WORKSPACE_USER.split('@')[1],
    });
    throw new Error('Google Workspace delegated authorization failed.');
  }

  const tokenData = await tokenResponse.json();
  const accessToken = String(tokenData?.access_token || '');
  const expiresInSeconds = Math.max(60, Number(tokenData?.expires_in || 3600));
  if (!accessToken) {
    throw new Error('Google OAuth did not return an access token.');
  }

  gmailAccessTokenCache = {
    token: accessToken,
    expiresAtMs: nowMs + expiresInSeconds * 1000,
  };
  return accessToken;
}

async function gmailSendRaw(accessToken, raw) {
  return fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(CONTACT_WORKSPACE_USER)}/messages/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': '360ConfiguratorContact/1.0',
      },
      body: JSON.stringify({ raw }),
    },
  );
}

async function sendContactEmail(contact) {
  const destination = CONTACT_DESTINATIONS[contact.language];
  const accessToken = await delegatedGmailAccessToken();
  const subject = `[360Configurator] ${contact.company} — ${contact.name}`;
  const text = contactEmailText(contact);

  let sender = CONTACT_FROM;
  let response = await gmailSendRaw(accessToken, encodeMimeMessage({
    from: sender,
    to: destination,
    replyTo: contact.email,
    subject,
    text,
  }));

  // The 360configurator.com domain is a Google Workspace alias domain. If its
  // send-as alias has not yet been enabled for the mailbox, retry once from the
  // primary Workspace address rather than losing the enquiry.
  if (response.status === 400) {
    sender = CONTACT_FALLBACK_FROM;
    response = await gmailSendRaw(accessToken, encodeMimeMessage({
      from: sender,
      to: destination,
      replyTo: contact.email,
      subject,
      text,
    }));
  }

  if (!response.ok) {
    logger.error('Gmail API rejected a contact form email.', {
      event: 'contact-email-provider-error',
      provider: 'gmail-api',
      providerStatus: response.status,
      recipientDomain: destination.split('@')[1],
      senderDomain: sender.match(/@([^>]+)>?$/)?.[1] || '',
      language: contact.language,
      sourceHost: contact.sourceHost,
    });
    throw new HttpsError('unavailable', 'Your message could not be sent. Please try again.');
  }

  let providerMessageId = '';
  try {
    const providerResult = await response.json();
    providerMessageId = sanitizeSingleLine(providerResult?.id, 128);
  } catch {
    // A successful Gmail API response is enough to consider the message accepted.
  }

  return { destination, providerMessageId, sender };
}

exports.submitContact = onCall(
  {
    region: FUNCTION_REGION,
    serviceAccount: RUNTIME_SERVICE_ACCOUNT,
    cors: [...CONTACT_ALLOWED_ORIGINS, CONTACT_DEVELOPMENT_ORIGIN],
    enforceAppCheck: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    if (request.rawRequest?.method !== 'POST') {
      throw new HttpsError('invalid-argument', 'Contact submissions must use POST.');
    }

    const origin = String(request.rawRequest?.get?.('origin') || '').trim().replace(/\/$/, '');
    if (!origin || !isAllowedContactOrigin(origin)) {
      throw new HttpsError('permission-denied', 'This contact form origin is not allowed.');
    }

    // Count every protected submission attempt, including honeypot hits, so a
    // bot cannot burn App Check assessments indefinitely without reaching the
    // rate limiter simply by filling the hidden field.
    await enforceContactRateLimit(request.rawRequest);

    // Honeypot. A bot that filled the hidden field receives a harmless success
    // response, but no email is sent and the frontend will not emit generate_lead.
    if (sanitizeSingleLine(request.data?.website, 200)) {
      logger.info('Contact form honeypot submission discarded.', {
        event: 'contact-honeypot-discarded',
        origin,
        appId: String(request.app?.appId || ''),
      });
      return { success: true, delivered: false };
    }

    const contact = validateContactPayload(request.data, origin);
    const delivery = await sendContactEmail(contact);
    logger.info('Contact form email accepted by provider.', {
      event: 'contact-email-accepted',
      provider: 'gmail-api',
      providerStatus: 'accepted',
      providerMessageId: delivery.providerMessageId || null,
      senderDomain: delivery.sender.match(/@([^>]+)>?$/)?.[1] || '',
      recipientDomain: delivery.destination.split('@')[1],
      language: contact.language,
      sourceHost: contact.sourceHost,
      configuratorInterestProvided: Boolean(contact.configuratorInterest),
      appId: String(request.app?.appId || ''),
    });
    return { success: true, delivered: true };
  },
);

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
// Cross-domain Firebase Authentication handoff helpers
// ---------------------------------------------------------------------------
function normalizeConfiguratorOrigin(value) {
  try {
    return new URL(String(value || '')).origin;
  } catch {
    return '';
  }
}

function requestOrigin(request) {
  return normalizeConfiguratorOrigin(request.rawRequest?.headers?.origin || '');
}

function tenantSlugFromConfiguratorOrigin(origin) {
  const normalized = normalizeConfiguratorOrigin(origin);
  if (!normalized) return '';

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' || parsed.port) return '';

  const suffix = '.360configurator.com';
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.endsWith(suffix)) return '';

  const slug = hostname.slice(0, -suffix.length);
  if (!slug || slug.includes('.') || !TENANT_SLUG_PATTERN.test(slug) || RESERVED_TENANT_SLUGS.has(slug)) {
    return '';
  }
  return slug;
}

async function requireAllowedConfiguratorOrigin(origin, label = 'origin') {
  const normalized = normalizeConfiguratorOrigin(origin);
  if (ALLOWED_CONFIGURATOR_ORIGINS.has(normalized)) return normalized;

  const tenantSlug = tenantSlugFromConfiguratorOrigin(normalized);
  if (tenantSlug) {
    const snapshot = await db.collection(TENANTS_COLLECTION).doc(tenantSlug).get();
    const tenant = snapshot.data() || {};
    const expectedDomain = `${tenantSlug}.360configurator.com`;
    if (snapshot.exists && tenant.status === 'active' && String(tenant.domain || '') === expectedDomain) {
      return normalized;
    }
  }

  throw new HttpsError('permission-denied', `Unsupported configurator ${label}.`);
}

function domainAuthHandoffsCollection() {
  return db.collection(DOMAIN_AUTH_HANDOFFS_COLLECTION);
}

async function cleanupExpiredDomainAuthHandoffs() {
  const expired = await domainAuthHandoffsCollection()
    .where('expiresAt', '<=', Timestamp.now())
    .limit(DOMAIN_AUTH_HANDOFF_CLEANUP_LIMIT)
    .get();
  if (expired.empty) return;
  const batch = db.batch();
  expired.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

function generateDomainAuthHandoffId() {
  return randomBytes(32).toString('base64url');
}

// ---------------------------------------------------------------------------
// Tier-1 tenant provisioning helpers
// ---------------------------------------------------------------------------
const IDENTITY_TOOLKIT_CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`;

async function identityToolkitAccessToken() {
  const client = await identityToolkitAuth.getClient();
  const result = await client.getAccessToken();
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Identity Toolkit access token unavailable.');
  return token;
}

async function identityToolkitConfigRequest({ method = 'GET', updateMask = '', body = null } = {}) {
  const accessToken = await identityToolkitAccessToken();
  const url = new URL(IDENTITY_TOOLKIT_CONFIG_URL);
  if (updateMask) url.searchParams.set('updateMask', updateMask);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    const detail = String(payload?.error?.message || `HTTP ${response.status}`);
    const error = new Error(`Identity Toolkit config request failed: ${detail}`);
    error.statusCode = response.status;
    throw error;
  }
  return payload || {};
}

async function ensureFirebaseAuthorizedDomain(domain) {
  const hostname = String(domain || '').trim().toLowerCase();
  const tenantSlug = tenantSlugFromConfiguratorOrigin(`https://${hostname}`);
  if (!tenantSlug || hostname !== `${tenantSlug}.360configurator.com`) {
    throw new Error('Refusing to authorize an invalid tenant authentication domain.');
  }

  const config = await identityToolkitConfigRequest();
  const currentDomains = Array.isArray(config.authorizedDomains)
    ? config.authorizedDomains.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (currentDomains.includes(hostname)) return false;

  const authorizedDomains = [...new Set([...currentDomains, hostname])].sort();
  const updated = await identityToolkitConfigRequest({
    method: 'PATCH',
    updateMask: 'authorizedDomains',
    body: {
      name: `projects/${PROJECT_ID}/config`,
      authorizedDomains,
    },
  });

  const savedDomains = Array.isArray(updated.authorizedDomains)
    ? updated.authorizedDomains.map((value) => String(value || '').trim().toLowerCase())
    : [];
  if (!savedDomains.includes(hostname)) {
    throw new Error('Firebase Authentication did not retain the tenant authorized domain.');
  }
  return true;
}

function tenantProvisioningAdminsCollection() {
  return db.collection(TENANT_PROVISIONING_ADMINS_COLLECTION);
}

function normalizeTenantSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function validateTenantSlug(value) {
  const slug = normalizeTenantSlug(value);
  if (!TENANT_SLUG_PATTERN.test(slug)) {
    throw new HttpsError(
      'invalid-argument',
      'The subdomain must use only lowercase letters, numbers, and hyphens, with a maximum length of 40 characters.',
    );
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) {
    throw new HttpsError('invalid-argument', 'This subdomain is reserved by 360Configurator.');
  }
  return slug;
}

function validateTenantCompanyName(value) {
  const companyName = String(value || '').trim();
  if (!companyName || companyName.length > TENANT_COMPANY_NAME_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Company name must contain between 1 and ${TENANT_COMPANY_NAME_MAX_LENGTH} characters.`,
    );
  }
  return companyName;
}

function validateTenantStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!TENANT_STATUSES.has(status)) {
    throw new HttpsError('invalid-argument', 'Tenant status must be active or suspended.');
  }
  return status;
}

function normalizedTenantConfigurators(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    [...ALLOWED_PRODUCTS].map((product) => [product, source[product] === true]),
  );
}

function validateTenantConfigurators(value) {
  const configurators = normalizedTenantConfigurators(value);
  if (!Object.values(configurators).some(Boolean)) {
    throw new HttpsError('invalid-argument', 'Enable at least one configurator.');
  }
  return configurators;
}

function detectLogoMime(buffer) {
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) return 'image/png';

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';

  return '';
}

function validateTenantLogoDataUrl(value) {
  const dataUrl = String(value || '').trim();
  if (!dataUrl) return '';

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    throw new HttpsError('invalid-argument', 'Logo must be a PNG, JPEG, or WebP image.');
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw new HttpsError('invalid-argument', 'The logo image is invalid.');
  }
  if (!buffer.length || buffer.length > TENANT_LOGO_MAX_BYTES) {
    throw new HttpsError(
      'invalid-argument',
      `Logo must be smaller than ${Math.floor(TENANT_LOGO_MAX_BYTES / 1000)} KB after optimization.`,
    );
  }

  const detectedMime = detectLogoMime(buffer);
  if (!detectedMime || detectedMime !== match[1]) {
    throw new HttpsError('invalid-argument', 'The logo image format does not match its declared type.');
  }

  return `data:${detectedMime};base64,${buffer.toString('base64')}`;
}

function requireTenantAdminOrigin(request) {
  const origin = requestOrigin(request);
  if (origin === TENANT_ADMIN_ORIGIN || TENANT_ADMIN_DEVELOPMENT_ORIGIN.test(origin)) return origin;
  throw new HttpsError('permission-denied', 'Tenant provisioning is only available from the internal admin page.');
}

async function requireTenantProvisioningAdmin(request) {
  const uid = requireAuthenticatedUid(request);
  const email = String(request.auth?.token?.email || '').trim().toLowerCase();
  if (!email || request.auth?.token?.email_verified !== true) {
    throw new HttpsError('permission-denied', 'A verified Google account is required.');
  }

  const snapshot = await tenantProvisioningAdminsCollection().doc(uid).get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.active !== true) {
    throw new HttpsError('permission-denied', 'This account is not authorized to provision tenants.');
  }

  const restrictedEmail = String(data.email || '').trim().toLowerCase();
  if (restrictedEmail && restrictedEmail !== email) {
    throw new HttpsError('permission-denied', 'This account is not authorized to provision tenants.');
  }

  return { uid, email };
}

function tenantTimestampMs(value) {
  return value && typeof value.toMillis === 'function' ? value.toMillis() : 0;
}

function tenantAdminSummaryFromSnapshot(snapshot) {
  const data = snapshot.data() || {};
  const slug = normalizeTenantSlug(data.slug || snapshot.id);
  return {
    slug,
    domain: String(data.domain || `${slug}.360configurator.com`),
    companyName: String(data.companyName || slug),
    status: String(data.status || '').trim().toLowerCase(),
    configurators: normalizedTenantConfigurators(data.configurators),
    hasLogo: Boolean(String(data.logoUrl || '').trim()),
    firebaseAuthDomainAuthorized: data.firebaseAuthDomainAuthorized === true,
    createdAtMs: tenantTimestampMs(data.createdAt),
    updatedAtMs: tenantTimestampMs(data.updatedAt),
  };
}

function tenantAdminDetailFromSnapshot(snapshot) {
  const data = snapshot.data() || {};
  return {
    ...tenantAdminSummaryFromSnapshot(snapshot),
    logoUrl: String(data.logoUrl || ''),
  };
}

async function requireGoLiveNowTenant(slug) {
  const snapshot = await db.collection(TENANTS_COLLECTION).doc(slug).get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.plan !== TENANT_PLAN_GO_LIVE_NOW) {
    throw new HttpsError('not-found', 'Tier-1 tenant not found.');
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Private per-user saved configurations
// ---------------------------------------------------------------------------
const USER_SAVED_CONFIGURATION_VERSION = 1;
const MAX_SAVED_CONFIGURATION_BYTES = 850_000;
const MAX_SAVED_CONFIGURATION_NAME_LENGTH = 80;
const SAVED_CONFIGURATION_LIST_LIMIT = 100;
const USER_CART_VERSION = 1;
const MAX_USER_CART_ITEMS = 100;
const USER_CART_CURRENCIES = new Set(['USD', 'EUR', 'RON']);
const USER_CART_KEY_PATTERN = /^(window|roof|pergola|hall|solar|fence):[A-Za-z0-9_-]{1,128}$/;

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

function userSavedItemsCollection(uid, product, tenantSlug = '') {
  const userRef = db.collection('users').doc(uid);
  if (!tenantSlug) {
    // Preserve the existing account-wide library for the public 360Configurator
    // domains. This keeps all pre-Tier-1 saves and .com/.ro/.de domain handoffs
    // compatible with the original storage path.
    return userRef
      .collection('savedConfigurations')
      .doc(product)
      .collection('items');
  }

  // Tier-1 customer saves live in a tenant-specific subtree. The browser never
  // chooses this path: the callable derives the tenant from the request Origin
  // and validates the private tenant record before accessing it.
  return userRef
    .collection('tenantSavedConfigurations')
    .doc(tenantSlug)
    .collection('products')
    .doc(product)
    .collection('items');
}

async function requireSavedConfigurationScope(request, product) {
  const origin = requestOrigin(request);
  if (ALLOWED_CONFIGURATOR_ORIGINS.has(origin) || USER_CONFIGURATION_DEVELOPMENT_ORIGIN.test(origin)) {
    return { origin, tenantSlug: '' };
  }

  const tenantSlug = tenantSlugFromConfiguratorOrigin(origin);
  if (!tenantSlug) {
    throw new HttpsError('permission-denied', 'Unsupported saved-configuration origin.');
  }

  const snapshot = await db.collection(TENANTS_COLLECTION).doc(tenantSlug).get();
  const tenant = snapshot.data() || {};
  const expectedDomain = `${tenantSlug}.360configurator.com`;
  const configurators = tenant.configurators && typeof tenant.configurators === 'object'
    ? tenant.configurators
    : {};

  if (
    !snapshot.exists
    || tenant.status !== 'active'
    || String(tenant.domain || '') !== expectedDomain
    || configurators[product] !== true
  ) {
    throw new HttpsError('permission-denied', 'This configurator is not enabled for the customer tenant.');
  }

  return { origin, tenantSlug };
}

function userCartDocument(uid, tenantSlug = '') {
  const scopeId = tenantSlug ? `tenant_${tenantSlug}` : 'platform';
  return db.collection('users').doc(uid).collection('carts').doc(scopeId);
}

async function requireUserCartScope(request) {
  const origin = requestOrigin(request);
  if (ALLOWED_CONFIGURATOR_ORIGINS.has(origin) || USER_CONFIGURATION_DEVELOPMENT_ORIGIN.test(origin)) {
    return { origin, tenantSlug: '' };
  }

  const tenantSlug = tenantSlugFromConfiguratorOrigin(origin);
  if (!tenantSlug) throw new HttpsError('permission-denied', 'Unsupported cart origin.');

  const snapshot = await db.collection(TENANTS_COLLECTION).doc(tenantSlug).get();
  const tenant = snapshot.data() || {};
  if (
    !snapshot.exists
    || tenant.status !== 'active'
    || String(tenant.domain || '') !== `${tenantSlug}.360configurator.com`
  ) {
    throw new HttpsError('permission-denied', 'This customer tenant is not active.');
  }

  return { origin, tenantSlug };
}

function validateUserCartKey(value) {
  const key = String(value || '').trim();
  if (!USER_CART_KEY_PATTERN.test(key)) {
    throw new HttpsError('invalid-argument', 'Invalid cart item key.');
  }
  return key;
}

function normalizeUserCartItem(raw) {
  const productId = normalizeProductType(raw?.productId);
  if (!ALLOWED_PRODUCTS.has(productId)) {
    throw new HttpsError('invalid-argument', 'Unsupported cart configurator type.');
  }
  const savedConfigurationId = validateSavedConfigurationId(raw?.savedConfigurationId);
  const key = `${productId}:${savedConfigurationId}`;
  const name = String(raw?.name || '').trim().slice(0, MAX_SAVED_CONFIGURATION_NAME_LENGTH);
  const costAmount = Number(raw?.costAmount);
  if (!Number.isFinite(costAmount) || costAmount < 0 || costAmount > 1_000_000_000_000) {
    throw new HttpsError('invalid-argument', 'Invalid cart price.');
  }
  const currency = String(raw?.currency || '').trim().toUpperCase();
  if (!USER_CART_CURRENCIES.has(currency)) {
    throw new HttpsError('invalid-argument', 'Unsupported cart currency.');
  }
  const addedAt = Number(raw?.addedAt);
  return {
    key,
    productId,
    savedConfigurationId,
    name,
    costAmount,
    currency,
    addedAt: Number.isFinite(addedAt) && addedAt > 0 ? Math.round(addedAt) : Date.now(),
  };
}

function normalizeStoredUserCartItems(items) {
  if (!Array.isArray(items)) return [];
  const deduplicated = new Map();
  items.slice(0, MAX_USER_CART_ITEMS).forEach((raw) => {
    try {
      const item = normalizeUserCartItem(raw);
      deduplicated.set(item.key, item);
    } catch {
      // Ignore malformed historical cart rows instead of making the cart unreadable.
    }
  });
  return [...deduplicated.values()].slice(-MAX_USER_CART_ITEMS);
}

function userCartResponse({ exists = true, items = [], updatedAt = null } = {}) {
  return {
    exists,
    items: normalizeStoredUserCartItems(items),
    updatedAtMs: timestampMillis(updatedAt),
  };
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

const TENANT_ADMIN_CALLABLE_OPTIONS = Object.freeze({
  region: FUNCTION_REGION,
  serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  // Tenant administration is protected by Firebase Auth + a private UID
  // allowlist. App Check remains disabled so the internal page does not consume
  // the Share-only reCAPTCHA assessment budget.
  enforceAppCheck: false,
  timeoutSeconds: 30,
  memory: '256MiB',
});

const TENANT_PROVISIONING_CALLABLE_OPTIONS = Object.freeze({
  ...TENANT_ADMIN_CALLABLE_OPTIONS,
  // Identity Platform authorizedDomains is a project-level read/modify/write
  // list. Provision customers serially so two simultaneous admin requests can
  // never overwrite each other's domain registration.
  concurrency: 1,
  maxInstances: 1,
});

exports.provisionTenant = onCall(
  TENANT_PROVISIONING_CALLABLE_OPTIONS,
  async (request) => {
    requireTenantAdminOrigin(request);
    const admin = await requireTenantProvisioningAdmin(request);
    const slug = validateTenantSlug(request.data?.slug);
    const companyName = validateTenantCompanyName(request.data?.companyName);
    const configurators = validateTenantConfigurators(request.data?.configurators);
    const logoUrl = validateTenantLogoDataUrl(request.data?.logoDataUrl);
    const now = Timestamp.now();
    const domain = `${slug}.360configurator.com`;
    const privateRef = db.collection(TENANTS_COLLECTION).doc(slug);
    const publicRef = db.collection(TENANT_PUBLIC_COLLECTION).doc(slug);

    // Fail before touching Firebase Auth when a Firestore tenant already owns
    // the slug. The transaction below repeats this check before creating data.
    const [privateExisting, publicExisting] = await Promise.all([privateRef.get(), publicRef.get()]);
    if (privateExisting.exists || publicExisting.exists) {
      throw new HttpsError('already-exists', 'This subdomain is already in use.');
    }

    try {
      await ensureFirebaseAuthorizedDomain(domain);
    } catch (error) {
      logger.error('Tier-1 Firebase Authentication domain authorization failed.', {
        slug,
        domain,
        error: String(error?.message || error),
      });
      throw new HttpsError(
        'failed-precondition',
        'The tenant domain could not be enabled for Google login. Provisioning was not completed.',
      );
    }

    await db.runTransaction(async (transaction) => {
      const privateSnapshot = await transaction.get(privateRef);
      const publicSnapshot = await transaction.get(publicRef);
      if (privateSnapshot.exists || publicSnapshot.exists) {
        throw new HttpsError('already-exists', 'This subdomain is already in use.');
      }

      transaction.create(privateRef, {
        schemaVersion: TENANT_SCHEMA_VERSION,
        slug,
        domain,
        companyName,
        plan: TENANT_PLAN_GO_LIVE_NOW,
        status: 'active',
        ownerUid: '',
        configurators,
        logoUrl,
        firebaseAuthDomain: domain,
        firebaseAuthDomainAuthorized: true,
        createdByUid: admin.uid,
        createdByEmail: admin.email,
        createdAt: now,
        updatedAt: now,
      });

      transaction.create(publicRef, {
        schemaVersion: TENANT_SCHEMA_VERSION,
        slug,
        companyName,
        status: 'active',
        logoUrl,
        configurators,
        createdAt: now,
        updatedAt: now,
      });
    });

    logger.info('Tier-1 tenant provisioned.', {
      slug,
      companyName,
      configurators: Object.entries(configurators).filter(([, enabled]) => enabled).map(([id]) => id),
      createdByUid: admin.uid,
    });

    return {
      slug,
      companyName,
      domain,
      url: `https://${domain}/`,
      configurators,
      createdAtMs: now.toMillis(),
    };
  },
);

exports.listTenants = onCall(
  TENANT_ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    requireTenantAdminOrigin(request);
    await requireTenantProvisioningAdmin(request);

    const snapshot = await db.collection(TENANTS_COLLECTION).limit(TENANT_ADMIN_LIST_LIMIT).get();
    const tenants = snapshot.docs
      .filter((doc) => (doc.data() || {}).plan === TENANT_PLAN_GO_LIVE_NOW)
      .map(tenantAdminSummaryFromSnapshot)
      .sort((a, b) => {
        const byCompany = a.companyName.localeCompare(b.companyName, 'en', { sensitivity: 'base' });
        return byCompany || a.slug.localeCompare(b.slug);
      });

    return { tenants, truncated: snapshot.size >= TENANT_ADMIN_LIST_LIMIT };
  },
);

exports.getTenant = onCall(
  TENANT_ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    requireTenantAdminOrigin(request);
    await requireTenantProvisioningAdmin(request);
    const slug = validateTenantSlug(request.data?.slug);
    const snapshot = await requireGoLiveNowTenant(slug);
    return tenantAdminDetailFromSnapshot(snapshot);
  },
);

exports.updateTenant = onCall(
  TENANT_ADMIN_CALLABLE_OPTIONS,
  async (request) => {
    requireTenantAdminOrigin(request);
    const admin = await requireTenantProvisioningAdmin(request);
    const input = request.data && typeof request.data === 'object' ? request.data : {};
    const slug = validateTenantSlug(input.slug);
    const privateRef = db.collection(TENANTS_COLLECTION).doc(slug);
    const publicRef = db.collection(TENANT_PUBLIC_COLLECTION).doc(slug);
    const expectedDomain = `${slug}.360configurator.com`;
    const now = Timestamp.now();
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(input, key);

    const result = await db.runTransaction(async (transaction) => {
      const privateSnapshot = await transaction.get(privateRef);
      const publicSnapshot = await transaction.get(publicRef);
      const tenant = privateSnapshot.data() || {};

      if (!privateSnapshot.exists || tenant.plan !== TENANT_PLAN_GO_LIVE_NOW) {
        throw new HttpsError('not-found', 'Tier-1 tenant not found.');
      }
      if (!publicSnapshot.exists) {
        throw new HttpsError('failed-precondition', 'The public tenant document is missing.');
      }

      const storedDomain = String(tenant.domain || '').trim().toLowerCase();
      if (storedDomain && storedDomain !== expectedDomain) {
        throw new HttpsError('failed-precondition', 'The tenant domain does not match its immutable subdomain.');
      }

      const companyName = hasOwn('companyName')
        ? validateTenantCompanyName(input.companyName)
        : validateTenantCompanyName(tenant.companyName);
      const status = hasOwn('status')
        ? validateTenantStatus(input.status)
        : validateTenantStatus(tenant.status);
      const configurators = hasOwn('configurators')
        ? validateTenantConfigurators(input.configurators)
        : validateTenantConfigurators(tenant.configurators);

      const logoMode = hasOwn('logoMode') ? String(input.logoMode || '').trim().toLowerCase() : 'keep';
      if (!['keep', 'replace', 'remove'].includes(logoMode)) {
        throw new HttpsError('invalid-argument', 'Logo update mode is invalid.');
      }

      let logoUrl = String(tenant.logoUrl || '');
      if (logoMode === 'remove') logoUrl = '';
      if (logoMode === 'replace') {
        logoUrl = validateTenantLogoDataUrl(input.logoDataUrl);
        if (!logoUrl) throw new HttpsError('invalid-argument', 'Choose a logo image to replace the current logo.');
      }

      const synchronizedFields = {
        companyName,
        status,
        configurators,
        logoUrl,
        updatedAt: now,
      };

      transaction.update(privateRef, {
        ...synchronizedFields,
        domain: expectedDomain,
        lastUpdatedByUid: admin.uid,
        lastUpdatedByEmail: admin.email,
      });
      transaction.update(publicRef, synchronizedFields);

      return {
        slug,
        domain: expectedDomain,
        companyName,
        status,
        configurators,
        logoUrl,
        firebaseAuthDomainAuthorized: tenant.firebaseAuthDomainAuthorized === true,
        createdAtMs: tenantTimestampMs(tenant.createdAt),
        updatedAtMs: now.toMillis(),
      };
    });

    logger.info('Tier-1 tenant updated.', {
      slug,
      status: result.status,
      configurators: Object.entries(result.configurators).filter(([, enabled]) => enabled).map(([id]) => id),
      updatedByUid: admin.uid,
    });

    return result;
  },
);

exports.createDomainAuthHandoff = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const uid = requireAuthenticatedUid(request);
    const sourceOrigin = await requireAllowedConfiguratorOrigin(requestOrigin(request), 'source origin');
    const targetOrigin = await requireAllowedConfiguratorOrigin(request.data?.targetOrigin, 'target origin');
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + DOMAIN_AUTH_HANDOFF_LIFETIME_MS);

    await cleanupExpiredDomainAuthHandoffs();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const handoffId = generateDomainAuthHandoffId();
      try {
        await domainAuthHandoffsCollection().doc(handoffId).create({
          uid,
          sourceOrigin,
          targetOrigin,
          createdAt: now,
          expiresAt,
        });
        return { handoffId, expiresAtMs: expiresAt.toMillis() };
      } catch (error) {
        if (Number(error?.code) === 6 || String(error?.code) === 'already-exists') continue;
        logger.error('Domain authentication handoff creation failed.', error);
        throw new HttpsError('internal', 'The domain authentication handoff could not be created.');
      }
    }
    throw new HttpsError('aborted', 'Could not allocate a domain authentication handoff.');
  },
);

exports.redeemDomainAuthHandoff = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const origin = await requireAllowedConfiguratorOrigin(requestOrigin(request), 'destination origin');
    const handoffId = String(request.data?.handoffId || '').trim();
    if (!DOMAIN_AUTH_HANDOFF_ID_PATTERN.test(handoffId)) {
      throw new HttpsError('invalid-argument', 'Invalid domain authentication handoff.');
    }

    const ref = domainAuthHandoffsCollection().doc(handoffId);
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { missing: true };
      const data = snapshot.data() || {};
      const expiresAtMs = timestampMillis(data.expiresAt);
      if (!expiresAtMs || expiresAtMs <= Date.now()) {
        transaction.delete(ref);
        return { expired: true };
      }
      if (String(data.targetOrigin || '') !== origin) return { wrongOrigin: true };
      const uid = String(data.uid || '');
      if (!uid) {
        transaction.delete(ref);
        return { invalid: true };
      }
      transaction.delete(ref);
      return { uid };
    });

    if (result.missing) throw new HttpsError('not-found', 'Domain authentication handoff not found.');
    if (result.expired) throw new HttpsError('deadline-exceeded', 'Domain authentication handoff expired.');
    if (result.wrongOrigin) throw new HttpsError('permission-denied', 'Domain authentication handoff belongs to another origin.');
    if (result.invalid || !result.uid) throw new HttpsError('failed-precondition', 'Invalid domain authentication handoff.');

    const customToken = await adminAuth.createCustomToken(result.uid);
    return { customToken };
  },
);

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
    const { tenantSlug } = await requireSavedConfigurationScope(request, product);
    const collection = userSavedItemsCollection(uid, product, tenantSlug);
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
      tenantSlug,
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

    const { tenantSlug } = await requireSavedConfigurationScope(request, product);
    const snapshot = await userSavedItemsCollection(uid, product, tenantSlug)
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
    const { tenantSlug } = await requireSavedConfigurationScope(request, product);
    const snapshot = await userSavedItemsCollection(uid, product, tenantSlug).doc(id).get();
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
    const { tenantSlug } = await requireSavedConfigurationScope(request, product);
    await userSavedItemsCollection(uid, product, tenantSlug).doc(id).delete();
    return { id, deleted: true };
  },
);

exports.getUserCart = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const uid = requireAuthenticatedUid(request);
    const { tenantSlug } = await requireUserCartScope(request);
    const snapshot = await userCartDocument(uid, tenantSlug).get();
    if (!snapshot.exists) return userCartResponse({ exists: false, items: [] });
    const data = snapshot.data() || {};
    return userCartResponse({
      exists: true,
      items: data.items,
      updatedAt: data.updatedAt,
    });
  },
);

exports.mutateUserCart = onCall(
  USER_CONFIGURATION_CALLABLE_OPTIONS,
  async (request) => {
    const uid = requireAuthenticatedUid(request);
    const { tenantSlug } = await requireUserCartScope(request);
    const action = String(request.data?.action || '').trim().toLowerCase();
    if (!['initialize', 'upsert', 'remove', 'empty'].includes(action)) {
      throw new HttpsError('invalid-argument', 'Unsupported cart action.');
    }

    const ref = userCartDocument(uid, tenantSlug);
    const now = Timestamp.now();
    let preparedItem = null;
    let preparedInitialItems = null;
    let removeKey = '';

    if (action === 'upsert') {
      preparedItem = normalizeUserCartItem(request.data?.item);
      const savedSnapshot = await userSavedItemsCollection(
        uid,
        preparedItem.productId,
        tenantSlug,
      ).doc(preparedItem.savedConfigurationId).get();
      if (!savedSnapshot.exists) {
        throw new HttpsError('not-found', 'The saved configuration referenced by this cart item no longer exists.');
      }
      preparedItem.name = String(savedSnapshot.data()?.n || preparedItem.name || '').trim()
        .slice(0, MAX_SAVED_CONFIGURATION_NAME_LENGTH);
    } else if (action === 'remove') {
      removeKey = validateUserCartKey(request.data?.key);
    } else if (action === 'initialize') {
      const incoming = Array.isArray(request.data?.items) ? request.data.items : [];
      preparedInitialItems = normalizeStoredUserCartItems(incoming.slice(0, MAX_USER_CART_ITEMS));
    }

    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.exists ? snapshot.data() || {} : {};
      const existingItems = normalizeStoredUserCartItems(data.items);
      const createdAt = data.createdAt || now;

      if (action === 'initialize' && snapshot.exists) {
        return userCartResponse({ exists: true, items: existingItems, updatedAt: data.updatedAt });
      }

      let items = existingItems;
      if (action === 'initialize') {
        items = preparedInitialItems;
      } else if (action === 'upsert') {
        items = existingItems.filter((item) => item.key !== preparedItem.key);
        items.push(preparedItem);
        if (items.length > MAX_USER_CART_ITEMS) items = items.slice(items.length - MAX_USER_CART_ITEMS);
      } else if (action === 'remove') {
        items = existingItems.filter((item) => item.key !== removeKey);
      } else if (action === 'empty') {
        items = [];
      }

      transaction.set(ref, {
        v: USER_CART_VERSION,
        tenantSlug,
        items,
        createdAt,
        updatedAt: now,
      });

      return userCartResponse({ exists: true, items, updatedAt: now });
    });

    return result;
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
