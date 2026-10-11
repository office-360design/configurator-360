# Pergola Firebase AR

Release markers: `pergola-ar-1` / shared `firebase-ar-3`.

## User workflow

The existing shared AR dialog now supports Pergola in addition to Hall and Window. Other configurators remain disabled by the explicit shared policy. The Android radio option is selected every time the dialog opens. Android exports GLB; iOS/iPadOS exports USDZ. A QR is displayed only after publication and the asset availability check succeed. The phone landing page asks the user to tap Open AR; it does not assume a scanner can automatically open a native camera session.

Platform switching, upload progress, retry, Copy link, Open on this device and the 24-hour expiry are inherited from the same shared dialog used by Hall and Window. Text is localized in English, Romanian and German. Native placement and feature support depend on the actual phone and browser.

## Deployment

1. Apply the repository-root update and commit it.
2. Allow the website deployment to build Pergola with its existing locked Three.js/Vite dependencies. Vite now builds both `index.html` and `ar.html`, together with their relative assets.
3. Allow **Deploy Firebase share backend** to finish. It redeploys the already-listed `publishHallAR`, `getHallAR` and `cleanupHallAR` exports with the expanded product allow-list.
4. Reload the deployed Pergola configurator before testing. Confirm the generated QR opens an actual AR phone page, not the configurator home screen.

**No additional administrator setup, bucket, IAM grants, credentials or Cloud Shell commands are introduced.** This release reuses the Hall AR infrastructure that was already provisioned and tested. Website deployment alone is insufficient: the previous backend rejects `product=pergola`.

Existing storage and functions deliberately retain their names:

- Private bucket: `configurator-360-hall-ar`.
- Objects: `hall-ar/v1/<random session id>/pergola.glb` or `pergola.usdz`.
- Firestore sessions: `hallARSessions`; same quota collection and cleanup job.
- Same 24-hour capability-link expiry, private bucket rules, MIME validation and native-viewer range responses. Link holders can view a snapshot without signing in.
- No Supabase/TUS/manual object URLs or third-party QR service.

Localized phone routes are `/pergola-configurator/ar.html` (English and tenant hosts), `/configurator-pergola/ar.html` (Romanian public host), and `/pergola-konfigurator/ar.html` (German public host). Existing web-server aliases serve the latter paths from the Pergola build.

## Export ownership and scope

`src/ar/controller.js` checks the live PergolaScene and its structural signature against the current store, then captures `scene.pergola`, never the entire scene. It does not use Window's readiness globals. A model which is genuinely rebuilding or has unloaded image data can be retried without a persistent extra ready flag.

`src/ar/exportPergola.js` copies physical meshes from the assembly, bakes their current transforms and batches them by portable material. Roof/louver positions, configured glazing/screens, privacy panels and fitted accessories are included when present in the assembly. Lights, line helpers, hidden/excluded subtrees, house, ground, deck, trees, dimensions and compass are excluded. Native AR contains a static snapshot, not live configurator controls.

Geometry is already in metres. Its exported copy is centered horizontally and grounded at its lowest vertex without rescaling. Source geometry, materials, textures, roof transforms and editor camera are not modified or disposed. Reflected transforms, instanced meshes, double-sided surfaces and accessory meshes lacking normals are handled in the owned copy. Temporary export resources are disposed after serialization/export.

Portable materials retain color, roughness, metalness, supported image maps and transparent glazing. Procedural RGBA DataTextures are copied into owned canvases. Textile alpha maps are packed into base-color alpha for cross-viewer portability. Texture size is capped at 1024 px; renderer-specific environments and shader effects are not exported. Native viewer lighting/glazing need not exactly match the editor.

The Pergola-only material adapter also resolves the supplied legacy `fabric.woven` provider name to the existing `fabric.weave` implementation on that scene's material-library instance. Without this, detailed screen panels failed during rebuild before AR could capture them. Shared presets and other configurator material libraries are unchanged.

Limits: GLB 10 MiB, USDZ 24 MiB, 300,000 exported triangles. Oversized/invalid exports fail before publication. Exports use the Pergola package's locked Three.js add-ons, not a cross-version CDN exporter.

## Tests and acceptance

From the repository root, with normal dependencies installed:

```bash
npm run check --prefix pergola-configurator
npm run test:ar --prefix pergola-configurator
node --test firebase-share-backend/functions/tests/hall-ar.test.cjs
node --test hall-configurator/tests/ar-policy.test.mjs
node --experimental-loader ./window-configurator/scripts/validation/window-ar-loader.mjs --test window-configurator/scripts/validation/window-firebase-ar.test.mjs
npm run build --prefix pergola-configurator
```

Offline geometry fixture, when npm packages are unavailable:

```bash
PERGOLA_AR_OFFLINE=1 node --experimental-loader ./pergola-configurator/tools/ar-test-loader.mjs --test pergola-configurator/tools/pergola-ar.test.mjs
```

The offline loader is test-only. It uses the repository's bundled r160 core/GLB exporter and stubs optional external asset loading; production remains on Pergola's existing locked Three.js 0.185.1. Do not import this loader into the application.

Completed locally:

- 13 Pergola test groups: policy, locales/routes, three actual procedural product families, dimensions, roof poses, copy ownership, transparency/winding, missing accessory normals, valid standalone GLBs, input/retry failures, phone entry and detailed screen-material compatibility.
- 13 Firebase tests, including Pergola GLB/USDZ publication, tenant entitlement, manifest/HEAD/range serving, expiry and mixed Hall/Window/Pergola cleanup with mock cloud services.
- 13 Window AR regressions and 5 Hall AR regressions.
- Pergola syntax/i18n checks and syntax checks on all modified JavaScript files.
- In-memory Chromium dialog tests with real geometry and GLB export, but simulated uploads: Android/iOS switching, caching, retry after readiness/publication errors, RO mobile layout and unchanged editor geometry. The iOS exporter was a UI stub in this test, not a real USDZ conversion.
- Textured default GLB: 572,452 bytes. Mixed screen/glazing GLB: 712,164 bytes. Both passed the backend asset validator. An explicit alpha-map fixture verified the packed alpha channel survives serialization/export.

Not verified locally: live Firebase publication, native phone placement, full editor WebGL rendering, a complete USDZ export, or the production Vite build. Dependency installation was blocked by unavailable npm network access; package versions were not changed to work around it. Browser tests used the r160 fixture, not the deployed 0.185.1 runtime.

Phone acceptance after deployment:

1. Test Android default and iOS separately with a basic freestanding pergola. Scan QR, tap Open AR, confirm orientation/size and no surrounding house/ground.
2. Change louver angle, frame finish and side closures; reopen AR and check the exported snapshot reflects the changes while the editor remains unchanged.
3. Repeat with wall-mounted and accessory-rich configurations. Inspect screen transparency and glazing in both native viewers.
4. Test all public language routes and a permitted tenant. Check retry after a network failure and expiry feedback.
5. Verify Hall and Window still publish/open; confirm AR remains disabled for the other configurators.

AR is a visualization tool, not a site survey, structural design, measuring or installation tool.
