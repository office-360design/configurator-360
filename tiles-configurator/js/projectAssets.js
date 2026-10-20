/** Bounded binary assets. Project imports never fetch URLs from a document. */
import { PROJECT_LIMITS, validateAssetRef, validatePhotoDimensions, validateProjectDocument, projectError, byteLength } from './pavingProject.js';
const fail = (code, text) => { throw projectError(code, text); };
export async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) fail('secureStorage', 'Photo saving requires HTTPS or localhost (Web Crypto is unavailable).');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export function inspectPhotoHeader(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), n = b.length;
  const text = (i, l) => String.fromCharCode(...b.subarray(i, i+l));
  const u32 = i => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(i);
  let type, width, height;
  if (n >= 24 && b[0] === 137 && text(1,7) === 'PNG\r\n\x1a\n' && text(12,4) === 'IHDR') {
    type = 'image/png'; width = u32(16); height = u32(20);
    for (let i = 8; i+12 <= n;) {
      const length = u32(i);
      if (text(i+4,4) === 'acTL') fail('animatedPhoto', 'Use a still photograph, not an animated PNG.');
      if (length > n-i-12) break;
      i += length+12;
    }
  } else if (n >= 30 && text(0,4) === 'RIFF' && text(8,4) === 'WEBP') {
    type = 'image/webp';
    const le24 = i => b[i] | b[i+1]<<8 | b[i+2]<<16;
    if (text(12,4) === 'VP8X') {
      if (b[20] & 2) fail('animatedPhoto', 'Use a still photograph, not an animated WebP.');
      width = le24(24)+1; height = le24(27)+1;
    } else if (text(12,4) === 'VP8L' && b[20] === 47) {
      width = 1 + (b[21] | (b[22]&63)<<8); height = 1 + ((b[22]>>6) | b[23]<<2 | (b[24]&15)<<10);
    } else if (text(12,4) === 'VP8 ' && b[23] === 157 && b[24] === 1 && b[25] === 42) {
      width = (b[26] | b[27]<<8)&16383; height = (b[28] | b[29]<<8)&16383;
    }
  } else if (n >= 4 && b[0] === 255 && b[1] === 216) {
    type = 'image/jpeg';
    for (let i = 2; i+4 < n;) {
      if (b[i++] !== 255) break;
      while (b[i] === 255) i++;
      const marker = b[i++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      const length = (b[i]<<8)|b[i+1];
      if (length < 2 || i+length > n) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) {
        height = (b[i+3]<<8)|b[i+4]; width = (b[i+5]<<8)|b[i+6]; break;
      }
      i += length;
    }
  }
  if (!type || !width || !height) fail('invalidPhoto', 'The file is not a supported JPEG, PNG or WebP photograph.');
  validatePhotoDimensions(width, height);
  return { type, width, height };
}
export async function decodePhotoDimensions(blob) {
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = () => reject(projectError('invalidPhoto', 'The photograph could not be decoded.'));
      image.src = url;
    });
    return validatePhotoDimensions(image.naturalWidth, image.naturalHeight);
  } finally { image.onload = image.onerror = null; URL.revokeObjectURL(url); }
}
export async function makePhotoAsset(blob, expected = null, decode = decodePhotoDimensions) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > PROJECT_LIMITS.photoBytes)
    fail('photoTooLarge', 'The photograph must be a JPEG, PNG or WebP file smaller than 24 MiB.');
  const bytes = await blob.arrayBuffer(), header = inspectPhotoHeader(bytes), normalized = new Blob([bytes], { type: header.type });
  const size = await decode(normalized);
  if (expected && (size.width !== expected.width || size.height !== expected.height))
    fail('photoMismatch', 'The photograph dimensions do not match this project.');
  const meta = { sha256: await sha256(bytes), size: bytes.byteLength, type: header.type, ...size };
  if (expected?.sha256 && expected.sha256 !== meta.sha256)
    fail('photoMismatch', 'This is not the exact photograph used by the saved project. Select the original file, not a crop or resized copy.');
  return { meta: validateAssetRef(meta, 'photo'), blob: normalized };
}
export async function makeResultAsset(payload, targets, photoSha256, includeOutsideGroundSupport = false) {
  const value = { format: '360-tiles-detection', version: 1, photoSha256,
    targets: (targets || ['grass','dirt']).filter(v => ['grass','dirt','pavement'].includes(v)), includeOutsideGroundSupport, payload };
  const text = JSON.stringify(value);
  if (byteLength(text) > PROJECT_LIMITS.resultBytes) fail('resultTooLarge', 'The optional model result exceeds 32 MiB. Save the design without diagnostics.');
  const blob = new Blob([text], { type: 'application/json' });
  return { meta: { sha256: await sha256(await blob.arrayBuffer()), size: blob.size, type: 'application/json' }, blob };
}
export async function readResultAsset(asset, photoSha256) {
  await verifyAsset(asset, 'result');
  const result = JSON.parse(await asset.blob.text());
  if (result?.format !== '360-tiles-detection' || result.version !== 1 || result.photoSha256 !== photoSha256 ||
      !result.payload || typeof result.payload !== 'object' || Array.isArray(result.payload) ||
      !Array.isArray(result.targets) || result.targets.some(v => !['grass','dirt','pavement'].includes(v)) ||
      result.includeOutsideGroundSupport !== undefined && typeof result.includeOutsideGroundSupport !== 'boolean')
    fail('resultMismatch', 'The cached detection belongs to a different photo or is invalid.');
  return result;
}
export async function verifyAsset(asset, role) {
  const ref = validateAssetRef(asset?.meta, role);
  if (!(asset.blob instanceof Blob) || asset.blob.size !== ref.size || asset.blob.type !== ref.type ||
      await sha256(await asset.blob.arrayBuffer()) !== ref.sha256) fail('corruptAsset', 'The saved asset is incomplete or corrupt.');
  return ref;
}
function encodeBase64(bytes) {
  let text = '';
  for (let i=0;i<bytes.length;i+=32768) text += String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(text);
}
function decodeBase64(text, maximum) {
  if (typeof text !== 'string' || text.length > Math.ceil(maximum/3)*4 || text.length % 4 ||
      /[^A-Za-z0-9+/=]/.test(text))
    fail('invalidAsset', 'The project contains invalid or oversized binary data.');
  const padding = text.indexOf('=');
  if (padding !== -1 && !((padding === text.length-1 && text.length > 3) ||
      (padding === text.length-2 && text.endsWith('==') && text.length > 3)))
    fail('invalidAsset', 'Invalid base64 padding.');
  const binary = atob(text);
  if (binary.length > maximum) fail('invalidAsset', 'The project asset is too large.');
  return Uint8Array.from(binary, c=>c.charCodeAt(0));
}
export async function encodeProjectFile(document, { photo = null, result = null } = {}, { includeResult = false } = {}) {
  const doc = validateProjectDocument({ ...document, result: includeResult ? document.result : null });
  const assets = {};
  for (const role of ['photo','result']) {
    const ref = doc[role]; if (!ref) continue;
    const asset = role === 'photo' ? photo : result;
    if (!asset || JSON.stringify(asset.meta) !== JSON.stringify(ref)) fail('missingAsset', `The ${role} is unavailable. Reattach it before downloading this full project.`);
    await verifyAsset(asset, role);
    assets[role] = { encoding: 'base64', data: encodeBase64(new Uint8Array(await asset.blob.arrayBuffer())) };
  }
  const blob = new Blob([JSON.stringify({ format: '360-tiles-project-file', version: 1, document: doc, assets })], { type: 'application/json' });
  if (blob.size > PROJECT_LIMITS.fileBytes) fail('projectTooLarge', 'The project file exceeds 80 MiB. Exclude optional diagnostics.');
  return blob;
}
export async function decodeProjectFile(file, decodeImage = decodePhotoDimensions) {
  if (!(file instanceof Blob) || file.size > PROJECT_LIMITS.fileBytes) fail('projectTooLarge', 'Project files must be smaller than 80 MiB.');
  let value;
  try { value = JSON.parse(await file.text()); } catch { fail('invalidProject', 'The project file is not valid JSON.'); }
  if (value?.format !== '360-tiles-project-file' || value.version !== 1) fail('invalidProject', 'Open a .paving.json project file. Model-result JSON belongs in Debug.');
  const document = validateProjectDocument(value.document), assets = { photo: null, result: null };
  for (const role of ['photo','result']) {
    const ref = document[role], raw = value.assets?.[role];
    if (!ref && raw) fail('invalidAsset', 'The project contains an unreferenced asset.');
    if (!ref) continue;
    if (raw?.encoding !== 'base64') fail('missingAsset', `The project is missing its ${role}. External URLs are not allowed.`);
    const bytes = decodeBase64(raw.data, ref.size), blob = new Blob([bytes], { type: ref.type });
    const asset = { meta: ref, blob }; await verifyAsset(asset, role);
    if (role === 'photo') await makePhotoAsset(blob, ref, decodeImage);
    else await readResultAsset(asset, document.photo.sha256);
    assets[role] = asset;
  }
  return { document, assets };
}
