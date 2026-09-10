# Plastic/rubber release validation

Release: `20260909-polymers-16`. Built from the latest uploaded
`configurator-360-main(13).zip`, followed by the accepted UV, deck rebalance,
handle restoration, glass, Step 9 contact and perf-15 overlays. No commits,
pushes or deployments were performed. No dependency declarations or lockfiles changed.

## Completed checks

- **347/347 shared automated tests passed**, including **55 new** polymer-material,
  mapping, cache/quality/lifecycle and approved-baseline preservation checks.
- Window's entire `npm run check` chain passed, including catalog, compositions,
  joints, compatibility, source SVG/CAD, import-map ordering and module linking.
- Window `prepare:static` passed. The new shared provider and Window adapter are
  present in the prepared module graph.
- Pergola syntax and EN/RO/DE translation checks passed. No Pergola source file changed.
- Matched actual Window browser checks passed against the unmodified perf-15
  baseline and the **prepared updated static site**, with its supplied CAD assets.
- Balanced, High and Low linked their shader programs; no WebGL context loss or
  JavaScript console/page errors were observed. The full three-part handle remained.
- The actual Window's non-UV geometry/placement fingerprint and fabrication
  fingerprint were identical before/after. This covers positions, normals, indices,
  groups, world transforms and shadow flags. Targeted polymer UVs can now use the
  already-declared metre mapping rather than their former unused coordinates.
- Source comparison confirmed **399 protected files remained byte-identical**:
  customer CAD/SVG files, geometry library, Window builder/handle and dimension
  wrapper, mesh reuse, resize optimizer, source classifier/catalog, Pergola source,
  PBR images, reflection environments, contact and performance implementation.

## Rendering work and image review

The harness used Chromium 144 and software WebGL2 (SwiftShader) with Window's
actual vendored Three.js r160. It stopped the loop only in the served test response,
rendered matching cameras at 800 x 600, and hid screen-space dimension labels for
the close-up comparison. No production code was instrumented for these tests.

| Tier | Moving-view draw calls, before | After | Idle draw calls after settling |
| --- | ---: | ---: | ---: |
| Balanced | 213 | 213 | 0 |
| High | 213 | 213 | 0 |
| Low | 71 | 71 | 0 |

These counts are for this test configuration with dimension labels hidden, not
an FPS promise. New materials add texture lookups on their own surfaces but no
extra render passes/draw calls. All four polymer variants add eight 128-pixel
maps (normal and roughness); current-map counts rose by eight. Low detaches these
maps, retaining the small bounded procedural cache for later tier switches.

Actual overview, glass-edge and section views were inspected before/after at
Balanced and High. The intended difference is the nonmetallic surface response,
not coarse noise, altered profile contours or a new lighting treatment. The
updated static client also passed CAD/debug colour toggling, return to realistic
materials and the catalog-aware PE-insert classification check.

Machine-readable results are in `POLYMERS_RESULTS.json`.

## Historical snapshot maintenance

The unmodified accepted baseline's full shared suite initially had **24 failures**:
12 old UV snapshots and 12 old no-edge snapshots still expected the former
32-segment handle neck, before the accepted handle-fix-12. The exact snapshot
also predated the accepted UV changes. The same 24 failures appeared with the
new polymer code, before fixture maintenance.

The two historical fixture files were aligned with the **unmodified approved
perf-15 code**, not generated from the new implementation to mask a regression.
Checks required the same mesh counts, bounding boxes, transforms, shadow flags,
section sizes and complete fabrication output; the only mesh vertex-count
changes were the already-delivered 32-to-128-segment handle necks (1152 extra
vertices per neck). Existing Pergola snapshot values were retained. No runtime
geometry change was made to address these stale expectations.

Separately, `polymers-approved-baseline.json` records the current approved Window
geometry/fabrication and all existing material presets/texture pixel hashes.
The new preservation suite checks against it for all 13 Window cases.

## Limits

These are local software-rendered checks, not a Firefox/mobile hardware or live
production sign-off. They do not establish a particular FPS or manufacturer-grade
optical match. Pergola's exact pinned Three.js 0.185.1 / Vite 8.1.5 build remains
unverified locally; shared cross-engine tests used the available Three.js 0.160.1.
The patch makes no Pergola-specific changes and does not modify its dependency set.

Use the normal installed-dependency production build before publication. The ZIP
contains only project-relative changes and a root `commit_message.md`; no build
output, node_modules, fonts, user configuration or account data are shipped.
