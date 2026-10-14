# Solar AR — Firebase QR workflow

## Deploy

Apply this package after `roof-firebase-ar-update.zip`, keeping the preceding
Bookshelf camera-validation and Pergola build-resolution fixes. Deploy the
website and **Deploy Firebase share backend**. Both must succeed: the previous
backend will reject the newly supported `product=solar`.

No Cloud Shell setup, new bucket, API activation or additional IAM grants are
required. This reuses the existing private `configurator-360-hall-ar` bucket,
`hallARSessions` records, `publishHallAR` / `getHallAR` functions and
`cleanupHallAR` job. Their historical Hall names are intentionally unchanged.
Older links retain their normal expiry. No email-backend files are changed.

Cache tags: `solar-ar-1` (Solar) and `firebase-ar-10` (shared AR). The production
Solar import map remains pinned to Three.js r169. No package versions or lock
files are changed. All ten existing website configurators now opt into their
own AR adapters; unknown product IDs and explicit disabled capabilities remain
rejected.

## User flow

The Solar top-bar AR button opens the existing shared dialog, with Android as
the default. The QR appears after export, upload, manifest and asset checks
succeed. Switching to iOS/iPadOS exports the **same captured model** to USDZ;
closing and reopening captures later edits. The phone page has an Open AR
button for Google Scene Viewer or Apple Quick Look. It retains retries,
copy-link, open-on-device, 24-hour expiry and English/Romanian/German text.

There are no new long export descriptions in the dialog. Preparation text is
shared generic wording such as “Preparing your QR code…”; implementation names
are not shown as loading messages. A zero-panel layout returns a translated
message asking the user to adjust the roof, panel count or spacing.

## Captured model

The scene exports its **current `modelRoot` and `solarRoot` together**, not a
new default model and not the whole presentation scene:

- House shell, base slab, façade details, gables, roof faces and trim.
- Current roof type (gable/hip/shed), dimensions, pitch, overhang and finish.
- Actual placed PV modules: count, orientation, roof side(s), rows/columns,
  spacing, margins, module dimensions, frames, glass and cell-grid appearance.
- A bearing change in Auto/best-face mode is reflected by capturing the updated
  array. Ground-local coordinates are normalized as one combined object, so
  panels retain their exact relationship to the roof and do not float alone.

The existing Solar model uses metres. Its slab underside is placed at zero in
the detached export. Roof and panel roots are never reparented in the live
scene. Their geometry/materials, camera, state, and running lighting simulation
are left unchanged. Finish readiness checks re-read both current roots and
support cancellation; they do not wait for unrelated energy-analysis requests.

The editor draws panel cell grids with `THREE.Line`. On the detached copy,
these become 1.5 mm surface strips, preserving each line's position, colour,
opacity and parent transform. This retains cell-grid appearance in both native
mesh formats. Line-based technical roof edges are not exported. Temporary
strip geometry/materials are disposed without disposing editor-owned assets.

## What is not new physical geometry

Neighbouring geographic buildings, roads, trees, terrain, sun paths, compass,
dimensions, flux heatmaps, building masks and **Google recommended-layout
comparison overlays** remain excluded. The export is of the user-configured
installation, not a duplicate comparison layout. Applying a roof/bearing
suggestion to the configured model is reflected in the next snapshot.

Battery capacity, energy tariffs, simulated yield, consumption, financial
estimates and shading data remain configuration/analysis values. The current
Solar editor does not model physical battery or inverter units; this update
does not invent them or claim to export them. It also does not upload exact
location, Google tokens, terrain data, pricing or account details in the model.

No geospatial registration, live energy simulation or interactive editing is
added inside the native viewer. Native illumination and materials can differ
from the editor. The existing 10 MiB GLB / 24 MiB USDZ and triangle limits still
fail explicitly rather than silently dropping configured parts.

## Automated checks

`Validate Solar AR` runs on relevant pull requests and main-branch pushes. It
runs the adapter tests, localization, Firebase/policy/branding/camera regression
checks and the offline Solar browser suite. Failure diagnostics are uploaded as
workflow artifacts.

From the repository root:

```sh
node solar-configurator/tools/validate-i18n.mjs
node --no-warnings --experimental-loader ./solar-configurator/tests/ar-test-loader.mjs --test solar-configurator/tests/solar-ar.test.mjs
node --test hall-configurator/tests/ar-policy.test.mjs scripts/validation/tenant-branding.test.mjs firebase-share-backend/functions/tests/hall-ar.test.cjs bookshelf-configurator/tests/camera-guard.test.mjs
python solar-configurator/tests/ar-browser.py --chromium /path/to/chromium --artifacts /tmp/solar-ar-tests
```

The 14 adapter test groups include 54 roof/orientation/module/face combinations,
real GLB generation, house inclusion, cell-detail counts, selected array faces,
edits and snapshot isolation, invalid inputs, texture readiness, cancellation,
routes, localization and exporter entrypoints. The browser suite uses the real
Solar application and its geometry. It generates 18 GLBs and checks each with
the backend asset validator, compares camera/state/model preservation before
and after export, and exercises best-face bearing changes, lighting simulation,
empty arrays, platform switching, retries, close/reopen and mobile layout.

These offline tests use the repository's bundled r160 fixture. The renderer,
account/cloud/solar-analysis responses and USDZ binary exporter in the browser
test are simulated. The original production r169 imports are not rewritten in
shipped code. Tests do not demonstrate physical phone placement or live cloud
publication.

## Phone acceptance checklist

1. Wait for both deployments; refresh Solar, edit the roof and array, open AR.
2. Android: scan the default QR, tap Open AR, place the house and panels; compare
   panel count, roof side, orientation, spacing, colour and dimensions.
3. iPhone/iPad: switch to iOS, scan and open in Safari, then Open AR. Verify the
   house is supported on the placement plane and both array faces are present.
4. Repeat with gable, hip (including depth greater than length), and shed roofs.
5. Change array count/columns, orientation and bearing/Auto face, close and reopen
   AR. Confirm the new model changes; the previous QR still shows its snapshot.
6. Confirm the native preview has no map terrain, recommendations, heatmaps,
   dimensions, compass or selection overlays.
7. Confirm Window, Hall, Fence, Pavement, Pergola, Chair, Cardbox, Bookshelf and
   Roof still open their own AR dialogs, and tenant permissions are respected.

Full production-runtime USDZ export, live Firebase publication and physical
Android/iOS placement still require acceptance testing after deployment.

## API reference

The implementation follows the existing native-viewer/exporter contracts:

- Google Scene Viewer: https://developers.google.com/ar/develop/scene-viewer
- Three.js GLTFExporter: https://threejs.org/docs/pages/GLTFExporter.html
- Three.js USDZExporter: https://threejs.org/docs/pages/USDZExporter.html

The source imports pin r169; the documentation links may describe newer Three
releases. No runtime upgrade is part of this patch.
