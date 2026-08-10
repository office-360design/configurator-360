import * as THREE from 'three';
import { deriveHallMetrics, structurePresets } from './state.js?v=2';

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

function iMemberBetween(a, b, section, mat, name, technicalEdges = false) {
  const group = new THREE.Group();
  group.name = name;
  const length = orientGroupBetween(group, a, b, AXIS_Z);
  const depth = section.depth;
  const flangeWidth = section.flangeWidth;
  const flange = Math.min(section.flange, depth * .22);
  const web = Math.min(section.web, flangeWidth * .35);
  const webHeight = Math.max(.01, depth - flange * 2);

  const top = boxMesh(new THREE.Vector3(flangeWidth, flange, length), mat, `${name}-top-flange`, technicalEdges);
  top.position.y = depth / 2 - flange / 2;
  const bottom = boxMesh(new THREE.Vector3(flangeWidth, flange, length), mat, `${name}-bottom-flange`, technicalEdges);
  bottom.position.y = -depth / 2 + flange / 2;
  const webMesh = boxMesh(new THREE.Vector3(web, webHeight, length), mat, `${name}-web`, technicalEdges);
  group.add(top, bottom, webMesh);
  return group;
}

function zMemberBetween(a, b, depth, flangeWidth, thickness, mat, name, technicalEdges = false) {
  const group = new THREE.Group();
  group.name = name;
  const length = orientGroupBetween(group, a, b, AXIS_Z);
  const web = boxMesh(new THREE.Vector3(thickness, depth, length), mat, `${name}-web`, technicalEdges);
  const top = boxMesh(new THREE.Vector3(flangeWidth, thickness, length), mat, `${name}-top-flange`, technicalEdges);
  const bottom = boxMesh(new THREE.Vector3(flangeWidth, thickness, length), mat, `${name}-bottom-flange`, technicalEdges);
  top.position.set(flangeWidth / 2 - thickness / 2, depth / 2 - thickness / 2, 0);
  bottom.position.set(-flangeWidth / 2 + thickness / 2, -depth / 2 + thickness / 2, 0);
  group.add(web, top, bottom);
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

function roofPoint(state, metrics, side, t, z) {
  const halfW = state.width / 2;
  if (side < 0) {
    return new THREE.Vector3(-halfW + halfW * t, state.eaveHeight + metrics.ridgeRise * t, z);
  }
  return new THREE.Vector3(halfW - halfW * t, state.eaveHeight + metrics.ridgeRise * t, z);
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
  const framePositions = Array.from({ length: metrics.frameCount }, (_, i) => -halfL + i * metrics.actualBaySpacing);

  const counts = {
    primaryColumns: 0,
    rafters: 0,
    footings: 0,
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
  const fasteners = setExplode(new THREE.Group(), 0, .82, 0);
  fasteners.name = 'bolts-nuts-washers';
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

    primary.add(iMemberBetween(leftBottom, leftTop, columnSection, primaryMat, `frame-${frameIndex}-left-column-${preset.columnProfile}`, technicalEdges));
    primary.add(iMemberBetween(leftTop, ridge, rafterSection, primaryMat, `frame-${frameIndex}-left-rafter-${preset.rafterProfile}`, technicalEdges));
    primary.add(iMemberBetween(ridge, rightTop, rafterSection, primaryMat, `frame-${frameIndex}-right-rafter-${preset.rafterProfile}`, technicalEdges));
    primary.add(iMemberBetween(rightTop, rightBottom, columnSection, primaryMat, `frame-${frameIndex}-right-column-${preset.columnProfile}`, technicalEdges));
    counts.primaryColumns += 2;
    counts.rafters += 2;

    const braceInset = Math.min(1.35, state.width * .09);
    const braceDrop = Math.min(1.1, state.eaveHeight * .21);
    primary.add(memberBetween(
      new THREE.Vector3(-halfW, state.eaveHeight - braceDrop, z),
      new THREE.Vector3(-halfW + braceInset, state.eaveHeight + Math.tan(pitchRad) * braceInset, z),
      .085, .085, primaryMat, `frame-${frameIndex}-left-haunch`, technicalEdges,
    ));
    primary.add(memberBetween(
      new THREE.Vector3(halfW, state.eaveHeight - braceDrop, z),
      new THREE.Vector3(halfW - braceInset, state.eaveHeight + Math.tan(pitchRad) * braceInset, z),
      .085, .085, primaryMat, `frame-${frameIndex}-right-haunch`, technicalEdges,
    ));

    for (const side of [-1, 1]) {
      const x = side * halfW;
      const footing = boxMesh(new THREE.Vector3(.82, .28, .82), footingMat, `frame-${frameIndex}-footing-${side}`, technicalEdges);
      footing.position.set(x, -.20, z);
      footingsGroup.add(footing);
      counts.footings += 1;

      const basePlate = boxMesh(new THREE.Vector3(.50, .035, .50), plateMat, `frame-${frameIndex}-base-plate-${side}`, technicalEdges);
      basePlate.position.set(x, .018, z);
      basePlate.userData.explodeOffset = new THREE.Vector3(side * .22, .15, 0);
      plates.add(basePlate);
      counts.connectionPlates += 1;

      for (const dx of [-.17, .17]) {
        for (const dz of [-.17, .17]) {
          const rodA = new THREE.Vector3(x + dx, -.34, z + dz);
          const rodB = new THREE.Vector3(x + dx, .15, z + dz);
          const rod = cylinderBetween(rodA, rodB, .018, fastenerMat, `anchor-M27-${frameIndex}-${side}-${dx}-${dz}`, 12);
          rod.userData.explodeOffset = new THREE.Vector3(side * .34, -.18, Math.sign(dz) * .10);
          anchors.add(rod);
          counts.anchorRods += 1;
          const nut = addHexNut(fasteners, new THREE.Vector3(x + dx, .17, z + dz), .038, .025, fastenerMat, `anchor-nut-M27-${frameIndex}-${side}-${dx}-${dz}`);
          nut.userData.explodeOffset = new THREE.Vector3(side * .48, .24, Math.sign(dz) * .14);
          counts.fasteners += 1;
        }
      }

      const kneePlate = boxMesh(new THREE.Vector3(.34, .62, .026), plateMat, `frame-${frameIndex}-knee-gusset-${side}`, technicalEdges);
      kneePlate.position.set(side * (halfW - .07), state.eaveHeight - .05, z);
      kneePlate.rotation.z = side * -pitchRad * .35;
      kneePlate.userData.explodeOffset = new THREE.Vector3(side * .45, .18, 0);
      plates.add(kneePlate);
      counts.connectionPlates += 1;

      const boltX = side * (halfW - .075);
      for (const [bi, dy] of [-.19, -.06, .07, .20].entries()) {
        const bolt = addBoltHeadAlongZ(fasteners, new THREE.Vector3(boltX, state.eaveHeight + dy, z), .026, .075, fastenerMat, `knee-bolt-M20-${frameIndex}-${side}-${bi}`);
        bolt.userData.explodeOffset = new THREE.Vector3(side * .62, .30 + bi * .04, side * .12);
        counts.fasteners += 1;
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
    for (const [bi, x] of [-.16, 0, .16].entries()) {
      const bolt = addBoltHeadAlongZ(fasteners, new THREE.Vector3(x, ridgeY - .08, z), .024, .15, fastenerMat, `ridge-bolt-M20-${frameIndex}-${bi}`);
      bolt.userData.explodeOffset = new THREE.Vector3(x * 1.4, .78, .45 * (bi - 1));
      counts.fasteners += 1;
    }
  }

  // RHS border/tie members from the IFC reference family.
  primary.add(memberBetween(new THREE.Vector3(-halfW, state.eaveHeight, -halfL), new THREE.Vector3(-halfW, state.eaveHeight, halfL), .15, .05, primaryMat, `left-eave-${preset.borderProfile}`, technicalEdges));
  primary.add(memberBetween(new THREE.Vector3(halfW, state.eaveHeight, -halfL), new THREE.Vector3(halfW, state.eaveHeight, halfL), .15, .05, primaryMat, `right-eave-${preset.borderProfile}`, technicalEdges));
  primary.add(memberBetween(new THREE.Vector3(0, ridgeY, -halfL), new THREE.Vector3(0, ridgeY, halfL), .15, .05, primaryMat, `ridge-tie-${preset.borderProfile}`, technicalEdges));
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
    const leftA = roofPoint(state, metrics, -1, t, -halfL);
    const leftB = roofPoint(state, metrics, -1, t, halfL);
    const rightA = roofPoint(state, metrics, 1, t, -halfL);
    const rightB = roofPoint(state, metrics, 1, t, halfL);
    leftA.y += .055; leftB.y += .055; rightA.y += .055; rightB.y += .055;
    roofSecondaryLeft.add(zMemberBetween(leftA, leftB, .20, .075, .012, secondaryMat, `left-purlin-${i}-${preset.purlinProfile}`, technicalEdges));
    roofSecondaryRight.add(zMemberBetween(rightA, rightB, .20, .075, .012, secondaryMat, `right-purlin-${i}-${preset.purlinProfile}`, technicalEdges));
    counts.roofPurlinLines += 2;
  }

  // Purlin cleats make the detailed exploded view readable without creating thousands of parts.
  for (const [frameIndex, z] of framePositions.entries()) {
    for (const side of [-1, 1]) {
      for (const [ti, t] of purlinTs.entries()) {
        if ((ti + frameIndex) % 2 !== 0) continue;
        const point = roofPoint(state, metrics, side, t, z);
        point.y += .03;
        const cleat = boxMesh(new THREE.Vector3(.07, .13, .045), plateMat, `purlin-cleat-${frameIndex}-${side}-${ti}`, technicalEdges);
        cleat.position.copy(point);
        cleat.userData.explodeOffset = new THREE.Vector3(side * .20, .35, ((frameIndex % 2) ? .16 : -.16));
        plates.add(cleat);
        counts.purlinCleats += 1;
        counts.connectionPlates += 1;
      }
    }
  }

  const girtLevels = Math.max(3, Math.ceil(state.eaveHeight / 1.35));
  for (let i = 1; i < girtLevels; i += 1) {
    const y = (state.eaveHeight * i) / girtLevels;
    sideSecondaryLeft.add(zMemberBetween(new THREE.Vector3(-halfW - .04, y, -halfL), new THREE.Vector3(-halfW - .04, y, halfL), .15, .055, .01, secondaryMat, `left-wall-girt-${i}`, technicalEdges));
    sideSecondaryRight.add(zMemberBetween(new THREE.Vector3(halfW + .04, y, -halfL), new THREE.Vector3(halfW + .04, y, halfL), .15, .055, .01, secondaryMat, `right-wall-girt-${i}`, technicalEdges));
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
      const x = side * (halfW + .025);
      bracing.add(cylinderBetween(new THREE.Vector3(x, .65, z0), new THREE.Vector3(x, state.eaveHeight - .5, z1), .018, braceMat, `wall-windbrace-D20-${bayIndex}-${side}-a`, 10));
      bracing.add(cylinderBetween(new THREE.Vector3(x, state.eaveHeight - .5, z0), new THREE.Vector3(x, .65, z1), .018, braceMat, `wall-windbrace-D20-${bayIndex}-${side}-b`, 10));
      bracing.add(memberBetween(new THREE.Vector3(x, state.eaveHeight * .55, z0), new THREE.Vector3(x, state.eaveHeight * .55, z1), .08, .08, braceMat, `wall-compression-RHS80x4-${bayIndex}-${side}`, technicalEdges));
      counts.wallBraces += 2;
      counts.compressionBars += 1;

      const a0 = roofPoint(state, metrics, side, .14, z0);
      const a1 = roofPoint(state, metrics, side, .86, z1);
      const b0 = roofPoint(state, metrics, side, .86, z0);
      const b1 = roofPoint(state, metrics, side, .14, z1);
      a0.y += .08; a1.y += .08; b0.y += .08; b1.y += .08;
      bracing.add(cylinderBetween(a0, a1, .016, braceMat, `roof-windbrace-D20-${bayIndex}-${side}-a`, 10));
      bracing.add(cylinderBetween(b0, b1, .016, braceMat, `roof-windbrace-D20-${bayIndex}-${side}-b`, 10));
      const c0 = roofPoint(state, metrics, side, .5, z0);
      const c1 = roofPoint(state, metrics, side, .5, z1);
      c0.y += .075; c1.y += .075;
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
        const q = p.clone().add(new THREE.Vector3(side * -.22, -.28, .20));
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

  const wallThickness = .075;
  const leftPanel = boxMesh(new THREE.Vector3(wallThickness, state.eaveHeight, state.length), wallMat, 'left-wall-cladding', technicalEdges);
  leftPanel.position.set(-halfW - wallThickness / 2 - .08, state.eaveHeight / 2, 0);
  leftWall.add(leftPanel);
  const rightPanel = boxMesh(new THREE.Vector3(wallThickness, state.eaveHeight, state.length), wallMat, 'right-wall-cladding', technicalEdges);
  rightPanel.position.set(halfW + wallThickness / 2 + .08, state.eaveHeight / 2, 0);
  rightWall.add(rightPanel);

  const frontRect = boxMesh(new THREE.Vector3(state.width, state.eaveHeight, wallThickness), wallMat, 'front-wall-cladding', technicalEdges);
  frontRect.position.set(0, state.eaveHeight / 2, -halfL - wallThickness / 2 - .08);
  frontWall.add(frontRect);
  const frontTriangle = createTriangleWall(state.width, metrics.ridgeRise, wallMat, 'front-gable-cladding', technicalEdges, false);
  frontTriangle.position.set(0, state.eaveHeight, -halfL - wallThickness - .08);
  frontWall.add(frontTriangle);

  const backRect = boxMesh(new THREE.Vector3(state.width, state.eaveHeight, wallThickness), wallMat, 'back-wall-cladding', technicalEdges);
  backRect.position.set(0, state.eaveHeight / 2, halfL + wallThickness / 2 + .08);
  backWall.add(backRect);
  const backTriangle = createTriangleWall(state.width, metrics.ridgeRise, wallMat, 'back-gable-cladding', technicalEdges, true);
  backTriangle.position.set(0, state.eaveHeight, halfL + wallThickness + .08);
  backTriangle.rotation.y = Math.PI;
  backWall.add(backTriangle);

  const slopeCenterY = state.eaveHeight + metrics.ridgeRise / 2 + .14;
  const leftRoofPanel = boxMesh(new THREE.Vector3(metrics.slopeLength, .075, state.length + .18), roofMat, 'left-roof-cladding', technicalEdges);
  leftRoofPanel.position.set(-halfW / 2, slopeCenterY, 0);
  leftRoofPanel.rotation.z = pitchRad;
  addCorrugationLines(leftRoofPanel, 'x', Math.max(8, Math.floor(metrics.slopeLength / .45)), state.length, metrics.slopeLength);
  leftRoof.add(leftRoofPanel);

  const rightRoofPanel = boxMesh(new THREE.Vector3(metrics.slopeLength, .075, state.length + .18), roofMat, 'right-roof-cladding', technicalEdges);
  rightRoofPanel.position.set(halfW / 2, slopeCenterY, 0);
  rightRoofPanel.rotation.z = -pitchRad;
  addCorrugationLines(rightRoofPanel, 'x', Math.max(8, Math.floor(metrics.slopeLength / .45)), state.length, metrics.slopeLength);
  rightRoof.add(rightRoofPanel);

  const openings = new THREE.Group();
  openings.name = 'openings';
  root.add(openings);

  if (state.rollerDoor) {
    const group = setExplode(new THREE.Group(), 0, 0, -3.1);
    const width = Math.min(state.rollerDoorWidth, state.width - 1.2);
    const height = Math.min(state.rollerDoorHeight, state.eaveHeight - .2);
    const door = boxMesh(new THREE.Vector3(width, height, .11), doorMat, 'roller-door', technicalEdges);
    door.position.set(0, height / 2, -halfL - .18);
    group.add(door);
    openings.add(group);
  }

  if (state.personnelDoor) {
    const group = setExplode(new THREE.Group(), 0, 0, -3.1);
    const door = boxMesh(new THREE.Vector3(1.0, 2.1, .12), material('#e7eef2', { metalness: .12 }), 'personnel-door', technicalEdges);
    door.position.set(Math.min(halfW - .9, Math.max(1.8, state.rollerDoorWidth / 2 + 1.15)), 1.05, -halfL - .19);
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

  root.traverse((object) => {
    if (!object.userData.basePosition) object.userData.basePosition = object.position.clone();
  });

  return {
    root,
    metrics,
    counts,
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
  root.traverse((object) => {
    const base = object.userData.basePosition;
    if (!base) return;
    const offset = object.userData.explodeOffset;
    if (offset) object.position.copy(base).addScaledVector(offset, t);
    else object.position.copy(base);
  });
}
