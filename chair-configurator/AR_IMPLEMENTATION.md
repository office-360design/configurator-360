# Chair Firebase AR

## Behavior

The chair configurator opts into the existing shared AR dialog. Android is the
initial platform on each opening; iOS/iPadOS selects the USDZ export instead of
the Android GLB. QR generation, upload checks, retries, Copy link, Open on this
device, localized phone pages and 24-hour expiry use the same implementation as
Hall, Window, Pergola, Fence and Pavement. A phone scan opens a landing page;
the user then taps Open AR.

The dialog keeps the recently simplified copy. It does not show export-content
or real-world-scale paragraphs, nor mention the storage provider during
preparation. The short privacy/expiry notice remains. English, Romanian and
German are supported.

Only Hall, Window, Pergola, Fence, Pavement and Chair are enabled by the shared
policy. Product adapters must also explicitly provide the viewAR capability.
Other configurators are still disabled.

## Captured product

`ChairScene.captureARSnapshot()` captures the rendered `model.group` through
`shared-3d/src/ar/productSnapshot.js`. It does not rebuild a default chair. The
current wood species, wood colour, upholstery type and upholstery colour are
therefore captured directly from the material system. All 18 physical mesh
parts are retained: the legs, uprights, arms, seat rails, back supports, cross
rail, cleats, upholstered seat and back, and seat underside.

Geometry, transforms, supported material settings, UV transforms and the pixels
of the generated wood/upholstery colour, normal and roughness maps are copied
into an independent snapshot. The ground, lights, camera and presentation
objects are outside the product root. The editor's meshes, materials and
camera are not changed. Reopening the dialog captures later edits; switching
platforms within one opening keeps the same captured configuration.

The existing Chair geometry is in metres. Its lowest physical point is placed
on y=0. The export does not impose a new nominal size or change the Chair model.
Advanced renderer-only surface effects and lighting can differ in native AR;
this is a static model, not a configurator running inside the phone viewer.
Export limits reject an oversized model rather than deliberately omitting parts.

## Runtime and files

Chair remains a static page on its existing vendored Three.js r160 engine. No
root dependency installation, import-map engine change or Vite conversion is
introduced.

- `js/ar/controller.js`: product adapter for the common dialog.
- `js/ar/exportChair.js`: independent snapshot and native file export.
- `lib/exporters/GLTFExporter.js`, `lib/utils/TextureUtils.js`: unchanged r160
  copies from the repository's Window runtime. The exporter blob was checked
  against the upstream r160 source. MIT attribution is in
  `lib/AR_EXPORTERS_LICENSE.txt`.
- iOS loads the r160 USDZ exporter from the same pinned CDN used by the Window
  implementation. Its bare Three import resolves to Chair's local engine.
  The r160 exporter uses asynchronous `parse()`, not `parseAsync()`.
- `ar.html` and `js/ar/phone.js`: chair phone landing page. Quick Look's link
  contains one img child. Existing EN/RO/DE routes and tenant hosts are retained.

Cache versions: Chair `chair-ar-1`; shared AR imports `firebase-ar-6`.

## Deployment

Apply this update on top of the Pavement Firebase AR/dialog-cleanup update and
all preceding validation/build fixes. Deploy BOTH the website and the Firebase
share backend. The backend change adds `chair` to the accepted product list in
`firebase-share-backend/functions/hall-ar.js`; without it, Chair publication is
rejected even when the frontend has the new button.

No new cloud infrastructure or permissions are required. This reuses:

- private bucket `configurator-360-hall-ar`;
- existing `publishHallAR`, `getHallAR` and `cleanupHallAR` functions;
- existing Firestore session records, tenant policy and object validation;
- existing expiry, cleanup, content type, range-serving and storage rules.

Do not rerun administrator setup, recreate the bucket, grant more roles or
make it public. No Supabase/TUS path is used. Existing Hall, Window, Pergola,
Fence and Pavement sessions remain supported. Bookshelf and email-backend code
are not modified.

## Automated checks

From the repository root:

```bash
node --no-warnings --experimental-loader ./chair-configurator/tests/ar-test-loader.mjs --test chair-configurator/tests/chair-ar.test.mjs chair-configurator/tests/front-arm-joint.test.mjs
node --test hall-configurator/tests/ar-policy.test.mjs scripts/validation/tenant-branding.test.mjs firebase-share-backend/functions/tests/hall-ar.test.cjs
```

The new Validate Chair AR workflow runs the same geometry/adapter checks and
shared/backend tests on relevant pull requests and main pushes. No npm install
is needed for those checks; they use the actual vendored engine and exporter.

For the offline browser suite, with Python Playwright and Chromium installed:

```bash
python chair-configurator/tests/ar-browser.py --artifacts /tmp/chair-ar-tests
```

The browser suite executes the actual ChairScene material methods, geometry,
shared capture, GLB exporter, QR generator and dialog through in-memory modules.
It does not instantiate the WebGL renderer. Publication/manifest responses and
the USDZ exporter are simulated in this suite. Generated test QR links do not
refer to live uploads. Screenshots are UI fixtures, not live product renders.

Recorded checks for this update:

- 11 Chair AR tests and all 14 existing Chair front-joint geometry tests passed.
- 72 other AR policy/adapter/completeness/backend tests passed (83 AR tests in
  total including Chair); 11 tenant-branding tests also passed.
- Browser checks covered all 42 combinations of three woods and fourteen
  upholstery types, independently selected colours, six texture maps per
  capture, all physical parts, snapshot isolation, platform switching,
  retries, clipboard, localization and 390-pixel dialog layout.
- Actual textured GLB: 2,276,192 bytes, 8,304 triangles, 18 source parts grouped
  into two material meshes, six embedded texture images; accepted by the
  backend asset validator. This uses Chair's real r160 runtime, not a substitute
  engine version.
- Window's full validation suite and static build passed. Pergola syntax and
  localization checks passed; its six static build-resolution checks passed.
  The real Vite-resolver test could not load the unavailable Vite dependency,
  and a full Pergola Vite build was not run in this environment. Its previously
  corrected aliases/deduplication and CI build workflow are unchanged.

Not verified here: live Firebase publication, physical Android/iOS placement,
full WebGL rendering, or a complete native USDZ export. The iOS dialog tests do
not substitute for those checks.

## Device acceptance checklist

1. After both deployments finish, reload Chair. Verify that AR is enabled and
   that other previously enabled products still open their own dialog.
2. Change wood species/colour and upholstery type/colour, then immediately open
   AR. Confirm Android is selected and only generic preparation messages appear.
3. Scan the Android QR and tap Open AR. Check the arms, supports, seat/back,
   underside, selected colours and texture appearance. Confirm a plausible
   physical scale and foot placement; resizing is available in the native viewer.
4. Switch the same dialog to iOS, scan in Safari and tap Open AR. Check the same
   parts and materials. Compare native glass/lighting/surface differences only
   where applicable; Chair has no glazing.
5. Edit the chair again and reopen AR. Confirm the new snapshot differs and the
   editor itself has not reset, moved, or replaced its materials.
6. Test retry after a connection failure, EN/RO/DE phone routes, tenant product
   restrictions where used, and creation of a fresh QR after expiry.
