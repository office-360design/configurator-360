const LEGACY_SHARE_PARAM = 'config';
const SHARE_HASH_PARAM = 'c';
const SHARE_FORMAT_VERSION = 2;
const GZIP_PREFIX = 'g2.';
const JSON_PREFIX = 'j2.';

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
    throw new Error('This browser cannot decompress compact shared configuration links.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unwrapPayload(parsed, expectedProduct = '') {
  if (!parsed || typeof parsed !== 'object') return null;
  const normalizedExpected = normalizeProductType(expectedProduct);

  // Versioned shared links use a compact envelope. Older Pergola links encoded
  // the state object directly, so direct objects remain intentionally supported.
  if (Object.prototype.hasOwnProperty.call(parsed, 's')) {
    const payloadProduct = normalizeProductType(parsed.p);
    if (normalizedExpected && payloadProduct && normalizedExpected !== payloadProduct) return null;
    return parsed.s && typeof parsed.s === 'object' ? parsed.s : null;
  }

  return parsed;
}

export async function encodeShareState(productType, state) {
  const payload = {
    v: SHARE_FORMAT_VERSION,
    p: normalizeProductType(productType),
    s: state,
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));

  try {
    const compressed = await compressGzip(jsonBytes);
    if (compressed?.length) return `${GZIP_PREFIX}${bytesToBase64Url(compressed)}`;
  } catch (error) {
    console.warn('Compact share-link compression failed; using the compatibility encoding.', error);
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
    // v1 shared links and the original Pergola links used uncompressed UTF-8
    // JSON in Base64/Base64URL. Keep them readable so existing links do not die.
    jsonBytes = base64UrlToBytes(value);
  }

  const parsed = JSON.parse(new TextDecoder().decode(jsonBytes));
  return unwrapPayload(parsed, productType);
}

function readHashValue(target, param = SHARE_HASH_PARAM) {
  const raw = target.hash.startsWith('#') ? target.hash.slice(1) : target.hash;
  if (!raw) return '';
  const params = new URLSearchParams(raw);
  return params.get(param) || '';
}

export async function readShareState({
  productType = '',
  url = window.location.href,
  param = LEGACY_SHARE_PARAM,
} = {}) {
  try {
    const target = new URL(url, window.location.href);
    // New links use the fragment so the configuration is never sent to the web
    // server and therefore cannot be truncated by request-URL limits.
    const encoded = readHashValue(target)
      || target.searchParams.get(SHARE_HASH_PARAM)
      || target.searchParams.get(param);
    return encoded ? await decodeShareState(encoded, { productType }) : null;
  } catch (error) {
    console.warn('The shared configuration could not be decoded.', error);
    return null;
  }
}

export async function createShareUrl({
  productType = '',
  state,
  url = window.location.href,
} = {}) {
  const target = new URL(url, window.location.href);
  const encoded = await encodeShareState(productType, state);

  // Remove older payloads before writing the compact fragment. Keeping the state
  // after # also means the CDN/server only receives the short configurator path.
  target.searchParams.delete(LEGACY_SHARE_PARAM);
  target.searchParams.delete(SHARE_HASH_PARAM);
  target.hash = `${SHARE_HASH_PARAM}=${encoded}`;
  return target.toString();
}
