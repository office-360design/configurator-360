'use strict';

const crypto = require('node:crypto');
const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const FORMATS = Object.freeze({
  glb: { type: 'model/gltf-binary', maxBytes: 10 * 1024 * 1024, mode: 'android' },
  usdz: { type: 'model/vnd.usdz+zip', maxBytes: 24 * 1024 * 1024, mode: 'ios' },
});
const LIFETIME_MS = 24 * 60 * 60 * 1000;
class ARRequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function reject(status, code, message) { throw new ARRequestError(status, code, message); }
function requireId(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) reject(404, 'not-found', 'AR session not found.');
  return value;
}
function validateAsset(format, body) {
  const info = Object.hasOwn(FORMATS, format) ? FORMATS[format] : null;
  if (!info) reject(400, 'invalid-format', 'Choose Android or iOS.');
  if (!Buffer.isBuffer(body) || body.length < 128) reject(400, 'invalid-model', 'The AR model is empty or invalid.');
  if (body.length > info.maxBytes) reject(413, 'model-too-large', 'This hall is too detailed for mobile AR.');
  if (format === 'glb') validateGLB(body); else validateUSDZ(body);
  return { format, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
}
function validateGLB(body) {
  const fail = () => reject(400, 'invalid-model', 'A self-contained glTF 2.0 binary model is required.');
  if (body.readUInt32LE(0) !== 0x46546c67 || body.readUInt32LE(4) !== 2 || body.readUInt32LE(8) !== body.length) fail();
  let offset = 12, json = null, binaryCount = 0;
  while (offset + 8 <= body.length) {
    const length = body.readUInt32LE(offset), type = body.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > body.length) fail();
    if (offset === 12 && type !== 0x4e4f534a) fail();
    if (type === 0x4e4f534a) {
      if (json || length > 2 * 1024 * 1024) fail();
      try { json = JSON.parse(body.toString('utf8', offset + 8, offset + 8 + length).trim()); } catch { fail(); }
    } else if (type === 0x004e4942) binaryCount++;
    else fail();
    offset += 8 + length;
  }
  if (offset !== body.length || !json || json.asset?.version !== '2.0' || binaryCount !== 1 || !json.meshes?.length || !json.scenes?.length) fail();
  if (json.buffers?.length !== 1 || json.buffers[0].uri || !json.buffers[0].byteLength) fail();
  if ((json.images || []).some(image => image.uri || !Number.isInteger(image.bufferView))) fail();
  if ((json.extensionsRequired || []).some(ext => !['KHR_materials_unlit', 'KHR_texture_transform'].includes(ext))) fail();
}
function validateUSDZ(body) {
  // USDZ is an uncompressed, 64-byte-aligned ZIP. Inspect without unzipping:
  // this prevents decompression bombs and rejects external asset references.
  const fail = () => reject(400, 'invalid-model', 'A self-contained, uncompressed USDZ model is required.');
  let offset = 0, entries = 0;
  const names = new Set(); const references = []; const localEntries = new Map();
  while (offset + 30 <= body.length && body.readUInt32LE(offset) === 0x04034b50) {
    const flags = body.readUInt16LE(offset + 6), method = body.readUInt16LE(offset + 8);
    const packed = body.readUInt32LE(offset + 18), size = body.readUInt32LE(offset + 22);
    const nameLength = body.readUInt16LE(offset + 26), extra = body.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extra;
    const name = body.toString('utf8', offset + 30, offset + 30 + nameLength);
    if (flags & 9 || method !== 0 || packed !== size || !size || start % 64 || start + size > body.length || ++entries > 2048) fail();
    if (!/^[A-Za-z0-9_./-]+\.(usd|usda|png|jpg|jpeg)$/.test(name) || name.startsWith('/') || name.split('/').includes('..') || names.has(name)) fail();
    if (entries === 1 && !/\.(usd|usda)$/.test(name)) fail();
    names.add(name);
    localEntries.set(name, { offset, size, crc: body.readUInt32LE(offset + 14) });
    if (/\.(usd|usda)$/.test(name)) {
      const text = body.toString('utf8', start, start + size);
      if (!text.startsWith('#usda ')) fail(); // This workflow exports USDA, not arbitrary binary USD.
      for (const match of text.matchAll(/@([^@]+)@/g)) references.push(match[1]);
    }
    offset = start + size;
  }
  if (!entries || offset + 4 > body.length || body.readUInt32LE(offset) !== 0x02014b50 || body.readUInt32LE(body.length - 22) !== 0x06054b50) fail();
  // Native ZIP readers follow the central directory, so it must agree with the
  // inspected local records (including names, sizes, offsets and compression).
  const directoryStart = offset, seen = new Set();
  while (offset + 46 <= body.length && body.readUInt32LE(offset) === 0x02014b50) {
    const nameLength = body.readUInt16LE(offset + 28), extra = body.readUInt16LE(offset + 30), comment = body.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extra + comment;
    if (next > body.length || body.readUInt16LE(offset + 8) & 9 || body.readUInt16LE(offset + 10) !== 0) fail();
    const name = body.toString('utf8', offset + 46, offset + 46 + nameLength), local = localEntries.get(name);
    if (!local || seen.has(name) || body.readUInt32LE(offset + 20) !== local.size || body.readUInt32LE(offset + 24) !== local.size || body.readUInt32LE(offset + 42) !== local.offset || body.readUInt32LE(offset + 16) !== local.crc) fail();
    seen.add(name); offset = next;
  }
  if (seen.size !== entries || offset + 22 !== body.length || body.readUInt32LE(offset) !== 0x06054b50 || body.readUInt16LE(offset+4) !== 0 || body.readUInt16LE(offset+6) !== 0 || body.readUInt16LE(offset+8) !== entries || body.readUInt16LE(offset+10) !== entries || body.readUInt32LE(offset+12) !== offset-directoryStart || body.readUInt32LE(offset+16) !== directoryStart) fail();
  if (references.some(name => !names.has(name.replace(/^\.\//, '')))) fail();
}
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header));
  if (!match || (!match[1] && !match[2])) reject(416, 'invalid-range', 'Invalid byte range.');
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) reject(416, 'invalid-range', 'Invalid byte range.');
  return { start, end };
}
function quotaDecision(current = {}, bytes, maxCount, maxBytes) {
  const count = Number(current.count || 0), size = Number(current.bytes || 0);
  if (count >= maxCount || size + bytes > maxBytes) reject(429, 'quota-exceeded', 'AR preparation limit reached. Please try again later.');
  return { count: count + 1, bytes: size + bytes };
}
module.exports = { FORMATS, LIFETIME_MS, ARRequestError, reject, requireId, validateAsset, parseRange, quotaDecision };
