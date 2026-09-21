# Pavement tiling configurator

Standalone Three.js configurator using the existing shared navigation, account/save/share,
undo, language, theme, tools and collapsible settings shell. Prototype URL:
`/tiles-configurator/` (Cloud Run also redirects `/tiles` here). It is deliberately
not added to the public marketing catalogue or sitemap yet.

## Local use

From the repository root run `python3 -m http.server 8765`, then visit
`http://localhost:8765/tiles-configurator/`. Like the other static configurators,
Three.js is loaded from jsDelivr. No application build is required.

Run `npm run check:tiles` from the repository root for the model regression tests.

## Features

- Synchronized sliders, value readouts and numeric fields for rectangle dimensions,
  custom sides (5 cm steps), angle B and house controls. Pointer drags are grouped
  as one undo operation; keyboard and numeric edits are also supported.
- Optional rectangular or L-shaped house, with footprint dimensions, L-wing widths,
  height, quarter-turn orientation, X/Z positioning, centre button and direct 3D dragging.
  X/Z locate the unrotated footprint's lower corner relative to the paving area's
  bounding-box origin; rotation is around the footprint centre. Moving outside the
  area is allowed; only the intersection is subtracted. The centre button positions
  the footprint centre in the area's bounding box, not necessarily inside concave areas.
- Rectangle plus separate custom four- and five-sided areas, following fence controls.
  Four sides: AB, BC, CD and angle B; CD is parallel to AB, DA closes automatically.
  Five sides: AB, BC, CD, DE and angle B; C/D use 72° exterior turns, EA closes automatically.
  Editable lengths are 1–20 m and angle B is 30–150°. Dimensions are inside the curbs.
- Labelled A–E outline preview and 3D dimensions, calculated closing length, true area
  and perimeter. Convex and simple concave outlines are supported. Crossing/collapsed
  outlines, edges shorter than 10 cm and nearly collinear corners are rejected while
  retaining the previous configuration. Existing saved rectangles remain compatible.
- Parket 20 × 10 × 6 cm, Pătrat 20 × 20 × 6 cm and Dală 60 × 30 × 5 cm.
- Straight/running bond, herringbone and basket weave for rectangular formats;
  straight/running bond and two-colour checkerboard for square paving.
- 0° / 90° orientation; independent tile and curb colours, deterministic mixed finishes.
- G600 garden and T500 sidewalk curbs; independently enable all four edges.
- Instanced 3D paving and curbs, clipped edge pieces, concrete texture, shadows,
  orbit/zoom, top view, dimension labels and responsive settings panel.
- EN/RO/DE product UI; numeric input uses metres and estimates explicitly use RON.
  Shared unit/currency preferences do not convert the supplier rate editor in this prototype.
- Live BOM, editable rates, spare allowance, purchase quantities and CSV export.
- Versioned, validated state adapters for shared save/share/drafts/reset/undo.

## Quantity and pricing conventions

The nominal module covers the selected area exactly before exclusions. The house footprint is subtracted from tiles and intersecting perimeter curbs; no automatic curb is added around the house. The two wings of an L footprint are disjoint, avoiding double-counting. Partial cuts from the same stock tile/curb remain one purchased piece; fully covered pieces disappear. Gross area, house overlap and remaining paved area are calculated separately. House geometry is illustrative and excluded from pricing. Polygon edges clip paving stones to the outline; triangulation seams do not count as additional pieces. The 3 mm visible recess between
stones is a visual joint within that module, not an additional dimension. Curbs sit
outside the configured rectangle. Front/back curbs extend over enabled side curbs,
forming butt corners without overlapping geometry. Custom outlines use outward miter joints; a side without an enabled neighbour has a square end. Each custom curb strip is divided by its longest projected extent into whole stock lengths. Curb quantities are rounded up
per run; no cut-off reuse is assumed.

For each paving colour, order quantity is the greater of the number of installed
whole/cut pieces and `ceil(net area × (1 + spare %) / nominal piece area)`.
This avoids under-ordering where boundary cuts exceed the spare allowance. Spare
percentage is applied to paving only. The paving price uses the resulting whole-piece
purchase area, while curbs are priced per purchased piece. There is no pallet rounding.

Rates in `js/model.js` are editable **demo rates**, not WISE quotes. The estimate
excludes VAT, labour, transport, bedding, foundations and accessories. Product selection
resets that product's demo rate; switching colour/pattern preserves the edited rate.

## Reference catalogue

Dimensions and selected colour options reviewed on 2026-09-21:

- https://wise.ro/produs/parket/
- https://wise.ro/produs/patrat/
- https://wise.ro/produse/ (Dală 60x30x5)
- https://wise.ro/produs/bordura-g600/
- https://wise.ro/produs/bordura-t500/

Geometry and concrete colours are illustrative. No supplier photos are redistributed.
The catalogue is data-driven, so additional verified formats and prices can be added later.

## Integration and release

Both static release workflows copy this directory. Nginx serves the prototype without
changing any existing routes. Shared route maps, save/draft/analytics product lists and
tenant access catalogue recognize `tiles`. Tenant access still requires explicit enablement.

Cloud save/share for this new product requires deployment of the changed
`firebase-share-backend/functions/index.js` and `firebase-share-backend/firestore.rules`,
in addition to deploying the static application. Do not claim cloud operations work
against an older backend. No production deployment is performed by this feature branch.

## Validation

Model tests verify exact coverage, no overlapping tiles, boundary clipping, both
rotations, all compatible patterns, all curb-edge combinations, exact reference BOMs,
checkerboard split, zero pricing, spare allowance, input limits and maximum size.
The polygon tests compare perimeter construction directly with the fence implementation and check all patterns/rotations, concave areas, all edge masks, exact reference areas and legacy snapshots. All 151 pavement tests pass, including house clipping across all supported paving patterns, every quarter-turn, partial/external/full coverage, curb exclusions, disabling and saved-state compatibility. The previous 165 colour-editor tests also pass.

Browser visual verification could not run in the implementation environment: no browser
was preinstalled and Chromium downloads timed out or returned HTTP 502. Authenticated
Firebase save/share was not exercised against production.
