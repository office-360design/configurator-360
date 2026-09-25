import test from 'node:test';
import { alignmentFixture } from './alignment-fixture.mjs';
import assert from 'node:assert/strict';
import {
  meetRoofSlope, joinLayoutInPlace, splitLayoutInPlace, selectionSurfaces, layoutStepWalls, moveLayoutPoint, linkedPlanPoints,
  deleteLayoutPoint, deleteLayoutEdge,
  layoutWallFootprint, layoutWallSegments, signedArea, validatePolygon,
  defaultLayout, footprintLayout, splitSurface, layoutMetrics, validateLayout,
  addLayoutPoint, insertPoint, cloneLayout, pitchedFootprint, lShapedLayout, roofSurfaceGroups,
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

test('overhang insets walls without changing roof geometry, including collinear gable points', () => {
  const source = defaultLayout();
  const snapshot = JSON.stringify(source);
  const walls = layoutWallFootprint(source, 0.5);
  assert.equal(walls.overhang, 0.5);
  assert.equal(Math.abs(signedArea(walls.points)), 54);
  assert.equal(JSON.stringify(source), snapshot);
  assert.equal(Math.abs(signedArea(layoutWallFootprint(source, 0).points)), 70);
  const segments = layoutWallSegments(source, walls.points);
  assert.ok(segments.flat().some(p => Math.abs(p.h - 2) < 1e-7));
  assert.ok(segments.flat().some(p => Math.abs(p.h - 2 / 7) < 1e-7));
});

test('overhang handles concave L corners and either boundary winding', () => {
  const layout = lShapedLayout();
  for (const source of [layout, { ...layout, boundary: [...layout.boundary].reverse() }]) {
    const walls = layoutWallFootprint(source, 0.45);
    assert.equal(walls.overhang, 0.45);
    assert.ok(Math.abs(signedArea(walls.points)) < layoutMetrics(source).footprint);
    assert.ok(layoutWallSegments(source, walls.points).flat().every(p => Number.isFinite(p.h)));
  }
});

test('narrow footprints limit overhang before edges collapse', () => {
  const layout = footprintLayout([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 4 }, { x: 0, z: 4 }]);
  const walls = layoutWallFootprint(layout, 1.2);
  assert.ok(walls.overhang > 0 && walls.overhang < 0.5);
  validatePolygon(walls.points);
  assert.ok(layoutWallSegments(layout, walls.points).flat().every(p => p.h === 0));
});


test('deleting a dividing edge merges surfaces without mutating the source', () => {
  const source = defaultLayout();
  const before = JSON.stringify(source);
  const next = deleteLayoutEdge(source, 2, 5);
  assert.equal(next.faces.length, 1);
  assert.equal(layoutMetrics(next).footprint, 70);
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => deleteLayoutEdge(source, 0, 1), /perimeter must stay closed/);
});

test('deleting an inserted point preserves faces and a corner reshapes the perimeter', () => {
  const source = defaultLayout();
  const id = insertPoint(source, { x: 0, z: 0 });
  const restored = deleteLayoutPoint(source, id);
  assert.deepEqual(restored, defaultLayout());
  const corner = deleteLayoutPoint(rectangle(), 0);
  assert.equal(corner.boundary.length, 3);
  assert.equal(layoutMetrics(corner).footprint, 30);
  assert.throws(() => deleteLayoutPoint(corner, 0), /at least three/);
});

test('deleting an interior ridge junction closes the roof and compacts indices', () => {
  const source = lShapedLayout();
  const next = deleteLayoutPoint(source, 6);
  validateLayout(next);
  assert.ok(next.faces.length < source.faces.length);
  assert.equal(next.vertices.length, source.vertices.length - 1);
  assert.equal(layoutMetrics(next).footprint, layoutMetrics(source).footprint);
});

test('deleting a polyline dividing edge removes orphaned interior points', () => {
  const source = splitSurface(rectangle(), [{ x: -5, z: 0 }, { x: 0, z: 1 }, { x: 5, z: 0 }]);
  const middle = source.vertices.findIndex(p => p.x === 0 && p.z === 1);
  const start = source.vertices.findIndex(p => p.x === -5 && p.z === 0);
  const next = deleteLayoutEdge(source, start, middle);
  assert.equal(next.faces.length, 1);
  assert.ok(!next.vertices.some(p => p.x === 0 && p.z === 1));
  validateLayout(next);
});

test('point split detaches chosen L-roof surfaces and permits independent height', () => {
  const source = lShapedLayout();
  const before = JSON.stringify(source);
  const { layout, copies } = splitLayoutInPlace(source, [6], [0, 2]);
  assert.equal(copies.length, 1);
  assert.equal(selectionSurfaces(layout, copies).length, 2);
  assert.ok(selectionSurfaces(layout, [6]).length > 0);
  layout.vertices[copies[0]].h += 1;
  validateLayout(layout);
  assert.equal(JSON.stringify(source), before);
  assert.equal(layout.vertices[6].h, source.vertices[6].h);
  assert.ok(layoutStepWalls(layout).length > 0);
  assert.deepEqual(validateLayout(JSON.parse(JSON.stringify(layout))), layout);
});

test('edge split duplicates both endpoints and builds a vertical step wall', () => {
  const { layout, copies } = splitLayoutInPlace(defaultLayout(), [2, 5], [0]);
  assert.equal(layoutStepWalls(layout).length, 0);
  assert.equal(layoutMetrics(layout).roofArea, layoutMetrics(defaultLayout()).roofArea);
  copies.forEach(id => { layout.vertices[id].h = 3; });
  validateLayout(layout);
  const walls = layoutStepWalls(layout);
  assert.equal(walls.length, 1);
  assert.deepEqual(walls[0].map(p => p.h).sort(), [2, 2, 3, 3]);
  // At a gable, opposite wall intervals must retain their own roof heights.
  const wallSegments = layoutWallSegments(layout, layoutWallFootprint(layout, 0).points);
  const ridgeHeights = wallSegments.flat().filter(p => p.z === 0).map(p => p.h);
  assert.ok(ridgeHeights.includes(2) && ridgeHeights.includes(3));
});

test('step walls split safely where independently edited height profiles cross', () => {
  const { layout, copies } = splitLayoutInPlace(defaultLayout(), [2, 5], [0]);
  layout.vertices[copies[0]].h = 3;
  layout.vertices[copies[1]].h = 1;
  const walls = layoutStepWalls(layout);
  assert.equal(walls.length, 2);
  assert.ok(walls.every(polygon => polygon.length === 3));
});

test('split copies move together in plan but never copy heights', () => {
  const { layout, copies } = splitLayoutInPlace(lShapedLayout(), [6], [0]);
  const h = layout.vertices[6].h;
  moveLayoutPoint(layout, copies[0], { x: -2.4, z: -2, h: 3 });
  assert.equal(layout.vertices[6].x, -2.4);
  assert.equal(layout.vertices[6].h, h);
  validateLayout(layout);
});

test('inserting into a split edge preserves both independent height profiles', () => {
  const { layout, copies } = splitLayoutInPlace(defaultLayout(), [2, 5], [0]);
  copies.forEach(id => { layout.vertices[id].h = 3; });
  const inserted = insertPoint(layout, { x: 0, z: 0, edgeIds: copies });
  validateLayout(layout);
  const linked = linkedPlanPoints(layout, inserted);
  assert.equal(linked.length, 2);
  assert.deepEqual(linked.map(id => layout.vertices[id].h).sort(), [2, 3]);
});

test('split validation rejects malformed links, gaps and invalid detach selections', () => {
  assert.throws(() => splitLayoutInPlace(defaultLayout(), [2, 5], [0, 1]));
  assert.throws(() => splitLayoutInPlace(defaultLayout(), [0, 1], [0]));
  const { layout, copies } = splitLayoutInPlace(defaultLayout(), [2, 5], [0]);
  const moved = cloneLayout(layout);
  moved.vertices[copies[0]].x += 0.1;
  assert.throws(() => validateLayout(moved), /aligned/);
  const duplicate = cloneLayout(layout);
  duplicate.planLinks[0].push(duplicate.planLinks[0][0]);
  assert.throws(() => validateLayout(duplicate));
  const gap = cloneLayout(layout);
  gap.faces.pop();
  assert.throws(() => validateLayout(gap));
});

test('equal-height split copies do not introduce covering seams', () => {
  const source = lShapedLayout();
  const { layout } = splitLayoutInPlace(source, [6], [0, 2]);
  const shape = value => roofSurfaceGroups(value).map(group => ({
    patches: group.patches, boundary: group.boundary,
  }));
  assert.deepEqual(shape(layout), shape(source));
});


test('joining an edge keeps selected endpoint heights and removes the step wall', () => {
  const { layout, copies } = splitLayoutInPlace(defaultLayout(), [2, 5], [0]);
  layout.vertices[copies[0]].h = 3;
  layout.vertices[copies[1]].h = 4;
  const before = JSON.stringify(layout);
  const joined = joinLayoutInPlace(layout, copies);
  assert.equal(joined.vertices.length, 6);
  assert.equal(joined.vertices[2].h, 3);
  assert.equal(joined.vertices[5].h, 4);
  assert.equal(joined.faces.length, 2);
  assert.equal(joined.planLinks, undefined);
  assert.equal(layoutStepWalls(joined).length, 0);
  assert.equal(JSON.stringify(layout), before);
  assert.deepEqual(validateLayout(JSON.parse(JSON.stringify(joined))), joined);
});

test('joining one point preserves other splits and can complete a partial edge join', () => {
  const { layout, copies } = splitLayoutInPlace(defaultLayout(), [2, 5], [0]);
  layout.vertices[copies[0]].h = 3;
  layout.vertices[copies[1]].h = 4;
  const pointJoined = joinLayoutInPlace(layout, [2]);
  assert.equal(pointJoined.vertices[2].h, 2);
  assert.equal(pointJoined.vertices.length, 7);
  assert.equal(pointJoined.planLinks.length, 1);
  assert.equal(layoutStepWalls(pointJoined).length, 1);
  const finished = joinLayoutInPlace(pointJoined, [2, 5]);
  assert.deepEqual(finished, defaultLayout());
});

test('joining a point reconnects multiple copies and rejects invalid selections', () => {
  const first = splitLayoutInPlace(lShapedLayout(), [6], [0]);
  const second = splitLayoutInPlace(first.layout, [6], [2]);
  second.layout.vertices[second.copies[0]].h = 3;
  const joined = joinLayoutInPlace(second.layout, second.copies);
  assert.equal(joined.vertices.length, 9);
  assert.equal(joined.vertices[6].h, 3);
  assert.equal(joined.planLinks, undefined);
  assert.throws(() => joinLayoutInPlace(defaultLayout(), [2]));
  assert.throws(() => joinLayoutInPlace(first.layout, [0, 2]));
});

test('meet slope at fixed height moves along the ridge and restores the target plane', () => {
  const { layout, pointId } = alignmentFixture();
  const before = JSON.stringify(layout);
  const result = meetRoofSlope(layout, { pointId, faceIndex: 0, mode: 'height', height: 1, directionId: 3 });
  assert.equal(result.position.x, 8);
  assert.ok(Math.abs(result.position.z - 5 / 3) < 1e-9);
  assert.equal(result.position.h, 1);
  assert.equal(result.reconnected, true);
  assert.equal(result.layout.vertices.length, 12);
  assert.equal(result.layout.planLinks, undefined);
  result.layout.faces[0].forEach(id => {
    const p = result.layout.vertices[id];
    assert.ok(Math.abs(p.h - 0.6 * p.z) < 1e-9);
  });
  for (const id of [0, 1, 6, 10]) assert.deepEqual(result.layout.vertices[id], layout.vertices[id]);
  assert.equal(JSON.stringify(layout), before);
});

test('meet slope at fixed position changes height without moving the plan', () => {
  const { layout, pointId } = alignmentFixture();
  const result = meetRoofSlope(layout, { pointId, faceIndex: 0, mode: 'position' });
  assert.equal(result.position.x, 8);
  assert.equal(result.position.z, 1.25);
  assert.equal(result.position.h, 0.75);
  assert.equal(result.distance, 0);
  validateLayout(result.layout);
});

test('alignment rejects ambiguous planes, impossible directions and invalid geometry', () => {
  const { layout, pointId } = alignmentFixture();
  const base = { pointId, faceIndex: 0, mode: 'height', height: 1, directionId: 3 };
  assert.throws(() => meetRoofSlope(layout, { ...base, directionId: null }), /connected edge/);
  assert.throws(() => meetRoofSlope(layout, { ...base, faceIndex: 3 }), /three fixed/);
  assert.throws(() => meetRoofSlope(layout, { ...base, height: 10 }), /invalid roof/);
  const bent = cloneLayout(layout);
  bent.vertices[6].h = 1.4;
  assert.throws(() => meetRoofSlope(bent, base), /not on one plane/);
  const flat = cloneLayout(layout);
  for (const id of [0, 1, 6, 10]) flat.vertices[id].h = 0;
  assert.throws(() => meetRoofSlope(flat, base), /never reaches/);
});


test('deleting an outer triangular tip removes its collapsed face and keeps adjoining slopes', () => {
  const source = validateLayout({ version: 1,
    vertices: [{ x: 0, z: 0, h: 0 }, { x: 10, z: 0, h: 0 },
      { x: 10, z: 2.5, h: 1.5 }, { x: 0, z: 2.5, h: 1.5 },
      { x: 11.75, z: 1.25, h: 0.86 }],
    boundary: [0, 1, 4, 2, 3], faces: [[0, 1, 2, 3], [1, 4, 2]],
  });
  const before = JSON.stringify(source);
  const next = deleteLayoutPoint(source, 4);
  assert.deepEqual(next.boundary, [0, 1, 2, 3]);
  assert.deepEqual(next.faces, [[0, 1, 2, 3]]);
  assert.deepEqual(next.vertices, source.vertices.slice(0, 4));
  assert.equal(layoutMetrics(next).footprint, 25);
  assert.equal(JSON.stringify(source), before);
  const reversed = cloneLayout(source);
  reversed.boundary.reverse();
  reversed.faces.forEach(face => face.reverse());
  validateLayout(deleteLayoutPoint(reversed, 4));
});

test('removing a triangular tip cannot leave the entire roof without a surface', () => {
  const triangle = footprintLayout([{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 0, z: 3 }]);
  assert.throws(() => deleteLayoutPoint(triangle, 0), /at least three/);
});

test('interior points preserve roof shape, including triangulation diagonals', () => {
  for (const point of [{ x: 0, z: -1.75 }, { x: -2, z: -2 }]) {
    const source = defaultLayout(), original = cloneLayout(source);
    const { layout, id } = addLayoutPoint(source, point);
    validateLayout(layout);
    assert.deepEqual(source, original);
    assert.ok(Math.abs(layout.vertices[id].h - (point.z + 3.5) * 2 / 3.5) < 1e-9);
    assert.ok(Math.abs(layoutMetrics(layout).roofArea - layoutMetrics(source).roofArea) < 1e-8);
    assert.ok(layout.faces.filter(face => face.includes(id)).length >= 3);
    layout.vertices[id].h += 1;
    validateLayout(layout);
    assert.ok(layoutMetrics(layout).roofArea > layoutMetrics(source).roofArea);
  }
});
test('inserting on concave roofs, shared edges and outside the roof', () => {
  const source = lShapedLayout();
  const before = cloneLayout(source);
  const { layout } = addLayoutPoint(source, { x: -4, z: -3 });
  validateLayout(layout);
  assert.ok(Math.abs(layoutMetrics(layout).roofArea - layoutMetrics(source).roofArea) < 1e-8);
  const edge = addLayoutPoint(defaultLayout(), { x: 0, z: 0 });
  assert.equal(edge.layout.faces.filter(face => face.includes(edge.id)).length, 2);
  assert.throws(() => addLayoutPoint(source, { x: 99, z: 99 }), /inside a roof surface/);
  assert.deepEqual(source, before);
});

test('interior insertion retains non-planar heights and works inside a concave face', () => {
  const nonPlanar = rectangle();
  nonPlanar.vertices[0].h = 2;
  const concave = footprintLayout([{ x: 0, z: 0 }, { x: 8, z: 0 },
    { x: 8, z: 3 }, { x: 3, z: 3 }, { x: 3, z: 7 }, { x: 0, z: 7 }]);
  for (const [source, point] of [[nonPlanar, { x: 1, z: 1 }], [concave, { x: 1, z: 5 }]]) {
    const { layout } = addLayoutPoint(source, point);
    validateLayout(layout);
    assert.ok(Math.abs(layoutMetrics(layout).roofArea - layoutMetrics(source).roofArea) < 1e-8);
    assert.deepEqual(layout.boundary, source.boundary);
  }
});
