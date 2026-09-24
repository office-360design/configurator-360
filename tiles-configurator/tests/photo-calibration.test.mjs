import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calibratePhotoCamera,
  projectCalibratedPoint,
  validCalibrationQuad,
} from '../js/photoCalibration.js';

const near = (a, b, tolerance = 1e-5) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('rejects collapsed and crossed calibration quadrilaterals', () => {
  assert.equal(validCalibrationQuad([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }]), false);
  assert.equal(validCalibrationQuad([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }]), false);
});

test('front-facing square calibrates and reproduces its four image corners', () => {
  const width = 1000,
    height = 600,
    corners = [
      { x: 420, y: 220 },
      { x: 580, y: 220 },
      { x: 580, y: 380 },
      { x: 420, y: 380 },
    ],
    calibration = calibratePhotoCamera(corners, width, height);
  assert.ok(calibration);
  const world = [
    { x: -0.5, y: 0, z: -0.5 },
    { x: 0.5, y: 0, z: -0.5 },
    { x: 0.5, y: 0, z: 0.5 },
    { x: -0.5, y: 0, z: 0.5 },
  ];
  world.forEach((point, i) => {
    const projected = projectCalibratedPoint(calibration, width, height, point);
    near(projected.x, corners[i].x);
    near(projected.y, corners[i].y);
  });
});

test('perspective quadrilateral keeps the known 1 m square registration', () => {
  const width = 1000,
    height = 600,
    corners = [
      { x: 469.17899716768414, y: 257.1177775756086 },
      { x: 575.0088205130554, y: 280.8314489623688 },
      { x: 536.0197262016221, y: 350.1153683754935 },
      { x: 419.8181573825959, y: 320.49052007470914 },
    ],
    calibration = calibratePhotoCamera(corners, width, height);
  assert.ok(calibration);
  near(calibration.focal, 800, 1e-5);
  const world = [
    { x: -0.5, y: 0, z: -0.5 },
    { x: 0.5, y: 0, z: -0.5 },
    { x: 0.5, y: 0, z: 0.5 },
    { x: -0.5, y: 0, z: 0.5 },
  ];
  world.forEach((point, i) => {
    const projected = projectCalibratedPoint(calibration, width, height, point);
    near(projected.x, corners[i].x, 1e-4);
    near(projected.y, corners[i].y, 1e-4);
  });
});
