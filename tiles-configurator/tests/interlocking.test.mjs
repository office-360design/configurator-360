import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, layout, estimate, TILES, areaGeometry } from '../js/model.js';
import { polygonArea, triangulate, clipRect } from '../js/area.js';
import { clipConvex } from '../js/interlocking.js';
import { houseGeometry } from '../js/house.js';
import { patternPreview } from '../js/patternPreview.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
for (const rotation of [0, 90])
  test(`H-Beton ${rotation}: exact coverage, interlocking without overlap`, () => {
    const s = normalize({ tile: 'hbeton', length: 1.13, width: 1.07, rotation }),
      pieces = layout(s);
    near(
      pieces.reduce((sum, p) => sum + p.area, 0),
      s.length * s.width,
    );
    const triangles = pieces.map((p) =>
      p.fragments.flatMap((poly) => triangulate(rotation === 90 ? [...poly].reverse() : poly)),
    );
    for (let i = 0; i < pieces.length; i++) {
      const a = pieces[i];
      for (const poly of a.fragments)
        for (const p of poly) {
          assert.ok(p.x >= -1e-8 && p.x <= s.length + 1e-8);
          assert.ok(p.z >= -1e-8 && p.z <= s.width + 1e-8);
        }
      for (let j = i + 1; j < pieces.length; j++) {
        const b = pieces[j];
        if (Math.abs(a.x - b.x) >= (a.l + b.l) / 2 || Math.abs(a.z - b.z) >= (a.w + b.w) / 2)
          continue;
        for (const p of triangles[i])
          for (const q of triangles[j]) near(polygonArea(clipConvex(p, q)), 0);
      }
    }
    assert.ok(pieces.some((p) => !p.cut && p.fragments[0].length === 12));
  });
for (const shape of ['rectangle', 'closed4', 'closed5'])
  for (const rotation of [0, 90])
    test(`H-Beton ${shape}/${rotation}: L house excludes exact footprint`, () => {
      const s = normalize({
        tile: 'hbeton',
        shape,
        rotation,
        houseEnabled: true,
        houseShape: 'l',
        houseX: 0.13,
        houseZ: 0.27,
      });
      const house = houseGeometry(s),
        g = areaGeometry(s),
        pieces = layout(s);
      const overlap = triangulate(g.points).reduce(
        (n, tri) =>
          n +
          house.rectangles.reduce(
            (sum, r) => sum + polygonArea(clipRect(tri, r.x, r.z, r.l, r.w)),
            0,
          ),
        0,
      );
      near(estimate(s, pieces).area, g.area - overlap);
      for (const piece of pieces)
        for (const poly of piece.fragments)
          for (const r of house.rectangles)
            near(polygonArea(clipRect(poly, r.x, r.z, r.l, r.w)), 0);
    });
test('H-Beton BOM uses supplier coverage, preserves whole cut pieces and saved selection', () => {
  const s = normalize({
    tile: 'hbeton',
    tileRate: 70,
    waste: 30,
    edges: [false, false, false, false],
  });
  const e = estimate(s);
  near(e.rows[0].rate, 2);
  assert.equal(e.rows[0].quantity, Math.max(e.installedPieces, Math.ceil(24 * 1.3 * 35)));
  near(e.total, e.rows[0].quantity * 2);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(s))), s);
});
test('new products have distinct previews and only compatible patterns', () => {
  for (const tile of ['hbeton', 'granit', 'tetraNova']) {
    const s = normalize({ tile, pattern: 'herringbone' });
    assert.ok(TILES[tile].patterns.includes(s.pattern));
    const preview = patternPreview(s, s.pattern);
    assert.ok(!/NaN|undefined/.test(preview));
    if (tile === 'hbeton') assert.match(preview, /<polygon/);
  }
  assert.equal(TILES.granit.length, 0.1);
  assert.equal(TILES.tetraNova.width, 0.2);
});
