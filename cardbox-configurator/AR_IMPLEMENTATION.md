# Cardbox Firebase AR

Release: `cardbox-ar-1`; shared AR cache: `firebase-ar-7`.

## User workflow

The Cardbox top-bar AR action opens the existing shared QR dialog. Android is
selected initially and uses GLB. iOS/iPadOS uses USDZ. Both modes use the same
captured box, including any current closure rotations. Close and reopen the
dialog to capture subsequent edits. No account-save step is necessary.

The dialog keeps generic, localized QR-preparation messages, retry, copy-link,
open-on-device, and the existing expiry/privacy notice. The removed long export
and scale paragraphs stay removed. The phone page asks the user to tap Open AR.
The existing 24-hour expiry applies. The file is accessible to anyone with the
unexpired link, including its printed text/images.

AR is opt-in for Hall, Window, Pergola, Fence, Pavement, Chair and now Cardbox.
Roof, Solar, Bookshelf and other unsupported products remain unavailable.

## Capture boundaries

`js/app.js` exposes `CARDBOX_CONFIGURATOR_API.captureARSnapshot({signal})`.
It waits for the latest image-render generation (including an immediate restore
or image resize) and font readiness before copying the current physical model.
The shared dialog supports asynchronous capture with cancellation and guards
against stale capture, close/reopen and platform-switch races.

The adapter captures the existing rendered geometry, not a default or a new box:

- All nine catalogue structures and configured box dimensions.
- Current top/bottom closure visibility and physical rotations.
- Configured handle/vent/cutout geometry and reinforcement details.
- The cardboard's current visible inner/outer appearance and per-face colours.
- Committed text and uploaded images, including wrapped segments, cropped UVs,
  selected colours, type styling, image proportions and placement.

Closure and reinforcement lines are converted to fine native-compatible mesh
seams on the export copy; technical wireframes and selection markers are not.
The editor's existing model detail is preserved, not replaced with an engineered
corrugation or die-cut manufacturing simulation. Nonvisual pricing/BOM values do
not invent geometry absent from the editor.

Editor coordinates are millimetres; the detached export is scaled to metres and
its lowest physical point is placed on the native viewer's placement plane.
The whole-box inspection lift, extra lid-inspection lift and transparent
inspection mode are removed on copies. The configured print remains included
even when artwork is temporarily hidden by the inspection tool. The live editor,
its materials, tool states, camera and selected components are left alone.

Incomplete text/image placement or editing, and a running fold demonstration,
produce localized errors instead of silently exporting a draft preview. Missing
committed artwork after a load/decode failure produces an explicit error. Pending
image loads time out after 15 seconds, with retry available. Static exports do
not provide interactive flap controls or replay the fold animation on the phone.

The existing shared capture copies geometry, materials, texture pixels and
supported material maps. The Cardbox adapter uses the editor's pinned Three.js
r169 import map, including both exporters, without a runtime/dependency upgrade.
GLB limit: 10 MiB. USDZ limit: 24 MiB. The shared texture maximum remains 1024 px
and its geometry limit remains 300,000 triangles. Too-large configurations fail
explicitly; parts are not silently removed to fit these limits.

## Firebase and deployment

Apply this update on top of the current Chair AR update and earlier fixes, then
wait for **both** the website deployment and **Deploy Firebase share backend** to
finish. The backend's supported-product allow-list now includes `cardbox`; an
old backend rejects Cardbox publication even if the new button is already live.

No new bucket, function export, API activation, IAM change or Cloud Shell setup
is needed. This extends the existing publishHallAR/getHallAR/cleanupHallAR
implementation and reuses the private `configurator-360-hall-ar` bucket. Files
are isolated under `hall-ar/v1/<session>/cardbox.glb` or `cardbox.usdz`; manifests,
streaming, range requests, quotas, expiry and cleanup use the existing handling.
Tenant Cardbox entitlement remains required for publication. Phone viewers do
not need to sign in. There is no Supabase or alternate transfer service.

The phone routes are:

- English/canonical and tenant: `/cardbox-configurator/ar.html`
- Romanian public site: `/configurator-cutii-carton/ar.html`
- German public site: `/karton-konfigurator/ar.html`

The existing locale/static route aliases already serve the new page. Backend
function names intentionally remain unchanged for compatibility with earlier AR
links and deployed clients. The email backend, factory recipient, permissions
setup, website ordering and other model-generation code are not changed.

## Verification

Run the fast offline tests from the repository root:

```bash
node --no-warnings --experimental-loader ./cardbox-configurator/tests/ar-test-loader.mjs --test cardbox-configurator/tests/cardbox-ar.test.mjs shared-3d/tests/ar/completeness.mjs
node --test hall-configurator/tests/ar-policy.test.mjs firebase-share-backend/functions/tests/hall-ar.test.cjs scripts/validation/tenant-branding.test.mjs
```

Actual-editor browser integration (requires Python Playwright and Chromium):

```bash
python cardbox-configurator/tests/ar-browser.py --artifacts /tmp/cardbox-ar-tests
```

`Validate Cardbox AR` runs these checks on matching pull requests and main-branch
changes. The browser test uses real Cardbox application code, geometry, texture
creation and GLB export, but stubs the renderer, account shell, Firebase and USDZ
export. Both Node and browser export tests use the repository's bundled r160
fixture; production remains r169. Do not ship that fixture as Cardbox's runtime.

Locally verified:

- 14 Cardbox AR test groups, including dimensions, state isolation, colours,
  closure poses, selection exclusion, artwork inclusion, export validation,
  asynchronous image readiness, cancellation and timeout handling.
- 99 AR test groups in total including existing adapters/backend/common capture,
  plus 11 tenant-branding tests and 14 pre-existing Chair geometry tests.
- Real GLBs from all nine box styles (about 19–89 kB) and a decorated example
  (97,708 bytes) with two embedded image textures; each passes the backend asset
  validator. The decorated text wraps into six committed segments.
- 76 actual-editor closure and cardboard combinations, including absent top or
  bottom closures; independent inner/outer colours and configured cutouts.
- Delayed artwork capture, invalid-image failure, editor-tool preservation,
  desktop/mobile dialog, locale changes, retries and stale-capture suppression.
- Existing Chair browser suite, full Window validation and static build.

Not locally verified: live Firebase publication; physical Android/iOS placement;
a complete Cardbox USDZ export through the production r169 runtime; a full
Pergola/website production dependency build. The environment cannot download
npm/CDN dependencies. iOS exporter responses are simulated only for offline UI
flow tests, not presented as a native-export acceptance result.

After deployment, test a default box and a resized coloured box with both text
and an uploaded logo. Scan both platform QRs, tap Open AR, verify all sides and
artwork/closure positions, then change the box and reopen AR to verify a fresh
snapshot. Check an open/absent lid and repeat with an authorised tenant. Also
check that a disabled tenant cannot publish and that Hall/Window/Pergola/Fence/
Pavement/Chair retain their current AR behavior.

Exporter references (production is pinned, not automatically upgraded):
https://threejs.org/docs/pages/GLTFExporter.html
https://threejs.org/docs/pages/USDZExporter.html
