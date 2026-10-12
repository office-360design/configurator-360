# Roof AR: Firebase QR workflow with the house included

## Deployment

Apply this update after the existing Bookshelf Firebase AR update and the Bookshelf camera-validation fix. Deploy both the website and **Deploy Firebase share backend** before testing Roof AR. The website can show the new button before the backend has learned to accept `product: "roof"`.

No Cloud Shell administrator setup, new bucket, API enablement, or additional IAM grants are needed. The existing private `configurator-360-hall-ar` bucket, expiring Firestore records, `publishHallAR` / `getHallAR` functions, and `cleanupHallAR` job are reused. Old product links remain valid until their normal expiry. The email backend is not changed.

Cache versions: `roof-ar-1` for Roof modules; `firebase-ar-9` for shared AR entrypoints. The production Three.js import map remains pinned to r169. No dependency or package-lock upgrades are included.

## User workflow

The top-bar AR button opens the existing shared dialog, initially in Android mode. The QR becomes available after preparation and publication succeed. iOS/iPadOS uses the same captured configuration with its USDZ export. Switching platform does not silently recapture an edited product; close/reopen or regenerate to capture later changes.

The common dialog retains short scanning instructions, generic preparation messages, retry, copy-link, open-on-device, and the 24-hour expiry/privacy notice. It does not add the previously removed long export/scale paragraphs or reveal Firebase details in progress text.

English, Romanian and German are supported. The phone pages use:

- `/roof-configurator/ar.html` on the English/canonical route;
- `/configurator-acoperis/ar.html` on the Romanian platform host;
- `/dach-konfigurator/ar.html` on the German platform host.

Tenant domains keep the canonical Roof path on their own origin. The existing backend tenant authorization checks still apply. Scanning opens the phone page; the user then taps **Open AR**.

AR is enabled for Hall, Window, Pergola, Fence, Pavement, Chair, Cardbox, Bookshelf and Roof. Solar remains disabled.

## Export scope

`RoofScene.modelRoot` is the source, not the entire presentation scene and not only a roof-surface mesh. Capture includes all physical meshes currently built under that root:

- the selected roof topology, pitch, dimensions, overhang, covering, colour and finish maps;
- house walls, gables, façade entrance/windows and the supporting base slab where modeled;
- L-shaped house wings, dormer geometry and roof trims;
- fitted roof windows and their frames/glazing, including the drawn roof's actual cutouts.

BOM-only choices that do not create geometry are not invented as new parts. Native AR uses the exported geometry/materials; editor lighting, dimension labels, compass, ground/grid, technical edge lines, planning dialogs and other overlays are excluded. Sun position/night presentation are not exported lighting scenes.

Roof CAD already uses metres. The full roof-and-house copy is centered horizontally and its minimum Y is placed on the AR placement plane. This includes the underside of the standard house's 200 mm slab, so the building does not float. Drawn layouts use their actual wall/base bounds instead of assuming a slab exists.

The shared snapshot engine copies and normalizes the export only. Live geometry, materials, camera, orbit target, selection and configuration are not reset or rebuilt by AR. Current finish images are checked before capture, including after a covering change; failed images produce a localized error instead of silently omitting textures. The readiness wait is abortable and times out after 15 seconds.

The unfinished legacy `custom` placeholder is not a complete roof and is rejected. Finish or cancel an open layout-editor draft before AR; an applied, valid `layout` roof is supported.

## Export limits and viewers

Android is GLB; iOS/iPadOS is USDZ using the existing exporter for the Roof runtime and horizontal anchoring. The existing limits remain 300,000 snapshot triangles, 10 MiB GLB and 24 MiB USDZ. Exported textures are limited to 1024 pixels by the exporter. Over-limit models fail explicitly; physical parts are not silently removed to fit a limit.

The model is a static configuration snapshot, not a second configurator. Native viewers control placement, scale and rendering, and glass/advanced material effects can differ from the editor. Real-world phone placement still needs device testing.

## Other narrowly scoped corrections

Detailed L-shaped slate roofs could exceed JavaScript's argument limit when spreading a complete vertex buffer into `Array.push`. Scalar buffer appends preserve the same data and order without the argument-count failure. This corrects model construction, not the roof design.

The Roof localization validator was still bound to obsolete literal cache versions. It now validates the actual script paths and a nonempty release version. Existing localization checks are retained; missing Romanian/German labels for the drawn-layout option are also supplied.

Existing products' test expectations are extended to include Roof in the supported-product lists; their production adapters are unchanged. The earlier Window loading-state, Pergola dependency-resolution, branding-validation and Bookshelf camera-guard fixes are not replaced.

## Reproducible checks

The new **Validate Roof AR** workflow runs on relevant pull requests/main pushes and can be started manually. It uses the repository's bundled r160 offline fixture rather than changing production's r169 import map.

```sh
npm run check:roof
node roof-configurator/tools/validate-i18n.mjs
node --no-warnings --experimental-loader ./roof-configurator/tests/ar-test-loader.mjs \
  --test roof-configurator/tests/roof-ar.test.mjs
node --test hall-configurator/tests/ar-policy.test.mjs \
  scripts/validation/tenant-branding.test.mjs \
  firebase-share-backend/functions/tests/hall-ar.test.cjs \
  bookshelf-configurator/tests/camera-guard.test.mjs
python -m pip install playwright==1.57.0
python -m playwright install --with-deps chromium
CHROMIUM="$(python -c 'from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()')"
python roof-configurator/tests/ar-browser.py --chromium "$CHROMIUM" --artifacts /tmp/roof-ar-tests
```

### Results obtained for this update

- 15 new Roof AR Node tests passed.
- A combined 126-test run passed: Roof and the Bookshelf/Chair/Cardbox/Fence/Pavement adapters, backend serving/publication tests, shared availability policy, tenant branding and the Bookshelf camera guard.
- Separately, 13 Window AR and 13 Pergola AR tests passed with their own offline loaders: **152 tests total** across those runs, without double-counting the new Roof tests.
- All 63 existing Roof geometry tests and Roof localization validation passed.
- The full Window validation suite and its static production build passed.
- All changed/new JavaScript syntax checks, browser Python compilation, YAML parsing and whitespace checks passed.
- The browser suite produced and backend-validated **19 actual textured GLBs**: six complete roof families (gable, hip, shed, L-shaped, dormer, drawn layout) times three coverings, plus an edited drawn layout with two roof windows. These retained every visible physical source mesh, included house walls, and embedded their textures. File sizes were approximately 0.92–8.12 MiB.
- Browser tests checked edited dimensions/pitch/overhang/colour, house placement, windows, unchanged editor/camera through both capture and GLB export, incomplete-layout guards, Android/iOS selection, retries, close/reopen, localization and mobile dialog layout.

### Validation boundaries

Offline browser tests use real Roof application logic, geometry, textures and GLB generation, but simulate WebGL drawing, labels/environment rendering, account/cloud responses and USDZ generation. Live Firebase uploads, physical phone AR placement and a complete r169 USDZ export were not executed here. The production Pergola Vite build was not rerun locally because its installed dependencies were unavailable; its prior resolver fix and build workflow are unchanged.

The separate all-product shared completeness fixture could not be rerun in this local reconstruction because an earlier Hall commercial module was absent from the mounted baseline. No shared snapshot-engine or Hall geometry changes are part of this update. The targeted product, backend, camera and branding suites above passed.

## Phone acceptance checklist after both deployments succeed

1. Open a standard Roof configuration, change its dimensions/covering/colour, then open AR without saving to an account. Verify Android is initially selected and generic QR preparation succeeds.
2. Scan with a supported Android phone and tap **Open AR**. Confirm the roof is attached to its complete house, the base rests on the placement surface, and the edited dimensions/finish are represented.
3. Change to iOS/iPadOS, scan on that device and use Quick Look. Check walls, gables, slab, L-shaped wings, dormers and glass at more than one angle.
4. Apply a drawn roof with roof windows and verify those openings and the house underneath appear. An unapplied layout draft should instead give the action-required error.
5. Switch platforms within a dialog to verify the same snapshot. Change the roof, close and reopen AR to verify the new configuration is used. Ensure the editor's camera and model were not disturbed.
6. Check retry after a failed connection, expired links and access under the tenant domain where applicable. Existing Hall, Window, Pergola, Fence, Pavement, Chair, Cardbox and Bookshelf links should remain unaffected.
