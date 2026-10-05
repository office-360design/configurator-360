import * as THREE from 'three';
import { commercialLayout } from './commercial.js?v=hall-storage-1';

function box(parent, name, x, y, z, px, py, pz, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
  mesh.name = name; mesh.position.set(px, py, pz);
  mesh.castShadow = !material.transparent; mesh.receiveShadow = !material.transparent;
  parent.add(mesh); return mesh;
}
function finish(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .56, metalness: .18, ...extra }); }
function framedGlass(parent, name, width, height, frame, glass, rim = .055) {
  const g = new THREE.Group(); g.name = name; parent.add(g);
  for (const side of [-1, 1]) {
    box(g, `${name}-stile-${side}`, rim, height, .085, side * (width - rim) / 2, height / 2, 0, frame);
    box(g, `${name}-rail-${side}`, width - 2 * rim, rim, .085, 0, height / 2 + side * (height - rim) / 2, 0, frame);
  }
  const pane = box(g, `${name}-glass`, Math.max(.05, width - rim * 2), Math.max(.05, height - rim * 2), .022, 0, height / 2, 0, glass);
  pane.renderOrder = 2;
  return g;
}
function visibilityStrips(parent, width, height) {
  const stripMat = finish('#edf4f4', { transparent: true, opacity: .72, depthWrite: false, metalness: 0 });
  for (const y of [.95, 1.5]) if (y < height - .15) {
    box(parent, 'glass-visibility-strip', Math.max(.05, width - .16), .018, .002, 0, y, -.015, stripMat).renderOrder = 3;
  }
}

/** Tall fixed glazing, divided by slim mullions, with no opaque backing. */
export function createShopfrontAssembly(width, height, frame, glass) {
  const group = new THREE.Group(); group.name = 'shopfront-glazing-assembly';
  const paneCount = Math.max(1, Math.ceil(width / 1.5));
  const paneWidth = width / paneCount;
  for (let i = 0; i < paneCount; i += 1) {
    const pane = framedGlass(group, `shopfront-pane-${i}`, paneWidth, height, frame, glass, .045);
    pane.position.x = -width / 2 + (i + .5) * paneWidth;
    // A shallow upper transom lends a commercial shopfront rhythm.
    const y = Math.min(2.15, height * .80);
    box(pane, 'shopfront-transom', paneWidth - .09, .045, .09, 0, y, 0, frame);
  }
  return group;
}

/** Local coordinates: +Y up, -Z outdoors. Door motion is a preview, not automation. */
export function createGlazedEntranceAssembly(opening, frame, glass, hardware) {
  const { width, height, subtype, isOpen } = opening;
  const group = new THREE.Group(); group.name = 'glazed-entrance-assembly';
  const rim = .065;
  for (const side of [-1, 1]) box(group, `entrance-jamb-${side}`, rim, height, .14,
    side * (width - rim) / 2, height / 2, 0, frame);
  box(group, 'entrance-head', width, rim, .14, 0, height - rim / 2, 0, frame);
  const clearWidth = width - rim * 2;
  const leafHeight = height - rim - .025;
  if (subtype === 'double-glass') {
    const leafWidth = (clearWidth - .012) / 2;
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.name = `entrance-hinge-${side}`;
      pivot.position.x = side * clearWidth / 2;
      pivot.rotation.y = isOpen ? -side * Math.PI * .48 : 0;
      group.add(pivot);
      const leaf = framedGlass(pivot, `entrance-leaf-${side}`, leafWidth, leafHeight, frame, glass);
      leaf.position.set(-side * leafWidth / 2, .015, -.016);
      visibilityStrips(leaf, leafWidth, leafHeight);
      box(leaf, 'entrance-pull-handle', .026, .55, .06, -side * (leafWidth / 2 - .12), 1.15, -.10, hardware);
    }
  } else {
    const leafWidth = clearWidth / 4;
    for (const side of [-1, 1]) {
      const fixed = framedGlass(group, `entrance-fixed-sidelight-${side}`, leafWidth, leafHeight, frame, glass);
      fixed.position.set(side * leafWidth * 1.5, .015, .035);
      const sliding = framedGlass(group, `entrance-sliding-leaf-${side}`, leafWidth - .006, leafHeight, frame, glass);
      sliding.position.set(side * leafWidth * (isOpen ? 1.48 : .5), .015, -.070);
      visibilityStrips(sliding, leafWidth, leafHeight);
    }
    box(group, 'automatic-entrance-operator', width + .08, .16, .20, 0, height + .04, -.018, frame);
    box(group, 'automatic-entrance-sensor', .24, .06, .10, 0, height + .035, -.16, hardware);
  }
  return group;
}

export function createLinearRetailLight(frame, glow) {
  const g = new THREE.Group(); g.name = 'retail-linear-luminaire';
  box(g, 'retail-linear-housing', 1.45, .075, .18, 0, 0, 0, frame);
  box(g, 'high-bay-lamp-linear-retail', 1.38, .012, .14, 0, -.044, 0, glow);
  for (const x of [-.52, .52]) box(g, 'retail-light-hanger', .018, .30, .018, x, .19, 0, frame);
  return g;
}

function signMaterial(text, accent, width, height) {
  const mat = finish(accent, { metalness: .12 });
  // Headless geometry tests do not need a DOM; browsers use a local canvas, no CDN font.
  if (typeof document === 'undefined') return mat;
  const canvas = document.createElement('canvas');
  const aspect = Math.max(1, width / height);
  canvas.width = 4096; canvas.height = Math.max(64, Math.round(canvas.width / aspect));
  const ctx = canvas.getContext('2d'); if (!ctx) return mat;
  ctx.fillStyle = accent; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let size = Math.round(canvas.height * .68); ctx.font = `700 ${size}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > canvas.width - 220 && size > 28) ctx.font = `700 ${--size}px system-ui, sans-serif`;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  mat.color.set(0xffffff); mat.map = texture; return mat;
}

/** Optional storefront fittings, outside the wall; display islands are separate. */
export function createCommercialDetails(state) {
  const layout = commercialLayout(state);
  const facade = new THREE.Group(); facade.name = 'commercial-frontage';
  const fitout = new THREE.Group(); fitout.name = 'retail-fitout';
  const trim = finish('#303e47', { metalness: .5 });
  const accent = finish(state.commercialAccent || '#b4663e');
  const pale = finish('#e8e4de', { metalness: 0, roughness: .8 });
  const wallZ = -state.length / 2 - .175; // existing exterior cladding plane
  if (layout.signArea) {
    const mesh = box(facade, 'commercial-fascia-sign', layout.signWidth, layout.signHeight, .12,
      0, layout.signBottom + layout.signHeight / 2, wallZ - .07, accent);
    // The text plane faces -Z, i.e. customers in front of the hall.
    const face = new THREE.Mesh(new THREE.PlaneGeometry(layout.signWidth - .1, layout.signHeight - .025), signMaterial(state.signText || '', state.commercialAccent || '#b4663e', layout.signWidth - .1, layout.signHeight - .025));
    face.name = 'commercial-sign-lettering'; face.rotation.y = Math.PI;
    face.position.set(0, 0, -.061); mesh.add(face);
  }
  if (layout.canopyArea) {
    const { canopyWidth: w, canopyDepth: d, canopyY: y, canopyCenterX: x } = layout;
    box(facade, 'commercial-entrance-canopy', w, .14, d, x, y, wallZ - d / 2, trim);
    box(facade, 'commercial-canopy-accent', w + .02, .09, .045, x, y - .005, wallZ - d, accent);
    const lamp = finish('#fff4dc', { emissive: '#fff1cf', emissiveIntensity: .4 });
    box(facade, 'commercial-canopy-light', w * .7, .012, .035, x, y - .077, wallZ - d * .70, lamp);
    // Concept tie rods, anchored to the solid wall above the glass. Not a support calculation.
    for (const side of [-1, 1]) {
      const a = new THREE.Vector3(x + side * w * .40, Math.min(state.eaveHeight - .10, y + .8), wallZ - .035);
      const b = new THREE.Vector3(a.x, y + .09, wallZ - d + .14);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, a.distanceTo(b), 10), trim);
      rod.name = 'commercial-canopy-tie'; rod.position.copy(a).add(b).multiplyScalar(.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
      facade.add(rod);
    }
  }
  if (layout.apronArea) {
    // A shallow ramp from the forecourt to slab level, without an entrance kerb.
    const w = layout.apronWidth, d = layout.apronDepth;
    const slabTop = state.slab ? .135 : .025;
    const mesh = box(facade, 'customer-paved-forecourt', w, .12, d, 0, 0, wallZ - d / 2, finish('#d1d0c9', { roughness: .95, metalness: 0 }));
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const t = (pos.getZ(i) + d / 2) / d;
      pos.setY(i, pos.getY(i) > 0 ? .012 + t * (slabTop - .012) : -.025);
    }
    pos.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingBox();
  }
  if (layout.displayCount) {
    const itemMat = finish('#b7c5c6', { metalness: 0, roughness: .8 });
    for (const side of [-1, 1]) for (const row of [-.18, .12]) {
      const g = new THREE.Group(); g.name = 'retail-display-island';
      g.position.set(side * Math.min(4.8, state.width * .25), state.slab ? .135 : 0, state.length * row);
      box(g, 'display-base', 2.6, .60, 1.3, 0, .30, 0, pale);
      box(g, 'display-plinth', 2.5, .08, 1.2, 0, .04, 0, trim);
      box(g, 'display-top', 2.65, .045, 1.35, 0, .62, 0, pale);
      // Abstract merchandise for scale: no brand, price or inventory claim.
      for (const sign of [-1, 1]) box(g, 'display-merchandise', .45, .28, .35, sign * .65, .78, 0, itemMat);
      fitout.add(g);
    }
    const counter = new THREE.Group(); counter.name = 'retail-checkout-counter';
    counter.position.set(state.width * .30, state.slab ? .135 : 0, state.length * .28);
    box(counter, 'checkout-body', 2.4, .94, .85, 0, .47, 0, pale);
    box(counter, 'checkout-top', 2.46, .055, .9, 0, .97, 0, trim);
    box(counter, 'checkout-accent', 2.25, .15, .012, 0, .75, -.433, accent);
    box(counter, 'checkout-terminal', .32, .28, .05, .6, 1.14, 0, trim);
    fitout.add(counter);
  }
  return { facade, fitout };
}
