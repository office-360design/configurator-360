# Pavement AR and shared-dialog cleanup

Release: `tiles-ar-1`; shared AR modules: `firebase-ar-5`.

## User workflow

Pavement joins Hall, Window, Pergola and Fence in the existing shared AR workflow. AR is still unavailable for Roof, Solar, Chair, Cardboard Box, Bookshelf and Gas. No extra AR settings or account-save step is introduced.

The top-bar AR button captures the current pavement state and opens the shared dialog with Android selected. After export and successful publication/availability verification, a QR is shown. Android uses GLB; iOS/iPadOS uses USDZ from the same captured configuration. Close and reopen the dialog to capture later edits. The existing retry, cancellation, copy-link, open-on-device and 24-hour expiry behavior is unchanged.

Finish or cancel drawing an outline before opening AR. Invalid/empty paving areas and models exceeding the mobile limits show an error rather than exporting partial geometry.

The phone page is `/tiles-configurator/ar.html` on the English, Romanian, German and entitled tenant origins. Scanning leads to a page with an **Open AR** action. Android uses Scene Viewer and iOS/iPadOS Safari uses Quick Look. Native viewer/device compatibility still applies; a QR reader is not assumed to launch the native viewer automatically.

## Current configuration preserved

`createTilesARController` copies the current committed state immediately when the dialog opens. The export is built using the same `layout`, `curbLayout`, polygon clipping and deterministic stone-colour logic as the editor, not a default demonstration model or a cached screenshot.

Included:

- Current paving dimensions and supported outline, tile type, bond/pattern, rotation, base/accent colours and mixed colour distributions.
- Full stones, interlocking profiles and clipped pieces at area and house-footprint boundaries.
- Selected curb type, colour, enabled edge runs, partial lengths and boundary cuts.
- Full physical stone/curb thickness. Paver tops stay at the editor's finished-surface height; most thickness remains below that plane rather than making the entire paving sit above the ground.

The context house, site photograph/location metadata, surrounding ground, grid, dimensions, selection controls and lights are not exported. House geometry still determines the excluded area in the actual paving. Each exported stone has its own portable material colour so mixed colours do not depend on the native viewer interpreting instance colours. A procedural normal map carries the concrete surface detail. Native appearance can differ from the editor's lighting and bump shading.

The state, editor resources and camera are not changed by capture/export. Geometry uses the existing metre scale. Limits remain 300,000 triangles, 10 MiB GLB and 24 MiB USDZ; no configured stones or curbs are silently removed to meet these limits.

`surfaceLayout.js` factors out the previously inline cut-face calculations from the viewer so the viewer and AR use the same shapes. It does not alter the layout/BOM algorithm.

## Shared AR text

For every enabled configurator, the two long snapshot/scale paragraphs have been removed from the dialog markup and all EN/RO/DE translations. The equivalent scale paragraph is also removed from the phone pages. The brief scan instructions, platform choice, expiry and link-privacy notice remain.

All preparation stages use generic localized wording, such as **Preparing your QR code…**, **Getting your AR preview ready…** and **Almost ready…**. Upload infrastructure names do not appear in progress or service-unavailable messages. Product-exporter progress values are normalized by the shared dialog rather than shown verbatim.

## Deployment: existing Firebase infrastructure

Deploy the website and **Deploy Firebase share backend** from this update and wait for both to succeed before testing. The existing backend must be updated to accept `product=tiles`; deploying only the client is not sufficient.

No new Cloud Shell setup, buckets, IAM roles, secrets, API enablement or functions are required. Reused resources:

- `publishHallAR`, `getHallAR`, `cleanupHallAR` (names retained for compatibility).
- Existing private `configurator-360-hall-ar` bucket and session collection.
- Existing validation, tenant entitlement, quotas, expiration, range/HEAD responses and scheduled cleanup.
- New assets use `hall-ar/v1/<random-id>/tiles.glb` or `tiles.usdz`; the bucket is not made public.

Links are bearer links valid for 24 hours. Anyone with the link can view that captured model during its validity period. QR generation stays local; no Supabase or third-party QR image service is added.

Previous fixes for Window loading-state refresh, tenant-branding validation and Pergola's Three.js build resolution remain intact. Pergola's `vite.config.js`, lockfiles and production-build validation workflow are unchanged. The Window AR entry-cache test now verifies a refreshed numeric release instead of one hard-coded label, while retaining its ready/profile-fix checks.

## Checks and limitations

Run from the repository root:

```bash
npm run check --prefix tiles-configurator
node --no-warnings --experimental-loader ./fence-configurator/tests/ar-test-loader.mjs --test tiles-configurator/tools/tiles-ar.test.mjs
node --test firebase-share-backend/functions/tests/hall-ar.test.cjs hall-configurator/tests/ar-policy.test.mjs
node --no-warnings --experimental-loader ./fence-configurator/tests/ar-test-loader.mjs --test fence-configurator/tests/fence-ar.test.mjs shared-3d/tests/ar/completeness.mjs
node --no-warnings --experimental-loader ./window-configurator/scripts/validation/window-ar-loader.mjs --test window-configurator/scripts/validation/window-firebase-ar.test.mjs
PERGOLA_AR_OFFLINE=1 node --no-warnings --experimental-loader ./pergola-configurator/tools/ar-test-loader.mjs --test pergola-configurator/tools/pergola-ar.test.mjs
node --test scripts/validation/tenant-branding.test.mjs
npm run check --prefix window-configurator
npm run prepare:static --prefix window-configurator
npm run check --prefix pergola-configurator
```

Local results: all 439 existing Tiles tests, 70 AR test groups and 11 tenant-branding tests passed. The complete Window validation/static build and Pergola syntax/localization check also passed. New Pavement cases cover all six stone types and supported patterns at two rotations (36 combinations), custom/parametric outlines, rotated house exclusions, enabled/disabled curbs, geometry limits, native link shape and translation completeness.

Actual GLB files from default, interlocking and house-cutout configurations passed the backend asset validator. A textured browser export was 287,904 bytes and included its normal-map image. Browser tests used actual DOM, Canvas2D, shared dialog/publisher code and GLTF export, but simulated network services and an iOS exporter stub. They covered platform changes, new snapshots after edits, errors/retry, generic progress and description removal for all five products in all three languages, and mobile sizing.

Offline geometry/export tests use the bundled Three.js r160 fixture. Production Pavement remains pinned to r169; dependency versions have not been changed. WebGL scene rendering, a complete native USDZ export, live Firebase publication and physical phone placement were not verified in this environment. Pergola's six declarative build-resolution checks passed, but the actual Vite integration and production build could not run because package installation was unavailable. The existing GitHub build-validation workflow still requires the real production build; it is not bypassed.

## Acceptance check after deployment

1. Edit paving dimensions, pattern, rotation, colours, curb selection and a house cutout. Open AR; check that Android is the default and all preparation wording is generic.
2. Scan the Android QR, tap Open AR and inspect the complete paving and selected curbs, including clipped edges/excluded house footprint.
3. Switch to iOS/iPadOS, scan on a supported device in Safari and compare that model with the same configuration, especially concrete colour variation and curb thickness.
4. Close AR, change the paving again and reopen it; verify the new snapshot is used.
5. Open Hall, Window, Pergola and Fence AR dialogs in each supported language; confirm the two long paragraphs are absent and there are no infrastructure names in progress messages.
6. Check that other configurators remain disabled and the existing Hall/Window/Pergola/Fence QR flows still work.
