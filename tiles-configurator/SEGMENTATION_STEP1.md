# Segmentation integration — step 1: paving geometry and editing

Base: `office-360design/configurator-360`, `tiles` branch,
`f096d0cb4261b009f1920a7304615b482ebe4930`.

This patch implements the geometry/editor foundation. It does not run the Python
models, import masks, estimate a camera, or add the segmentation Debug panel.
The existing photo upload and manual 1 m calibration flow remain in use.

## Applying the patch

Extract this ZIP at the repository root and replace the included files. There are
no new npm dependencies, Python services, database migrations, or build commands.
Use the project's existing development/deployment workflow. The ZIP contains only
modified/new files; it is not a complete checkout.

## Using the editor

After adding a photo, calibrate its 1 m reference and draw the first area as before.
The area panel then offers:

- **Add area**: draw a correction polygon, then Apply. It can enlarge an area,
  bridge two areas, fill a hole, or create a disconnected region.
- **Remove area**: draw and Apply a correction polygon. It can create a hole,
  cut an exterior notch, split a region, or remove a region entirely.
- **Start from scratch**: clear the actual paving selection without removing the
  photo, calibration, tile selection, direction, or fixed coordinate origin.
  The empty selection is valid and has zero paving quantities. Use Add area to
  draw again. Undo restores the cleared selection.
- **Edit boundary**: select an outer boundary or a hole. Drag its handles, or
  choose a vertex number and insert a midpoint after it / delete that vertex.
  Only the selected boundary has handles. For dense boundaries, at most roughly
  55 are shown, including the selected vertex and its neighbours. Hidden handles
  do not mean discarded vertices; every vertex remains accessible by number.
- **Undo edit / Redo edit**: restore complete state snapshots, including region
  topology and curb choices. A completed correction or boundary drag is one edit.
  During drawing, Undo point removes the last draft point. Cancel discards the
  unapplied draft. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) work outside inputs.

The curb section groups controls by region boundary. Internal-hole curbs are off
by default. A partially enabled boundary is shown as an indeterminate checkbox;
clicking it sets the entire boundary. Existing legacy edge choices are retained
when migrating into the new editor. A new outer boundary follows the existing
outer-curb preference; holes do not gain curbs automatically.

Labels are included for English, Romanian and German.

## Geometry and persisted state

Legacy rectangle, four/five-side, and single-custom-outline states continue to
use their previous version-1 geometry and dimensional validation. They migrate
when edited through the new region tools. House footprint validation is unchanged.

The new format uses version 2:

```js
{
  version: 2,
  shape: 'regions',
  areaPoints: null,
  areaOrigin: { x: 0, z: 0 },
  areaRegions: [{
    id: 'region-1',
    outer: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    holes: [[{ x: 1, z: 1 }, { x: 1, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 1 }]],
    curbs: { outer: true, holes: [false] }
  }]
  // Existing product, house and pricing fields remain present.
}
```

Coordinates are metres in ONE shared ground frame, not pixels or individual
region bounding-box coordinates. Outer rings are normalized counterclockwise,
holes clockwise. Closing-point repetition is accepted and removed. Collinear
vertices are allowed; contours are not truncated to the old 64-point limit.

`areaOrigin` is a fixed renderer translation: scene x/z equals geometry x/z minus
this origin. Migrating a legacy area uses its previous centre as the origin;
existing geometry, house positions and pattern-grid coordinates are not shifted.
Corrections never recenter the design, and undo/redo does not accumulate photo
camera shifts. New photo sessions start with an empty selection and their own
zero origin and clear the old edit history.

Normalization expands curb choices into `curbs.edges`, one boolean array per
boundary (outer first, then holes). When supplied, these arrays are authoritative;
the whole-boundary booleans are derived from them. This preserves partial legacy
edge selections and surviving edges through corrections.

Multiple disjoint regions, holes, and filled islands inside holes are supported.
Overlapping input regions must be combined with Add area rather than submitted as
an overlapping collection. Self-crossing rings, overlapping holes, holes outside
an outer boundary, and holes touching another boundary are rejected. A correction
that produces ambiguous point-touching hole topology is rejected rather than
silently filling a hole or inventing a connection; overlap the cut sufficiently
or leave a gap instead.

Geometry operations use floating-point tolerances, not raster masks. Regions are
split into disjoint horizontal bands and triangulated with holes excluded. Both
regular patterns and H-Beton use this geometry. Tile fragments retain one parent
tile entry, so triangulation does not multiply purchase-piece counts. Area,
perimeter, house subtraction, enabled curbs, BOM and CSV export use the new data.

Preview safety limits are explicit in `REGION_LIMITS`: 4,096 total vertices,
128 boundary rings, 64 regions, 200 m extent, plus tile, clipping and fragment
budgets. Exceeding a budget reports an error before changing the saved design.
It never silently resizes or truncates the area. Coordinate-keyed bounded caches
and a triangle spatial index avoid revalidating/clipping every contour segment
for every displayed tile.

## Integration points for the next step

The existing browser API gains:

```js
const api = window.TILES_CONFIGURATOR_API;
const current = api.getPavingState(); // Version-2 copy, including the fixed origin.
api.setPavingRegions(regions, current.areaOrigin); // Validate, render, record undo.
api.applyPavingPatch(polygonInGeometryMetres, 'add'); // Or 'remove'.
api.clearPaving();
api.undo();
api.redo();
```

`setPavingRegions` is the future vector-geometry import boundary. The model adapter
must convert its image masks to validated metre-space regions and supply the
appropriate camera/calibration separately. Importing geometry does not pretend
that the model camera or photo-setup lifecycle has been implemented. No inference
results, model weights, API URLs, or network upload behavior are added here.

## Verification performed

Run the two added test files from `tiles-configurator`:

```sh
node --test tests/regions.test.mjs tests/regions-layout.test.mjs
```

All **123** added test cases passed. They cover all tile formats/patterns at six
rotations, holes/islands, curbs, house exclusion, empty selections, migration,
fixed coordinates, vertex edits, history and invalid/budget-limited inputs.
The existing `npm run check` command automatically includes these new tests.

Additional checks during preparation:

- 360 legacy configurations compared against the exact original model: area,
  perimeter, curb length, installed/cut counts and totals matched.
- 572 generated polygon union/subtraction cases compared against independently
  computed Shapely areas, with matching output and triangulated areas.
- JavaScript syntax checks passed for every changed module.

The complete live site and WebGL rendering were **not** exercised. Browser access
was restricted in the execution environment; the attempted UI harness did not
run and is not counted as a passed test. The original repository's entire test
suite was not run because this workspace contains a focused source subset.

Before deploying, check an uploaded photo with one internal hole and a separate
region, drag each boundary, undo/redo, switch to free camera, change the sidebar
width, and verify that the photo alignment and camera remain stable. Verify one
rotated H-Beton example as well as a rectangular tile pattern.
