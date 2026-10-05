# Pergola materials release validation

Release: `20260910-pergola-materials-17`, 10 September 2026.

## Baseline and delivery scope

The authoritative baseline is uploaded `configurator-360-main(13).zip` plus accepted
UV/deck/handle/glass/contact/performance/Window-polymer overlays, ending at
`20260909-polymers-16`. This patch does not replace main with an older full project.
Production changes are shared material additions and Pergola integration only.
There are NO Window source files in this update. Dependency declarations and all
lockfiles are unchanged; package scripts add validation commands only.

`RELEASE_PERGOLA17.json` records every packaged file except its own self-hash.
The update was applied to an independent clean baseline and its final hashes,
full shared tests, Pergola checks and Window static build were verified there.
Use `node shared-3d/tools/check_pergola_materials_release.mjs` immediately after
applying this release. Later intentional edits invalidate that release's hashes.

## Automated checks

- 489 shared tests passed, with no failures/skips: 347 existing tests plus 51 new
  material/asset/lifecycle checks and 91 preservation checks.
- The preservation fixture records 11 existing material definitions and 80
  Pergola configurations: 40 states with actual local accessory GLBs and the
  same 40 using generated fallbacks. Positions, normals, indices, groups,
  transforms, dimensions, shadow settings and light sources are protected;
  UV changes are deliberately permitted only for known fitted render clones.
- Window's entire validation chain passed. Its static build and runtime shared
  asset-copy/manifest checks passed with the new modules.
- Pergola JavaScript syntax checks and EN/RO/DE translation validation passed.
- Material-specific checks include complete screen retraction, color/quality
  changes, independent clone ownership, superseded-material disposal, fallback
  models, exact LED channel/diffuser classification, unknown asset nodes and
  source GLB immutability.

## Actual rendered checks

Chromium 144, SwiftShader WebGL2, 800 x 600, devicePixelRatio 1:

- Pergola's actual scene and shipped local GLBs passed default, screen and
  all-accessory scenarios at Balanced, High and Low, shader-link/context checks,
  camera movement/settling, recolor/retraction, equivalent rebuilds and teardown.
- Window used the actual prepared static client and production CAD. Three handle
  meshes remain present; geometry and fabrication hashes match the baseline.
  Debug-color switching, all three qualities, movement and idle behavior passed.
- The six Window Balanced/High overview, gasket and section before/after renders
  are pixel-identical. The Pergola default deck close-up is also pixel-identical.
  The default Pergola overview differs at only 88 of 480,000 pixels (small
  existing trim/motor surfaces now use the shared finish).
- Screen and accessory close-ups were inspected as actual renders. They do not
  imply increased mesh detail; the original accessory silhouettes remain low-poly.

## Rendering workload (not an FPS claim)

| Pergola test scene | Quality | Before / after moving draw calls | Updated idle draws |
| --- | --- | --- | --- |
| Default | Balanced / High | 246 / 246 | 0 |
| Default | Low | 124 / 124 | 0 |
| Screen | Balanced / High | 254 / 253 | 0 |
| Screen | Low | 129 / 128 | 0 |
| All accessories | Balanced / High | 368 / 368 | 0 |
| All accessories | Low | 185 / 185 | 0 |

In the baseline screen-only case, transparent DoubleSide material churn kept the
scene rendering while idle. Using the existing closed screen's outward FrontSide
faces avoids that churn and still passed front/back visibility checks. The
performance-controller implementation itself is unchanged. Window remains
213 moving calls in Balanced/High, 71 in Low, and zero idle draws.

No new rendering stage or reflection/transmission pass is introduced. Extra
material texture samples and textures still have a cost. These figures compare
workload on deterministic fixtures, not frame-rate guarantees for user devices.
Detailed counts and pixel-difference records are in PERGOLA_MATERIALS_RESULTS.json.

## Remaining verification limits

The container could not retrieve the exact Pergola production dependency set
(Three.js 0.185.1 / Vite 8.1.5). Local Pergola geometry/render checks used the
available 0.160.1 test engine; no substitute dependency is shipped. The exact Vite
production build and Firefox/mobile GPU behavior remain unverified here. Run the
normal installed-dependency production build before publishing and check the
new screen/accessories on deployed devices. Material definitions are visual
reference finishes, not measured manufacturer formulations or textile ratings.

No commits, pushes or deployments were performed.
