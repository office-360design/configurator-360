import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const LINE_COLOR = 0x4f5963;

function labelObject(text) {
  const element = document.createElement('div');
  element.className = 'dimension-label';
  element.textContent = text;
  return new CSS2DObject(element);
}

function segment(points, material) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function addDimension(group, start, end, tickA, tickB, label, labelOffset = new THREE.Vector3()) {
  const material = new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0.8 });
  group.add(segment([start, end], material));
  group.add(segment([start.clone().sub(tickA), start.clone().add(tickA)], material));
  group.add(segment([end.clone().sub(tickB), end.clone().add(tickB)], material));

  const text = labelObject(label);
  text.position.copy(start).add(end).multiplyScalar(0.5).add(labelOffset);
  group.add(text);
}

export function createDimensions(state, ridgeElevation) {
  const group = new THREE.Group();
  group.name = 'dimensions';
  const halfL = state.length / 2;
  const halfD = state.depth / 2;
  const margin = 1.05;
  const tick = 0.16;

  addDimension(
    group,
    new THREE.Vector3(-halfL, 0.07, -halfD - margin),
    new THREE.Vector3(halfL, 0.07, -halfD - margin),
    new THREE.Vector3(0, 0, tick),
    new THREE.Vector3(0, 0, tick),
    `L ${state.length.toFixed(1)} m`,
    new THREE.Vector3(0, 0.16, 0),
  );

  addDimension(
    group,
    new THREE.Vector3(halfL + margin, 0.07, -halfD),
    new THREE.Vector3(halfL + margin, 0.07, halfD),
    new THREE.Vector3(tick, 0, 0),
    new THREE.Vector3(tick, 0, 0),
    `D ${state.depth.toFixed(1)} m`,
    new THREE.Vector3(0, 0.16, 0),
  );

  addDimension(
    group,
    new THREE.Vector3(-halfL - margin * 0.72, 0, halfD + margin * 0.45),
    new THREE.Vector3(-halfL - margin * 0.72, ridgeElevation, halfD + margin * 0.45),
    new THREE.Vector3(tick, 0, 0),
    new THREE.Vector3(tick, 0, 0),
    `H ${ridgeElevation.toFixed(2)} m`,
    new THREE.Vector3(-0.15, 0, 0),
  );

  const pitchLabel = labelObject(`${state.pitch}°`);
  pitchLabel.position.set(0, ridgeElevation + 0.45, 0);
  group.add(pitchLabel);

  return group;
}
