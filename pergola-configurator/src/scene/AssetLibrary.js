import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_URLS = Object.freeze({
  house: './assets/models/environment/house.glb',
  tree: './assets/models/environment/tree.glb',
  ledStrip: './assets/models/accessories/led-strip.glb',
  spotlight: './assets/models/accessories/spotlight.glb',
  heater: './assets/models/accessories/heater.glb',
  rainSensor: './assets/models/accessories/rain-sensor.glb',
  windSensor: './assets/models/accessories/wind-sensor.glb',
  speaker: './assets/models/accessories/speaker.glb',
  outlet: './assets/models/accessories/outlet.glb',
  screenCassette: './assets/models/accessories/screen-cassette.glb',
});

function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map((item) => item.clone());
  return material?.clone?.() ?? material;
}

function makeIndependentClone(source) {
  const clone = source.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry = child.geometry?.clone?.() ?? child.geometry;
    child.material = cloneMaterial(child.material);
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return clone;
}

export function fitAssetToBox(object, targetSize, options = {}) {
  const wrapper = new THREE.Group();
  wrapper.name = `${object.name || 'asset'}-fitted`;
  wrapper.add(object);

  const sourceBox = new THREE.Box3().setFromObject(object);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const safe = (value) => Math.max(0.0001, value);

  object.scale.multiply(new THREE.Vector3(
    targetSize.x / safe(sourceSize.x),
    targetSize.y / safe(sourceSize.y),
    targetSize.z / safe(sourceSize.z),
  ));
  object.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(object);
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
  const alignY = options.alignY ?? 'center';
  const targetY = alignY === 'bottom'
    ? -fittedBox.min.y
    : alignY === 'top'
      ? -fittedBox.max.y
      : -fittedCenter.y;

  object.position.add(new THREE.Vector3(
    -fittedCenter.x,
    targetY,
    -fittedCenter.z,
  ));
  object.updateMatrixWorld(true);
  return wrapper;
}

export function tintAsset(object, color, materialNamePattern = null) {
  const tint = new THREE.Color(color);
  object.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((item) => {
      if (!item?.color) return;
      if (materialNamePattern && !materialNamePattern.test(`${child.name} ${item.name}`)) return;
      item.color.copy(tint);
      if (item.emissive && /led|lens|element|glow|diffuser/i.test(`${child.name} ${item.name}`)) {
        item.emissive.copy(tint);
      }
      item.needsUpdate = true;
    });
  });
  return object;
}

export class AssetLibrary {
  constructor() {
    this.loader = new GLTFLoader();
    this.sources = new Map();
    this.errors = new Map();
    this.ready = this.loadAll();
  }

  async loadAll() {
    await Promise.all(Object.entries(ASSET_URLS).map(async ([key, url]) => {
      try {
        const gltf = await this.loader.loadAsync(url);
        this.sources.set(key, gltf.scene);
      } catch (error) {
        this.errors.set(key, error);
        console.warn(`3D asset "${key}" could not be loaded from ${url}.`, error);
      }
    }));
    return this;
  }

  has(key) {
    return this.sources.has(key);
  }

  clone(key) {
    const source = this.sources.get(key);
    return source ? makeIndependentClone(source) : null;
  }

  dispose() {
    this.sources.forEach((source) => {
      source.traverse((child) => {
        child.geometry?.dispose?.();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((item) => item?.dispose?.());
      });
    });
    this.sources.clear();
    this.errors.clear();
  }
}
