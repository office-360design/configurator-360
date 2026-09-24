# Window plastic and rubber surfaces

Release: `20260909-polymers-16` (9 September 2026). Apply over the accepted
`20260909-perf-15` update. The geometry, contact, glass, PBR image assets and
performance stages retain their own previous versions.

## What is integrated

This is a render-material update for existing Window parts, not a new PVC window
product option, an accessory-geometry addition or a change to customer CAD.

| Shared material | Appearance | Window mapping |
| --- | --- | --- |
| `plastic.rigid` | Opaque satin rigid plastic with restrained molded microdetail | 275701 operating bar; 288319 PVC glazing bridge; 208694 drainage cap |
| `plastic.thermalBreak` | More matte engineering plastic; fine surface grain, not prominent fibres | Existing `iso` thermal-break subshapes, including inside aluminium parent profiles |
| `plastic.foam` | Matte polymer insulation with shallow cellular microdetail | PE insulation inserts 200988 and 245442; existing `foam` classification |
| `rubber.epdm` | Dark, matte elastomer with soft highlights and subtle microstructure | Centre gasket, rebate/stop gaskets, outer and inner glazing gaskets; existing `centralSeal` and `epdm` classifications |

These are calibrated visual categories, not manufacturer-measured optical
properties, a guarantee of exact resin formulation, or engineering specifications.
The catalog supplied in this project is the mapping source. In particular,
`200988` is catalogued as PE foam despite its legacy EPDM drawing classification;
`275701` and `288319` are plastic despite their legacy central-seal layer.
Unconfirmed dark objects and unknown part IDs are not guessed from their colour.
Missing accessory geometry is not invented, enabled, or installed by this update.

The drainage cap retains the selected **outside colour**, including in bicolour
mode. It does not become metal when the surrounding aluminium is set to mill
finish or anodized. Its cache entry follows exterior-colour invalidation so
repeated colour changes do not retain an unbounded series of obsolete cap materials.
Other polymer parts retain their fixed product colours. The PE inserts now use
the existing foam colour rather than the legacy gasket colour.

## Technical choices and performance

All four definitions use `MeshStandardMaterial` with `metalness: 0`, `opacity: 1`
and no transmission, clearcoat, displacement or new shader pass. The existing
scene reflections and contact shading supply the lighting. Neither the shader
pipeline nor the on-demand/adaptive-motion controller was modified.

The normal/roughness data is generated once, on demand, by
`src/materials/polymerTextures.js`. Maps are deterministic, periodic 128 x 128 RGBA
textures; their channels are explicitly non-colour data. There is no painted
highlight, albedo dirt, photographic download or remote dependency. Small uniform
plastic/rubber finishes do not require large scanned colour textures.

| Quality | Polymer detail |
| --- | --- |
| Low | Same colours and numeric roughness, no active normal or roughness map |
| Balanced | 128 px normal/roughness maps, the existing 0.85 normal-strength multiplier and filtering budgets |
| High | The same source maps, full preset normal strength and existing higher filtering budget |

Geometry-owned metre UVs continue defining direction and physical scale. Repeat
sizes are 16 mm (rigid plastic), 24 mm (thermal break), 25 mm (foam), and 12 mm
(EPDM). These are tile widths, **not the size of each bump**. Most surfaces should
look clean at full-product distance, with detail becoming apparent close up.

The four current variants need eight small maps total: approximately 512 KiB of
raw RGBA pixel data, or 683 KiB including a full mip chain (excluding driver
bookkeeping). Allocation is lazy; compatible materials share maps. Low at initial
load allocates none of these polymer maps. After a detailed tier has been used,
the bounded procedural cache is retained until scene disposal to avoid rebaking
on every quality switch; Low detaches the maps from materials. The existing
material/texture disposal and managed-clone behavior are retained.

## Mapping and extension points

`window-configurator/src/client/js/window-polymer-materials.js` is the host's
render-only adapter. It does not rewrite `materialKey`, IDs, source colours,
component groups, manufacturing metadata, connections, or geometry. This keeps
catalog-specific knowledge out of `shared-3d`.

Known accessory identities take precedence over legacy CAD colour classification.
Thermal-break and foam subshapes are still recognized when they have an aluminium
parent catalog ID. Unknown parts retain the old fallback material. CAD/debug
mode bypasses polymer assignment and preserves the source colour display.

To use the same definitions in another configurator, supply its own part mapping:

```js
const seal = surfaces.materials.create('rubber.epdm', { color: '#20242a' });
const moldedPart = surfaces.materials.create('plastic.rigid', { color: '#f1f0ea' });
// Use the host geometry adapter's metre-scale UVs; do not change map.repeat on
// a shared texture for a single part. Managed clones follow quality changes.
```

No Pergola source, material selection, deck UV offset, wood image, or geometry
file was changed. Shared definitions are available for its later material pass,
but are not automatically assigned to its accessories.

## Installation and diagnostics

Extract the update directly into the project root, preserving project-relative
paths. `commit_message.md` is at the ZIP root. Run the usual build pipeline.
Window's static builder copies the shared module tree, including the new provider;
there are no new PBR image files or dependency/lockfile changes.

With the Window scene open, run:

```js
const d = WINDOW_VISUALS_API.getDiagnostics();
d.version;        // "20260909-polymers-16"
d.activeMaterials;
d.surfaceDetails;
d.performance.version;  // "20260909-perf-15" — deliberately unchanged
```

For visual review, disable **CAD/debug colours**. Inspect the seals at the glass
edge, a section/exploded view for thermal breaks, and available hardware/insulation
parts. `activeMaterials` describes managed materials, including materials for
currently hidden components, not a count of visible meshes.

## Validation commands

```sh
npm run check:shared-3d:polymers
npm run check:shared-3d
npm run check --prefix window-configurator
npm run prepare:static --prefix window-configurator
node shared-3d/tools/check_polymers_release.mjs
```

The optional actual-client browser check requires Playwright and Chromium:

```sh
POLYMER_STATIC=1 node shared-3d/tests/polymer-browser.mjs
# On headless Linux CI with software GL:
xvfb-run -a env LIBGL_ALWAYS_SOFTWARE=1 POLYMER_STATIC=1 node shared-3d/tests/polymer-browser.mjs
```

The browser test uses only locally served client/CAD assets, no real accounts.
It disables the loop in the **served test response**, not the shipped source, to
obtain reproducible before/after views. See `POLYMERS_VALIDATION.md` for results
and the local renderer limitations.

## References and mapping basis

- Project catalog: `window-configurator/src/client/js/profile-catalog.js` (plastic
  operating bar, PVC glazing bridge, PE foam inserts, plastic drainage cap, EPDM seals).
- Three.js primary documentation: https://threejs.org/docs/pages/MeshStandardMaterial.html
  (non-metal materials use zero metalness; roughness-map multiplication; normal
  maps change lighting rather than geometry).
- Three.js primary documentation: https://threejs.org/docs/pages/Texture.html
  (colour-space labeling, mipmaps, anisotropy and disposal).
- Technoform: https://www.technoform.com/en/solutions/thermal-break/insulating-plastic-profiles-windows-doors-and-facades
  (polyamide-based insulating profiles as an engineering-plastic reference;
  not evidence of the exact formulation of every supplied customer part).
