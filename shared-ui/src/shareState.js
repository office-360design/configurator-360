import { callFirebaseShareFunction, isFirebaseAppCheckConfigured } from './firebaseAppCheck.js';

const LEGACY_SHARE_PARAM = 'config';
const COMPACT_SHARE_PARAM = 'c';
const SHORT_SHARE_PARAM = 's';
const SHARE_FORMAT_VERSION = 4;
const FIRESTORE_RECORD_VERSION = 1;
const GZIP_PREFIX = 'g2.';
const JSON_PREFIX = 'j2.';
const LEGACY_SHARE_API_PATH = '/api/configurations';
const LEGACY_SHORT_ID_PATTERN = /^[a-f0-9]{64}$/;
const FIRESTORE_SHORT_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const MAX_GENERATED_URL_LENGTH = 150;
const MAX_FIRESTORE_STATE_BYTES = 850000;
const FIRESTORE_COLLECTION = 'sharedConfigurations';

// This is the Firebase web app already registered for configurator-360 and linked
// to the project's Firebase Hosting site. Firebase web config/API keys identify
// the project; access is enforced by Firestore Security Rules, not by hiding them.
const DEFAULT_FIREBASE_SHARE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyBgS4VLxQYZnqW-YZJPKvuuocf5w_0kRwY',
  projectId: 'configurator-360',
  appId: '1:719238533149:web:9e0b8a97375731b8ea6f4',
  databaseId: '(default)',
});

function normalizeProductType(value) {
  return String(value ?? '').trim().toLowerCase();
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value ?? '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  const binary = globalThis.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function compressGzip(bytes) {
  if (typeof globalThis.CompressionStream !== 'function') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressGzip(bytes) {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new Error('This browser cannot decompress compact legacy shared configuration links.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unwrapPayload(parsed, expectedProduct = '') {
  if (!parsed || typeof parsed !== 'object') return null;
  const normalizedExpected = normalizeProductType(expectedProduct);

  if (Object.prototype.hasOwnProperty.call(parsed, 's')) {
    const payloadProduct = normalizeProductType(parsed.p);
    if (normalizedExpected && payloadProduct && normalizedExpected !== payloadProduct) return null;
    return parsed.s && typeof parsed.s === 'object' ? parsed.s : null;
  }

  // Original Pergola links stored the state object directly.
  return parsed;
}

function readHashValue(target, param) {
  const raw = target.hash.startsWith('#') ? target.hash.slice(1) : target.hash;
  if (!raw) return '';
  return new URLSearchParams(raw).get(param) || '';
}

function firebaseShareConfig() {
  const override = globalThis.FIREBASE_SHARE_CONFIG && typeof globalThis.FIREBASE_SHARE_CONFIG === 'object'
    ? globalThis.FIREBASE_SHARE_CONFIG
    : {};
  return {
    apiKey: String(override.apiKey || DEFAULT_FIREBASE_SHARE_CONFIG.apiKey),
    projectId: String(override.projectId || DEFAULT_FIREBASE_SHARE_CONFIG.projectId),
    appId: String(override.appId || DEFAULT_FIREBASE_SHARE_CONFIG.appId),
    databaseId: String(override.databaseId || DEFAULT_FIREBASE_SHARE_CONFIG.databaseId),
  };
}

function firestoreDocumentsBaseUrl() {
  const { apiKey, projectId, databaseId } = firebaseShareConfig();
  const database = encodeURIComponent(databaseId);
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${database}/documents`;
  return { root, apiKey };
}

function firestoreUrl(path = '', query = {}) {
  const { root, apiKey } = firestoreDocumentsBaseUrl();
  const suffix = path ? `/${path.replace(/^\/+/, '')}` : '';
  const url = new URL(`${root}${suffix}`);
  if (apiKey) url.searchParams.set('key', apiKey);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function generateShortShareId() {
  const bytes = new Uint8Array(12); // 96 random bits -> exactly 16 Base64URL chars.
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function firestoreErrorMessage(payload, fallback) {
  return String(payload?.error?.message || payload?.error || fallback || 'Firestore request failed.');
}

async function storeShareStateInFirestore(productType, state) {
  const product = normalizeProductType(productType);
  const stateJson = JSON.stringify(state);
  const stateBytes = new TextEncoder().encode(stateJson).length;
  if (stateBytes > MAX_FIRESTORE_STATE_BYTES) {
    throw new Error(`This configuration is too large to share (${stateBytes} bytes).`);
  }

  // Once a reCAPTCHA Enterprise site key is configured, all new shares go
  // through an App Check-enforced callable function. During the rollout phase,
  // an empty site key keeps the legacy direct-Firestore path alive so enabling
  // App Check cannot unexpectedly break production sharing.
  if (await isFirebaseAppCheckConfigured()) {
    const result = await callFirebaseShareFunction(
      'createSharedConfiguration',
      { productType: product, stateJson },
      firebaseShareConfig(),
    );
    const id = String(result?.id || '');
    if (!FIRESTORE_SHORT_ID_PATTERN.test(id)) {
      throw new Error('The secure share service returned an invalid share id.');
    }
    return id;
  }

  const document = {
    fields: {
      v: { integerValue: String(FIRESTORE_RECORD_VERSION) },
      p: { stringValue: product },
      s: { stringValue: stateJson },
    },
  };

  // Collision is already astronomically unlikely with 96 random bits. Retrying
  // lets us retain create-only Firestore rules without ever overwriting a share.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = generateShortShareId();
    const response = await fetch(firestoreUrl(FIRESTORE_COLLECTION, { documentId: id }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document),
    });
    const payload = await readJsonResponse(response);
    if (response.ok) return id;

    const status = String(payload?.error?.status || '');
    if (response.status === 409 || status === 'ALREADY_EXISTS') continue;
    throw new Error(firestoreErrorMessage(payload, `Firestore share storage returned HTTP ${response.status}.`));
  }

  throw new Error('Could not allocate a unique share id. Please try again.');
}

async function fetchShareStateFromFirestore(id, productType = '') {
  if (!FIRESTORE_SHORT_ID_PATTERN.test(String(id))) return null;

  if (await isFirebaseAppCheckConfigured()) {
    try {
      const result = await callFirebaseShareFunction(
        'getSharedConfiguration',
        { shareId: String(id), productType: normalizeProductType(productType) },
        firebaseShareConfig(),
      );
      const stateJson = result?.stateJson;
      if (typeof stateJson !== 'string') return null;
      const parsed = JSON.parse(stateJson);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      const code = String(error?.code || '');
      if (code.endsWith('/not-found') || code.endsWith('/failed-precondition')) return null;
      throw error;
    }
  }

  const response = await fetch(firestoreUrl(`${FIRESTORE_COLLECTION}/${encodeURIComponent(id)}`), {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(firestoreErrorMessage(payload, `Firestore share storage returned HTTP ${response.status}.`));
  }

  const fields = payload?.fields || {};
  const recordVersion = Number(fields.v?.integerValue || 0);
  const storedProduct = normalizeProductType(fields.p?.stringValue);
  const expectedProduct = normalizeProductType(productType);
  const stateJson = fields.s?.stringValue;
  if (recordVersion !== FIRESTORE_RECORD_VERSION || typeof stateJson !== 'string') return null;
  if (expectedProduct && storedProduct && expectedProduct !== storedProduct) return null;
  const parsed = JSON.parse(stateJson);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

// Compatibility only: v3 used a Cloudflare/R2 content-addressed endpoint. The
// new implementation does not require this endpoint, but already-created links
// can still resolve if that backend happens to be deployed later.
function configuredLegacyShareEndpoint(pageUrl = window.location.href) {
  const explicit = String(globalThis.SHARE_STATE_API_ENDPOINT ?? '').trim();
  const meta = typeof document !== 'undefined'
    ? String(document.querySelector('meta[name="share-state-endpoint"]')?.content ?? '').trim()
    : '';
  const endpoint = explicit || meta || LEGACY_SHARE_API_PATH;
  return new URL(endpoint, new URL(pageUrl, window.location.href).origin).toString().replace(/\/$/, '');
}

async function fetchLegacyStoredShareState(id, { productType = '', pageUrl = window.location.href } = {}) {
  if (!LEGACY_SHORT_ID_PATTERN.test(String(id))) return null;
  const endpoint = configuredLegacyShareEndpoint(pageUrl);
  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Legacy share storage returned HTTP ${response.status}.`);
  return unwrapPayload(await response.json(), productType);
}

// Retained exclusively so links produced by the earlier self-contained
// implementation keep working. New links never place the full state in the URL.
export async function encodeShareState(productType, state) {
  const payload = {
    v: 2,
    p: normalizeProductType(productType),
    s: state,
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));

  try {
    const compressed = await compressGzip(jsonBytes);
    if (compressed?.length) return `${GZIP_PREFIX}${bytesToBase64Url(compressed)}`;
  } catch (error) {
    console.warn('Legacy share-link compression failed; using the compatibility encoding.', error);
  }

  return `${JSON_PREFIX}${bytesToBase64Url(jsonBytes)}`;
}

export async function decodeShareState(encoded, { productType = '' } = {}) {
  if (!encoded) return null;
  const value = String(encoded);
  let jsonBytes;

  if (value.startsWith(GZIP_PREFIX)) {
    jsonBytes = await decompressGzip(base64UrlToBytes(value.slice(GZIP_PREFIX.length)));
  } else if (value.startsWith(JSON_PREFIX)) {
    jsonBytes = base64UrlToBytes(value.slice(JSON_PREFIX.length));
  } else {
    jsonBytes = base64UrlToBytes(value);
  }

  return unwrapPayload(JSON.parse(new TextDecoder().decode(jsonBytes)), productType);
}

export async function readShareState({
  productType = '',
  url = window.location.href,
  param = LEGACY_SHARE_PARAM,
} = {}) {
  try {
    const target = new URL(url, window.location.href);
    const shortId = readHashValue(target, SHORT_SHARE_PARAM)
      || target.searchParams.get(SHORT_SHARE_PARAM);

    if (shortId) {
      if (FIRESTORE_SHORT_ID_PATTERN.test(shortId)) {
        return await fetchShareStateFromFirestore(shortId, productType);
      }
      if (LEGACY_SHORT_ID_PATTERN.test(shortId)) {
        return await fetchLegacyStoredShareState(shortId, { productType, pageUrl: target.toString() });
      }
      return null;
    }

    // v2/v1 compatibility: continue reading the older self-contained links.
    const encoded = readHashValue(target, COMPACT_SHARE_PARAM)
      || target.searchParams.get(COMPACT_SHARE_PARAM)
      || target.searchParams.get(param);
    return encoded ? await decodeShareState(encoded, { productType }) : null;
  } catch (error) {
    console.warn('The shared configuration could not be restored.', error);
    return null;
  }
}

export async function createShareUrl({
  productType = '',
  state,
  url = window.location.href,
} = {}) {
  const target = new URL(url, window.location.href);
  const id = await storeShareStateInFirestore(productType, state);

  // The link is now just a bearer-style Firestore document id. Configuration
  // complexity no longer affects URL length.
  target.search = '';
  target.hash = `${SHORT_SHARE_PARAM}=${id}`;

  const result = target.toString();
  if (result.length > MAX_GENERATED_URL_LENGTH) {
    throw new Error(`The generated share URL is ${result.length} characters; the configured maximum is ${MAX_GENERATED_URL_LENGTH}.`);
  }
  return result;
}

export const SHARE_STATE_FIREBASE_INFO = Object.freeze({
  projectId: DEFAULT_FIREBASE_SHARE_CONFIG.projectId,
  appId: DEFAULT_FIREBASE_SHARE_CONFIG.appId,
  collection: FIRESTORE_COLLECTION,
  appCheckProvider: 'recaptcha-enterprise',
  idLength: 16,
  maxUrlLength: MAX_GENERATED_URL_LENGTH,
});
