import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultLayout, footprintLayout, splitSurface, layoutMetrics, validateLayout,
  insertPoint, cloneLayout, pitchedFootprint, lShapedLayout, roofSurfaceGroups,
} from '../js/roofLayout.js';
const rectangle = () => footprintLayout([
  { x: -5, z: -3 }, { x: 5, z: -3 }, { x: 5, z: 3 }, { x: -5, z: 3 },
]);
test('gable area is the analytical sum of its two slopes', () => {
  const result = layoutMetrics(defaultLayout());
  assert.equal(result.footprint, 70);
  assert.ok(Math.abs(result.roofArea - 20 * Math.hypot(3.5, 2)) < 1e-9);
});
test('concave footprint triangulation preserves area in either winding', () => {
  const points = [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 7 }, { x: 0, z: 7 }];
  for (const ring of [points, [...points].reverse()]) {
    const metrics = layoutMetrics(footprintLayout(ring));
    assert.equal(metrics.footprint, 36);
    assert.equal(metrics.roofArea, 36);
  }
});
test('division inserts shared endpoints and preserves source', () => {
  const original = rectangle();
  const next = splitSurface(original, [{ x: -5, z: 0 }, { x: 5, z: 0 }]);
  assert.equal(original.vertices.length, 4);
  assert.equal(next.faces.length, 2);
  for (const id of [4, 5]) {
    assert.equal(next.faces.filter(face => face.includes(id)).length, 2);
    next.vertices[id].h = 2;
  }
  assert.ok(Math.abs(layoutMetrics(next).roofArea - 20 * Math.hypot(3, 2)) < 1e-9);
});
test('multi-segment ridge works and can be divided again', () => {
  let next = splitSurface(rectangle(), [{ x: -5, z: 0 }, { x: -2, z: 0 }, { x: 2, z: 0 }, { x: 5, z: 0 }]);
  next = splitSurface(next, [{ x: -5, z: -3 }, { x: -2, z: 0 }]);
  assert.equal(next.faces.length, 3);
  assert.equal(layoutMetrics(next).roofArea, 60);
});
test('edge insertion updates all incident faces and interpolates height', () => {
  const next = defaultLayout();
  const id = insertPoint(next, { x: 0, z: 0 });
  assert.equal(next.vertices[id].h, 2);
  assert.equal(next.faces.filter(face => face.includes(id)).length, 2);
  validateLayout(next);
});
test('consecutive slopes retain all shared boundaries', () => {
  let next = rectangle();
  for (const x of [-2, 0, 2]) next = splitSurface(next, [{ x, z: -3 }, { x, z: 3 }]);
  next.vertices.forEach(p => { p.h = Math.abs(p.x) === 2 ? 2 : 0; });
  assert.equal(next.faces.length, 4);
  assert.ok(layoutMetrics(next).roofArea > 60);
});
test('rejects crossing perimeter, zero area, external cuts and invalid heights', () => {
  assert.throws(() => footprintLayout([{ x: 0, z: 0 }, { x: 5, z: 5 }, { x: 0, z: 5 }, { x: 5, z: 0 }]));
  assert.throws(() => footprintLayout([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }]));
  assert.throws(() => splitSurface(rectangle(), [{ x: -5, z: 0 }, { x: 0, z: 8 }, { x: 5, z: 0 }]));
  const next = defaultLayout();
  next.vertices[0].h = NaN;
  assert.throws(() => validateLayout(next));
});
test('restore rejects gaps, duplicates, invalid indices and crossing edits', () => {
  for (const edit of [
    l => l.faces.pop(), l => l.faces.push([...l.faces[0]]),
    l => l.faces[0].push(999), l => { l.vertices[2].x = -8; },
  ]) {
    const layout = cloneLayout(defaultLayout());
    edit(layout);
    assert.throws(() => validateLayout(layout));
  }
});
test('JSON round-trip preserves topology, heights and area', () => {
  const source = defaultLayout();
  const restored = validateLayout(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(layoutMetrics(source), layoutMetrics(restored));
});


test('drawn rectangle starts with two pitched surfaces and a raised ridge', () => {
  const source = rectangle();
  const roof = pitchedFootprint(source.vertices, 30);
  assert.equal(roof.faces.length, 2);
  assert.ok(Math.abs(Math.max(...roof.vertices.map(p => p.h)) - 3 * Math.tan(Math.PI / 6)) < 1e-8);
  assert.ok(Math.abs(layoutMetrics(roof).roofArea - 60 / Math.cos(Math.PI / 6)) < 1e-7);
});

test('pitched concave outlines handle boundary-aligned and disconnected ridge intervals', () => {
  const outlines = [
    [[-5,-4],[5,-4],[5,0],[0,0],[0,4],[-5,4]],
    [[-6,-4],[6,-4],[6,4],[2,4],[2,-2],[-2,-2],[-2,4],[-6,4]],
    [[0,0],[8,0],[6,6],[3,8],[-2,3]],
  ];
  for (const coords of outlines) {
    for (const points of [coords, [...coords].reverse()]) {
      const roof = pitchedFootprint(points.map(([x,z]) => ({x,z})), 35);
      validateLayout(roof);
      const metrics = layoutMetrics(roof);
      assert.ok(metrics.roofArea > metrics.footprint);
      assert.ok(Math.max(...roof.vertices.map(p => p.h)) > 0);
      assert.equal(roof.faces.length >= 2, true);
      const regenerated = pitchedFootprint(roof.boundary.map(i => roof.vertices[i]), 35);
      assert.ok(Math.abs(layoutMetrics(regenerated).roofArea - metrics.roofArea) < 1e-7);
    }
  }
});


test('L-shaped example has planar intersecting wings, level eaves and an inside valley', () => {
  const roof = lShapedLayout();
  const metrics = layoutMetrics(roof);
  assert.equal(metrics.footprint, 60);
  assert.equal(roof.faces.length, 6);
  assert.ok(metrics.roofArea > 60);
  assert.ok(roof.boundary.every(id => roof.vertices[id].h === 0));
  const ridge = roof.vertices.slice(6);
  assert.ok(ridge.every(p => p.h > 0 && p.h === ridge[0].h));
  assert.equal(ridge[0].z, ridge[1].z);
  assert.equal(ridge[0].x, ridge[2].x);
  assert.equal(roof.faces.filter(face => face.includes(3) && face.includes(6)).length, 2);
  for (const face of roof.faces) {
    const [a, b, c, ...rest] = face.map(id => roof.vertices[id]);
    const u = [b.x - a.x, b.h - a.h, b.z - a.z];
    const v = [c.x - a.x, c.h - a.h, c.z - a.z];
    const normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    for (const p of rest) {
      const deviation = normal[0]*(p.x-a.x) + normal[1]*(p.h-a.h) + normal[2]*(p.z-a.z);
      assert.ok(Math.abs(deviation) < 1e-8, 'Every roof face must be planar');
    }
  }
});


test('rendering groups remove triangulation diagonals but preserve real slope boundaries', () => {
  const roof = lShapedLayout();
  const groups = roofSurfaceGroups(roof);
  assert.equal(groups.length, 6);
  assert.ok(groups.every(group => group.patches.length === 1));
  assert.equal(groups.reduce((sum, g) => sum + g.boundary.length, 0), 22);
  for (const group of groups) {
    assert.ok(group.normal.y > 0);
    for (const [a, b] of group.boundary) {
      assert.ok(roof.faces.some(face => face.some((id, i) =>
        (id === a && face[(i + 1) % face.length] === b) ||
        (id === b && face[(i + 1) % face.length] === a))));
    }
  }
  const flat = splitSurface(rectangle(), [{x:-5,z:-3},{x:5,z:3}]);
  assert.equal(roofSurfaceGroups(flat).length, 1);
  assert.equal(roofSurfaceGroups(flat)[0].boundary.length, 4);
  flat.vertices[0].h = 1;
  assert.equal(roofSurfaceGroups(flat).length, 2, 'A real fold must remain distinct');
});
