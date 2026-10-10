import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSurfaceSystem, disposeObjectResources } from '../../shared-3d/src/index.js?v=platform-19';
import { FINISHES } from './facade.js?v=cw-2';
import { GLASS_GAP, nodeParts } from './sections.js?v=cw-2';

const MM = 0.001;
// Exploded view: offset of each layer along the facade normal (m at amount 1),
// from the building side outwards. Transom layers move slightly further in so
// mullion and transom profiles read separately.
export const EXPLODE_LAYERS = Object.freeze([
  { kind: 'profile', role: 'mullion', z: -0.34 },
  { kind: 'profile', role: 'transom', z: -0.2 },
  { kind: 'gasketInner', z: -0.08 },
  { kind: 'glass', z: 0 },
  { kind: 'panel', z: 0 },
  { kind: 'insulator', z: 0.1 },
  { kind: 'gasketOuter', z: 0.2 },
  { kind: 'strip', z: 0.32 },
  { kind: 'cover', z: 0.46 },
]);
const layerOffset = (kind, role) => (EXPLODE_LAYERS.find(l => l.kind === kind && (!l.role || l.role === role))?.z ?? 0);
const TINTS = { clear: '#dfeaec', neutral: '#a9b8bd', blue: '#7fa6c2', bronze: '#a8906f' };

function shapeFrom(part) {
  // Section (x, z) → shape (x, −z), extruded along +Z then rotated so the
  // extrusion runs along +Y and the section depth maps back to +Z.
  const shape = new THREE.Shape(part.contour.map(([x, z]) => new THREE.Vector2(x * MM, -z * MM)));
  part.holes.forEach(h => shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x * MM, -z * MM)))));
  return shape;
}

// One member: every section part extruded over `length` mm, oriented
// vertically (mullion) or horizontally (transom).
function memberGeometries(parts, length, { horizontal, x, y }) {
  const out = {};
  for (const part of parts) {
    const g = new THREE.ExtrudeGeometry(shapeFrom(part), { depth: length * MM, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    if (horizontal) g.rotateZ(-Math.PI / 2);
    g.translate(x * MM, y * MM, 0);
    (out[part.kind] ||= []).push(g);
  }
  return out;
}

export class FacadeScene {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef2f4);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('change', () => this.invalidate());
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2c8, 1.35));
    this.key = new THREE.DirectionalLight(0xffffff, 2.6);
    this.key.position.set(6, 10, 9);
    this.key.castShadow = true;
    this.scene.add(this.key);
    const fill = new THREE.DirectionalLight(0xdce8ff, 0.7);
    fill.position.set(-7, 4, -6);
    this.scene.add(fill);
    this.surface = createSurfaceSystem(THREE, {
      renderer: this.renderer, scene: this.scene, shadowLights: [this.key], quality: 'balanced',
      contactShading: { radius: 0.05, intensity: 0.4 }, glazingReflections: true,
    });
    this.surface.setQuality('balanced', { compact: matchMedia('(max-width: 760px)').matches });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe3e8ea, roughness: 0.95 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.root = null;
    this.views = ['exterior', 'front', 'interior', 'node'];
    this.viewIndex = 0;
    this.explode = { value: 0, from: 0, to: 0, start: 0, scale: 1 };
    this.needsFrame = true;
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = now => {
      this.controls.update();
      this.stepExplode(now);
      if (this.needsFrame) { this.needsFrame = false; this.surface.render(this.camera, { onDemand: true, now }); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  invalidate() { this.needsFrame = true; this.surface.invalidate?.(); }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.invalidate();
  }

  material(kind, S) {
    const finish = id => FINISHES.find(f => f.id === id);
    const metal = id => this.surface.materials.create(id === 'E6C0' ? 'aluminium.anodized' : 'aluminium.powderCoated', { color: finish(id).color });
    switch (kind) {
      case 'profile': return metal(S.finishInside);
      case 'strip': return metal(S.finishOutside);
      case 'cover': return metal(S.finishOutside);
      case 'gasketInner':
      case 'gasketOuter': return this.surface.materials.create('rubber.epdm');
      case 'insulator': return this.surface.materials.create('plastic.thermalBreak');
      case 'glass': return this.surface.materials.create('glass.architectural', { color: TINTS[S.glassTint], side: THREE.DoubleSide });
      case 'panel': return metal(S.finishOutside);
      default: return new THREE.MeshStandardMaterial();
    }
  }

  build(model) {
    const { S, glazing, mullions, transoms, panes, mullion, transom } = model;
    if (this.root) { this.scene.remove(this.root); disposeObjectResources?.(this.root); }
    const root = new THREE.Group();
    root.name = 'curtain-wall';
    const buckets = {};
    const node = profile => nodeParts({ depth: profile.depth, thickness: glazing.thickness, stripId: S.strip, coverId: S.coverMullion });
    const mullionParts = node(mullion);
    const transomParts = nodeParts({ depth: transom.depth, thickness: glazing.thickness, stripId: S.strip, coverId: S.coverTransom });
    const collectAs = (role, geometries) => Object.entries(geometries).forEach(([kind, list]) => (buckets[`${role}:${kind}`] ||= []).push(...list));
    mullions.forEach(m => collectAs('mullion', memberGeometries(mullionParts, m.length, { horizontal: false, x: m.x, y: 0 })));
    transoms.forEach(t => collectAs('transom', memberGeometries(transomParts, t.length, { horizontal: true, x: t.x0, y: t.y })));
    for (const [key, list] of Object.entries(buckets)) {
      const [role, kind] = key.split(':');
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged, this.material(kind, S));
      mesh.castShadow = kind === 'profile' || kind === 'cover';
      mesh.receiveShadow = true;
      mesh.name = `${role}:${kind}`;
      mesh.userData.explodeZ = layerOffset(kind, role);
      root.add(mesh);
    }
    // Infills: glass panes and opaque spandrel panels between the gaskets.
    const glass = [], panel = [];
    panes.forEach(p => {
      const g = new THREE.BoxGeometry(p.width * MM, p.height * MM, glazing.thickness * MM);
      g.translate((p.x0 + p.x1) / 2 * MM, (p.y0 + p.y1) / 2 * MM, (GLASS_GAP + glazing.thickness / 2) * MM);
      (p.spandrel ? panel : glass).push(g);
    });
    for (const [kind, list] of [['glass', glass], ['panel', panel]]) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list, false), this.material(kind, S));
      list.forEach(g => g.dispose());
      mesh.name = kind;
      mesh.userData.explodeZ = layerOffset(kind);
      mesh.castShadow = kind === 'panel';
      mesh.receiveShadow = true;
      if (kind === 'glass') mesh.renderOrder = 2;
      root.add(mesh);
    }
    // Facade centred on the origin, standing on the ground.
    root.position.set(-model.W / 2 * MM, 0.02, 0);
    this.root = root;
    this.size = { W: model.W * MM, H: model.H * MM, depth: mullion.depth * MM };
    this.scene.add(root);
    const k = this.key.shadow.camera, ext = Math.max(this.size.W, this.size.H) * 0.8 + 1;
    k.left = -ext; k.right = ext; k.top = ext; k.bottom = -ext; k.far = 60; k.updateProjectionMatrix();
    this.key.position.set(this.size.W * 0.6 + 4, this.size.H + 6, 9);
    // Larger facades separate the layers a little more so they stay readable.
    this.explode.scale = Math.min(2.5, Math.max(0.8, Math.max(this.size.W, this.size.H) / 6));
    this.applyExplode();
    this.invalidate();
  }

  // Animate the exploded view to `amount` (0 = assembled, 1 = fully exploded).
  setExploded(amount) {
    const to = Math.min(1, Math.max(0, Number(amount) || 0));
    this.explode = { ...this.explode, from: this.explode.value, to, start: performance.now() };
    this.invalidate();
    return to;
  }

  get exploded() { return this.explode.to; }

  stepExplode(now) {
    const e = this.explode;
    if (e.value === e.to) return;
    const t = Math.min(1, (now - e.start) / 650);
    const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    e.value = t >= 1 ? e.to : e.from + (e.to - e.from) * ease;
    this.applyExplode();
    this.needsFrame = true;
  }

  applyExplode() {
    if (!this.root) return;
    const amount = this.explode.value * this.explode.scale;
    this.root.children.forEach(mesh => { mesh.position.z = (mesh.userData.explodeZ || 0) * amount; });
    this.surface.invalidate?.();
  }

  setView(view) {
    if (!this.size) return;
    // Fit the facade in the frame (both directions) with room for the overlay card.
    const { W, H } = this.size, c = new THREE.Vector3(0, H * 0.6, 0);
    const vFov = THREE.MathUtils.degToRad(this.camera.fov), hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const d = Math.max((H * 1.6) / (2 * Math.tan(vFov / 2)), (W * 1.25) / (2 * Math.tan(hFov / 2)));
    let pos = new THREE.Vector3(d * 0.42, H * 0.55, d * 0.92), target = c;
    if (view === 'front') pos = new THREE.Vector3(0, H * 0.47, d);
    else if (view === 'interior') pos = new THREE.Vector3(-d * 0.38, H * 0.5, -d * 0.92);
    else if (view === 'exploded') pos = new THREE.Vector3(d * 0.82, H * 0.62, d * 0.5);
    else if (view === 'node') {
      // Close-up of the first interior mullion/transom crossing, from outside.
      const x = this.firstNode?.x ?? 0, y = this.firstNode?.y ?? H / 2;
      // Step back and to the side when the layers are exploded.
      const extra = this.explode.to * this.explode.scale * 0.5;
      target = new THREE.Vector3(x, y, extra * 0.15);
      pos = new THREE.Vector3(x + 0.35 + extra * 1.6, y + 0.28 + extra * 0.4, 0.55 + extra * 1.4);
    }
    this.viewIndex = Math.max(0, this.views.indexOf(view));
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
    this.invalidate();
  }

  cycleView() {
    this.viewIndex = (this.viewIndex + 1) % this.views.length;
    this.setView(this.views[this.viewIndex]);
    return this.views[this.viewIndex];
  }

  setNodeFocus(model) {
    const x = model.xs[Math.min(1, model.xs.length - 1)] * MM - model.W / 2 * MM;
    const y = model.ys[Math.min(1, model.ys.length - 1)] * MM;
    this.firstNode = { x, y };
  }
}
