import * as THREE from 'three';
import { deriveHallMetrics, structurePresets } from './state.js?v=1';

const UP_Z = new THREE.Vector3(0, 0, 1);

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .68, metalness: options.metalness ?? .08, side: THREE.DoubleSide, ...options });
}

function addEdges(mesh, enabled, color = 0x273843) {
  if (!enabled || !mesh.geometry?.attributes?.position) return;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 22),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: .48 }),
  );
  edges.renderOrder = 5;
  mesh.add(edges);
}

function boxMesh(size, mat, name, technicalEdges = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, technicalEdges);
  return mesh;
}

function memberBetween(a, b, sx, sy, mat, name, technicalEdges = false) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = boxMesh(new THREE.Vector3(sx, sy, length), mat, name, technicalEdges);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP_Z, direction.normalize());
  return mesh;
}

function setExplode(group, x, y, z) {
  group.userData.explodeOffset = new THREE.Vector3(x, y, z);
  group.userData.basePosition = group.position.clone();
  return group;
}

function createTriangleWall(width, rise, mat, name, technicalEdges, flip = false) {
  const geometry = new THREE.BufferGeometry();
  const hw = width / 2;
  const vertices = flip
    ? [-hw, 0, 0, 0, rise, 0, hw, 0, 0]
    : [-hw, 0, 0, hw, 0, 0, 0, rise, 0];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, technicalEdges);
  return mesh;
}

function addCorrugationLines(panel, axis, count, length, span, color = 0x7a8992) {
  const positions = [];
  for (let i = 1; i < count; i += 1) {
    const t = i / count - .5;
    if (axis === 'x') positions.push(t * span, .042, -length / 2, t * span, .042, length / 2);
    else positions.push(-length / 2, .042, t * span, length / 2, .042, t * span);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .22 }));
  panel.add(lines);
}

function addOpeningPanel(group, { width, height, depth, position, color, name, technicalEdges, explode }) {
  const mat = material(color, { roughness: .48, metalness: .16 });
  const panel = boxMesh(new THREE.Vector3(width, height, depth), mat, name, technicalEdges);
  panel.position.copy(position);
  group.add(panel);
  group.userData.explodeOffset = explode;
  group.userData.basePosition = group.position.clone();
}

export function buildHallModel(state) {
  const metrics = deriveHallMetrics(state);
  const root = new THREE.Group();
  root.name = 'hall-model';

  const preset = structurePresets[state.structurePreset] ?? structurePresets.standard;
  const primaryMat = material(preset.steelColor, { metalness: .6, roughness: .38 });
  const secondaryMat = material('#e68a2e', { metalness: .48, roughness: .42 });
  const wallMat = material(state.wallColor, { metalness: .12, roughness: .62 });
  const roofMat = material(state.roofColor, { metalness: .3, roughness: .48 });
  const slabMat = material('#b7bdc0', { metalness: 0, roughness: .92 });
  const footingMat = material('#8e979c', { metalness: 0, roughness: .92 });
  const glassMat = material('#8ec6df', { metalness: .05, roughness: .18, transparent: true, opacity: .53 });
  const doorMat = material('#24445a', { metalness: .34, roughness: .45 });

  const halfW = state.width / 2;
  const halfL = state.length / 2;
  const ridgeY = metrics.ridgeElevation;
  const technicalEdges = state.technicalEdges;

  const foundation = setExplode(new THREE.Group(), 0, -1.1, 0);
  foundation.name = 'foundation';
  root.add(foundation);
  if (state.slab) {
    const slab = boxMesh(new THREE.Vector3(state.width + .35, .16, state.length + .35), slabMat, 'concrete-slab', technicalEdges);
    slab.position.y = -.09;
    foundation.add(slab);
  }

  const primary = new THREE.Group();
  primary.name = 'primary-structure';
  root.add(primary);
  const framePositions = Array.from({ length: metrics.frameCount }, (_, i) => -halfL + i * metrics.actualBaySpacing);

  for (const [frameIndex, z] of framePositions.entries()) {
    const leftBottom = new THREE.Vector3(-halfW, 0, z);
    const leftTop = new THREE.Vector3(-halfW, state.eaveHeight, z);
    const ridge = new THREE.Vector3(0, ridgeY, z);
    const rightTop = new THREE.Vector3(halfW, state.eaveHeight, z);
    const rightBottom = new THREE.Vector3(halfW, 0, z);

    primary.add(memberBetween(leftBottom, leftTop, preset.columnSize, preset.columnSize, primaryMat, `frame-${frameIndex}-left-column`, technicalEdges));
    primary.add(memberBetween(leftTop, ridge, preset.rafterDepth, preset.columnSize, primaryMat, `frame-${frameIndex}-left-rafter`, technicalEdges));
    primary.add(memberBetween(ridge, rightTop, preset.rafterDepth, preset.columnSize, primaryMat, `frame-${frameIndex}-right-rafter`, technicalEdges));
    primary.add(memberBetween(rightTop, rightBottom, preset.columnSize, preset.columnSize, primaryMat, `frame-${frameIndex}-right-column`, technicalEdges));

    const braceInset = Math.min(1.25, state.width * .08);
    const braceDrop = Math.min(1.05, state.eaveHeight * .2);
    primary.add(memberBetween(
      new THREE.Vector3(-halfW, state.eaveHeight - braceDrop, z),
      new THREE.Vector3(-halfW + braceInset, state.eaveHeight + Math.tan(state.pitch * Math.PI / 180) * braceInset, z),
      preset.secondarySize * .9, preset.secondarySize * .9, primaryMat, `frame-${frameIndex}-left-knee-brace`, technicalEdges,
    ));
    primary.add(memberBetween(
      new THREE.Vector3(halfW, state.eaveHeight - braceDrop, z),
      new THREE.Vector3(halfW - braceInset, state.eaveHeight + Math.tan(state.pitch * Math.PI / 180) * braceInset, z),
      preset.secondarySize * .9, preset.secondarySize * .9, primaryMat, `frame-${frameIndex}-right-knee-brace`, technicalEdges,
    ));

    for (const x of [-halfW, halfW]) {
      const footing = boxMesh(new THREE.Vector3(.72, .22, .72), footingMat, `frame-${frameIndex}-footing`, technicalEdges);
      footing.position.set(x, -.18, z);
      foundation.add(footing);
    }
  }

  // Longitudinal members keep the portal frames tied together even when the envelope is exploded away.
  primary.add(memberBetween(new THREE.Vector3(-halfW, state.eaveHeight, -halfL), new THREE.Vector3(-halfW, state.eaveHeight, halfL), preset.secondarySize * 1.25, preset.secondarySize * 1.25, primaryMat, 'left-eave-beam', technicalEdges));
  primary.add(memberBetween(new THREE.Vector3(halfW, state.eaveHeight, -halfL), new THREE.Vector3(halfW, state.eaveHeight, halfL), preset.secondarySize * 1.25, preset.secondarySize * 1.25, primaryMat, 'right-eave-beam', technicalEdges));
  primary.add(memberBetween(new THREE.Vector3(0, ridgeY, -halfL), new THREE.Vector3(0, ridgeY, halfL), preset.secondarySize * 1.15, preset.secondarySize * 1.15, primaryMat, 'ridge-tie-beam', technicalEdges));

  const secondary = new THREE.Group();
  secondary.name = 'secondary-structure';
  secondary.visible = state.secondaryStructure;
  root.add(secondary);

  const roofSecondaryLeft = setExplode(new THREE.Group(), -1.25, 1.25, 0);
  const roofSecondaryRight = setExplode(new THREE.Group(), 1.25, 1.25, 0);
  const sideSecondaryLeft = setExplode(new THREE.Group(), -1.1, 0, 0);
  const sideSecondaryRight = setExplode(new THREE.Group(), 1.1, 0, 0);
  const frontSecondary = setExplode(new THREE.Group(), 0, 0, -1.1);
  const backSecondary = setExplode(new THREE.Group(), 0, 0, 1.1);
  secondary.add(roofSecondaryLeft, roofSecondaryRight, sideSecondaryLeft, sideSecondaryRight, frontSecondary, backSecondary);

  const roofPurlinCountPerSlope = Math.max(2, Math.ceil(metrics.slopeLength / 1.6));
  for (let i = 1; i < roofPurlinCountPerSlope; i += 1) {
    const t = i / roofPurlinCountPerSlope;
    const leftX = -halfW + halfW * t;
    const leftY = state.eaveHeight + metrics.ridgeRise * t + .05;
    const rightX = halfW - halfW * t;
    const rightY = state.eaveHeight + metrics.ridgeRise * t + .05;
    roofSecondaryLeft.add(memberBetween(new THREE.Vector3(leftX, leftY, -halfL), new THREE.Vector3(leftX, leftY, halfL), preset.secondarySize, preset.secondarySize, secondaryMat, `left-roof-purlin-${i}`, technicalEdges));
    roofSecondaryRight.add(memberBetween(new THREE.Vector3(rightX, rightY, -halfL), new THREE.Vector3(rightX, rightY, halfL), preset.secondarySize, preset.secondarySize, secondaryMat, `right-roof-purlin-${i}`, technicalEdges));
  }

  const girtLevels = Math.max(2, Math.ceil(state.eaveHeight / 1.35));
  for (let i = 1; i < girtLevels; i += 1) {
    const y = (state.eaveHeight * i) / girtLevels;
    sideSecondaryLeft.add(memberBetween(new THREE.Vector3(-halfW - .03, y, -halfL), new THREE.Vector3(-halfW - .03, y, halfL), preset.secondarySize, preset.secondarySize, secondaryMat, `left-wall-girt-${i}`, technicalEdges));
    sideSecondaryRight.add(memberBetween(new THREE.Vector3(halfW + .03, y, -halfL), new THREE.Vector3(halfW + .03, y, halfL), preset.secondarySize, preset.secondarySize, secondaryMat, `right-wall-girt-${i}`, technicalEdges));
    frontSecondary.add(memberBetween(new THREE.Vector3(-halfW, y, -halfL - .03), new THREE.Vector3(halfW, y, -halfL - .03), preset.secondarySize, preset.secondarySize, secondaryMat, `front-wall-girt-${i}`, technicalEdges));
    backSecondary.add(memberBetween(new THREE.Vector3(-halfW, y, halfL + .03), new THREE.Vector3(halfW, y, halfL + .03), preset.secondarySize, preset.secondarySize, secondaryMat, `back-wall-girt-${i}`, technicalEdges));
  }

  const endPostIntervals = Math.max(2, Math.ceil(state.width / 4));
  for (let i = 1; i < endPostIntervals; i += 1) {
    const x = -halfW + (state.width * i) / endPostIntervals;
    const localRise = metrics.ridgeRise * (1 - Math.abs(x) / halfW);
    const topY = state.eaveHeight + localRise;
    frontSecondary.add(memberBetween(new THREE.Vector3(x, 0, -halfL), new THREE.Vector3(x, topY, -halfL), preset.secondarySize, preset.secondarySize, secondaryMat, `front-end-post-${i}`, technicalEdges));
    backSecondary.add(memberBetween(new THREE.Vector3(x, 0, halfL), new THREE.Vector3(x, topY, halfL), preset.secondarySize, preset.secondarySize, secondaryMat, `back-end-post-${i}`, technicalEdges));
  }

  const envelope = new THREE.Group();
  envelope.name = 'envelope';
  envelope.visible = state.showCladding;
  root.add(envelope);

  const leftWall = setExplode(new THREE.Group(), -2.6, .1, 0);
  const rightWall = setExplode(new THREE.Group(), 2.6, .1, 0);
  const frontWall = setExplode(new THREE.Group(), 0, .1, -2.6);
  const backWall = setExplode(new THREE.Group(), 0, .1, 2.6);
  const leftRoof = setExplode(new THREE.Group(), -1.8, 3.0, 0);
  const rightRoof = setExplode(new THREE.Group(), 1.8, 3.0, 0);
  envelope.add(leftWall, rightWall, frontWall, backWall, leftRoof, rightRoof);

  const wallThickness = .075;
  const leftPanel = boxMesh(new THREE.Vector3(wallThickness, state.eaveHeight, state.length), wallMat, 'left-wall-cladding', technicalEdges);
  leftPanel.position.set(-halfW - wallThickness / 2 - .06, state.eaveHeight / 2, 0);
  leftWall.add(leftPanel);
  const rightPanel = boxMesh(new THREE.Vector3(wallThickness, state.eaveHeight, state.length), wallMat, 'right-wall-cladding', technicalEdges);
  rightPanel.position.set(halfW + wallThickness / 2 + .06, state.eaveHeight / 2, 0);
  rightWall.add(rightPanel);

  const frontRect = boxMesh(new THREE.Vector3(state.width, state.eaveHeight, wallThickness), wallMat, 'front-wall-cladding', technicalEdges);
  frontRect.position.set(0, state.eaveHeight / 2, -halfL - wallThickness / 2 - .06);
  frontWall.add(frontRect);
  const frontTriangle = createTriangleWall(state.width, metrics.ridgeRise, wallMat, 'front-gable-cladding', technicalEdges, false);
  frontTriangle.position.set(0, state.eaveHeight, -halfL - wallThickness - .06);
  frontWall.add(frontTriangle);

  const backRect = boxMesh(new THREE.Vector3(state.width, state.eaveHeight, wallThickness), wallMat, 'back-wall-cladding', technicalEdges);
  backRect.position.set(0, state.eaveHeight / 2, halfL + wallThickness / 2 + .06);
  backWall.add(backRect);
  const backTriangle = createTriangleWall(state.width, metrics.ridgeRise, wallMat, 'back-gable-cladding', technicalEdges, true);
  backTriangle.position.set(0, state.eaveHeight, halfL + wallThickness + .06);
  backTriangle.rotation.y = Math.PI;
  backWall.add(backTriangle);

  const slopeCenterY = state.eaveHeight + metrics.ridgeRise / 2 + .12;
  const leftRoofPanel = boxMesh(new THREE.Vector3(metrics.slopeLength, .075, state.length + .14), roofMat, 'left-roof-cladding', technicalEdges);
  leftRoofPanel.position.set(-halfW / 2, slopeCenterY, 0);
  leftRoofPanel.rotation.z = state.pitch * Math.PI / 180;
  addCorrugationLines(leftRoofPanel, 'x', Math.max(8, Math.floor(metrics.slopeLength / .45)), state.length, metrics.slopeLength);
  leftRoof.add(leftRoofPanel);

  const rightRoofPanel = boxMesh(new THREE.Vector3(metrics.slopeLength, .075, state.length + .14), roofMat, 'right-roof-cladding', technicalEdges);
  rightRoofPanel.position.set(halfW / 2, slopeCenterY, 0);
  rightRoofPanel.rotation.z = -state.pitch * Math.PI / 180;
  addCorrugationLines(rightRoofPanel, 'x', Math.max(8, Math.floor(metrics.slopeLength / .45)), state.length, metrics.slopeLength);
  rightRoof.add(rightRoofPanel);

  const openings = new THREE.Group();
  openings.name = 'openings';
  root.add(openings);

  if (state.rollerDoor) {
    const group = setExplode(new THREE.Group(), 0, 0, -2.9);
    const width = Math.min(state.rollerDoorWidth, state.width - 1.2);
    const height = Math.min(state.rollerDoorHeight, state.eaveHeight - .2);
    const door = boxMesh(new THREE.Vector3(width, height, .11), doorMat, 'roller-door', technicalEdges);
    door.position.set(0, height / 2, -halfL - .16);
    group.add(door);
    openings.add(group);
  }

  if (state.personnelDoor) {
    const group = setExplode(new THREE.Group(), 0, 0, -2.9);
    const door = boxMesh(new THREE.Vector3(1.0, 2.1, .12), material('#e7eef2', { metalness: .12 }), 'personnel-door', technicalEdges);
    door.position.set(Math.min(halfW - .9, Math.max(1.8, state.rollerDoorWidth / 2 + 1.15)), 1.05, -halfL - .17);
    group.add(door);
    openings.add(group);
  }

  if (state.windows) {
    const zPositions = [-state.length * .25, state.length * .25];
    for (const side of [-1, 1]) {
      const group = setExplode(new THREE.Group(), side * 2.9, 0, 0);
      for (const [index, z] of zPositions.entries()) {
        const frame = boxMesh(new THREE.Vector3(.11, 1.25, 1.8), primaryMat, `window-frame-${side}-${index}`, technicalEdges);
        frame.position.set(side * (halfW + .12), state.eaveHeight * .56, z);
        group.add(frame);
        const glass = boxMesh(new THREE.Vector3(.13, 1.08, 1.63), glassMat, `window-glass-${side}-${index}`, false);
        glass.position.copy(frame.position);
        group.add(glass);
      }
      openings.add(group);
    }
  }

  // Store base transforms once so the scene can animate exploded view without rebuilding geometry.
  root.traverse((object) => {
    if (!object.userData.basePosition) object.userData.basePosition = object.position.clone();
  });

  return {
    root,
    metrics,
    counts: {
      primaryColumns: metrics.frameCount * 2,
      rafters: metrics.frameCount * 2,
      footings: metrics.frameCount * 2,
      roofPurlinLines: state.secondaryStructure ? (roofPurlinCountPerSlope - 1) * 2 : 0,
      wallGirtLines: state.secondaryStructure ? (girtLevels - 1) * 4 : 0,
      endPosts: state.secondaryStructure ? (endPostIntervals - 1) * 2 : 0,
    },
  };
}

export function applyExplodedView(root, amount) {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  root.traverse((object) => {
    const base = object.userData.basePosition;
    if (!base) return;
    const offset = object.userData.explodeOffset;
    if (offset) object.position.copy(base).addScaledVector(offset, t);
    else object.position.copy(base);
  });
}
