/** Image-only metric camera contract. No guessed height, focal length or pose. */
export class ModelImportError extends Error {
  constructor(code, message) { super(message); this.name = 'ModelImportError'; this.code = code; }
}
export const failImport = (code, message) => { throw new ModelImportError(code, message); };
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const vector = (v) => Array.isArray(v) && v.length === 3 && v.every(finite);
const matrix = (v) => Array.isArray(v) && v.length === 3 && v.every(vector);
export const multiply3 = (a, b) => Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3), c = i % 3;
  return a[r*3]*b[c] + a[r*3+1]*b[3+c] + a[r*3+2]*b[6+c];
});
export function inverse3(m) {
  const [a,b,c,d,e,f,g,h,i] = m,
    n = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d],
    det = a*n[0] + b*n[3] + c*n[6];
  if (!finite(det) || Math.abs(det) < 1e-12) failImport('invalidCamera', 'The model camera is singular.');
  const out = n.map(v => v / det);
  if (!out.every(finite)) failImport('invalidCamera', 'The model camera is not finite.');
  return out;
}
export function imageSize(image) {
  const width = image?.width, height = image?.height;
  if (![width, height].every(v => Number.isSafeInteger(v) && v >= 32 && v <= 1100))
    failImport('imageMismatch', 'Working image dimensions must be integers between 32 and 1100 pixels.');
  return { width, height };
}
export function assertSameImage(a, b) {
  const size = imageSize(a?.image);
  if (typeof a?.image_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(a.image_id) ||
      b && (a.image_id !== b.image_id || size.width !== b.image?.width || size.height !== b.image?.height))
    failImport('imageMismatch', 'The masks and camera must belong to the same working image.');
  return size;
}
/** Only metric-model results are accepted. Prototype reference-only homographies are not 3D cameras. */
export function validateModelCamera(payload) {
  const image = assertSameImage(payload), c = payload.camera, p = payload.ground_plane,
    bad = () => failImport('invalidCamera', 'Invalid or inconsistent metric camera result; no fallback camera was substituted.');
  if (payload.schema_version !== 1 || c?.source !== 'metric_model' ||
      payload.model?.metric_scale_head !== true || payload.model?.fov_input !== null ||
      !matrix(c.intrinsics_px) || !p || ![p.normal_camera,p.origin_camera_m,p.axis_x_camera,p.axis_z_camera].every(vector)) bad();
  const K = c.intrinsics_px.flat(), n = p.normal_camera, P0 = p.origin_camera_m,
    e1 = p.axis_x_camera, e2 = p.axis_z_camera, h = p.distance_m;
  if (!finite(h) || h <= .001 || h > 1000 || !finite(c.height_m) || Math.abs(c.height_m-h) > 1e-4*Math.max(1,h) ||
      K[0] <= 0 || K[4] <= 0 || Math.abs(K[3]) > 1e-9 || Math.abs(K[6]) > 1e-9 || Math.abs(K[7]) > 1e-9 || Math.abs(K[8]-1) > 1e-9 ||
      K[2] < 0 || K[2] > image.width || K[5] < 0 || K[5] > image.height) bad();
  if ([n,e1,e2].some(v => Math.abs(Math.hypot(...v)-1) > 1e-5) ||
      Math.abs(dot(e1,n)) > 1e-5 || Math.abs(dot(e2,n)) > 1e-5 || Math.abs(dot(e1,e2)) > 1e-5 ||
      Math.abs(dot(n,P0)-h) > 1e-5*Math.max(1,h) ||
      cross(n,e2).some((v,i) => Math.abs(v-e1[i]) > 1e-5)) bad();
  const H = multiply3(K, [e1[0],e2[0],P0[0],e1[1],e2[1],P0[1],e1[2],e2[2],P0[2]]);
  const match = (sent, expected) => matrix(sent) && sent.flat().every((v,i) => Math.abs(v-expected[i]) <= 1e-5*Math.max(1,Math.abs(expected[i])));
  if (!match(payload.homography_ground_m_to_image_px, H)) bad();
  const Hinv = inverse3(H);
  if (payload.homography_image_px_to_ground_m && !match(payload.homography_image_px_to_ground_m,Hinv)) bad();
  const norm = m => Math.max(...[0,1,2].map(r => m.slice(r*3,r*3+3).reduce((s,v)=>s+Math.abs(v),0)));
  if (norm(H)*norm(Hinv) > 1e10) bad();
  // Bounded, serializable calibration only. Raw masks and untrusted metadata are kept elsewhere.
  return { type: 'metric_model', imageId: payload.image_id, image, K: [...K], n: [...n], P0: [...P0],
    e1: [...e1], e2: [...e2], h, H, Hinv, accuracyVerified: false,
    scaleSource: 'model_estimated_metric_scale', modelId: String(payload.model.id || 'metric-model').slice(0,160) };
}
/** Metre-space conversion: the model's +z points forward; scene +z is its negative.
 * This reflection of the 2D ground coordinates is required for a proper (det=+1)
 * 3D rotation with scene +Y above ground. Never decompose an improper reflection.
 */
export function imageToGround(camera, u, v, { maxRange = 80, minDepth = .01 } = {}) {
  const m = camera.Hinv, d = m[6]*u + m[7]*v + m[8];
  if (!finite(d) || d <= 1e-10) return null;
  const x = (m[0]*u+m[1]*v+m[2])/d, forward = (m[3]*u+m[4]*v+m[5])/d;
  const cv = camera.P0.map((a,i) => a+camera.e1[i]*x+camera.e2[i]*forward);
  if (!cv.every(finite) || cv[2] < minDepth || Math.hypot(...cv) > maxRange) return null;
  return { x, z: -forward };
}
export function groundToImage(camera, point) {
  const m = camera.H, x = point.x, z = -point.z, d = m[6]*x+m[7]*z+m[8];
  if (!finite(d) || d <= 1e-10) return null;
  return { x: (m[0]*x+m[1]*z+m[2])/d, y: (m[3]*x+m[4]*z+m[5])/d, depth: d };
}
/** Row-major WebGL view/projection matrices, including letterboxing and off-centre intrinsics. */
export function modelCameraMatrices(calibration, viewport, rect, origin = { x: 0, z: 0 }, groundY = -.16) {
  const { width: w, height: h } = viewport, c = calibration;
  if (![w,h,rect?.width,rect?.height].every(v => finite(v) && v > 0) ||
      ![rect.left,rect.top,origin.x,origin.z,groundY].every(finite))
    failImport('invalidViewport', 'The photo viewport is not ready.');
  const { e1: x, e2: f, n } = c, sx = rect.width/c.image.width, sy = rect.height/c.image.height,
    tx = c.P0.map((v,i) => v+x[i]*origin.x-f[i]*origin.z+n[i]*groundY),
    near = .01, far = 1000,
    fx = c.K[0]*sx, fy = c.K[4]*sy, skew = c.K[1]*sx,
    cx = rect.left+c.K[2]*sx, cy = rect.top+c.K[5]*sy;
  return {
    view: [x[0],-n[0],-f[0],tx[0], -x[1],n[1],f[1],-tx[1], -x[2],n[2],f[2],-tx[2], 0,0,0,1],
    projection: [2*fx/w,-2*skew/w,1-2*cx/w,0, 0,2*fy/h,2*cy/h-1,0,
      0,0,-(far+near)/(far-near),-2*far*near/(far-near), 0,0,-1,0],
    near, far, fov: 2*Math.atan(h/(2*fy))*180/Math.PI,
  };
}
export function assertPhotoMatches(camera, photo) {
  if (!photo || !finite(photo.width) || !finite(photo.height) || photo.width <= 0 || photo.height <= 0)
    failImport('noPhoto', 'Load the matching photograph before importing model results.');
  // Resizing with integer rounding may change the working-image aspect by <= 1 pixel.
  const a = camera.image.width/photo.width, b = camera.image.height/photo.height;
  if (Math.abs(a-b) > 1.01/Math.min(photo.width,photo.height))
    failImport('imageMismatch', 'This result has a different aspect ratio from the loaded photograph. Use the same uncropped, oriented photo.');
}
