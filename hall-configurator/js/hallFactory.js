import * as THREE from 'three';
import { deriveHallMetrics, structurePresets } from './state.js?v=7';

const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: .68,
    metalness: options.metalness ?? .08,
    side: THREE.DoubleSide,
    ...options,
  });
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

function orientGroupBetween(group, a, b, axis = AXIS_Z) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  group.position.copy(a).add(b).multiplyScalar(.5);
  if (length > 0) group.quaternion.setFromUnitVectors(axis, direction.normalize());
  return length;
}

function memberBetween(a, b, sx, sy, mat, name, technicalEdges = false) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = boxMesh(new THREE.Vector3(sx, sy, length), mat, name, technicalEdges);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  if (length > 0) mesh.quaternion.setFromUnitVectors(AXIS_Z, direction.normalize());
  return mesh;
}

function cylinderBetween(a, b, radius, mat, name, radialSegments = 10) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  if (length > 0) mesh.quaternion.setFromUnitVectors(AXIS_Y, direction.normalize());
  return mesh;
}

function iSectionGeometry(section, length) {
  const d = section.depth;
  const b = section.flangeWidth;
  const tf = Math.min(section.flange, d * .24);
  const tw = Math.min(section.web, b * .36);
  const x = b / 2;
  const y = d / 2;
  const wx = tw / 2;
  const fy = y - tf;
  const shape = new THREE.Shape();
  shape.moveTo(-x, y);
  shape.lineTo(x, y);
  shape.lineTo(x, fy);
  shape.lineTo(wx, fy);
  shape.lineTo(wx, -fy);
  shape.lineTo(x, -fy);
  shape.lineTo(x, -y);
  shape.lineTo(-x, -y);
  shape.lineTo(-x, -fy);
  shape.lineTo(-wx, -fy);
  shape.lineTo(-wx, fy);
  shape.lineTo(-x, fy);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(.01, length),
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -length / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function iMemberBetween(a, b, section, mat, name, technicalEdges = false) {
  const group = new THREE.Group();
  group.name = name;
  const length = orientGroupBetween(group, a, b, AXIS_Z);
  const mesh = new THREE.Mesh(iSectionGeometry(section, length), mat);
  mesh.name = `${name}-rolled-i-section`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, technicalEdges);
  group.add(mesh);
  return group;
}

function iMemberBetweenWithNormal(a, b, section, mat, name, normal, technicalEdges = false) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(a).add(b).multiplyScalar(.5);
  if (length > 0) {
    direction.normalize();
    const yAxis = normal.clone().normalize();
    // Cross-section flange width runs across the hall, while section depth follows
    // the roof normal. This removes the mirrored/rolled look produced by the generic
    // shortest-arc quaternion on opposite roof slopes.
    const xAxis = new THREE.Vector3().crossVectors(yAxis, direction).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, direction);
    group.quaternion.setFromRotationMatrix(basis);
  }
  const mesh = new THREE.Mesh(iSectionGeometry(section, length), mat);
  mesh.name = `${name}-rolled-i-section`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, technicalEdges);
  group.add(mesh);
  return group;
}

function zSectionGeometry(depth, flangeWidth, thickness, length) {
  const d = depth;
  const f = flangeWidth;
  const t = Math.min(thickness, Math.min(d, f) * .3);
  const shape = new THREE.Shape();
  // Open thin-walled Z profile. Keeping it as one extruded section makes the real
  // cross-section visible in close-up and exploded views instead of three bars.
  shape.moveTo(-t / 2, d / 2);
  shape.lineTo(f - t / 2, d / 2);
  shape.lineTo(f - t / 2, d / 2 - t);
  shape.lineTo(t / 2, d / 2 - t);
  shape.lineTo(t / 2, -d / 2 + t);
  shape.lineTo(-f + t / 2, -d / 2 + t);
  shape.lineTo(-f + t / 2, -d / 2);
  shape.lineTo(-t / 2, -d / 2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(.01, length),
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -length / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function zMemberBetween(a, b, depth, flangeWidth, thickness, mat, name, technicalEdges = false) {
  const group = new THREE.Group();
  group.name = name;
  const length = orientGroupBetween(group, a, b, AXIS_Z);
  const mesh = new THREE.Mesh(zSectionGeometry(depth, flangeWidth, thickness, length), mat);
  mesh.name = `${name}-rolled-z-section`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, technicalEdges);
  group.add(mesh);
  return group;
}

function angleMemberBetween(a, b, leg, thickness, mat, name, technicalEdges = false) {
  const group = new THREE.Group();
  group.name = name;
  const length = orientGroupBetween(group, a, b, AXIS_Z);
  const vertical = boxMesh(new THREE.Vector3(thickness, leg, length), mat, `${name}-leg-a`, technicalEdges);
  const horizontal = boxMesh(new THREE.Vector3(leg, thickness, length), mat, `${name}-leg-b`, technicalEdges);
  vertical.position.x = -leg / 2 + thickness / 2;
  horizontal.position.y = -leg / 2 + thickness / 2;
  group.add(vertical, horizontal);
  return group;
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

function addHexNut(group, position, radius, thickness, mat, name, axis = 'y') {
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 6), mat);
  nut.name = name;
  nut.position.copy(position);
  if (axis === 'z') nut.rotation.x = Math.PI / 2;
  nut.castShadow = true;
  group.add(nut);
  return nut;
}

function addBoltHeadAlongZ(group, position, radius, length, mat, name) {
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), mat);
  bolt.name = name;
  bolt.rotation.x = Math.PI / 2;
  bolt.position.copy(position);
  bolt.castShadow = true;
  group.add(bolt);
  return bolt;
}

function addWasherAlongZ(group, position, outerRadius, thickness, mat, name) {
  const washer = new THREE.Mesh(new THREE.CylinderGeometry(outerRadius, outerRadius, thickness, 18), mat);
  washer.name = name;
  washer.rotation.x = Math.PI / 2;
  washer.position.copy(position);
  washer.castShadow = true;
  group.add(washer);
  return washer;
}

function addBoltAssemblyAlongZ(group, position, shankRadius, gripLength, mat, name) {
  const assembly = new THREE.Group();
  assembly.name = name;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(shankRadius, shankRadius, gripLength, 12), mat);
  shank.rotation.x = Math.PI / 2;
  shank.castShadow = true;
  assembly.add(shank);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(shankRadius * 1.75, shankRadius * 1.75, shankRadius * .95, 6), mat);
  head.rotation.x = Math.PI / 2;
  head.position.z = -gripLength / 2 - shankRadius * .48;
  head.castShadow = true;
  assembly.add(head);

  const washerA = new THREE.Mesh(new THREE.CylinderGeometry(shankRadius * 2.05, shankRadius * 2.05, shankRadius * .35, 18), mat);
  washerA.rotation.x = Math.PI / 2;
  washerA.position.z = -gripLength / 2 + shankRadius * .20;
  assembly.add(washerA);
  const washerB = washerA.clone();
  washerB.position.z = gripLength / 2 - shankRadius * .20;
  assembly.add(washerB);

  const nut = new THREE.Mesh(new THREE.CylinderGeometry(shankRadius * 1.82, shankRadius * 1.82, shankRadius * 1.05, 6), mat);
  nut.rotation.x = Math.PI / 2;
  nut.position.z = gripLength / 2 + shankRadius * .52;
  nut.castShadow = true;
  assembly.add(nut);
  assembly.position.copy(position);
  group.add(assembly);
  return assembly;
}

function triangularPrism(points, thickness, mat, name, technicalEdges = false) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -thickness / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, technicalEdges);
  return mesh;
}

function createRidgeCap(length, pitchRad, legLength, thickness, mat, name, technicalEdges = false) {
  const run = Math.cos(pitchRad) * legLength;
  const fall = Math.sin(pitchRad) * legLength;
  const innerDrop = Math.max(thickness, .012);
  const shape = new THREE.Shape();
  // One folded sheet instead of two intersecting bars: the ridge fold remains visible
  // and the inner skin follows the same V so no daylight appears at the crown.
  shape.moveTo(-run, -fall);
  shape.lineTo(0, 0);
  shape.lineTo(run, -fall);
  shape.lineTo(run, -fall - innerDrop);
  shape.lineTo(0, -innerDrop / Math.max(.45, Math.cos(pitchRad)));
  shape.lineTo(-run, -fall - innerDrop);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -length / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addEdges(mesh, technicalEdges);
  return mesh;
}

function addWallSeams(group, orientation, width, height, position, color = 0x8a969e) {
  const positions = [];
  const step = 1.0;
  if (orientation === 'front' || orientation === 'back') {
    for (let x = -width / 2 + step; x < width / 2 - .01; x += step) {
      positions.push(x, 0, 0, x, height, 0);
    }
  } else {
    for (let z = -width / 2 + step; z < width / 2 - .01; z += step) {
      positions.push(0, 0, z, 0, height, z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .18 }));
  lines.position.copy(position);
  group.add(lines);
  return lines;
}

function createRollerDoorAssembly(width, height, doorMat, trimMat, fastenerMat, technicalEdges = false) {
  const group = new THREE.Group();
  group.name = 'roller-shutter-assembly';
  const leaf = boxMesh(new THREE.Vector3(width, height, .065), doorMat, 'roller-door-leaf', technicalEdges);
  leaf.position.y = height / 2;
  group.add(leaf);

  const jamb = .12;
  for (const side of [-1, 1]) {
    const track = boxMesh(new THREE.Vector3(jamb, height + .20, .13), trimMat, `roller-door-track-${side}`, technicalEdges);
    track.position.set(side * (width / 2 + jamb / 2), (height + .20) / 2, -.005);
    group.add(track);
  }
  const lintel = boxMesh(new THREE.Vector3(width + jamb * 2, .16, .14), trimMat, 'roller-door-lintel', technicalEdges);
  lintel.position.set(0, height + .08, 0);
  group.add(lintel);
  const hood = boxMesh(new THREE.Vector3(width + .34, .30, .24), trimMat, 'roller-door-hood', technicalEdges);
  hood.position.set(0, height + .31, .03);
  group.add(hood);
  const bottomRail = boxMesh(new THREE.Vector3(width, .10, .095), trimMat, 'roller-door-bottom-rail', technicalEdges);
  bottomRail.position.set(0, .05, -.045);
  group.add(bottomRail);

  const slatSpacing = .22;
  const slatCount = Math.max(6, Math.floor(height / slatSpacing));
  for (let i = 1; i < slatCount; i += 1) {
    const slat = boxMesh(new THREE.Vector3(width - .08, .022, .075), trimMat, `roller-door-slat-${i}`, false);
    slat.position.set(0, (height * i) / slatCount, -.04);
    group.add(slat);
  }

  const lockPlate = boxMesh(new THREE.Vector3(.19, .14, .035), trimMat, 'roller-door-lock-plate', technicalEdges);
  lockPlate.position.set(.22, .78, -.07);
  group.add(lockPlate);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.017, .017, .15, 12), fastenerMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(.22, .78, -.12);
  group.add(handle);
  return group;
}

function createPersonnelDoorAssembly(trimMat, leafMat, glassMat, fastenerMat, technicalEdges = false) {
  const group = new THREE.Group();
  group.name = 'personnel-door-assembly';
  const width = 1.0;
  const height = 2.1;
  const frameT = .075;
  const leaf = boxMesh(new THREE.Vector3(width - frameT * 2, height - frameT * 2, .055), leafMat, 'personnel-door-leaf', technicalEdges);
  leaf.position.y = height / 2;
  group.add(leaf);
  for (const side of [-1, 1]) {
    const jamb = boxMesh(new THREE.Vector3(frameT, height + .08, .10), trimMat, `personnel-door-jamb-${side}`, technicalEdges);
    jamb.position.set(side * (width / 2 - frameT / 2), (height + .08) / 2, 0);
    group.add(jamb);
  }
  const head = boxMesh(new THREE.Vector3(width, frameT, .10), trimMat, 'personnel-door-head', technicalEdges);
  head.position.set(0, height - frameT / 2, 0);
  group.add(head);
  const threshold = boxMesh(new THREE.Vector3(width, .035, .12), trimMat, 'personnel-door-threshold', technicalEdges);
  threshold.position.set(0, .018, 0);
  group.add(threshold);

  const visionWidth = .30;
  const visionHeight = .48;
  const visionFrameT = .03;
  const vision = boxMesh(new THREE.Vector3(visionWidth, visionHeight, .025), glassMat, 'personnel-door-vision-panel', technicalEdges);
  vision.position.set(0, 1.55, -.047);
  group.add(vision);
  for (const side of [-1, 1]) {
    const bar = boxMesh(new THREE.Vector3(visionFrameT, visionHeight + visionFrameT * 2, .038), trimMat, `personnel-door-vision-frame-side-${side}`, technicalEdges);
    bar.position.set(side * (visionWidth / 2 + visionFrameT / 2), 1.55, -.028);
    group.add(bar);
  }
  for (const side of [-1, 1]) {
    const bar = boxMesh(new THREE.Vector3(visionWidth + visionFrameT * 2, visionFrameT, .038), trimMat, `personnel-door-vision-frame-horizontal-${side}`, technicalEdges);
    bar.position.set(0, 1.55 + side * (visionHeight / 2 + visionFrameT / 2), -.028);
    group.add(bar);
  }
  vision.renderOrder = 2;

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .16, 12), fastenerMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(.34, 1.02, -.09);
  group.add(handle);
  const escutcheon = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .018, 16), trimMat);
  escutcheon.rotation.x = Math.PI / 2;
  escutcheon.position.set(.34, 1.02, -.067);
  group.add(escutcheon);
  for (const y of [.42, 1.05, 1.72]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .12, 10), fastenerMat);
    hinge.position.set(-width / 2 + .03, y, .055);
    group.add(hinge);
  }
  return group;
}


function createCondenserUnit(width, height, depth, casingMat, fanMat, technicalEdges = false) {
  const group = new THREE.Group();
  const body = boxMesh(new THREE.Vector3(width, height, depth), casingMat, 'condenser-casing', technicalEdges);
  body.position.y = height / 2;
  group.add(body);
  const fanRadius = Math.min(width, height) * .28;
  for (const x of [-width * .22, width * .22]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(fanRadius, .025, 8, 28), fanMat);
    ring.position.set(x, height * .56, -depth / 2 - .012);
    group.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .04, 16), fanMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(ring.position);
    group.add(hub);
    for (let i = 0; i < 4; i += 1) {
      const blade = boxMesh(new THREE.Vector3(fanRadius * .72, .035, .018), fanMat, `condenser-fan-blade-${i}`, false);
      blade.position.copy(ring.position);
      blade.rotation.z = i * Math.PI / 2 + Math.PI / 4;
      group.add(blade);
    }
  }
  for (const x of [-width * .38, width * .38]) {
    const foot = boxMesh(new THREE.Vector3(.16, .10, depth * .75), fanMat, 'condenser-foot', false);
    foot.position.set(x, .05, 0);
    group.add(foot);
  }
  return group;
}

function createHighBayLight(mat, glowMat) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .38, 8), mat);
  stem.position.y = .19;
  group.add(stem);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.09, .25, .12, 24, 1, true), mat);
  shade.position.y = -.04;
  group.add(shade);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .025, 24), glowMat);
  lamp.name = 'high-bay-lamp-glow';
  lamp.position.y = -.11;
  group.add(lamp);
  return group;
}

function createSkylight(length, width, mat, name, technicalEdges = false) {
  const mesh = boxMesh(new THREE.Vector3(length, .035, width), mat, name, technicalEdges);
  return mesh;
}

function roofPoint(state, metrics, side, t, z) {
  const halfW = state.width / 2;
  if (side < 0) {
    return new THREE.Vector3(-halfW + halfW * t, state.eaveHeight + metrics.ridgeRise * t, z);
  }
  return new THREE.Vector3(halfW - halfW * t, state.eaveHeight + metrics.ridgeRise * t, z);
}

function roofNormal(state, side) {
  const pitch = THREE.MathUtils.degToRad(state.pitch);
  return new THREE.Vector3(side * Math.sin(pitch), Math.cos(pitch), 0).normalize();
}

export function buildHallModel(state) {
  const metrics = deriveHallMetrics(state);
  const root = new THREE.Group();
  root.name = 'hall-model';

  const preset = structurePresets[state.structurePreset] ?? structurePresets.standard;
  const primaryMat = material(preset.steelColor, { metalness: .65, roughness: .34 });
  const secondaryMat = material('#e68a2e', { metalness: .52, roughness: .4 });
  const braceMat = material('#9b6a42', { metalness: .58, roughness: .38 });
  const plateMat = material('#5b7180', { metalness: .72, roughness: .3 });
  const fastenerMat = material('#a9b5bc', { metalness: .82, roughness: .24 });
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
  const pitchRad = state.pitch * Math.PI / 180;
  const detailGeometry = state.explode > 0 || state.connectionDetails || state.inspectionMode === 'connections' || state.inspectionMode === 'foundations';
  const framePositions = Array.from({ length: metrics.frameCount }, (_, i) => -halfL + i * metrics.actualBaySpacing);

  const counts = {
    primaryColumns: 0,
    rafters: 0,
    footings: 0,
    foundationPiers: 0,
    roofPurlinLines: 0,
    wallGirtLines: 0,
    endPosts: 0,
    borderMembers: 0,
    wallBraces: 0,
    roofBraces: 0,
    compressionBars: 0,
    stays: 0,
    connectionPlates: 0,
    anchorRods: 0,
    fasteners: 0,
    washers: 0,
    purlinCleats: 0,
  };

  const foundation = setExplode(new THREE.Group(), 0, -1.35, 0);
  foundation.name = 'foundation';
  root.add(foundation);
  if (state.slab) {
    const slab = boxMesh(new THREE.Vector3(state.width + .35, .16, state.length + .35), slabMat, 'concrete-slab', technicalEdges);
    slab.position.y = -.09;
    foundation.add(slab);
  }

  const footingsGroup = new THREE.Group();
  footingsGroup.name = 'column-footings';
  foundation.add(footingsGroup);

  const primary = new THREE.Group();
  primary.name = 'primary-structure';
  root.add(primary);

  const connectionRoot = new THREE.Group();
  connectionRoot.name = 'connection-detail';
  root.add(connectionRoot);
  const plates = setExplode(new THREE.Group(), 0, .42, 0);
  plates.name = 'connection-plates';
  const anchors = setExplode(new THREE.Group(), 0, -.62, 0);
  anchors.name = 'anchor-rods';
  anchors.userData.detailOnly = true;
  const fasteners = setExplode(new THREE.Group(), 0, .82, 0);
  fasteners.name = 'bolts-nuts-washers';
  fasteners.userData.detailOnly = true;
  connectionRoot.add(plates, anchors, fasteners);

  const columnSection = {
    depth: preset.columnDepth,
    flangeWidth: preset.columnFlangeWidth,
    web: preset.columnWeb,
    flange: preset.columnFlange,
  };
  const rafterSection = {
    depth: preset.rafterDepth,
    flangeWidth: preset.rafterFlangeWidth,
    web: preset.rafterWeb,
    flange: preset.rafterFlange,
  };

  for (const [frameIndex, z] of framePositions.entries()) {
    const leftBottom = new THREE.Vector3(-halfW, 0, z);
    const leftTop = new THREE.Vector3(-halfW, state.eaveHeight, z);
    const ridge = new THREE.Vector3(0, ridgeY, z);
    const rightTop = new THREE.Vector3(halfW, state.eaveHeight, z);
    const rightBottom = new THREE.Vector3(halfW, 0, z);

    // Trim the rafter ends slightly around the knee and ridge joints. Connection
    // plates/haunches bridge those gaps, avoiding the old visual interpenetration
    // of complete I-sections at the joints.
    const kneeTrimRatio = Math.min(.06, Math.max(.015, preset.columnDepth * .34 / Math.max(metrics.slopeLength, .1)));
    const ridgeTrimRatio = Math.min(.06, Math.max(.012, preset.rafterDepth * .30 / Math.max(metrics.slopeLength, .1)));
    const leftRafterStart = leftTop.clone().lerp(ridge, kneeTrimRatio);
    const leftRafterEnd = ridge.clone().lerp(leftTop, ridgeTrimRatio);
    const rightRafterStart = ridge.clone().lerp(rightTop, ridgeTrimRatio);
    const rightRafterEnd = rightTop.clone().lerp(ridge, kneeTrimRatio);

    primary.add(iMemberBetween(leftBottom, leftTop, columnSection, primaryMat, `frame-${frameIndex}-left-column-${preset.columnProfile}`, technicalEdges));
    primary.add(iMemberBetweenWithNormal(leftRafterStart, leftRafterEnd, rafterSection, primaryMat, `frame-${frameIndex}-left-rafter-${preset.rafterProfile}`, roofNormal(state, -1), technicalEdges));
    // Both rafters use an explicit roof-normal basis, so the two rolled sections are
    // true mirror counterparts in section view rather than differently rolled beams.
    primary.add(iMemberBetweenWithNormal(rightRafterEnd, rightRafterStart, rafterSection, primaryMat, `frame-${frameIndex}-right-rafter-${preset.rafterProfile}`, roofNormal(state, 1), technicalEdges));
    primary.add(iMemberBetween(rightTop, rightBottom, columnSection, primaryMat, `frame-${frameIndex}-right-column-${preset.columnProfile}`, technicalEdges));
    counts.primaryColumns += 2;
    counts.rafters += 2;

    const braceInset = Math.min(1.55, state.width * .11);
    const braceDrop = Math.min(1.25, state.eaveHeight * .23);
    const leftHaunch = triangularPrism([
      [-halfW + .02, state.eaveHeight - braceDrop],
      [-halfW + .02, state.eaveHeight - .10],
      [-halfW + braceInset, state.eaveHeight + Math.tan(pitchRad) * braceInset - .13],
    ], Math.max(.12, preset.rafterFlangeWidth * .72), primaryMat, `frame-${frameIndex}-left-tapered-haunch`, technicalEdges);
    leftHaunch.position.z = z;
    primary.add(leftHaunch);
    const rightHaunch = triangularPrism([
      [halfW - .02, state.eaveHeight - braceDrop],
      [halfW - .02, state.eaveHeight - .10],
      [halfW - braceInset, state.eaveHeight + Math.tan(pitchRad) * braceInset - .13],
    ], Math.max(.12, preset.rafterFlangeWidth * .72), primaryMat, `frame-${frameIndex}-right-tapered-haunch`, technicalEdges);
    rightHaunch.position.z = z;
    primary.add(rightHaunch);

    for (const side of [-1, 1]) {
      const x = side * halfW;

      // Concrete pad + raised pedestal create the visible foundation pylon / anchor cage
      // seen in the IFC reference when the envelope is removed or exploded.
      const footing = boxMesh(new THREE.Vector3(1.05, .28, 1.05), footingMat, `frame-${frameIndex}-foundation-pad-${side}`, technicalEdges);
      footing.position.set(x, -.62, z);
      footingsGroup.add(footing);
      counts.footings += 1;
      const pedestal = boxMesh(new THREE.Vector3(.68, .78, .68), footingMat, `frame-${frameIndex}-foundation-pedestal-${side}`, technicalEdges);
      pedestal.position.set(x, -.25, z);
      footingsGroup.add(pedestal);
      counts.foundationPiers += 1;

      const grout = boxMesh(new THREE.Vector3(.62, .055, .62), slabMat, `frame-${frameIndex}-grout-bed-${side}`, technicalEdges);
      grout.position.set(x, .015, z);
      footingsGroup.add(grout);

      const basePlate = boxMesh(new THREE.Vector3(.57, .025, .57), plateMat, `frame-${frameIndex}-base-plate-BL25x570-${side}`, technicalEdges);
      basePlate.position.set(x, .055, z);
      basePlate.userData.explodeOffset = new THREE.Vector3(side * .26, .18, 0);
      plates.add(basePlate);
      counts.connectionPlates += 1;

      const anchorCoordinates = [-.21, .21];
      for (const dx of anchorCoordinates) {
        for (const dz of anchorCoordinates) {
          counts.anchorRods += 1;
          counts.washers += 1;
          counts.fasteners += 2;
          if (!detailGeometry) continue;

          const rodA = new THREE.Vector3(x + dx, -.83, z + dz);
          const rodB = new THREE.Vector3(x + dx, .24, z + dz);
          const rod = cylinderBetween(rodA, rodB, .0135, fastenerMat, `anchor-D27-${frameIndex}-${side}-${dx}-${dz}`, 12);
          rod.userData.explodeOffset = new THREE.Vector3(side * .38, -.32, Math.sign(dz) * .14);
          anchors.add(rod);

          const washerPosition = new THREE.Vector3(x + dx, .092, z + dz);
          const washer = new THREE.Mesh(new THREE.CylinderGeometry(.040, .040, .010, 12), fastenerMat);
          washer.name = `anchor-washer-PD40-${frameIndex}-${side}-${dx}-${dz}`;
          washer.position.copy(washerPosition);
          washer.userData.explodeOffset = new THREE.Vector3(side * .50, .22, Math.sign(dz) * .17);
          fasteners.add(washer);

          const nut = addHexNut(fasteners, new THREE.Vector3(x + dx, .125, z + dz), .038, .030, fastenerMat, `anchor-nut-M24-${frameIndex}-${side}-${dx}-${dz}`);
          nut.userData.explodeOffset = new THREE.Vector3(side * .56, .27, Math.sign(dz) * .18);
          const lockNut = addHexNut(fasteners, new THREE.Vector3(x + dx, .165, z + dz), .036, .026, fastenerMat, `anchor-locknut-M24-${frameIndex}-${side}-${dx}-${dz}`);
          lockNut.userData.explodeOffset = new THREE.Vector3(side * .64, .34, Math.sign(dz) * .20);
        }
      }

      const kneePlate = boxMesh(new THREE.Vector3(.42, .82, .030), plateMat, `frame-${frameIndex}-knee-end-plate-${side}`, technicalEdges);
      kneePlate.position.set(side * (halfW - .055), state.eaveHeight - .05, z);
      kneePlate.rotation.z = side * -pitchRad * .28;
      kneePlate.userData.explodeOffset = new THREE.Vector3(side * .50, .22, 0);
      plates.add(kneePlate);
      counts.connectionPlates += 1;

      // Eight M20 assemblies per knee, arranged as two bolt columns like the Tekla detail.
      const boltXBase = side * (halfW - .072);
      const boltDy = [-.27, -.09, .09, .27];
      for (const dzOffset of [-.085, .085]) {
        for (const [bi, dy] of boltDy.entries()) {
          counts.fasteners += 1;
          counts.washers += 2;
          if (!detailGeometry) continue;
          const bolt = addBoltAssemblyAlongZ(
            fasteners,
            new THREE.Vector3(boltXBase, state.eaveHeight + dy, z + dzOffset),
            .010,
            .125,
            fastenerMat,
            `knee-bolt-M20-${frameIndex}-${side}-${bi}-${dzOffset}`,
          );
          bolt.userData.explodeOffset = new THREE.Vector3(side * .68, .34 + bi * .035, Math.sign(dzOffset) * .28);
        }
      }
    }

    const ridgePlateFront = boxMesh(new THREE.Vector3(.56, .44, .026), plateMat, `frame-${frameIndex}-ridge-splice-a`, technicalEdges);
    ridgePlateFront.position.set(0, ridgeY - .08, z - .055);
    ridgePlateFront.userData.explodeOffset = new THREE.Vector3(0, .55, -.32);
    const ridgePlateBack = boxMesh(new THREE.Vector3(.56, .44, .026), plateMat, `frame-${frameIndex}-ridge-splice-b`, technicalEdges);
    ridgePlateBack.position.set(0, ridgeY - .08, z + .055);
    ridgePlateBack.userData.explodeOffset = new THREE.Vector3(0, .55, .32);
    plates.add(ridgePlateFront, ridgePlateBack);
    counts.connectionPlates += 2;
    for (const [row, yOffset] of [-.16, .10].entries()) {
      for (const [bi, x] of [-.18, 0, .18].entries()) {
        counts.fasteners += 1;
        counts.washers += 2;
        if (!detailGeometry) continue;
        const bolt = addBoltAssemblyAlongZ(
          fasteners,
          new THREE.Vector3(x, ridgeY + yOffset, z),
          .010,
          .16,
          fastenerMat,
          `ridge-bolt-M20-${frameIndex}-${row}-${bi}`,
        );
        bolt.userData.explodeOffset = new THREE.Vector3(x * 1.6, .78 + row * .09, .38 * (bi - 1));
      }
    }
  }

  // RHS border/tie members from the IFC reference family.
  const eaveTieY = state.eaveHeight - Math.max(.08, preset.rafterDepth * .18);
  const eaveTieInset = Math.max(.04, preset.columnDepth * .16);
  const ridgeTieY = ridgeY - Math.max(.16, preset.rafterDepth * .58);
  primary.add(memberBetween(new THREE.Vector3(-halfW + eaveTieInset, eaveTieY, -halfL), new THREE.Vector3(-halfW + eaveTieInset, eaveTieY, halfL), .15, .05, primaryMat, `left-eave-${preset.borderProfile}`, technicalEdges));
  primary.add(memberBetween(new THREE.Vector3(halfW - eaveTieInset, eaveTieY, -halfL), new THREE.Vector3(halfW - eaveTieInset, eaveTieY, halfL), .15, .05, primaryMat, `right-eave-${preset.borderProfile}`, technicalEdges));
  primary.add(memberBetween(new THREE.Vector3(0, ridgeTieY, -halfL), new THREE.Vector3(0, ridgeTieY, halfL), .15, .05, primaryMat, `ridge-tie-${preset.borderProfile}`, technicalEdges));
  counts.borderMembers += 3;

  const secondary = new THREE.Group();
  secondary.name = 'secondary-structure';
  secondary.visible = state.secondaryStructure;
  root.add(secondary);

  const roofSecondaryLeft = setExplode(new THREE.Group(), -1.3, 1.3, 0);
  const roofSecondaryRight = setExplode(new THREE.Group(), 1.3, 1.3, 0);
  const sideSecondaryLeft = setExplode(new THREE.Group(), -1.15, 0, 0);
  const sideSecondaryRight = setExplode(new THREE.Group(), 1.15, 0, 0);
  const frontSecondary = setExplode(new THREE.Group(), 0, 0, -1.15);
  const backSecondary = setExplode(new THREE.Group(), 0, 0, 1.15);
  const bracing = setExplode(new THREE.Group(), 0, .75, 0);
  bracing.name = 'wind-bracing-and-stays';
  secondary.add(roofSecondaryLeft, roofSecondaryRight, sideSecondaryLeft, sideSecondaryRight, frontSecondary, backSecondary, bracing);

  const roofPurlinCountPerSlope = Math.max(3, Math.ceil(metrics.slopeLength / 1.55));
  const purlinTs = [];
  for (let i = 1; i < roofPurlinCountPerSlope; i += 1) {
    const t = i / roofPurlinCountPerSlope;
    purlinTs.push(t);
    const purlinDepth = .20;
    const purlinSeatOffset = preset.rafterDepth / 2 + purlinDepth / 2 + .012;
    const leftNormal = roofNormal(state, -1);
    const rightNormal = roofNormal(state, 1);
    const leftA = roofPoint(state, metrics, -1, t, -halfL).addScaledVector(leftNormal, purlinSeatOffset);
    const leftB = roofPoint(state, metrics, -1, t, halfL).addScaledVector(leftNormal, purlinSeatOffset);
    const rightA = roofPoint(state, metrics, 1, t, -halfL).addScaledVector(rightNormal, purlinSeatOffset);
    const rightB = roofPoint(state, metrics, 1, t, halfL).addScaledVector(rightNormal, purlinSeatOffset);
    const leftPurlin = zMemberBetween(leftA, leftB, purlinDepth, .075, .012, secondaryMat, `left-purlin-${i}-${preset.purlinProfile}`, technicalEdges);
    const rightPurlin = zMemberBetween(rightA, rightB, purlinDepth, .075, .012, secondaryMat, `right-purlin-${i}-${preset.purlinProfile}`, technicalEdges);
    leftPurlin.rotation.z = pitchRad;
    rightPurlin.rotation.z = -pitchRad;
    roofSecondaryLeft.add(leftPurlin);
    roofSecondaryRight.add(rightPurlin);
    counts.roofPurlinLines += 2;
  }

  // Purlin cleats make the detailed exploded view readable without creating thousands of parts.
  for (const [frameIndex, z] of framePositions.entries()) {
    for (const side of [-1, 1]) {
      for (const [ti, t] of purlinTs.entries()) {
        if ((ti + frameIndex) % 2 !== 0) continue;
        const point = roofPoint(state, metrics, side, t, z)
          .addScaledVector(roofNormal(state, side), preset.rafterDepth / 2 + .035);
        const cleat = boxMesh(new THREE.Vector3(.07, .13, .045), plateMat, `purlin-cleat-${frameIndex}-${side}-${ti}`, technicalEdges);
        cleat.position.copy(point);
        cleat.userData.explodeOffset = new THREE.Vector3(side * .20, .35, ((frameIndex % 2) ? .16 : -.16));
        plates.add(cleat);
        for (const boltOffset of [-.032, .032]) {
          counts.fasteners += 1;
          counts.washers += 2;
          if (!detailGeometry) continue;
          const bolt = addBoltAssemblyAlongZ(
            fasteners,
            point.clone().add(new THREE.Vector3(0, boltOffset, 0)),
            .006,
            .075,
            fastenerMat,
            `purlin-cleat-bolt-M12-${frameIndex}-${side}-${ti}-${boltOffset}`,
          );
          bolt.userData.explodeOffset = new THREE.Vector3(side * .30, .46, boltOffset * 5);
        }
        counts.purlinCleats += 1;
        counts.connectionPlates += 1;
      }
    }
  }

  const girtLevels = Math.max(3, Math.ceil(state.eaveHeight / 1.35));
  for (let i = 1; i < girtLevels; i += 1) {
    const y = (state.eaveHeight * i) / girtLevels;
    sideSecondaryLeft.add(zMemberBetween(new THREE.Vector3(-halfW + .08, y, -halfL), new THREE.Vector3(-halfW + .08, y, halfL), .15, .055, .01, secondaryMat, `left-wall-girt-${i}`, technicalEdges));
    sideSecondaryRight.add(zMemberBetween(new THREE.Vector3(halfW - .08, y, -halfL), new THREE.Vector3(halfW - .08, y, halfL), .15, .055, .01, secondaryMat, `right-wall-girt-${i}`, technicalEdges));
    frontSecondary.add(memberBetween(new THREE.Vector3(-halfW, y, -halfL - .04), new THREE.Vector3(halfW, y, -halfL - .04), .10, .06, secondaryMat, `front-wall-girt-${i}`, technicalEdges));
    backSecondary.add(memberBetween(new THREE.Vector3(-halfW, y, halfL + .04), new THREE.Vector3(halfW, y, halfL + .04), .10, .06, secondaryMat, `back-wall-girt-${i}`, technicalEdges));
    counts.wallGirtLines += 4;
  }

  const endPostIntervals = Math.max(2, Math.ceil(state.width / 4));
  for (let i = 1; i < endPostIntervals; i += 1) {
    const x = -halfW + (state.width * i) / endPostIntervals;
    const localRise = metrics.ridgeRise * (1 - Math.abs(x) / halfW);
    const topY = state.eaveHeight + localRise;
    frontSecondary.add(memberBetween(new THREE.Vector3(x, 0, -halfL), new THREE.Vector3(x, topY, -halfL), .15, .05, secondaryMat, `front-montant-${i}-RHS150x50`, technicalEdges));
    backSecondary.add(memberBetween(new THREE.Vector3(x, 0, halfL), new THREE.Vector3(x, topY, halfL), .15, .05, secondaryMat, `back-montant-${i}-RHS150x50`, technicalEdges));
    counts.endPosts += 2;
  }

  // Gable border members (Bordaj RHS150x50 from the IFC model).
  for (const z of [-halfL, halfL]) {
    const zOffset = z + Math.sign(z || 1) * .055;
    const gableGroup = z < 0 ? frontSecondary : backSecondary;
    gableGroup.add(memberBetween(new THREE.Vector3(-halfW, 0, zOffset), new THREE.Vector3(-halfW, state.eaveHeight, zOffset), .15, .05, secondaryMat, `gable-border-left-${z}`, technicalEdges));
    gableGroup.add(memberBetween(new THREE.Vector3(halfW, 0, zOffset), new THREE.Vector3(halfW, state.eaveHeight, zOffset), .15, .05, secondaryMat, `gable-border-right-${z}`, technicalEdges));
    gableGroup.add(memberBetween(new THREE.Vector3(-halfW, state.eaveHeight, zOffset), new THREE.Vector3(0, ridgeY, zOffset), .15, .05, secondaryMat, `gable-border-rafter-left-${z}`, technicalEdges));
    gableGroup.add(memberBetween(new THREE.Vector3(0, ridgeY, zOffset), new THREE.Vector3(halfW, state.eaveHeight, zOffset), .15, .05, secondaryMat, `gable-border-rafter-right-${z}`, technicalEdges));
    counts.borderMembers += 4;
  }

  const braceBayIndices = [...new Set([0, Math.max(0, metrics.bayCount - 1)])];
  for (const bayIndex of braceBayIndices) {
    const z0 = framePositions[bayIndex];
    const z1 = framePositions[bayIndex + 1];
    if (!Number.isFinite(z0) || !Number.isFinite(z1)) continue;

    for (const side of [-1, 1]) {
      const x = side * (halfW - .10);
      bracing.add(cylinderBetween(new THREE.Vector3(x, .65, z0), new THREE.Vector3(x, state.eaveHeight - .5, z1), .018, braceMat, `wall-windbrace-D20-${bayIndex}-${side}-a`, 10));
      bracing.add(cylinderBetween(new THREE.Vector3(x, state.eaveHeight - .5, z0), new THREE.Vector3(x, .65, z1), .018, braceMat, `wall-windbrace-D20-${bayIndex}-${side}-b`, 10));
      bracing.add(memberBetween(new THREE.Vector3(x, state.eaveHeight * .55, z0), new THREE.Vector3(x, state.eaveHeight * .55, z1), .08, .08, braceMat, `wall-compression-RHS80x4-${bayIndex}-${side}`, technicalEdges));
      counts.wallBraces += 2;
      counts.compressionBars += 1;

      const braceRoofOffset = preset.rafterDepth / 2 + .028;
      const roofN = roofNormal(state, side);
      const a0 = roofPoint(state, metrics, side, .14, z0).addScaledVector(roofN, braceRoofOffset);
      const a1 = roofPoint(state, metrics, side, .86, z1).addScaledVector(roofN, braceRoofOffset);
      const b0 = roofPoint(state, metrics, side, .86, z0).addScaledVector(roofN, braceRoofOffset);
      const b1 = roofPoint(state, metrics, side, .14, z1).addScaledVector(roofN, braceRoofOffset);
      bracing.add(cylinderBetween(a0, a1, .016, braceMat, `roof-windbrace-D20-${bayIndex}-${side}-a`, 10));
      bracing.add(cylinderBetween(b0, b1, .016, braceMat, `roof-windbrace-D20-${bayIndex}-${side}-b`, 10));
      const c0 = roofPoint(state, metrics, side, .5, z0).addScaledVector(roofN, braceRoofOffset);
      const c1 = roofPoint(state, metrics, side, .5, z1).addScaledVector(roofN, braceRoofOffset);
      bracing.add(memberBetween(c0, c1, .08, .08, braceMat, `roof-compression-RHS80x4-${bayIndex}-${side}`, technicalEdges));
      counts.roofBraces += 2;
      counts.compressionBars += 1;
    }
  }

  // L60x6 stays at representative purlin/rafter locations.
  for (const [frameIndex, z] of framePositions.entries()) {
    for (const side of [-1, 1]) {
      for (const t of [.32, .68]) {
        const p = roofPoint(state, metrics, side, t, z);
        const q = p.clone().add(new THREE.Vector3(side * -.18, -.26, 0));
        bracing.add(angleMemberBetween(p, q, .06, .008, braceMat, `stay-L60x6-${frameIndex}-${side}-${t}`, technicalEdges));
        counts.stays += 1;
      }
    }
  }

  const envelope = new THREE.Group();
  envelope.name = 'envelope';
  envelope.visible = state.showCladding;
  root.add(envelope);

  const leftWall = setExplode(new THREE.Group(), -2.8, .1, 0);
  const rightWall = setExplode(new THREE.Group(), 2.8, .1, 0);
  const frontWall = setExplode(new THREE.Group(), 0, .1, -2.8);
  const backWall = setExplode(new THREE.Group(), 0, .1, 2.8);
  const leftRoof = setExplode(new THREE.Group(), -2.0, 3.25, 0);
  const rightRoof = setExplode(new THREE.Group(), 2.0, 3.25, 0);
  envelope.add(leftWall, rightWall, frontWall, backWall, leftRoof, rightRoof);

  const wallThickness = .065;
  const envelopeOffset = .075;
  const leftPanel = boxMesh(new THREE.Vector3(wallThickness, state.eaveHeight, state.length), wallMat, 'left-wall-cladding', technicalEdges);
  leftPanel.position.set(-halfW - wallThickness / 2 - envelopeOffset, state.eaveHeight / 2, 0);
  leftWall.add(leftPanel);
  addWallSeams(leftWall, 'side', state.length, state.eaveHeight, new THREE.Vector3(-halfW - wallThickness - envelopeOffset - .004, 0, 0));

  const rightPanel = boxMesh(new THREE.Vector3(wallThickness, state.eaveHeight, state.length), wallMat, 'right-wall-cladding', technicalEdges);
  rightPanel.position.set(halfW + wallThickness / 2 + envelopeOffset, state.eaveHeight / 2, 0);
  rightWall.add(rightPanel);
  addWallSeams(rightWall, 'side', state.length, state.eaveHeight, new THREE.Vector3(halfW + wallThickness + envelopeOffset + .004, 0, 0));

  const frontZ = -halfL - wallThickness / 2 - envelopeOffset;
  const frontRect = boxMesh(new THREE.Vector3(state.width, state.eaveHeight, wallThickness), wallMat, 'front-wall-cladding', technicalEdges);
  frontRect.position.set(0, state.eaveHeight / 2, frontZ);
  frontWall.add(frontRect);
  addWallSeams(frontWall, 'front', state.width, state.eaveHeight, new THREE.Vector3(0, 0, frontZ - wallThickness / 2 - .004));
  const frontTriangle = createTriangleWall(state.width, metrics.ridgeRise, wallMat, 'front-gable-cladding', technicalEdges, false);
  frontTriangle.position.set(0, state.eaveHeight, frontZ - wallThickness / 2);
  frontWall.add(frontTriangle);

  const backZ = halfL + wallThickness / 2 + envelopeOffset;
  const backRect = boxMesh(new THREE.Vector3(state.width, state.eaveHeight, wallThickness), wallMat, 'back-wall-cladding', technicalEdges);
  backRect.position.set(0, state.eaveHeight / 2, backZ);
  backWall.add(backRect);
  addWallSeams(backWall, 'back', state.width, state.eaveHeight, new THREE.Vector3(0, 0, backZ + wallThickness / 2 + .004));
  const backTriangle = createTriangleWall(state.width, metrics.ridgeRise, wallMat, 'back-gable-cladding', technicalEdges, true);
  backTriangle.position.set(0, state.eaveHeight, backZ + wallThickness / 2);
  backTriangle.rotation.y = Math.PI;
  backWall.add(backTriangle);

  // Thin sandwich/trapezoidal roof sheets are aligned directly to the roof plane.
  // A dedicated ridge cap and eave/barge flashings cover the panel ends so the roof
  // does not show the old open/stacked strip artefact at the ridge and gable edges.
  const roofThickness = .052;
  const purlinDepth = .20;
  // Seat the roof directly on the purlin top. Using a global Y-only clearance made
  // the sheets visibly float and gave the left/right slopes different apparent gaps.
  const roofSurfaceOffset = preset.rafterDepth / 2 + purlinDepth + roofThickness / 2 + .012;
  const roofLength = state.length + .22;
  const leftRoofCenter = roofPoint(state, metrics, -1, .5, 0).addScaledVector(roofNormal(state, -1), roofSurfaceOffset);
  const leftRoofPanel = boxMesh(new THREE.Vector3(metrics.slopeLength + .06, roofThickness, roofLength), roofMat, 'left-roof-cladding', technicalEdges);
  leftRoofPanel.position.copy(leftRoofCenter);
  leftRoofPanel.rotation.z = pitchRad;
  addCorrugationLines(leftRoofPanel, 'x', Math.max(10, Math.floor(metrics.slopeLength / .34)), roofLength, metrics.slopeLength);
  leftRoof.add(leftRoofPanel);

  const rightRoofCenter = roofPoint(state, metrics, 1, .5, 0).addScaledVector(roofNormal(state, 1), roofSurfaceOffset);
  const rightRoofPanel = boxMesh(new THREE.Vector3(metrics.slopeLength + .06, roofThickness, roofLength), roofMat, 'right-roof-cladding', technicalEdges);
  rightRoofPanel.position.copy(rightRoofCenter);
  rightRoofPanel.rotation.z = -pitchRad;
  addCorrugationLines(rightRoofPanel, 'x', Math.max(10, Math.floor(metrics.slopeLength / .34)), roofLength, metrics.slopeLength);
  rightRoof.add(rightRoofPanel);

  const roofTrim = setExplode(new THREE.Group(), 0, 3.55, 0);
  roofTrim.name = 'roof-flashings';
  envelope.add(roofTrim);
  const ridgeCapMat = material(state.roofColor, { metalness: .38, roughness: .40 });
  const ridgeCap = createRidgeCap(roofLength + .04, pitchRad, .42, .028, ridgeCapMat, 'folded-ridge-cap', technicalEdges);
  ridgeCap.position.set(0, ridgeY + Math.cos(pitchRad) * roofSurfaceOffset + .040, 0);
  roofTrim.add(ridgeCap);

  const leftEave = memberBetween(
    new THREE.Vector3(-halfW - .03, state.eaveHeight + Math.cos(pitchRad) * roofSurfaceOffset - .010, -halfL - .13),
    new THREE.Vector3(-halfW - .03, state.eaveHeight + Math.cos(pitchRad) * roofSurfaceOffset - .010, halfL + .13),
    .13, .07, ridgeCapMat, 'left-eave-flashing', technicalEdges,
  );
  const rightEave = memberBetween(
    new THREE.Vector3(halfW + .03, state.eaveHeight + Math.cos(pitchRad) * roofSurfaceOffset - .010, -halfL - .13),
    new THREE.Vector3(halfW + .03, state.eaveHeight + Math.cos(pitchRad) * roofSurfaceOffset - .010, halfL + .13),
    .13, .07, ridgeCapMat, 'right-eave-flashing', technicalEdges,
  );
  roofTrim.add(leftEave, rightEave);

  for (const z of [-halfL - .125, halfL + .125]) {
    roofTrim.add(memberBetween(
      new THREE.Vector3(-halfW, state.eaveHeight + Math.cos(pitchRad) * roofSurfaceOffset + .010, z),
      new THREE.Vector3(0, ridgeY + Math.cos(pitchRad) * roofSurfaceOffset + .010, z),
      .09, .055, ridgeCapMat, `barge-flashing-left-${z}`, technicalEdges,
    ));
    roofTrim.add(memberBetween(
      new THREE.Vector3(0, ridgeY + Math.cos(pitchRad) * roofSurfaceOffset + .010, z),
      new THREE.Vector3(halfW, state.eaveHeight + Math.cos(pitchRad) * roofSurfaceOffset + .010, z),
      .09, .055, ridgeCapMat, `barge-flashing-right-${z}`, technicalEdges,
    ));
  }

  const openings = new THREE.Group();
  openings.name = 'openings';
  root.add(openings);

  if (state.rollerDoor) {
    const group = setExplode(new THREE.Group(), 0, 0, -3.15);
    group.name = 'front-roller-door';
    const width = Math.min(state.rollerDoorWidth, state.width - 1.2);
    const height = Math.min(state.rollerDoorHeight, state.eaveHeight - .40);
    const trimMat = material('#1d3448', { metalness: .62, roughness: .34 });
    const door = createRollerDoorAssembly(width, height, doorMat, trimMat, fastenerMat, technicalEdges);
    door.position.set(0, 0, frontZ - .075);
    group.add(door);
    openings.add(group);
  }

  if (state.personnelDoor) {
    const group = setExplode(new THREE.Group(), 0, 0, -3.15);
    group.name = 'front-personnel-door';
    const trimMat = material('#284b61', { metalness: .55, roughness: .36 });
    const leafMat = material('#e5ebee', { metalness: .18, roughness: .55 });
    const door = createPersonnelDoorAssembly(trimMat, leafMat, glassMat, fastenerMat, technicalEdges);
    door.position.set(Math.min(halfW - .75, Math.max(1.55, state.rollerDoorWidth / 2 + .95)), 0, frontZ - .085);
    group.add(door);
    openings.add(group);
  }

  if (state.windows) {
    const zPositions = [-state.length * .25, state.length * .25];
    for (const side of [-1, 1]) {
      const group = setExplode(new THREE.Group(), side * 3.1, 0, 0);
      for (const [index, z] of zPositions.entries()) {
        const frame = boxMesh(new THREE.Vector3(.11, 1.25, 1.8), primaryMat, `window-frame-${side}-${index}`, technicalEdges);
        frame.position.set(side * (halfW + .14), state.eaveHeight * .56, z);
        group.add(frame);
        const glass = boxMesh(new THREE.Vector3(.13, 1.08, 1.63), glassMat, `window-glass-${side}-${index}`, false);
        glass.position.copy(frame.position);
        group.add(glass);
      }
      openings.add(group);
    }
  }


  // Optional hall services are split into named display layers so the Model
  // display inspector can isolate them without rebuilding the hall.
  const services = setExplode(new THREE.Group(), 0, 1.4, 0);
  services.name = 'building-services';
  root.add(services);

  const drainageServices = new THREE.Group();
  drainageServices.name = 'service-drainage';
  const skylightServices = new THREE.Group();
  skylightServices.name = 'service-skylights';
  const lightingServices = new THREE.Group();
  lightingServices.name = 'service-lighting';
  const fireServices = new THREE.Group();
  fireServices.name = 'service-fire';
  const climateServices = new THREE.Group();
  climateServices.name = 'service-climate';
  const coverageServices = new THREE.Group();
  coverageServices.name = 'service-coverage';
  coverageServices.visible = Boolean(state.serviceCoverage);
  services.add(drainageServices, skylightServices, lightingServices, fireServices, climateServices, coverageServices);

  const lightingPositions = [];
  const sprinklerPositions = [];

  if (state.gutters) {
    const gutterMat = material('#5d6971', { metalness: .72, roughness: .32 });
    const gutterY = state.eaveHeight + Math.cos(pitchRad) * roofSurfaceOffset - .085;
    for (const side of [-1, 1]) {
      const x = side * (halfW + .17);
      drainageServices.add(memberBetween(new THREE.Vector3(x, gutterY, -halfL - .12), new THREE.Vector3(x, gutterY, halfL + .12), .14, .12, gutterMat, `eave-gutter-${side}`, technicalEdges));
      for (const z of [-halfL + .14, halfL - .14]) {
        drainageServices.add(cylinderBetween(new THREE.Vector3(x, gutterY - .02, z), new THREE.Vector3(x, .18, z), .038, gutterMat, `downpipe-${side}-${z}`, 12));
      }
    }
  }

  if (state.roofSkylights) {
    const skyMat = material('#b9e6f5', { transparent: true, opacity: .62, metalness: .03, roughness: .18, depthWrite: false });
    const modulesPerSide = Math.max(1, Math.floor(metrics.skylightCount / 2));
    for (const side of [-1, 1]) {
      for (let i = 0; i < modulesPerSide; i += 1) {
        const z = modulesPerSide === 1 ? 0 : -halfL * .72 + i * (halfL * 1.44 / (modulesPerSide - 1));
        const panel = createSkylight(Math.min(1.35, metrics.slopeLength * .25), 1.15, skyMat, `roof-skylight-${side}-${i}`, technicalEdges);
        const roofT = .52;
        const point = roofPoint(state, metrics, side, roofT, z);
        point.addScaledVector(roofNormal(state, side), roofSurfaceOffset + .028);
        panel.position.copy(point);
        panel.rotation.z = side < 0 ? pitchRad : -pitchRad;
        skylightServices.add(panel);
      }
    }
  }

  if (state.highBayLighting) {
    const fixtureMat = material('#313d45', { metalness: .65, roughness: .32 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xf6fbff, emissive: 0xd6efff, emissiveIntensity: .75, roughness: .25 });
    const columns = Math.max(1, Math.ceil(state.width / 9));
    const rows = Math.max(2, Math.ceil(metrics.highBayFixtureCount / columns));
    let created = 0;
    for (let r = 0; r < rows && created < metrics.highBayFixtureCount; r += 1) {
      const z = rows === 1 ? 0 : -halfL * .72 + r * (halfL * 1.44 / (rows - 1));
      for (let c = 0; c < columns && created < metrics.highBayFixtureCount; c += 1) {
        const x = columns === 1 ? 0 : -halfW * .55 + c * (halfW * 1.10 / (columns - 1));
        const localRoofY = state.eaveHeight + metrics.ridgeRise * (1 - Math.min(1, Math.abs(x) / Math.max(halfW, .01)));
        const light = createHighBayLight(fixtureMat, glowMat);
        // Mount the fixture below the rafter bottom and keep every fixture inside
        // the hall footprint. Previous spacing used full width/length where a
        // half-span was intended, which sent later fixtures outside the building.
        const fixtureY = Math.max(2.35, localRoofY - preset.rafterDepth / 2 - .58);
        light.position.set(
          THREE.MathUtils.clamp(x, -halfW + .75, halfW - .75),
          fixtureY,
          THREE.MathUtils.clamp(z, -halfL + .75, halfL - .75),
        );
        lightingServices.add(light);
        lightingPositions.push(new THREE.Vector3(x, 0, z));
        created += 1;
      }
    }
  }

  if (state.fireSprinklers) {
    const pipeMat = material('#b63d38', { metalness: .45, roughness: .38 });
    const pipeY = Math.max(2.7, Math.min(state.eaveHeight - .55, ridgeY - .9));
    fireServices.add(cylinderBetween(new THREE.Vector3(0, pipeY, -halfL + .4), new THREE.Vector3(0, pipeY, halfL - .4), .032, pipeMat, 'sprinkler-main', 10));
    const branchCount = Math.max(2, Math.ceil(state.length / 6));
    for (let i = 0; i < branchCount; i += 1) {
      const z = branchCount === 1 ? 0 : -halfL * .78 + i * (halfL * 1.56 / (branchCount - 1));
      fireServices.add(cylinderBetween(new THREE.Vector3(-halfW + .6, pipeY, z), new THREE.Vector3(halfW - .6, pipeY, z), .022, pipeMat, `sprinkler-branch-${i}`, 8));
      const headCount = Math.max(2, Math.ceil(state.width / 4));
      for (let h = 0; h < headCount; h += 1) {
        const x = headCount === 1 ? 0 : -halfW * .7 + h * (halfW * 1.4 / (headCount - 1));
        const stem = cylinderBetween(new THREE.Vector3(x, pipeY, z), new THREE.Vector3(x, pipeY - .16, z), .008, pipeMat, `sprinkler-drop-${i}-${h}`, 7);
        fireServices.add(stem);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(.035, .018, .025, 10), pipeMat);
        head.position.set(x, pipeY - .18, z);
        fireServices.add(head);
        sprinklerPositions.push(new THREE.Vector3(x, 0, z));
      }
    }
  }

  if (state.climateSystem !== 'none') {
    const casingMat = material('#d9e1e4', { metalness: .42, roughness: .52 });
    const fanMat = material('#35434c', { metalness: .62, roughness: .33 });
    const unitCount = metrics.refrigerationUnitCount || Math.max(1, Math.ceil(metrics.footprint / 280));
    const unitWidth = state.climateSystem === 'frozen' ? 2.5 : 2.0;
    for (let i = 0; i < unitCount; i += 1) {
      const z = unitCount === 1 ? 0 : -Math.min(halfL - 1.5, unitCount * 1.8) + i * (Math.min(state.length - 3, unitCount * 3.6) / Math.max(1, unitCount - 1));
      const unit = createCondenserUnit(unitWidth, 1.45, .72, casingMat, fanMat, technicalEdges);
      unit.position.set(halfW + 1.45, .12, z);
      unit.rotation.y = -Math.PI / 2;
      climateServices.add(unit);
      const pipeA = cylinderBetween(new THREE.Vector3(halfW - .02, 1.15, z - .10), new THREE.Vector3(halfW + 1.0, .95, z - .10), .018, fanMat, `climate-pipe-a-${i}`, 8);
      const pipeB = cylinderBetween(new THREE.Vector3(halfW - .02, 1.02, z + .10), new THREE.Vector3(halfW + 1.0, .82, z + .10), .014, fanMat, `climate-pipe-b-${i}`, 8);
      climateServices.add(pipeA, pipeB);
    }
  }

  // Lightweight coverage overlays are created once and toggled by the display
  // inspector. They do not participate in shadows and therefore stay inexpensive.
  const coverageBlue = new THREE.MeshBasicMaterial({ color: 0x1a9fe6, transparent: true, opacity: .10, depthWrite: false, side: THREE.DoubleSide });
  const coverageRed = new THREE.MeshBasicMaterial({ color: 0xd95a52, transparent: true, opacity: .08, depthWrite: false, side: THREE.DoubleSide });
  const coverageCyan = new THREE.MeshBasicMaterial({ color: 0x62c7d9, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide });
  lightingPositions.forEach((pos, index) => {
    const zone = new THREE.Mesh(new THREE.CircleGeometry(Math.min(3.4, Math.max(2.1, state.width / 4)), 24), coverageBlue);
    zone.name = `lighting-coverage-${index}`;
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(pos.x, .025, pos.z);
    coverageServices.add(zone);
  });
  sprinklerPositions.forEach((pos, index) => {
    const zone = new THREE.Mesh(new THREE.CircleGeometry(2.3, 20), coverageRed);
    zone.name = `sprinkler-coverage-${index}`;
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(pos.x, .03, pos.z);
    coverageServices.add(zone);
  });
  if (state.climateSystem !== 'none') {
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1, state.width - 1.6), Math.max(1, state.length - 1.6)), coverageCyan);
    zone.name = 'climate-coverage';
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = .035;
    coverageServices.add(zone);
  }

  // Warehouse-planning overlays are hall-specific inspection aids rather than
  // configuration geometry. They remain hidden until enabled in Model display.
  const planning = new THREE.Group();
  planning.name = 'warehouse-planning';
  root.add(planning);
  const racks = new THREE.Group();
  racks.name = 'warehouse-racking';
  const aisles = new THREE.Group();
  aisles.name = 'forklift-clearance';
  planning.add(racks, aisles);

  const rackMat = material('#7b8d98', { metalness: .48, roughness: .48, transparent: true, opacity: .78 });
  const palletMat = material('#c08a4e', { metalness: .02, roughness: .88, transparent: true, opacity: .72 });
  const densityRows = state.rackDensity === 'dense' ? 4 : state.rackDensity === 'light' ? 2 : 3;
  const usableWidth = Math.max(2.5, state.width - 3.0);
  const usableLength = Math.max(4.0, state.length - 4.2);
  const rackHeight = Math.min(4.2, Math.max(2.2, state.eaveHeight - 1.0));
  const rackDepth = state.rackDensity === 'dense' ? 1.0 : 1.15;
  const rowCount = Math.max(1, Math.min(densityRows, Math.floor(usableWidth / (rackDepth + 2.1))));
  for (let i = 0; i < rowCount; i += 1) {
    const x = rowCount === 1 ? 0 : -usableWidth / 2 + rackDepth / 2 + i * ((usableWidth - rackDepth) / (rowCount - 1));
    const frame = boxMesh(new THREE.Vector3(rackDepth, rackHeight, usableLength), rackMat, `rack-row-${i}`, false);
    frame.position.set(x, rackHeight / 2, .45);
    frame.castShadow = false;
    racks.add(frame);
    for (const level of [.22, .48, .74]) {
      const pallet = boxMesh(new THREE.Vector3(rackDepth + .08, .12, usableLength * .94), palletMat, `rack-shelf-${i}-${level}`, false);
      pallet.position.set(x, rackHeight * level, .45);
      pallet.castShadow = false;
      racks.add(pallet);
    }
  }

  const aisleMat = new THREE.MeshBasicMaterial({ color: 0x18a0d8, transparent: true, opacity: .11, depthWrite: false, side: THREE.DoubleSide });
  const mainAisle = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3.4, state.width * .35), Math.max(2, state.length - 2.0)), aisleMat);
  mainAisle.name = 'main-forklift-aisle';
  mainAisle.rotation.x = -Math.PI / 2;
  mainAisle.position.set(0, .045, 0);
  aisles.add(mainAisle);
  const crossAisle = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(2, state.width - 1.6), Math.min(3.4, state.length * .22)), aisleMat);
  crossAisle.name = 'forklift-turning-cross-aisle';
  crossAisle.rotation.x = -Math.PI / 2;
  crossAisle.position.set(0, .05, -halfL + Math.min(2.5, state.length * .16));
  aisles.add(crossAisle);

  root.traverse((object) => {
    if (!object.userData.basePosition) object.userData.basePosition = object.position.clone();
  });

  return {
    root,
    metrics,
    counts,
    detailGeometry,
    profileSchedule: {
      columns: preset.columnProfile,
      rafters: preset.rafterProfile,
      purlins: preset.purlinProfile,
      border: preset.borderProfile,
      braces: preset.braceProfile,
      stays: preset.stayProfile,
    },
  };
}

export function applyExplodedView(root, amount) {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  const detailVisible = Boolean(root.userData.showConnectionDetails) || t > .015;
  root.traverse((object) => {
    if (object.userData.detailOnly) object.visible = detailVisible;
    const base = object.userData.basePosition;
    if (!base) return;
    const offset = object.userData.explodeOffset;
    if (offset) object.position.copy(base).addScaledVector(offset, t);
    else object.position.copy(base);
  });
}
