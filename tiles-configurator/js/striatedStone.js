// Stone-local UVs: U follows the long edge, V follows the short edge.
// Sample individual faces from the user's photo; the 3D layout owns all joints.
export const STRIATED_GREY = Object.freeze(['#7f878a', '#a0a7a8', '#b1b7b7', '#919a9c']);
export const STRIATED_SOURCE_SIZE = Object.freeze({width:2048, height:1349});
export const STRIATED_FACE_CROPS = Object.freeze([
  [270, 15, 450, 300], [820, 15, 450, 300], [1340, 15, 450, 300],
  [30, 350, 450, 300], [555, 350, 450, 300], [1080, 350, 450, 300],
  [280, 705, 450, 300], [820, 705, 450, 300], [1340, 705, 450, 300],
  [45, 1045, 420, 280], [570, 1045, 420, 280], [1095, 1045, 420, 280],
].map(Object.freeze));
export const STRIATED_VARIANTS = STRIATED_FACE_CROPS.length;
export const STRIATED_PHOTO_URL = new URL('../textures/tetra-nova-gray.jpg?v=tile-photo-1', import.meta.url).href;
const canvases = new Map(), urls = new Map();
let photo = null, photoPromise = null;

function drawFace(canvas, variant) {
  const [x,y,w,h] = STRIATED_FACE_CROPS[variant];
  const sx = photo.naturalWidth / STRIATED_SOURCE_SIZE.width;
  const sy = photo.naturalHeight / STRIATED_SOURCE_SIZE.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, x*sx, y*sy, w*sx, h*sy, 0, 0, canvas.width, canvas.height);
}
/** Decode once. Runtime face sampling keeps the original JPG intact. */
export function loadStriatedStone() {
  if (!photoPromise) {
    photoPromise = (async () => {
      const image = new Image();
      image.src = STRIATED_PHOTO_URL;
      await image.decode();
      if (Math.abs(image.naturalWidth / image.naturalHeight - STRIATED_SOURCE_SIZE.width / STRIATED_SOURCE_SIZE.height) > .01)
        throw new Error('The Tetra Nova texture photo has unexpected proportions.');
      photo = image;
      for (const [variant,canvas] of canvases) drawFace(canvas, variant);
      urls.clear();
      return image;
    })();
    photoPromise.catch(() => { photoPromise = null; });
  }
  return photoPromise;
}
function stoneCanvas(variant) {
  if (!Number.isInteger(variant) || variant < 0 || variant >= STRIATED_VARIANTS)
    throw new Error('Unknown Tetra Nova texture face.');
  if (!canvases.has(variant)) {
    const canvas = document.createElement('canvas'); canvas.width = 450; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (photo) drawFace(canvas, variant);
    else { ctx.fillStyle = '#929a9c'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    canvases.set(variant, canvas);
  }
  return canvases.get(variant);
}
export function striatedStoneURL(variant = 0) {
  if (!photo || typeof document === 'undefined') return null;
  if (!urls.has(variant)) {
    const thumbnail = document.createElement('canvas'); thumbnail.width = 96; thumbnail.height = 64;
    thumbnail.getContext('2d').drawImage(stoneCanvas(variant), 0, 0, 96, 64);
    urls.set(variant, thumbnail.toDataURL('image/png'));
  }
  return urls.get(variant);
}
export function createStriatedStoneTexture(THREE, variant) {
  const texture = new THREE.CanvasTexture(stoneCanvas(variant));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'Tetra Nova photo face ' + (variant + 1);
  if (!photo) loadStriatedStone().then(() => { texture.needsUpdate = true; }).catch(() => {});
  return texture;
}
/** Matches the top-face UVs of BoxGeometry, including its 3 mm visual joint.
 * Fragments use the original uncut stone's centre and dimensions, so a cut or
 * intentional hole crops the finish instead of stretching/reseeding it.
 */
export function stoneTextureUV(stone, x, z) {
  const angle = (Number(stone.rotation) || 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const dx = x - stone.x, dz = z - stone.z;
  return {u: .5 + (dx*c + dz*s) / Math.max(.001, stone.l-.003),
    v: .5 - (-dx*s + dz*c) / Math.max(.001, stone.w-.003)};
}
export function applyStoneTextureUV(geometry, stone, originX = 0, originZ = 0) {
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const p = stoneTextureUV(stone, position.getX(i) + originX, position.getZ(i) + originZ);
    uv.setXY(i, p.u, p.v);
  }
  uv.needsUpdate = true;
}
