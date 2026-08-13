const LEGACY_SHARE_PARAM = 'config';
const COMPACT_SHARE_PARAM = 'c';
const SHORT_SHARE_PARAM = 's';
const SHARE_FORMAT_VERSION = 3;
const GZIP_PREFIX = 'g2.';
const JSON_PREFIX = 'j2.';
const DEFAULT_SHARE_API_PATH = '/api/configurations';
const SHORT_ID_PATTERN = /^[a-f0-9]{64}$/;
const MAX_GENERATED_URL_LENGTH = 150;

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

function configuredShareEndpoint(pageUrl = window.location.href) {
  const explicit = String(globalThis.SHARE_STATE_API_ENDPOINT ?? '').trim();
  const meta = typeof document !== 'undefined'
    ? String(document.querySelector('meta[name="share-state-endpoint"]')?.content ?? '').trim()
    : '';
  const endpoint = explicit || meta || DEFAULT_SHARE_API_PATH;
  return new URL(endpoint, new URL(pageUrl, window.location.href).origin).toString().replace(/\/$/, '');
}

function readHashValue(target, param) {
  const raw = target.hash.startsWith('#') ? target.hash.slice(1) : target.hash;
  if (!raw) return '';
  return new URLSearchParams(raw).get(param) || '';
}

async function storeShareState(productType, state, pageUrl) {
  const endpoint = configuredShareEndpoint(pageUrl);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      v: SHARE_FORMAT_VERSION,
      p: normalizeProductType(productType),
      s: state,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Share storage returned HTTP ${response.status}.`);
  }

  const id = String(payload?.id || '');
  if (!SHORT_ID_PATTERN.test(id)) throw new Error('Share storage returned an invalid configuration id.');
  return id;
}

async function fetchStoredShareState(id, { productType = '', pageUrl = window.location.href } = {}) {
  if (!SHORT_ID_PATTERN.test(String(id))) return null;
  const endpoint = configuredShareEndpoint(pageUrl);
  const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Share storage returned HTTP ${response.status}.`);
  return unwrapPayload(await response.json(), productType);
}

// Retained exclusively so links produced by the previous implementation keep
// working. New links never place the configuration itself in the URL.
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

    // v3 short links contain only a fixed-length content id. The actual state is
    // fetched before each configurator creates its initial model/store.
    const shortId = readHashValue(target, SHORT_SHARE_PARAM)
      || target.searchParams.get(SHORT_SHARE_PARAM);
    if (shortId) {
      return await fetchStoredShareState(shortId, { productType, pageUrl: target.toString() });
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
  const id = await storeShareState(productType, state, target.toString());

  // A content-addressed server entry makes URL size independent of configuration
  // complexity. Clear all old query/fragment state and retain only the 64-char id.
  target.search = '';
  target.hash = `${SHORT_SHARE_PARAM}=${id}`;

  const result = target.toString();
  if (result.length > MAX_GENERATED_URL_LENGTH) {
    throw new Error(`The generated share URL is ${result.length} characters; the configured maximum is ${MAX_GENERATED_URL_LENGTH}.`);
  }
  return result;
}
