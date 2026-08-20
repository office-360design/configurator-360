import * as THREE from 'three';
import { modulePresets } from './state.js?v=8';
import { solarT, resolveSolarLocale } from './i18n.js?v=1';

const ROOF_OFFSET_Y = 0.05;
const DEG = Math.PI / 180;
const normalizeDeg = (value) => ((value % 360) + 360) % 360;
const signedAngle = (value) => ((normalizeDeg(value) + 180) % 360) - 180;

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function rectInsidePolygon(x, y, width, height, polygon, inset = 0.006) {
  const points = [
    [x + inset, y + inset],
    [x + width - inset, y + inset],
    [x + width - inset, y + height - inset],
    [x + inset, y + height - inset],
    [x + width / 2, y + height / 2],
  ];
  return points.every((point) => pointInPolygon(point, polygon));
}

function surface({ id, label, origin, u, v, width, height, polygon, azimuth }) {
  return {
    id,
    label,
    origin,
    u: u.clone().normalize(),
    v: v.clone().normalize(),
    width,
    height,
    polygon: polygon || [[0, 0], [width, 0], [width, height], [0, height]],
    azimuth: normalizeDeg(azimuth),
  };
}

export function getSolarSurfaces(state) {
  const north = Number(state.northDirection) || 0;
  const pitchRad = state.pitch * DEG;
  const slope = Math.tan(pitchRad);
  const x = state.length / 2 + state.overhang;
  const z = state.depth / 2 + state.overhang;
  const width = x * 2;

  if (state.roofType === 'shed') {
    const lowWallY = state.wallHeight;
    const highWallY = state.wallHeight + slope * state.depth;
    const lowEaveY = lowWallY - slope * state.overhang;
    const height = (state.depth + 2 * state.overhang) / Math.cos(pitchRad);
    return [surface({
      id: 'front',
      label: solarT(resolveSolarLocale(), 'solar.surface.single'),
      origin: new THREE.Vector3(-x, lowEaveY, -z),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, Math.sin(pitchRad), Math.cos(pitchRad)),
      width,
      height,
      azimuth: north,
    })];
  }

  if (state.roofType === 'hip') {
    let length = state.length;
    let depth = state.depth;
    let rotated = false;
    if (depth > length) {
      [length, depth] = [depth, length];
      rotated = true;
    }
    const hx = length / 2 + state.overhang;
    const hz = depth / 2 + state.overhang;
    const localWidth = hx * 2;
    const ridgeHalf = Math.max(0, hx - hz);
    const ridgeY = state.wallHeight + Math.tan(pitchRad) * hz;
    const faceHeight = hz / Math.cos(pitchRad);
    const originFront = new THREE.Vector3(-hx, state.wallHeight, -hz);
    const originBack = new THREE.Vector3(-hx, state.wallHeight, hz);
    const frontPoly = [
      [0, 0], [localWidth, 0], [ridgeHalf + hx, faceHeight], [hx - ridgeHalf, faceHeight],
    ];
    const backPoly = [
      [0, 0], [localWidth, 0], [ridgeHalf + hx, faceHeight], [hx - ridgeHalf, faceHeight],
    ];

    const rotatePoint = (point) => rotated ? new THREE.Vector3(-point.z, point.y, point.x) : point;
    const rotateVector = (vector) => rotated ? new THREE.Vector3(-vector.z, vector.y, vector.x) : vector;
    const azOffset = rotated ? 90 : 0;

    return [
      surface({
        id: 'front', label: solarT(resolveSolarLocale(), 'solar.surface.frontHip'),
        origin: rotatePoint(originFront),
        u: rotateVector(new THREE.Vector3(1, 0, 0)),
        v: rotateVector(new THREE.Vector3(0, Math.sin(pitchRad), Math.cos(pitchRad))),
        width: localWidth, height: faceHeight, polygon: frontPoly,
        azimuth: north + azOffset,
      }),
      surface({
        id: 'back', label: solarT(resolveSolarLocale(), 'solar.surface.backHip'),
        origin: rotatePoint(originBack),
        u: rotateVector(new THREE.Vector3(1, 0, 0)),
        v: rotateVector(new THREE.Vector3(0, Math.sin(pitchRad), -Math.cos(pitchRad))),
        width: localWidth, height: faceHeight, polygon: backPoly,
        azimuth: north + 180 + azOffset,
      }),
    ];
  }

  const ridgeY = state.wallHeight + ROOF_OFFSET_Y + slope * (state.depth / 2);
  const eaveY = ridgeY - slope * z;
  const faceHeight = z / Math.cos(pitchRad);
  return [
    surface({
      id: 'front', label: solarT(resolveSolarLocale(), 'solar.surface.front'),
      origin: new THREE.Vector3(-x, eaveY, -z),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, Math.sin(pitchRad), Math.cos(pitchRad)),
      width, height: faceHeight,
      azimuth: north,
    }),
    surface({
      id: 'back', label: solarT(resolveSolarLocale(), 'solar.surface.back'),
      origin: new THREE.Vector3(-x, eaveY, z),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, Math.sin(pitchRad), -Math.cos(pitchRad)),
      width, height: faceHeight,
      azimuth: north + 180,
    }),
  ];
}

function orientationDistanceFromSouth(azimuth) {
  return Math.abs(signedAngle(azimuth - 180));
}

export function resolveSelectedSurfaces(state) {
  const surfaces = getSolarSurfaces(state);
  // A shed roof has only one usable exterior roof plane. Treat any stale
  // back/both selection as that single plane; the UI disables those choices.
  if (surfaces.length === 1) return [surfaces[0]];
  if (state.roofSide === 'both' && surfaces.length > 1) return surfaces.slice(0, 2);
  if (state.roofSide === 'front') return [surfaces.find((item) => item.id === 'front') || surfaces[0]];
  if (state.roofSide === 'back') return [surfaces.find((item) => item.id === 'back') || surfaces[0]];
  return [surfaces.reduce((best, item) => (
    orientationDistanceFromSouth(item.azimuth) < orientationDistanceFromSouth(best.azimuth) ? item : best
  ), surfaces[0])];
}

function createPanelMesh(width, height, thickness, materials) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), materials.frame);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.02, width - 0.045), Math.max(0.02, height - 0.045), thickness * 0.42),
    materials.glass,
  );
  glass.position.z = thickness * 0.36;
  glass.castShadow = true;
  group.add(glass);

  const lineMaterial = materials.cellLine;
  const cellGroup = new THREE.Group();
  const cols = width > height ? 10 : 6;
  const rows = width > height ? 6 : 10;
  for (let col = 1; col < cols; col += 1) {
    const x = -width / 2 + (width * col) / cols;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, -height / 2 + 0.04, thickness * 0.58),
      new THREE.Vector3(x, height / 2 - 0.04, thickness * 0.58),
    ]);
    cellGroup.add(new THREE.Line(geometry, lineMaterial));
  }
  for (let row = 1; row < rows; row += 1) {
    const y = -height / 2 + (height * row) / rows;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2 + 0.04, y, thickness * 0.58),
      new THREE.Vector3(width / 2 - 0.04, y, thickness * 0.58),
    ]);
    cellGroup.add(new THREE.Line(geometry, lineMaterial));
  }
  group.add(cellGroup);
  return group;
}

function panelQuaternion(surfaceInfo) {
  const xAxis = surfaceInfo.u.clone();
  let yAxis = surfaceInfo.v.clone();
  let zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

  // Surface parameterization runs in the opposite winding direction on the
  // front and back roof planes. Always orient the panel's local +Z toward the
  // exterior/upward side of the roof so back-face panels do not end up below
  // the roof skin (and therefore appear missing because of back-face culling).
  if (zAxis.y < 0) {
    yAxis.multiplyScalar(-1);
    zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  }

  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  return {
    quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
    normal: zAxis,
  };
}

function addPanelsOnSurface(root, surfaceInfo, count, state, module, materials) {
  const portrait = state.moduleOrientation !== 'landscape';
  const panelWidth = portrait ? module.widthM : module.lengthM;
  const panelHeight = portrait ? module.lengthM : module.widthM;
  const gap = Math.max(0.015, Number(state.panelGap) || 0.04);
  const margin = Math.max(0.05, Number(state.panelMargin) || 0.32);
  const requestedColumns = Math.max(1, Math.min(count, Math.round(Number(state.panelColumns) || 1)));
  const rows = Math.ceil(count / requestedColumns);
  const gridWidth = requestedColumns * panelWidth + (requestedColumns - 1) * gap;
  const gridHeight = rows * panelHeight + (rows - 1) * gap;
  const startX = Math.max(margin, (surfaceInfo.width - gridWidth) / 2);
  const startY = Math.max(margin, (surfaceInfo.height - gridHeight) / 2);
  const { quaternion, normal } = panelQuaternion(surfaceInfo);
  let placed = 0;

  for (let row = 0; row < rows && placed < count; row += 1) {
    for (let col = 0; col < requestedColumns && placed < count; col += 1) {
      const px = startX + col * (panelWidth + gap);
      const py = startY + row * (panelHeight + gap);
      if (px < margin - 1e-6 || py < margin - 1e-6) continue;
      if (px + panelWidth > surfaceInfo.width - margin + 1e-6) continue;
      if (py + panelHeight > surfaceInfo.height - margin + 1e-6) continue;
      if (!rectInsidePolygon(px, py, panelWidth, panelHeight, surfaceInfo.polygon)) continue;

      const panel = createPanelMesh(panelWidth, panelHeight, module.thicknessM, materials);
      panel.quaternion.copy(quaternion);
      panel.position.copy(surfaceInfo.origin)
        .addScaledVector(surfaceInfo.u, px + panelWidth / 2)
        .addScaledVector(surfaceInfo.v, py + panelHeight / 2)
        .addScaledVector(normal, 0.075);
      panel.userData.surfaceId = surfaceInfo.id;
      root.add(panel);
      placed += 1;
    }
  }

  return {
    placed,
    requested: count,
    columns: requestedColumns,
    rows,
    panelWidth,
    panelHeight,
  };
}

export function buildSolarArray(state) {
  const module = modulePresets[state.modulePreset] || modulePresets.standard475;
  const root = new THREE.Group();
  root.name = 'solar-array';
  const materials = {
    frame: new THREE.MeshStandardMaterial({ color: 0x27313a, roughness: 0.38, metalness: 0.72 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0d2742, roughness: 0.2, metalness: 0.35 }),
    cellLine: new THREE.LineBasicMaterial({ color: 0x5c7895, transparent: true, opacity: 0.55 }),
  };

  const selected = resolveSelectedSurfaces(state);
  const requested = Math.max(1, Math.round(Number(state.panelCount) || 1));
  const counts = selected.map((_, index) => (
    selected.length === 1
      ? requested
      : index === 0 ? Math.ceil(requested / selected.length) : Math.floor(requested / selected.length)
  ));

  let placed = 0;
  const layouts = [];
  selected.forEach((surfaceInfo, index) => {
    const result = addPanelsOnSurface(root, surfaceInfo, counts[index], state, module, materials);
    placed += result.placed;
    layouts.push({ ...result, surface: surfaceInfo });
  });

  const weightedAzimuth = layouts.reduce((sum, layout) => sum + layout.surface.azimuth * layout.placed, 0)
    / Math.max(1, placed);

  return {
    group: root,
    metrics: {
      requestedPanels: requested,
      placedPanels: placed,
      systemKwp: (placed * module.powerW) / 1000,
      modulePowerW: module.powerW,
      moduleAreaM2: module.lengthM * module.widthM,
      arrayAreaM2: placed * module.lengthM * module.widthM,
      arrayAzimuth: normalizeDeg(weightedAzimuth || selected[0]?.azimuth || 180),
      selectedSurfaces: layouts.map((layout) => ({
        id: layout.surface.id,
        label: layout.surface.label,
        azimuth: layout.surface.azimuth,
        placed: layout.placed,
      })),
      layoutDescription: solarT(resolveSolarLocale(), 'solar.arrayLayout', { columns: Math.max(1, Math.round(Number(state.panelColumns) || 1)), orientation: solarT(resolveSolarLocale(), `orientation.${state.moduleOrientation}`) }),
      fitWarning: placed < requested
        ? solarT(resolveSolarLocale(), 'panels.fitWarning', { placed, requested })
        : '',
    },
  };
}
