'use strict';

const { onInit } = require('firebase-functions/v2/core');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { createHash, randomBytes } = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const { initializeApp } = require('firebase-admin/app');
const { AggregateField, FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore');

// Firebase CLI loads this module during deployment to discover exported functions.
// Defer Admin/Monitoring initialization until the deployed runtime starts so
// discovery does not initialize Google services on the developer machine.
let db;
let monitoringAuth;
let mailerSignerAuth;
let gmailAccessTokenCache = { token: '', expiresAtMs: 0 };
onInit(() => {
  initializeApp();
  db = getFirestore();
  monitoringAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/monitoring.read'],
  });
  mailerSignerAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
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
  // Check remains deliberately disabled here so ordinary Save/Open actions do
  // not create reCAPTCHA assessments. Share and the public contact form are the
  // only browser flows in this backend that currently enforce App Check.
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
