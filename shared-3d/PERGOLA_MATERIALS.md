# Pergola textile and accessory materials

Release: `20260910-pergola-materials-17` (10 September 2026).
Baseline: uploaded main(13), followed by the accepted UV, deck, restored-handle,
glass, contact-shading, performance and Window polymer updates through polymers-16.

## Scope

This is a material pass, not a geometry/model replacement. The approved aluminium,
glass, deck and all Window material definitions are preserved. No Window source or
CAD file, product dimensions, pricing, saved-state schema, deck offset/texture,
light-source intensity, reflection environment, contact-shading algorithm or
performance-controller implementation is edited. Background house/tree materials
remain as before. Scenery resurfacing and improved low-poly accessory shapes are
separate work; this release does not claim to finish them.

## Shared definitions and actual assignments

| Semantic material | Applied to | Detail |
| --- | --- | --- |
| `fabric.screen` (new) | Manual and motorized ZIP screen fabric | Fine periodic weave normal, roughness and alpha maps; zero metalness |
| `steel.brushed` (new) | Crank rod/eye/elbow, wind-sensor mast/arms, rain sensing grid, outlet earth lip | Metallic exposed-hardware finish; reuses the existing neutral brushed microtexture data |
| `rubber.softTouch` (new) | Crank grip and speaker driver surfaces | Matte rubber-like response; reuses the existing fine rubber provider |
| `plastic.diffuser` (new) | LED diffuser and spotlight light cover | Cheap standard-PBR opaque luminous cover; not an additional refractive/transmission layer |
| `plastic.rigid` (reused) | Switch/socket faces and inserts, sensor housings/cups, speaker shell, screen motor enclosure | Molded-plastic finish rather than a metallic surface |
| `aluminium.powderCoated` (reused) | Accessory casings, brackets, cassettes, premium trim and motor enclosure | Same accepted coating definition, with each part's existing tint |
| `aluminium.bare` (reused) | LED channel | Does not emit light; only the diffuser does |

These are appearance categories, not manufacturer-certified compositions,
engineering substitutions, or new bill-of-materials data. The existing source
models do not identify a supplier-specific polymer or steel grade. In particular,
soft-touch rubber is not automatically labeled EPDM. No imaginary gasket meshes
are added. Existing heaters retain their original heated-element response.

## Textile behavior and quality

The 128 x 128 weave is baked once on first detailed use. All three maps are
non-color data; there is no new photographic/albedo overlay to alter a chosen
screen color. The 12 mm physical tile contains eight weave periods (a nominal
1.5 mm pitch), repeated in metre-authored geometry coordinates. This is a visual
reference scale, not a supplier weave specification. Mapping follows the fabric's
vertical deployment direction and is independent of the width/height ratio.

The existing screen `openness` setting continues to mean roll-up/deployment
percentage. It is NOT repurposed as a textile optical openness rating. Fully
retracted fabric is not allocated or retained as an unattached material.

Balanced and High use weave normal/roughness/alpha maps with existing anisotropic
filtering and mipmaps. Low drops the maps and keeps a comparable average opacity,
color and matte response. The screen remains visible from both sides using the
existing closed box's outward faces. It uses regular blended transparency,
`FrontSide` and `depthWrite: false`, not a second double-sided draw pass or hard
alpha-test holes. This is a real-time visual approximation: it does not simulate
measured solar transmission, woven fiber scattering or cloth motion.

## Accessory mapping and resource ownership

`pergola-configurator/src/scene/pergolaMaterials.js` contains exact known GLB node
assignments. Unknown future node names retain authored materials. The palette
caches immutable variants within one generated assembly, with shared textures
owned by the scene's material library. Superseded independent GLB-clone materials
are disposed only after checking for remaining references in that asset.
Unused palette variants are released at the end of a build.

The shipped accessory GLBs frequently contain positions/indices without UVs or
normals. Known static clones get metre-scale UVs after fitting. Where normals
are missing, a scratch geometry supplies a projection basis, while the original
keeps its vertices/indices and flat derivative-based surface shading. No normals
or topology are added to the original buffer in that case. Tangent/morph/skinned
assets are not automatically reprojected. This is deliberate: a material pass
must not silently rewrite an imported object's geometry.

The old `/led/` substring test also matched `led_channel`. Exact assignments now
separate the non-emissive aluminium channel from `led_diffuser`. LED/spotlight
light-source colors, positions, intensities and counts are unchanged.

## Performance

No new reflection, transmission, ambient-occlusion or post-processing passes are
added. The new weave set uses about 256 KiB of RGBA8 texture storage including
mipmaps when detailed maps are allocated. Existing polymer/brushed providers are
reused and all new maps are lazy; no per-frame texture generation occurs.
Shader texture samples still have a cost. The release makes no claim of zero GPU
cost or of a measured FPS improvement. Idle-render skipping, shadow reuse and
adaptive motion resolution remain the accepted `20260909-perf-15` implementation.

## Acceptance

Apply the ZIP at the project root over the accepted polymers-16 release and use
the normal production build pipeline. There are no dependency/lockfile changes.

On the Pergola page, run:

```js
const d = PERGOLA_VISUALS_API.getDiagnostics();
d.version; // "20260910-pergola-materials-17"
d.activeMaterials; // New IDs appear when their corresponding options are active.
d.surfaceDetails['fabric.screen']; // alphaMapped > 0 on Balanced/High, 0 on Low.
d.performance.version; // "20260909-perf-15"
```

Start with a deployed manual or motorized screen at Balanced quality and inspect
it close-up from both sides. Change its color, partially retract it and fully
retract it. Then inspect a switch/socket, crank grip/rod, speaker, weather sensor
and LED channel/diffuser. Cycle Low, Balanced and High, then let the view settle.
The existing deck, frame and glass should retain their accepted appearance.

Commands:

```sh
npm run check:shared-3d:pergola-materials
npm run check:shared-3d
npm run check --prefix pergola-configurator
npm run check --prefix window-configurator
npm run prepare:static --prefix window-configurator
npm run check:shared-3d:pergola-materials-browser
node shared-3d/tools/check_pergola_materials_release.mjs
```

Browser tests require Playwright, Chromium and a working WebGL2 context. A Linux
headless environment that needs a display can run the browser test under
`xvfb-run -a`. Release integrity checks validate the exact package version and
will correctly fail after those same files are edited by a later update.

## References

The implementation uses standard Three.js material fields, not custom shaders:
https://threejs.org/docs/pages/MeshStandardMaterial.html
https://threejs.org/docs/pages/Material.html

Normal/roughness/alpha maps are non-color data. Alpha maps use their green
channel. Diffuser emission is visual emission; the retained scene lights provide
illumination of the surrounding objects. No external texture asset is added.
