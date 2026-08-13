import * as THREE from 'three';
import { fitAssetToBox } from './AssetLibrary.js';
import {
  getPoleGrid,
  getSideSegmentConfig,
  poleFaceIsAvailable,
  poleIsAvailable,
  segmentIsAvailable,
} from '../state.js';

const METERS_PER_MM = 0.001;
const SCREEN_TYPES = ['screen', 'motorized-screen'];

function box(width, height, depth, material, options = {}) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function cylinder(radius, height, material, radialSegments = 20) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, radialSegments),
    material,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.5,
    metalness: options.metalness ?? 0.65,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function cloneFittedAsset(assets, key, targetSize, alignY = 'center') {
  const model = assets?.clone(key);
  if (!model) return null;
  return fitAssetToBox(model, targetSize, { alignY });
}

function addPost(group, x, z, height, size, frameMaterial, premium) {
  const post = box(size, height, size, frameMaterial);
  post.position.set(x, height / 2, z);
  group.add(post);

  const foot = box(size * 1.35, 0.025, size * 1.35, frameMaterial, {
    castShadow: false,
  });
  foot.position.set(x, 0.0125, z);
  group.add(foot);

  if (premium) {
    const cap = box(size * 1.06, 0.045, size * 1.06, frameMaterial);
    cap.position.set(x, height - 0.0225, z);
    group.add(cap);
  }
}

function addBeam(group, position, dimensions, frameMaterial, premium) {
  const beam = box(dimensions.x, dimensions.y, dimensions.z, frameMaterial);
  beam.position.copy(position);
  group.add(beam);

  if (premium) {
    const trimMaterial = material('#111719', { roughness: 0.3, metalness: 0.8 });
    const trim = box(
      Math.max(0.015, dimensions.x - 0.018),
      0.025,
      Math.max(0.015, dimensions.z - 0.018),
      trimMaterial,
    );
    trim.position.set(position.x, position.y - dimensions.y / 2 + 0.026, position.z);
    group.add(trim);
  }
}

function addLouvers(group, state, width, depth, topY, louverMaterial) {
  const orientation = state.roof.orientation;
  const tilt = THREE.MathUtils.degToRad(state.roof.louverTilt);
  const bladeWidth = state.model === 'lite' ? 0.115 : 0.135;
  const thickness = state.model === 'premium' ? 0.045 : 0.038;
  const pitch = bladeWidth + 0.018;
  const margin = 0.19;

  if (orientation === 'width') {
    const count = Math.max(4, Math.floor((depth - margin * 2) / pitch));
    const usable = depth - margin * 2;
    for (let index = 0; index < count; index += 1) {
      const pivot = new THREE.Group();
      const z = -usable / 2 + (index + 0.5) * (usable / count);
      pivot.position.set(0, topY, z);
      pivot.rotation.x = tilt;
      const louver = box(width - margin * 2, thickness, bladeWidth, louverMaterial);
      pivot.add(louver);
      group.add(pivot);
    }
  } else {
    const count = Math.max(4, Math.floor((width - margin * 2) / pitch));
    const usable = width - margin * 2;
    for (let index = 0; index < count; index += 1) {
      const pivot = new THREE.Group();
      const x = -usable / 2 + (index + 0.5) * (usable / count);
      pivot.position.set(x, topY, 0);
      pivot.rotation.z = -tilt;
      const louver = box(bladeWidth, thickness, depth - margin * 2, louverMaterial);
      pivot.add(louver);
      group.add(pivot);
    }
  }
}

function addDrainage(group, state, width, depth, height) {
  if (state.roof.drainage !== 'integrated') return;

  const gutterMaterial = material('#151d20', { roughness: 0.4, metalness: 0.75 });
  const gutter = box(width - 0.24, 0.06, 0.08, gutterMaterial);
  gutter.position.set(0, height - 0.19, depth / 2 - 0.13);
  group.add(gutter);

  if (state.model !== 'lite') {
    const pipe = cylinder(0.024, height - 0.22, gutterMaterial, 12);
    pipe.position.set(width / 2 - 0.085, (height - 0.22) / 2, depth / 2 - 0.085);
    group.add(pipe);
  }
}

function segmentTransform(state, segment, width, depth, height, postSize) {
  const coordinates = poleCoordinates(state, width, depth, postSize);
  const first = coordinates[segment.a];
  const second = coordinates[segment.b];
  if (!first || !second) return null;

  const top = height - 0.24;
  const bottom = 0.12;
  const usableHeight = top - bottom;
  const midpoint = first.clone().add(second).multiplyScalar(0.5);
  const distance = first.distanceTo(second);
  return {
    span: Math.max(0.18, distance - postSize - 0.04),
    position: new THREE.Vector3(midpoint.x, bottom + usableHeight / 2, midpoint.z),
    rotationY: segment.axis === 'horizontal' ? 0 : Math.PI / 2,
    usableHeight,
  };
}

function screenSettings(config) {
  return config.screenSettings?.[config.type] ?? {
    openness: 50,
    color: config.type === 'motorized-screen' ? '#34444c' : '#67757d',
  };
}

function addScreen(container, transform, config, motorized, assets) {
  const settings = screenSettings(config);
  const screenMaterial = material(settings.color, {
    roughness: 0.86,
    metalness: 0.02,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  const cassetteMaterial = material('#202b30', { roughness: 0.42, metalness: 0.7 });
  const openness = THREE.MathUtils.clamp(settings.openness, 0, 100) / 100;
  const deployedHeight = transform.usableHeight * (1 - openness);

  const cassetteAsset = cloneFittedAsset(
    assets,
    'screenCassette',
    new THREE.Vector3(transform.span, 0.11, 0.13),
  );
  if (cassetteAsset) {
    cassetteAsset.position.set(0, transform.usableHeight / 2 - 0.055, 0);
    cassetteAsset.traverse((child) => {
      if (!child.isMesh) return;
      child.material = cassetteMaterial.clone();
      if (!motorized && /motor/i.test(child.name)) child.visible = false;
    });
    container.add(cassetteAsset);
  } else {
    const cassette = box(transform.span, 0.11, 0.12, cassetteMaterial);
    cassette.position.set(0, transform.usableHeight / 2 - 0.055, 0);
    container.add(cassette);
  }

  if (deployedHeight > 0.04) {
    const fabric = box(transform.span - 0.08, deployedHeight, 0.018, screenMaterial, {
      castShadow: false,
    });
    fabric.position.set(0, transform.usableHeight / 2 - 0.11 - deployedHeight / 2, 0);
    container.add(fabric);

    const bottomRail = box(transform.span - 0.06, 0.045, 0.045, cassetteMaterial);
    bottomRail.position.set(0, fabric.position.y - deployedHeight / 2, 0);
    container.add(bottomRail);
  }
}

function addPrivacyWall(container, transform, color) {
  const slatMaterial = material(color, { roughness: 0.42, metalness: 0.72 });
  const count = Math.max(8, Math.floor(transform.usableHeight / 0.14));
  const spacing = transform.usableHeight / count;
  for (let index = 0; index < count; index += 1) {
    const slat = box(transform.span - 0.06, 0.075, 0.055, slatMaterial);
    slat.position.set(0, -transform.usableHeight / 2 + spacing * (index + 0.5), 0);
    slat.rotation.x = THREE.MathUtils.degToRad(-18);
    container.add(slat);
  }
}


function addGlass(container, transform, frameMaterial) {
  const panelCount = Math.max(2, Math.round(transform.span / 1.25));
  const gap = 0.025;
  const panelWidth = (transform.span - gap * (panelCount - 1)) / panelCount;
  const glassMaterial = material('#b9d9e4', {
    roughness: 0.06,
    metalness: 0.02,
    transparent: true,
    opacity: 0.26,
    side: THREE.DoubleSide,
  });

  for (let index = 0; index < panelCount; index += 1) {
    const panel = box(panelWidth - 0.018, transform.usableHeight - 0.1, 0.018, glassMaterial, {
      castShadow: false,
    });
    panel.position.set(
      -transform.span / 2 + panelWidth / 2 + index * (panelWidth + gap),
      0,
      0,
    );
    container.add(panel);

    const rail = box(0.025, transform.usableHeight - 0.06, 0.05, frameMaterial);
    rail.position.set(-transform.span / 2 + index * (panelWidth + gap), 0, 0);
    container.add(rail);
  }

  const topRail = box(transform.span, 0.045, 0.07, frameMaterial);
  topRail.position.y = transform.usableHeight / 2 - 0.0225;
  container.add(topRail);
  const bottomRail = topRail.clone();
  bottomRail.position.y = -transform.usableHeight / 2 + 0.0225;
  container.add(bottomRail);
}

function addSideClosings(group, state, width, depth, height, postSize, frameMaterial, assets) {
  const grid = getPoleGrid(state);
  grid.segments.forEach((segment) => {
    const config = getSideSegmentConfig(state, segment.id);
    if (!config || config.type === 'none' || !segmentIsAvailable(state, segment.id)) return;

    const transform = segmentTransform(state, segment, width, depth, height, postSize);
    if (!transform) return;
    const container = new THREE.Group();
    container.position.copy(transform.position);
    container.rotation.y = transform.rotationY;

    if (SCREEN_TYPES.includes(config.type)) {
      addScreen(container, transform, config, config.type === 'motorized-screen', assets);
    } else if (config.type === 'privacy-wall') {
      addPrivacyWall(container, transform, config.privacyColor ?? state.roof.frameColor);
    } else if (config.type === 'glass') {
      addGlass(container, transform, frameMaterial);
    }

    group.add(container);
  });
}

function styleLedAsset(object, color) {
  const ledColor = new THREE.Color(color);
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (/diffuser|led/i.test(child.name)) {
      child.material = new THREE.MeshStandardMaterial({
        color: ledColor,
        emissive: ledColor,
        emissiveIntensity: 4.5,
        roughness: 0.16,
        metalness: 0,
      });
    } else {
      child.material = new THREE.MeshStandardMaterial({
        color: '#b8c0c3',
        roughness: 0.32,
        metalness: 0.7,
      });
    }
  });
}

function addPerimeterLed(group, width, depth, height, ledConfig, assets, night = false) {
  const y = height - 0.225;
  const offset = 0.105;
  const specifications = [
    [new THREE.Vector3(width - 0.26, 0.018, 0.022), new THREE.Vector3(0, y, depth / 2 - offset), 0],
    [new THREE.Vector3(width - 0.26, 0.018, 0.022), new THREE.Vector3(0, y, -depth / 2 + offset), 0],
    [new THREE.Vector3(depth - 0.26, 0.018, 0.022), new THREE.Vector3(width / 2 - offset, y, 0), Math.PI / 2],
    [new THREE.Vector3(depth - 0.26, 0.018, 0.022), new THREE.Vector3(-width / 2 + offset, y, 0), Math.PI / 2],
  ];

  specifications.forEach(([size, position, rotationY]) => {
    const strip = cloneFittedAsset(assets, 'ledStrip', size);
    if (strip) {
      styleLedAsset(strip, ledConfig.color);
      strip.position.copy(position);
      strip.rotation.y = rotationY;
      group.add(strip);
    } else {
      const fallbackMaterial = material(ledConfig.color, {
        roughness: 0.15,
        metalness: 0,
        emissive: ledConfig.color,
        emissiveIntensity: 4,
      });
      const fallback = box(size.x, size.y, size.z, fallbackMaterial, { castShadow: false });
      fallback.position.copy(position);
      fallback.rotation.y = rotationY;
      group.add(fallback);
    }

    const ledLight = new THREE.PointLight(ledConfig.color, night ? 1.8 : 0.12, 4.6, 2);
    ledLight.position.copy(position);
    ledLight.position.y -= 0.08;
    group.add(ledLight);
  });
}

function styleSpotlight(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (/lens/i.test(child.name)) {
      child.material = material('#fff4c6', {
        roughness: 0.05,
        metalness: 0,
        emissive: '#ffdf7a',
        emissiveIntensity: 3,
      });
    } else {
      child.material = material('#111719', { roughness: 0.3, metalness: 0.7 });
    }
  });
}

function addSpotlights(group, count, width, depth, height, beamHeight, frameMaterial, assets, night = false) {
  if (count <= 0) return;

  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const railY = height - beamHeight - 0.022;
  const lightY = railY - 0.016;
  const railMaterial = frameMaterial.clone();
  railMaterial.color.offsetHSL(0, -0.02, 0.04);

  const rowPositions = rows === 1
    ? [0]
    : Array.from({ length: rows }, (_, index) => THREE.MathUtils.lerp(
      -depth * 0.28,
      depth * 0.28,
      index / (rows - 1),
    ));

  rowPositions.forEach((z) => {
    const rail = box(width - 0.42, 0.035, 0.045, railMaterial);
    rail.position.set(0, railY, z);
    group.add(rail);
  });

  let created = 0;
  for (let row = 0; row < rows; row += 1) {
    const lightsInRow = Math.min(columns, count - created);
    for (let column = 0; column < lightsInRow; column += 1) {
      const x = lightsInRow === 1
        ? 0
        : THREE.MathUtils.lerp(-width * 0.32, width * 0.32, column / (lightsInRow - 1));
      const model = cloneFittedAsset(assets, 'spotlight', new THREE.Vector3(0.14, 0.065, 0.14));
      if (model) {
        styleSpotlight(model);
        model.position.set(x, lightY, rowPositions[row]);
        group.add(model);
      } else {
        const body = cylinder(0.055, 0.035, material('#111719'), 20);
        body.position.set(x, lightY, rowPositions[row]);
        group.add(body);
      }
      const downlight = new THREE.SpotLight(0xffefc2, night ? 4.2 : 0.08, 3.6, Math.PI / 5, 0.48, 1.6);
      downlight.position.set(x, lightY - 0.005, rowPositions[row]);
      downlight.target.position.set(x, 0, rowPositions[row]);
      group.add(downlight);
      group.add(downlight.target);
      created += 1;
    }
  }
}


function styleHeater(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (/element/i.test(child.name)) {
      child.material = material('#ef7b21', {
        roughness: 0.32,
        metalness: 0.1,
        emissive: '#e84c16',
        emissiveIntensity: 2.8,
      });
    } else {
      child.material = material('#171b1d', { roughness: 0.38, metalness: 0.7 });
    }
  });
}

function addHeaterBrackets(group, side, width, depth, height, beamHeight, heaterY, frameMaterial) {
  const beamBottom = height - beamHeight + 0.012;
  const heaterTop = heaterY + 0.085;
  const inset = 0.31;
  const anchorInset = 0.14;
  const rodThickness = 0.022;
  const hangerMaterial = frameMaterial.clone();
  hangerMaterial.color.offsetHSL(0, -0.03, 0.03);

  const makeRod = (start, end) => {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const rod = box(rodThickness, length, rodThickness, hangerMaterial);
    rod.position.copy(start).add(end).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    group.add(rod);
  };

  if (side === 'front' || side === 'back') {
    const z = side === 'front' ? depth / 2 - inset : -depth / 2 + inset;
    const anchorZ = side === 'front' ? depth / 2 - anchorInset : -depth / 2 + anchorInset;
    const rail = box(0.76, rodThickness, 0.045, hangerMaterial);
    rail.position.set(0, heaterTop + 0.004, z);
    group.add(rail);
    [-0.31, 0.31].forEach((xOffset) => {
      makeRod(
        new THREE.Vector3(xOffset, heaterTop + 0.008, z),
        new THREE.Vector3(xOffset * 0.65, beamBottom, anchorZ),
      );
    });
  } else {
    const x = side === 'right' ? width / 2 - inset : -width / 2 + inset;
    const anchorX = side === 'right' ? width / 2 - anchorInset : -width / 2 + anchorInset;
    const rail = box(0.045, rodThickness, 0.76, hangerMaterial);
    rail.position.set(x, heaterTop + 0.004, 0);
    group.add(rail);
    [-0.31, 0.31].forEach((zOffset) => {
      makeRod(
        new THREE.Vector3(x, heaterTop + 0.008, zOffset),
        new THREE.Vector3(anchorX, beamBottom, zOffset * 0.65),
      );
    });
  }
}


function addHeaters(group, selectedSides, width, depth, height, beamHeight, frameMaterial, assets) {
  const inset = 0.31;
  Object.entries(selectedSides).forEach(([side, selected]) => {
    if (!selected) return;

    const heaterY = height - beamHeight - 0.235;
    const heater = cloneFittedAsset(assets, 'heater', new THREE.Vector3(0.92, 0.18, 0.17));
    if (!heater) return;
    styleHeater(heater);

    if (side === 'front') {
      heater.position.set(0, heaterY, depth / 2 - inset);
      heater.rotation.y = Math.PI;
    } else if (side === 'back') {
      heater.position.set(0, heaterY, -depth / 2 + inset);
      heater.rotation.y = 0;
    } else if (side === 'left') {
      heater.position.set(-width / 2 + inset, heaterY, 0);
      heater.rotation.y = Math.PI / 2;
    } else {
      heater.position.set(width / 2 - inset, heaterY, 0);
      heater.rotation.y = -Math.PI / 2;
    }

    group.add(heater);
    addHeaterBrackets(group, side, width, depth, height, beamHeight, heaterY, frameMaterial);
  });
}


function sensorPosition(position, width, depth, height) {
  const inset = 0.095;
  const xPositions = {
    left: -width / 2 + inset,
    center: 0,
    right: width / 2 - inset,
  };
  const zPositions = {
    front: depth / 2 - inset,
    center: 0,
    back: -depth / 2 + inset,
  };

  const [first, second] = position.split('-');
  const vector = first === 'front' || first === 'back'
    ? new THREE.Vector3(xPositions[second], height + 0.035, zPositions[first])
    : new THREE.Vector3(xPositions[first], height + 0.035, zPositions.center);
  return vector;
}


function styleWeatherSensor(model, type) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.material = type === 'rain'
      ? material(/cap|grid/i.test(child.name) ? '#e8eceb' : '#263238', { roughness: 0.45, metalness: 0.35 })
      : material(/arm/i.test(child.name) ? '#98a4a9' : '#222a2e', { roughness: 0.42, metalness: 0.5 });
  });
}

function addSensors(group, sensors, width, depth, height, assets) {
  const mountMaterial = material('#2b353a', { roughness: 0.38, metalness: 0.68 });

  const addSensor = (type, key, size) => {
    const config = sensors[type];
    if (!config.enabled) return;
    const position = sensorPosition(config.position, width, depth, height);
    const plate = box(0.16, 0.025, 0.16, mountMaterial);
    plate.position.set(position.x, height + 0.012, position.z);
    group.add(plate);

    const sensor = cloneFittedAsset(assets, key, size, 'bottom');
    if (!sensor) return;
    styleWeatherSensor(sensor, type);
    sensor.position.copy(position);
    group.add(sensor);
  };

  addSensor('rain', 'rainSensor', new THREE.Vector3(0.16, 0.105, 0.16));
  addSensor('wind', 'windSensor', new THREE.Vector3(0.27, 0.31, 0.28));
}


function poleCoordinates(state, width, depth, postSize) {
  const grid = getPoleGrid(state);
  const xLeft = -width / 2 + postSize / 2;
  const xRight = width / 2 - postSize / 2;
  const zFront = depth / 2 - postSize / 2;
  const zBack = -depth / 2 + postSize / 2;
  const coordinates = {};
  grid.poles.forEach((pole) => {
    const x = THREE.MathUtils.lerp(xLeft, xRight, pole.xRatio);
    const z = THREE.MathUtils.lerp(zFront, zBack, pole.zRatio);
    coordinates[pole.id] = new THREE.Vector3(x, 0, z);
  });
  return coordinates;
}

function faceVector(face) {
  return {
    front: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    back: new THREE.Vector3(0, 0, -1),
    left: new THREE.Vector3(-1, 0, 0),
  }[face];
}

function faceRotation(face) {
  return {
    front: 0,
    right: Math.PI / 2,
    back: Math.PI,
    left: -Math.PI / 2,
  }[face];
}

function placeOnPole(model, base, face, height, postSize, depthOffset = 0.018) {
  const outward = faceVector(face);
  model.position.copy(base).addScaledVector(outward, postSize / 2 + depthOffset);
  model.position.y = height;
  model.rotation.y = faceRotation(face);
}

function styleSpeakerModel(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.material = material(/grille|driver/i.test(child.name) ? '#3b454a' : '#171d20', {
      roughness: 0.44,
      metalness: 0.45,
    });
  });
}


function buildOutletModel(type) {
  const outlet = new THREE.Group();
  const plateMaterial = material('#f0f1ed', { roughness: 0.64, metalness: 0.06 });
  const insertMaterial = material('#f7f7f4', { roughness: 0.58, metalness: 0.04 });
  const holeMaterial = material('#1e2529', { roughness: 0.88, metalness: 0.02 });

  const basePlate = box(0.108, 0.148, 0.012, plateMaterial, { castShadow: false });
  outlet.add(basePlate);
  const innerPlate = box(0.082, 0.122, 0.006, insertMaterial, { castShadow: false });
  innerPlate.position.z = 0.009;
  outlet.add(innerPlate);

  const addHoleCylinder = (radius, x, y) => {
    const hole = cylinder(radius, 0.004, holeMaterial, 20);
    hole.rotation.z = Math.PI / 2;
    hole.position.set(x, y, 0.0135);
    outlet.add(hole);
  };

  const addHoleSlot = (w, h, x, y, rotation = 0) => {
    const slot = box(w, h, 0.004, holeMaterial, { castShadow: false });
    slot.position.set(x, y, 0.0135);
    slot.rotation.z = rotation;
    outlet.add(slot);
  };

  if (type === 'us') {
    const socketYs = [0.031, -0.031];
    socketYs.forEach((centerY) => {
      const bezel = box(0.047, 0.043, 0.0035, material('#ebece8', { roughness: 0.55, metalness: 0.03 }), { castShadow: false });
      bezel.position.set(0, centerY, 0.0122);
      outlet.add(bezel);
      addHoleSlot(0.007, 0.018, -0.011, centerY + 0.002, 0);
      addHoleSlot(0.007, 0.018, 0.011, centerY + 0.002, 0);
      addHoleCylinder(0.0045, 0, centerY - 0.010);
    });
  } else {
    const bezel = box(0.055, 0.055, 0.0035, material('#ebece8', { roughness: 0.55, metalness: 0.03 }), { castShadow: false });
    bezel.position.set(0, 0.006, 0.0122);
    outlet.add(bezel);
    addHoleCylinder(0.0068, -0.015, 0.006);
    addHoleCylinder(0.0068, 0.015, 0.006);
    addHoleSlot(0.009, 0.018, 0, -0.012, 0);
    const earthLip = box(0.038, 0.006, 0.003, material('#c8cbc7', { roughness: 0.6 }), { castShadow: false });
    earthLip.position.set(0, 0.032, 0.012);
    outlet.add(earthLip);
  }
  return outlet;
}

function styleAutomationAsset(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.material = material(/button/i.test(child.name) ? '#0878c9' : /face/i.test(child.name) ? '#eceeea' : '#566168', {
      roughness: /metal|rod|eye|grip/i.test(child.name) ? 0.28 : 0.58,
      metalness: /metal|rod|eye/i.test(child.name) ? 0.75 : 0.12,
    });
  });
}

function addMotorizedAutomation(group, state, width, depth, height) {
  if (state.automation === 'manual') return;
  const motorMaterial = material('#111719', { roughness: 0.35, metalness: 0.75 });
  const motor = box(0.34, 0.13, 0.13, motorMaterial);
  motor.position.set(width / 2 - 0.32, height - 0.11, -depth / 2 + 0.13);
  group.add(motor);
}

function addPoleMounts(group, state, width, depth, height, postSize, assets) {
  const coordinates = poleCoordinates(state, width, depth, postSize);

  Object.entries(state.poleMounts ?? {}).forEach(([pole, faces]) => {
    if (!poleIsAvailable(state, pole) || !coordinates[pole]) return;
    Object.entries(faces ?? {}).forEach(([face, mounts]) => {
      if (!poleFaceIsAvailable(state, pole, face)) return;
      Object.values(mounts ?? {}).forEach((mount) => {
        if (!mount) return;
        const mountHeight = height * (Number(mount.height) / 100);
        let model = null;
        let depthOffset = 0.02;

        if (mount.type === 'speaker') {
          model = cloneFittedAsset(assets, 'speaker', new THREE.Vector3(0.17, 0.24, 0.16));
          if (model) styleSpeakerModel(model);
          depthOffset = 0.045;
        } else if (mount.type === 'outlet') {
          model = buildOutletModel(mount.outletType === 'us' ? 'us' : 'eu');
          depthOffset = 0.006;
        } else if (mount.type === 'hand-crank') {
          model = cloneFittedAsset(assets, 'handCrank', new THREE.Vector3(0.23, 0.78, 0.12));
          if (model) styleAutomationAsset(model);
          depthOffset = 0.07;
        } else if (mount.type === 'switch') {
          model = cloneFittedAsset(assets, 'wallSwitch', new THREE.Vector3(0.085, 0.14, 0.045));
          if (model) styleAutomationAsset(model);
          depthOffset = 0.025;
        }

        if (!model) return;
        placeOnPole(model, coordinates[pole], face, mountHeight, postSize, depthOffset);
        group.add(model);
      });
    });
  });
}


export function buildPergola(state, assets = null) {
  const group = new THREE.Group();
  group.name = 'Pergola';

  const width = state.dimensions.width * METERS_PER_MM;
  const depth = state.dimensions.depth * METERS_PER_MM;
  const height = state.dimensions.height * METERS_PER_MM;

  const isPremium = state.model === 'premium';
  const postSize = state.model === 'lite' ? 0.115 : state.model === 'comfort' ? 0.135 : 0.15;
  const beamHeight = state.model === 'lite' ? 0.16 : state.model === 'comfort' ? 0.19 : 0.215;
  const beamDepth = state.model === 'lite' ? 0.13 : 0.155;
  const frameMaterial = material(state.roof.frameColor, {
    roughness: 0.36,
    metalness: 0.78,
  });
  const louverMaterial = material(state.roof.louverColor, {
    roughness: 0.38,
    metalness: 0.72,
  });

  const grid = getPoleGrid(state);
  const coordinates = poleCoordinates(state, width, depth, postSize);
  Object.entries(coordinates).forEach(([key, position]) => {
    if (!poleIsAvailable(state, key)) return;
    addPost(group, position.x, position.z, height, postSize, frameMaterial, isPremium);
  });

  const beamY = height - beamHeight / 2;
  for (let row = 0; row < grid.rows; row += 1) {
    const rowPole = grid.poles.find((item) => item.row === row && item.column === 0);
    const z = coordinates[rowPole?.id]?.z ?? 0;
    addBeam(group, new THREE.Vector3(0, beamY, z), new THREE.Vector3(width, beamHeight, beamDepth), frameMaterial, isPremium);
  }
  for (let column = 0; column < grid.columns; column += 1) {
    const columnPole = grid.poles.find((item) => item.row === 0 && item.column === column);
    const x = coordinates[columnPole?.id]?.x ?? 0;
    addBeam(group, new THREE.Vector3(x, beamY, 0), new THREE.Vector3(beamDepth, beamHeight, depth), frameMaterial, isPremium);
  }

  addLouvers(group, state, width, depth, height - beamHeight - 0.015, louverMaterial);
  addDrainage(group, state, width, depth, height);
  addSideClosings(group, state, width, depth, height, postSize, frameMaterial, assets);
  addMotorizedAutomation(group, state, width, depth, height);

  const isNight = Boolean(state.environment?.night);
  if (state.accessories.perimeterLed.enabled) {
    addPerimeterLed(group, width, depth, height, state.accessories.perimeterLed, assets, isNight);
  }
  addSpotlights(group, state.accessories.spotlights, width, depth, height, beamHeight, frameMaterial, assets, isNight);
  addHeaters(
    group,
    state.accessories.heaters,
    width,
    depth,
    height,
    beamHeight,
    frameMaterial,
    assets,
  );
  addSensors(group, state.accessories.sensors, width, depth, height, assets);
  addPoleMounts(group, state, width, depth, height, postSize, assets);

  group.userData.dimensions = { width, depth, height };
  group.userData.postSize = postSize;
  return group;
}
