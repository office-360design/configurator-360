/** Versioned project documents. Geometry, camera and tiny asset references only.
 * Image bytes and model masks belong in the asset store / explicit project file,
 * never in normal saved-state payloads, geometry share links or undo snapshots.
 */
import { normalize, areaGeometry, layout, estimate } from './model.js';
import { validateModelCamera, assertPhotoMatches } from './modelCamera.js';

export const PROJECT_FORMAT = '360-tiles-project';
export const PROJECT_LIMITS = Object.freeze({ documentBytes: 700000, photoBytes: 24 * 1024 * 1024,
  resultBytes: 32 * 1024 * 1024, fileBytes: 80 * 1024 * 1024, photoPixels: 40 * 1000 * 1000 });
export const projectError = (code, message) => Object.assign(new Error(message), { code });
const bad = message => { throw projectError('invalidProject', message || 'This is not a valid pavement project.'); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
export const byteLength = v => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v)).length;
const vector = (v, n, bound = 10000) => Array.isArray(v) && v.length === n && v.every(x => finite(x) && Math.abs(x) <= bound);
export function validatePhotoDimensions(width, height) {
  if (![width, height].every(v => Number.isSafeInteger(v) && v >= 32 && v <= 20000) || width * height > PROJECT_LIMITS.photoPixels)
    throw projectError('photoTooLarge', 'The photo must be at least 32 × 32 pixels and at most 40 megapixels (20,000 pixels per side).');
  return { width, height };
}
export function validateAssetRef(value, role) {
  if (!object(value) || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.size) || value.size < 1 ||
      value.size > (role === 'photo' ? PROJECT_LIMITS.photoBytes : PROJECT_LIMITS.resultBytes)) bad('Invalid project asset reference.');
  if (role === 'photo') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(value.type)) bad('Unsupported project photograph.');
    return { sha256: value.sha256, size: value.size, type: value.type, ...validatePhotoDimensions(value.width, value.height) };
  }
  if (value.type !== 'application/json') bad('Invalid result asset type.');
  return { sha256: value.sha256, size: value.size, type: value.type };
}
const pair = (v, bound = 1000) => {
  if (!object(v) || ![v.x, v.z].every(x => finite(x) && Math.abs(x) <= bound)) bad('Invalid coordinate origin.');
  return { x: v.x, z: v.z };
};
export function validateReferenceCorners(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some(p => !object(p) || ![p.x, p.y].every(x => finite(x) && x >= 0 && x <= 1)))
    bad('Invalid reference-square corners.');
  const turns = value.map((p, i) => { const b = value[(i+1)%4], c = value[(i+2)%4]; return (b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x); });
  if (!(turns.every(v => v > 1e-9) || turns.every(v => v < -1e-9))) bad('The reference square is crossed or collapsed.');
  return value.map(p => ({ x: p.x, y: p.y }));
}
export function validateSavedView(value, photo) {
  if (value == null) return { calibration: null, photoMode: false, photoSetup: false, top: false, pose: null };
  if (!object(value)) bad('Invalid saved camera.');
  let calibration = null;
  if (value.calibration) {
    if (!photo) bad('A photo calibration must reference its photograph.');
    const c = value.calibration;
    if (c.type === 'reference_square') {
      calibration = { type: c.type, corners: validateReferenceCorners(c.corners), shift: pair(c.shift) };
    } else if (c.type === 'metric_model') {
      const v = c.value;
      if (!object(v) || !vector(v.K, 9, 1e7) || !vector(v.H, 9, 1e8)) bad('Invalid model calibration.');
      const rows = a => [a.slice(0,3), a.slice(3,6), a.slice(6,9)];
      // Re-validate the compact camera using the same authoritative server contract
      // as live imports. Never trust a persisted projection or inverse matrix.
      const camera = validateModelCamera({ schema_version: 1, image_id: v.imageId, image: v.image,
        model: { id: v.modelId, metric_scale_head: true, fov_input: null },
        camera: { source: 'metric_model', height_m: v.h, intrinsics_px: rows(v.K) },
        ground_plane: { normal_camera: v.n, origin_camera_m: v.P0, axis_x_camera: v.e1, axis_z_camera: v.e2, distance_m: v.h },
        homography_ground_m_to_image_px: rows(v.H) });
      assertPhotoMatches(camera, photo);
      calibration = { type: c.type, value: camera, origin: pair(c.origin) };
    } else bad('Unknown camera calibration type.');
  }
  let pose = null;
  if (value.pose != null) {
    const p = value.pose;
    if (!object(p) || !vector(p.position,3) || !vector(p.target,3) || !vector(p.quaternion,4,1.01) ||
        Math.abs(Math.hypot(...p.quaternion)-1) > .001 || !finite(p.fov) || p.fov < .1 || p.fov >= 180)
      bad('Invalid saved free-camera pose.');
    pose = { position: [...p.position], quaternion: [...p.quaternion], target: [...p.target], fov: p.fov };
  }
  return { calibration, photoMode: Boolean(photo && value.photoMode), photoSetup: Boolean(photo && value.photoSetup), top: value.top === true, pose };
}
export function validateProjectDocument(input) {
  if (!object(input) || input.format !== PROJECT_FORMAT || input.version !== 1) bad('Unsupported pavement project version.');
  if (byteLength(input) > PROJECT_LIMITS.documentBytes) throw projectError('projectTooLarge', 'The project metadata is too large. Masks and images must be stored as separate assets.');
  if (!object(input.state) || ![1,2].includes(input.state.version)) bad('Unsupported pavement state version.');
  const state = normalize(input.state);
  if (input.state.shape && state.shape !== input.state.shape) bad('The saved pavement outline is invalid.');
  if (input.state.houseShape === 'imported' && state.houseShape !== 'imported') bad('The saved house outline is invalid.');
  areaGeometry(state);
  const photo = input.photo == null ? null : validateAssetRef(input.photo, 'photo');
  const view = validateSavedView(input.view, photo);
  const referenceCorners = input.referenceCorners == null ? null : validateReferenceCorners(input.referenceCorners);
  const result = input.result == null ? null : validateAssetRef(input.result, 'result');
  if (result && !photo) bad('A detected result must reference its photograph.');
  const stage = photo && !view.calibration ? 'calibrate' : 'done';
  view.photoSetup = stage !== 'done';
  if (stage === 'calibrate') view.photoMode = true;
  return { format: PROJECT_FORMAT, version: 1, state, photo, view, referenceCorners, result, stage };
}
export function prepareProjectState(document) {
  const value = validateProjectDocument(document), parts = layout(value.state);
  return { document: value, parts, bom: estimate(value.state, parts) };
}
export function projectSavedState(document) {
  const { state, ...photoProject } = validateProjectDocument(document);
  // Root geometry is retained for existing cart / quotation consumers.
  return { ...state, photoProject };
}
export function projectFromSavedState(snapshot) {
  if (!object(snapshot) || !object(snapshot.photoProject)) bad();
  return validateProjectDocument({ ...snapshot.photoProject, state: snapshot });
}
export function geometryShareState(input) {
  const state = normalize(input);
  areaGeometry(state);
  // A share contains the client's current design and holes, not the detection,
  // the photo hash, the photo/calibration itself or a precise map location.
  return { ...state, houseLocation: null };
}
export function projectFileName(name) {
  return (String(name || 'pavement').normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu, '_').replace(/^\.+/, '').slice(0,80).trim() || 'pavement') + '.paving.json';
}
