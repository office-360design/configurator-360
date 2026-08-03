import * as THREE from 'three';
import { fitAssetToBox } from './AssetLibrary.js';
import { poleIsAvailable } from '../state.js';

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

function sideTransform(side, width, depth, height) {
  const top = height - 0.24;
  const bottom = 0.12;
  const usableHeight = top - bottom;

  if (side === 'front') {
    return {
      span: width - 0.26,
      position: new THREE.Vector3(0, bottom + usableHeight / 2, depth / 2 - 0.075),
      rotationY: 0,
      usableHeight,
    };
  }
  if (side === 'back') {
    return {
      span: width - 0.26,
      position: new THREE.Vector3(0, bottom + usableHeight / 2, -depth / 2 + 0.075),
      rotationY: Math.PI,
      usableHeight,
    };
  }
  if (side === 'left') {
    return {
      span: depth - 0.26,
      position: new THREE.Vector3(-width / 2 + 0.075, bottom + usableHeight / 2, 0),
      rotationY: Math.PI / 2,
      usableHeight,
    };
  }
  return {
    span: depth - 0.26,
    position: new THREE.Vector3(width / 2 - 0.075, bottom + usableHeight / 2, 0),
    rotationY: -Math.PI / 2,
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

function addPrivacyWall(container, transform, frameMaterial) {
  const slatMaterial = frameMaterial.clone();
  slatMaterial.color.offsetHSL(0, -0.02, 0.06);
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

function addSideClosings(group, state, width, depth, height, frameMaterial, assets) {
  Object.entries(state.sides).forEach(([side, config]) => {
    if (!config || config.type === 'none') return;
    if (state.installation === 'wall-mounted' && side === state.mountedSide) return;

    const transform = sideTransform(side, width, depth, height);
    const container = new THREE.Group();
    container.position.copy(transform.position);
    container.rotation.y = transform.rotationY;

    if (SCREEN_TYPES.includes(config.type)) {
      addScreen(container, transform, config, config.type === 'motorized-screen', assets);
    } else if (config.type === 'privacy-wall') {
      addPrivacyWall(container, transform, frameMaterial);
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

function addPerimeterLed(group, width, depth, height, ledConfig, assets) {
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
      return;
    }

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

function addSpotlights(group, count, width, depth, height, assets) {
  if (count <= 0) return;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  let created = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (created >= count) break;
      const x = columns === 1 ? 0 : THREE.MathUtils.lerp(-width * 0.32, width * 0.32, column / (columns - 1));
      const z = rows === 1 ? 0 : THREE.MathUtils.lerp(-depth * 0.28, depth * 0.28, row / (rows - 1));
      const model = cloneFittedAsset(assets, 'spotlight', new THREE.Vector3(0.14, 0.055, 0.14));
      if (model) {
        styleSpotlight(model);
        model.position.set(x, height - 0.255, z);
        group.add(model);
      } else {
        const body = cylinder(0.055, 0.035, material('#111719'), 20);
        body.position.set(x, height - 0.24, z);
        group.add(body);
      }
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
  const beamBottom = height - beamHeight;
  const heaterTop = heaterY + 0.09;
  const bracketHeight = Math.max(0.08, beamBottom - heaterTop);
  const bracketY = heaterTop + bracketHeight / 2;
  const barSize = 0.025;

  if (side === 'front' || side === 'back') {
    const z = side === 'front' ? depth / 2 - 0.16 : -depth / 2 + 0.16;
    [-0.28, 0.28].forEach((xOffset) => {
      const bracket = box(barSize, bracketHeight, barSize, frameMaterial);
      bracket.position.set(xOffset, bracketY, z);
      group.add(bracket);
    });
    const rail = box(0.72, barSize, barSize, frameMaterial);
    rail.position.set(0, beamBottom - barSize / 2, z);
    group.add(rail);
  } else {
    const x = side === 'right' ? width / 2 - 0.16 : -width / 2 + 0.16;
    [-0.28, 0.28].forEach((zOffset) => {
      const bracket = box(barSize, bracketHeight, barSize, frameMaterial);
      bracket.position.set(x, bracketY, zOffset);
      group.add(bracket);
    });
    const rail = box(barSize, barSize, 0.72, frameMaterial);
    rail.position.set(x, beamBottom - barSize / 2, 0);
    group.add(rail);
  }
}

function addHeaters(group, selectedSides, width, depth, height, beamHeight, frameMaterial, assets) {
  Object.entries(selectedSides).forEach(([side, selected]) => {
    if (!selected) return;

    const heaterY = height - beamHeight - 0.34;
    const heater = cloneFittedAsset(assets, 'heater', new THREE.Vector3(0.92, 0.18, 0.17));
    if (!heater) return;
    styleHeater(heater);

    if (side === 'front') {
      heater.position.set(0, heaterY, depth / 2 - 0.16);
      heater.rotation.y = 0;
    } else if (side === 'back') {
      heater.position.set(0, heaterY, -depth / 2 + 0.16);
      heater.rotation.y = Math.PI;
    } else if (side === 'left') {
      heater.position.set(-width / 2 + 0.16, heaterY, 0);
      heater.rotation.y = Math.PI / 2;
    } else {
      heater.position.set(width / 2 - 0.16, heaterY, 0);
      heater.rotation.y = -Math.PI / 2;
    }

    group.add(heater);
    addHeaterBrackets(group, side, width, depth, height, beamHeight, heaterY, frameMaterial);
  });
}

function sensorPosition(position, width, depth, height) {
  const inset = 0.27;
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
  if (first === 'front' || first === 'back') {
    return new THREE.Vector3(xPositions[second], height + 0.04, zPositions[first]);
  }
  return new THREE.Vector3(xPositions[first], height + 0.04, zPositions.center);
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
  if (sensors.rain.enabled) {
    const sensor = cloneFittedAsset(assets, 'rainSensor', new THREE.Vector3(0.17, 0.12, 0.17), 'bottom');
    if (sensor) {
      styleWeatherSensor(sensor, 'rain');
      sensor.position.copy(sensorPosition(sensors.rain.position, width, depth, height));
      group.add(sensor);
    }
  }

  if (sensors.wind.enabled) {
    const sensor = cloneFittedAsset(assets, 'windSensor', new THREE.Vector3(0.28, 0.34, 0.28), 'bottom');
    if (sensor) {
      styleWeatherSensor(sensor, 'wind');
      sensor.position.copy(sensorPosition(sensors.wind.position, width, depth, height));
      group.add(sensor);
    }
  }
}

function poleCoordinates(width, depth, postSize) {
  const x = width / 2 - postSize / 2;
  const z = depth / 2 - postSize / 2;
  return {
    frontLeft: new THREE.Vector3(-x, 0, z),
    frontRight: new THREE.Vector3(x, 0, z),
    backLeft: new THREE.Vector3(-x, 0, -z),
    backRight: new THREE.Vector3(x, 0, -z),
  };
}

function addSpeakers(group, state, width, depth, height, postSize, assets) {
  const coordinates = poleCoordinates(width, depth, postSize);
  Object.entries(state.accessories.speakers).forEach(([pole, selected]) => {
    if (!selected || !poleIsAvailable(state, pole)) return;
    const model = cloneFittedAsset(assets, 'speaker', new THREE.Vector3(0.17, 0.24, 0.12));
    if (!model) return;

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = material(/grille|driver/i.test(child.name) ? '#3b454a' : '#171d20', {
        roughness: 0.44,
        metalness: 0.45,
      });
    });

    const base = coordinates[pole];
    const isFront = pole.startsWith('front');
    const innerZ = isFront ? -1 : 1;
    model.position.set(base.x, height - 0.5, base.z + innerZ * (postSize / 2 + 0.07));
    model.rotation.y = isFront ? Math.PI : 0;
    group.add(model);
  });
}

function addOutlets(group, state, width, depth, height, postSize, assets) {
  const coordinates = poleCoordinates(width, depth, postSize);
  const faceVectors = {
    front: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    back: new THREE.Vector3(0, 0, -1),
    left: new THREE.Vector3(-1, 0, 0),
  };
  const faceRotations = {
    front: 0,
    right: Math.PI / 2,
    back: Math.PI,
    left: -Math.PI / 2,
  };

  Object.entries(state.accessories.outlets).forEach(([pole, faces]) => {
    if (!poleIsAvailable(state, pole)) return;
    Object.entries(faces).forEach(([face, level]) => {
      if (!level) return;
      const model = cloneFittedAsset(assets, 'outlet', new THREE.Vector3(0.11, 0.15, 0.03));
      if (!model) return;
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.material = material(/hole/i.test(child.name) ? '#1e2529' : '#e7e9e6', {
          roughness: 0.6,
          metalness: 0.12,
        });
      });

      const outward = faceVectors[face];
      const base = coordinates[pole];
      const ratio = Number(level) / 100;
      model.position.copy(base).addScaledVector(outward, postSize / 2 + 0.018);
      model.position.y = height * ratio;
      model.rotation.y = faceRotations[face];
      group.add(model);
    });
  });
}

function addAutomation(group, state, width, depth, height) {
  if (state.automation === 'manual') {
    const crankMaterial = material('#c4c8ca', { roughness: 0.25, metalness: 0.8 });
    const rod = cylinder(0.012, 0.8, crankMaterial, 10);
    rod.position.set(width / 2 - 0.16, height - 0.67, depth / 2 - 0.17);
    group.add(rod);
    const handle = cylinder(0.012, 0.16, crankMaterial, 10);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(width / 2 - 0.08, height - 1.06, depth / 2 - 0.17);
    group.add(handle);
  } else {
    const motorMaterial = material('#111719', { roughness: 0.35, metalness: 0.75 });
    const motor = box(0.34, 0.13, 0.13, motorMaterial);
    motor.position.set(width / 2 - 0.32, height - 0.11, -depth / 2 + 0.13);
    group.add(motor);
    if (state.automation === 'wall-switch') {
      const switchBox = box(0.06, 0.11, 0.025, material('#eceeea', { roughness: 0.7, metalness: 0 }));
      switchBox.position.set(width / 2 - 0.09, 1.25, depth / 2 - 0.09);
      group.add(switchBox);
    }
  }
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

  const coordinates = poleCoordinates(width, depth, postSize);
  Object.entries(coordinates).forEach(([key, position]) => {
    if (!poleIsAvailable(state, key)) return;
    addPost(group, position.x, position.z, height, postSize, frameMaterial, isPremium);
  });

  const beamY = height - beamHeight / 2;
  addBeam(group, new THREE.Vector3(0, beamY, depth / 2 - beamDepth / 2), new THREE.Vector3(width, beamHeight, beamDepth), frameMaterial, isPremium);
  addBeam(group, new THREE.Vector3(0, beamY, -depth / 2 + beamDepth / 2), new THREE.Vector3(width, beamHeight, beamDepth), frameMaterial, isPremium);
  addBeam(group, new THREE.Vector3(width / 2 - beamDepth / 2, beamY, 0), new THREE.Vector3(beamDepth, beamHeight, depth), frameMaterial, isPremium);
  addBeam(group, new THREE.Vector3(-width / 2 + beamDepth / 2, beamY, 0), new THREE.Vector3(beamDepth, beamHeight, depth), frameMaterial, isPremium);

  if (state.model !== 'lite' && Math.max(width, depth) > 5.5) {
    const centerBeam = state.roof.orientation === 'width'
      ? box(beamDepth, beamHeight * 0.72, depth - beamDepth * 2, frameMaterial)
      : box(width - beamDepth * 2, beamHeight * 0.72, beamDepth, frameMaterial);
    centerBeam.position.set(0, height - beamHeight * 0.56, 0);
    group.add(centerBeam);
  }

  addLouvers(group, state, width, depth, height - beamHeight - 0.015, louverMaterial);
  addDrainage(group, state, width, depth, height);
  addSideClosings(group, state, width, depth, height, frameMaterial, assets);
  addAutomation(group, state, width, depth, height);

  if (state.accessories.perimeterLed.enabled) {
    addPerimeterLed(group, width, depth, height, state.accessories.perimeterLed, assets);
  }
  addSpotlights(group, state.accessories.spotlights, width, depth, height, assets);
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
  addSpeakers(group, state, width, depth, height, postSize, assets);
  addOutlets(group, state, width, depth, height, postSize, assets);

  group.userData.dimensions = { width, depth, height };
  group.userData.postSize = postSize;
  return group;
}
