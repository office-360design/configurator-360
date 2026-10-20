import { decodeBinaryRLE, decodeUint8RLE, GROUND_LABELS } from './segmentationAdapter.js?v=tiles-ground-support-1';
import { assertPhotoMatches, assertSameImage } from './modelCamera.js';
import { ringArea } from './pavingRegions.js';

// Canonical application labels (not COCO class indices). Unknown IDs stay visible.
export const DEBUG_CLASSES = Object.freeze([
  { key: 'grass', id: 10, color: [64, 172, 91] },
  { key: 'pavement', id: 4, color: [112, 144, 168] },
  { key: 'dirt', id: 6, color: [174, 117, 65] },
  { key: 'building', id: 1, color: [227, 107, 79] },
  { key: 'vegetation', id: 5, color: [22, 108, 64] },
  { key: 'sky', id: 3, color: [97, 192, 237] },
  { key: 'obstacle', id: 250, color: [170, 83, 199] },
  { key: 'unknown', id: null, color: [237, 190, 37] },
]);
export const DEBUG_MASKS = Object.freeze([
  'labels', 'uncertain', 'protected', 'groundHint', 'groundSupport', 'requested',
  'selection', 'supportedSelection', 'effective', 'unsupported', 'projectionRejected', 'occlusion',
]);
const classMap = new Map(DEBUG_CLASSES.filter(c => c.id !== null).map(c => [c.id, c]));
export const classForLabel = label => classMap.get(label) || DEBUG_CLASSES.at(-1);

/** Inspect retained data only. Never runs projection/contour generation or inference.
 * Failed camera imports can still expose valid semantic masks. Each optional mask
 * fails independently; mismatched IMAGE identity rejects the complete source.
 */
export function inspectDebugSource(source, photo) {
  if (!source) return null;
  if (!photo || source.photoId !== photo.photoId) throw new Error('The diagnostic result belongs to a different photograph.');
  const raw = source.payload || {}, prototype = raw.schema_version === 2;
  const geometry = prototype ? raw : raw.geometry;
  const segmentation = prototype ? null : raw.segmentation;
  const identity = geometry || segmentation;
  if (!identity) throw new Error('No model image is present in this result.');
  const image = assertSameImage(identity);
  if (geometry && segmentation) assertSameImage(geometry, segmentation);
  assertPhotoMatches({ image }, photo);
  const size = image.width * image.height, masks = {}, errors = [];
  const read = (key, encoded, labels = false) => {
    if (!encoded) return;
    try { masks[key] = labels ? decodeUint8RLE(encoded, size) : decodeBinaryRLE(encoded, size); }
    catch (e) { errors.push(`${key}: ${e.message}`); }
  };
  read('labels', segmentation?.labels, true);
  read('uncertain', segmentation?.uncertainty);
  read('groundHint', segmentation?.ground_hint);
  read('groundSupport', geometry?.ground_support);
  read('occlusion', raw.occlusion);
  if (prototype && raw.masks?.included === true) {
    if (raw.masks.width !== image.width || raw.masks.height !== image.height)
      throw new Error('The prototype mask dimensions do not match its image.');
    for (const [key, field] of [['requested', 'selection'], ['selection', 'paving'], ['effective', 'paving'], ['groundSupport', 'ground_support']])
      if (raw.masks[field]) read(key, { encoding: raw.masks.encoding, counts: raw.masks[field] });
  } else read('selection', raw.selection);
  // The prepared selection is the EXACT import result, including safety clipping.
  // Do not recompute it when opening Debug or when the client's design changes.
  if (source.prepared) {
    if (source.prepared.image?.width !== image.width || source.prepared.image?.height !== image.height)
      throw new Error('The imported diagnostic masks have inconsistent dimensions.');
    for (const key of DEBUG_MASKS) {
      const m = source.prepared.masks?.[key];
      if (m == null) continue;
      if (!(m instanceof Uint8Array) || m.length !== size) { errors.push(`${key}: invalid retained mask`); continue; }
      masks[key] = m.slice();
    }
  }
  if (masks.labels) {
    masks.protected = Uint8Array.from(masks.labels, v => [4, 6, 10].includes(v) ? 0 : 1);
    if (!masks.selection) {
      const ids = new Set((source.targets || ['grass', 'dirt']).filter(k => Object.hasOwn(GROUND_LABELS, k)).map(k => GROUND_LABELS[k]));
      masks.selection = Uint8Array.from(masks.labels, v => ids.has(v) ? 1 : 0);
    }
  }
  if (!masks.requested && masks.selection) masks.requested = masks.selection.slice();
  if (masks.selection && masks.groundSupport) {
    masks.supportedSelection = Uint8Array.from(masks.selection, (v, i) => v && masks.groundSupport[i] ? 1 : 0);
    masks.unsupported ??= Uint8Array.from(masks.selection, (v, i) => v && !masks.groundSupport[i] ? 1 : 0);
    if (masks.effective) masks.projectionRejected ??= Uint8Array.from(masks.supportedSelection, (v, i) => v && !masks.effective[i] ? 1 : 0);
  }
  const classes = masks.labels ? DEBUG_CLASSES.map(c => ({ ...c, pixels: 0, percentage: 0 })) : null;
  if (classes) {
    const indices = new Map(classes.map((c, i) => [c.key, i]));
    for (const value of masks.labels) classes[indices.get(classForLabel(value).key)].pixels++;
    classes.forEach(c => c.percentage = c.pixels * 100 / size);
  }
  const counts = {};
  for (const [key, m] of Object.entries(masks)) if (key !== 'labels') {
    let pixels = 0; for (const value of m) if (value) pixels++;
    counts[key] = { pixels, percentage: pixels * 100 / size };
  }
  return { image, imageId: identity.image_id, masks, classes, counts, errors,
    camera: geometry?.camera || null, plane: geometry?.ground_plane || null,
    planeDiagnostics: geometry?.diagnostics || geometry?.metric_plane_diagnostics || null,
    models: { segmentation: segmentation?.model || raw.models?.segmentation || null,
      camera: geometry?.model || raw.models?.camera_model || null },
    uncertaintyMeaning: segmentation?.model?.uncertainty_definition || segmentation?.uncertainty?.meaning || raw.confidence?.segmentation_uncertainty_definition || null,
    reportedClassesPct: prototype ? raw.classes_pct || null : null, reportedConfidence: prototype ? raw.confidence || null : null,
    timings: { pipeline: raw.timing_s || {}, segmentation: segmentation?.timing_s || {}, camera: geometry?.timing_s || {} },
    predictionCached: geometry?.prediction_cached ?? null,
    warnings: [...(Array.isArray(raw.warnings) ? raw.warnings : []),
      ...(!prototype && Array.isArray(geometry?.warnings) ? geometry.warnings : []), ...(source.summary?.warnings || [])],
    source: source.kind, targets: source.targets || null, diagnostics: source.summary?.diagnostics || null };
}

export function maskRGBA(inspected, key, visibleClasses = DEBUG_CLASSES.map(c => c.key)) {
  const mask = inspected?.masks?.[key];
  if (!mask) return null;
  const pixels = new Uint8ClampedArray(mask.length * 4), allowed = new Set(visibleClasses);
  const colors = { uncertain: [244, 186, 42], protected: [203, 70, 122], groundHint: [69, 193, 189],
    groundSupport: [67, 121, 229], requested: [170, 106, 224], selection: [213, 90, 188],
    effective: [209, 75, 169], supportedSelection: [110, 127, 217], unsupported: [237, 114, 44],
    projectionRejected: [218, 65, 50], occlusion: [220, 90, 40] };
  for (let i = 0; i < mask.length; i++) {
    if (key === 'labels') {
      const c = classForLabel(mask[i]); if (!allowed.has(c.key)) continue;
      pixels.set([...c.color, 255], i * 4);
    } else if (mask[i]) pixels.set([...(colors[key] || [105, 178, 228]), 255], i * 4);
  }
  return pixels;
}
export function designStatistics(design) {
  const regions = design?.areaRegions || [];
  let outerArea = 0, holeArea = 0, vertices = 0, holes = 0;
  for (const r of regions) {
    outerArea += ringArea(r.outer); vertices += r.outer.length; holes += r.holes.length;
    for (const h of r.holes) { holeArea += ringArea(h); vertices += h.length; }
  }
  return { regions: regions.length, holes, vertices, outerAreaM2: outerArea, holeAreaM2: holeArea, areaM2: outerArea - holeArea };
}
export function encodeDebugMask(mask, labels = false) {
  if (!mask?.length) throw new Error('No mask is available to export.');
  const counts = [], values = []; let previous = labels ? mask[0] : 0, count = 0;
  for (const value of mask) {
    if (value === previous) count++;
    else { counts.push(count); if (labels) values.push(previous); previous = value; count = 1; }
  }
  counts.push(count); if (labels) values.push(previous);
  return labels ? { encoding: 'uint8_rle_row_major', values, counts } : { encoding: 'binary_rle_zero_first_row_major', counts };
}

/** Bound metadata rendering. Large masks must never accidentally enter <pre> or a
 * lightweight export through model metadata, arrays, error objects or URL strings.
 */
export function debugMetadata(value, depth = 0) {
  if (value == null || typeof value === 'boolean') return value ?? null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (depth > 8) return '[depth limit]';
  if (ArrayBuffer.isView(value)) return `[${value.length} samples omitted]`;
  if (Array.isArray(value)) return value.length > 128 ? `[${value.length} values omitted]` : value.map(v => debugMetadata(v, depth + 1));
  if (typeof value !== 'object') return null;
  const result = {};
  for (const [key, v] of Object.entries(value).slice(0, 100)) {
    if (/^(image_data|photo_url|authorization|token|client_id)$/i.test(key)) continue;
    if (/^(counts|values|labels|ground_support|ground_hint|masks|occlusion|selection|effective)$/i.test(key) &&
        !(v && typeof v.pixels === 'number' && typeof v.percentage === 'number')) continue;
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    result[key] = debugMetadata(v, depth + 1);
  }
  return result;
}
export function publicServiceAddress(address) {
  try { const url = new URL(address); return `${url.origin}${url.pathname}`; }
  catch { return ''; }
}
export function buildDebugReport({ snapshot, source, inspected, design, includeMasks = false, now = () => new Date().toISOString() }) {
  const report = { schema: 'tiles.segmentation.debug', version: 1, exported_at: now(),
    photo: snapshot.photo ? { photoId: snapshot.photo.photoId, width: snapshot.photo.width, height: snapshot.photo.height } : null,
    source: source ? { kind: source.kind, key: source.key, active: source.active ?? false, image_id: inspected?.imageId,
      targets: source.targets } : null,
    pipeline: debugMetadata({ ...snapshot.status, apiBase: publicServiceAddress(snapshot.status?.apiBase), service: snapshot.service }),
    current_camera: debugMetadata(snapshot.calibration), measurement_status: snapshot.measurementStatus,
    model_diagnostics: inspected ? debugMetadata({ camera: inspected.camera, ground_plane: inspected.plane, fit: inspected.planeDiagnostics,
      models: inspected.models, timings: inspected.timings, warnings: inspected.warnings, errors: inspected.errors,
      uncertainty_meaning: inspected.uncertaintyMeaning, prediction_cached: inspected.predictionCached,
      mask_counts: inspected.counts, classes: inspected.classes, reported_classes_pct: inspected.reportedClassesPct,
      reported_confidence: inspected.reportedConfidence, clipping: inspected.diagnostics }) : null,
    design: { coordinate_space: 'fixed_ground_plane_metres', origin: structuredClone(design?.areaOrigin || { x: 0, z: 0 }),
      regions: structuredClone(design?.areaRegions || []), statistics: designStatistics(design),
      meaning: 'Current client design including intentional holes; separate from original model masks.' },
    masks_included: includeMasks === true,
    notes: ['Diagnostics only; not a durable photo/configuration save.',
      'No photograph bytes are included.', 'Uncertainty and plane-fit consistency are not verified geometric accuracy.',
      'Importing this report restores the original model suggestion, NOT the current client design.'] };
  if (includeMasks) {
    report.model_result = source?.payload ? structuredClone(source.payload) : null;
    report.diagnostic_masks = inspected ? Object.fromEntries(Object.entries(inspected.masks).filter(([k]) => ['requested', 'selection', 'effective'].includes(k)).map(([k, m]) => [k, encodeDebugMask(m)])) : null;
    report.mask_image = inspected?.image || null;
    report.mask_note = 'Original masks are in model_result; diagnostic_masks adds import selections. Other read-only layers are derived from these without duplicating payloads.';
  }
  return report;
}
export function unwrapDebugReport(payload) {
  if (payload?.schema !== 'tiles.segmentation.debug') return payload;
  if (payload.version !== 1 || payload.masks_included !== true || !payload.model_result)
    throw new Error('This is a diagnostics-only export. Export again with “Include RLE masks” enabled to import its original model suggestion.');
  // Never infer a model selection from the report's editable client geometry.
  const result = payload.model_result;
  // Preserve the imported target selection, including non-default target sets.
  // The current client's editable geometry is deliberately NEVER read here.
  return result.schema_version === 2 || !payload.diagnostic_masks?.selection ? result :
    { ...result, selection: payload.diagnostic_masks.selection };
}
