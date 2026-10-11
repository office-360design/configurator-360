# Window AR — Firebase QR workflow

## Deployment

Apply this update at the repository root. Deploy both the website and **Deploy
Firebase share backend** from the updated commit. The existing `publishHallAR`,
`getHallAR`, and `cleanupHallAR` functions are intentionally retained; their
handler now accepts the allow-listed `window` product in addition to `hall`.

**Do not rerun administrator setup, create another bucket, or grant more IAM
permissions.** This update uses the already-provisioned private
`configurator-360-hall-ar` bucket, the `hall-ar/v1/` object prefix, existing
Firestore records, and existing cleanup job. No provisioning or deployment
allow-list changes are required. No bucket is made public.

Wait for both deployments before testing Window AR. The client rejects a Hall
response to a Window request, so a website-only deployment against the old
backend deliberately cannot display a misleading Window QR code. Existing Hall
clients and records remain compatible; requests omitting `product` default to
Hall.

## Interaction

- AR is enabled only for Hall and Window, and only when their adapter opts in.
- Clicking Window AR captures the current assembled window snapshot and opens
  the same shared dialog used by Hall. Android is selected by default.
- Android exports GLB; iOS/iPadOS exports USDZ. Both export the same captured
  snapshot. Close/reopen to capture later configuration changes.
- The QR appears only after publication and a successful model availability
  check. Scanning opens a Window-specific phone page; tap **Open AR** there.
- Android uses Scene Viewer (`ar_preferred`, 3D fallback). Safari on iOS/iPadOS
  uses Quick Look (`rel="ar"` with one image child).
- Copy link, open on this device, retries, platform switching and expiry feedback
  are shared. Labels are localized in English, Romanian and German.

This uses native phone viewers, not browser-only WebXR or the former manually
hosted/Supabase/TUS workflow. Existing archived exporter files are not imported by
this flow. `ar-upload-config.js` is inert and no longer included in `index.html`.

## Export

Only `WindowBuilder.mainGroup` is exported. Profile geometry, glazing, handles,
finish colours and current sash/opening transforms are captured; scenery, the
house, ground, labels and component-selection highlighting are excluded.
Inspection-only exploded translations are restored on the **clone**, never on
the editor. Hidden model parts stay hidden.

Window units are already metres. The model is centred horizontally with its
lowest point on the placement plane. Scaling remains available in the native
viewer. AR is a visualization, not an installation/alignment measuring tool.

The exporter bakes transforms and UV transforms, handles mirrored parts and
material groups, and maps editor materials to portable standard PBR materials.
Transmission-only glazing receives an explicit transparent approximation for
native viewers. Renderer-specific reflection/clipping/shader effects are not
transferred. Complex/textured configurations are subject to the existing size
limits (10 MiB GLB / 24 MiB USDZ) and show an error rather than publishing a broken
link.

GLB uses the existing bundled Three r160 exporter. USDZ uses the matching pinned
r160 exporter from jsDelivr, not Hall's r169 exporter. Its asynchronous `parse`
API is supported explicitly. Existing geometry and rendering libraries are not
upgraded.

## Storage and privacy

POST `publishHallAR?product=window`, with the existing binary body and
`X-Hall-AR-Format` header, stores `hall-ar/v1/<random-id>/window.glb` or
`window.usdz`. Metadata identifies the product. The existing network/global
quotas are shared with Hall; switching platform publishes another model.

Links expire after 24 hours. Anyone holding a valid link can view that snapshot
without logging in. The scheduled cleanup handles both products. For tenant
sites, publication is checked against that tenant's **Window** entitlement;
Hall entitlement alone does not authorize Window publication.

## Validation

From the repository root:

```bash
node --test firebase-share-backend/functions/tests/hall-ar.test.cjs hall-configurator/tests/ar-policy.test.mjs
node --experimental-loader ./window-configurator/scripts/validation/window-ar-loader.mjs --test window-configurator/scripts/validation/window-firebase-ar.test.mjs
cd window-configurator
npm run check:startup
npm run check:window-i18n
npm run check:window-importmap
npm run check:client-modules
npm run prepare:static
```

The added tests cover policy, product-specific/localized links, serialization,
selection-safe capture, mirrored/open geometry, glazing transparency, real r160
GLB generation and backend asset validation. Backend tests include both format
records, byte-range serving, Window-only tenant authorization, old Hall request
compatibility and mixed-product cleanup.

An offline browser run also loaded the actual Window CAD geometry with rendering
and cloud account/settings services simulated. Its default window exported a
5.47 MiB self-contained GLB (70 source meshes / 85,220 triangles), accepted by the
backend asset validator. Shared-dialog tests covered Android default, platform
switching, local SVG QR generation, successful-session cache, close/reopen,
localization, mobile fit, error feedback and Escape.

**Not verified here:** physical phone placement, live publication in the user's
project, and a complete r160 USDZ file export. iOS branch API and native link
markup were inspected/tested; the dialog's iOS state tests simulate the asset
export and are not an iPhone acceptance test.

After deployment, test one normal and one opened-sash window on Android and on
Safari/iOS. Check scale, glazing and hardware; verify that Hall still works and
that the other configurators' AR buttons remain unavailable.

Primary viewer references:
- https://developers.google.com/ar/develop/scene-viewer
- https://developer.apple.com/quick-look-gallery/
- https://github.com/mrdoob/three.js/blob/r160/examples/jsm/exporters/USDZExporter.js
