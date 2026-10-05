import { validateLayout, splitLayoutInPlace } from '../js/roofLayout.js';

// L-shaped junction matching the reported case: the small ridge is at 1 m,
// while the main wing rises 1.5 m over a 2.5 m horizontal run.
export function alignmentFixture() {
  const source = validateLayout({
    version: 1,
    vertices: [
      { x: 0, z: 0, h: 0 }, { x: 6, z: 0, h: 0 },
      { x: 6, z: -3, h: 0 }, { x: 8, z: -3, h: 1 },
      { x: 10, z: -3, h: 0 }, { x: 10, z: 0, h: 0 },
      { x: 10, z: 2.5, h: 1.5 }, { x: 10, z: 5, h: 0 },
      { x: 8, z: 5, h: 0 }, { x: 0, z: 5, h: 0 },
      { x: 0, z: 2.5, h: 1.5 }, { x: 8, z: 1.25, h: 1.5 },
    ],
    boundary: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    faces: [[0, 1, 11, 6, 10], [1, 2, 3, 11], [3, 4, 5, 11], [5, 6, 11], [10, 6, 7, 8, 9]],
  });
  const { layout, copies } = splitLayoutInPlace(source, [11], [1, 2]);
  layout.vertices[copies[0]].h = 1;
  return { layout, pointId: copies[0] };
}
