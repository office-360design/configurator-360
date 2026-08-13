const DEFAULT_SHARE_PARAM = 'config';
const SHARE_FORMAT_VERSION = 1;

function normalizeProductType(value) {
  return String(value ?? '').trim().toLowerCase();
}

function encodeUtf8Base64Url(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeUtf8Base64(value) {
  const normalized = String(value ?? '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

export function encodeShareState(productType, state) {
  const payload = {
    v: SHARE_FORMAT_VERSION,
    p: normalizeProductType(productType),
    s: state,
  };
  return encodeUtf8Base64Url(JSON.stringify(payload));
}

export function decodeShareState(encoded, { productType = '' } = {}) {
  if (!encoded) return null;
  const parsed = JSON.parse(decodeUtf8Base64(encoded));
  const expectedProduct = normalizeProductType(productType);

  // v1+ links use an envelope. Older Pergola links encoded the state object
  // directly, so direct objects remain supported for backwards compatibility.
  if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 's')) {
    const payloadProduct = normalizeProductType(parsed.p);
    if (expectedProduct && payloadProduct && expectedProduct !== payloadProduct) return null;
    return parsed.s && typeof parsed.s === 'object' ? parsed.s : null;
  }

  return parsed && typeof parsed === 'object' ? parsed : null;
}

export function readShareState({
  productType = '',
  url = window.location.href,
  param = DEFAULT_SHARE_PARAM,
} = {}) {
  try {
    const target = new URL(url, window.location.href);
    const encoded = target.searchParams.get(param);
    return encoded ? decodeShareState(encoded, { productType }) : null;
  } catch (error) {
    console.warn('The shared configuration could not be decoded.', error);
    return null;
  }
}

export function createShareUrl({
  productType = '',
  state,
  url = window.location.href,
  param = DEFAULT_SHARE_PARAM,
} = {}) {
  const target = new URL(url, window.location.href);
  target.searchParams.set(param, encodeShareState(productType, state));
  return target.toString();
}
