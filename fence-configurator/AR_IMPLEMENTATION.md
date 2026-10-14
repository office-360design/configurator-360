# Fence Firebase AR and export completeness

Release: `fence-ar-1`; shared interface: `firebase-ar-4`. Existing adapters refresh as `hall-ar-2`, `window-ar-3`, `pergola-ar-2`.

## User workflow

The top-bar cube is enabled for Fence, Hall, Window and Pergola only. Each adapter must opt in; ordering Tiles fourth on the website does not enable Tiles AR. Other configurators stay disabled.

Click Fence AR to capture the current assembly. The shared dialog defaults to Android, produces GLB, uploads it, verifies the asset and displays a locally generated QR. Switching to iOS/iPadOS exports USDZ from the same snapshot and updates the QR. Closing and reopening captures later changes. Preparation/upload progress, retries, copy-link, open-on-device, stale-request protection and localization are the same as Hall/Window/Pergola.

Scanning opens the product's localized phone page. Tap **Open AR** to launch Scene Viewer on supported Android devices or Quick Look in iOS/iPadOS Safari. A scanner is not guaranteed to auto-launch a native camera session. Unsupported Android devices can use a 3D fallback. The phone does not require a configurator account.

Links expire after 24 hours. Anyone with the link can view/download that snapshot until expiry. The editor does not upload camera footage. AR is a visualization, not a measuring/installation tool. Viewer lighting, glass and advanced material effects can differ from the editor.

## What is captured

`FENCE_CONFIGURATOR_API.getARAssembly()` flushes a pending model rebuild before capture. It cannot export an older build while a newer gate/panel/finish change is waiting. A failed rebuild must succeed on retry rather than marking stale geometry ready.

The source is `currentBuild.root`, not the scenery scene. The snapshot includes:

- Every segment and panel in straight, L, U, closed four-side and closed five-side layouts.
- Vertical/horizontal slats, solid panels and mesh infill; posts, caps, rails and physical fasteners.
- Configured pedestrian/driveway gates, their dimensions, positions, handing and hardware. No new gate animation is introduced by this AR update.
- Configured concrete footings or base plates with bolts/nuts. Finished grade stays Y=0; below-ground concrete is retained at its designed negative Y coordinates. Native surface occlusion may hide buried portions on a real site.
- Current material/finish colours and supported texture maps, including wood image maps and procedural maps.

House, ground/scenery, dimensions, lights, selection controls and nonphysical inspection helpers are excluded. Current physical moving-part positions are exported as static transforms; native AR does not contain the editor's interactive controls. Labels that are physical product signs are included, not measurement overlays.

## Shared physical-part capture

All four enabled products use `shared-3d/src/ar/productSnapshot.js`. The helper owns the captured geometry, material properties and image pixels and leaves source/editor resources unchanged. It handles material groups, draw ranges, reflected transforms, instancing/instance colours, vertex colours, emissive strength, generated normals for accessory meshes, and explicit front/back triangles for thin surfaces. Base, normal, roughness, metalness, emissive, AO and bump texture slots are copied where supported; alpha maps are packed into base alpha when they have compatible mapping. Textures retain their UV channel/transform and are capped at 1024 px for mobile use.

This release also stops omitting Hall foundations and removes the Window capture's previous base-texture-only restriction. Window's exploded transforms are restored on the clone while its actual sash-opening rotations remain; its earlier ready-flag fix is retained. Pergola roof/closure/accessory state remains captured from its actual assembly. Hall remains an independent build of the configured design with inspection effects removed.

Material export uses portable standard PBR plus transparent-glass approximation, not full renderer-specific shaders, environments, lights or physical refraction. Native formats/exporters differ in advanced-map support. Unsupported required geometry or unavailable image data fails with an error instead of silently dropping configured parts. Limits stay 300,000 triangles, 10 MiB GLB and 24 MiB USDZ. There is no part-removal optimization to make a too-large model fit.

Fence exports use the existing r169 import map and matching add-ons. Other products keep their existing runtime/exporter versions. No engine or dependency upgrade is included.

## Firebase deployment — no new administrator setup

Deploy both the website and **Deploy Firebase share backend** from the updated commit. Wait for both to succeed before testing. A backend still on the previous product allow-list rejects `product=fence`. Existing product requests/links remain compatible.

**Do not run a new Cloud Shell setup, create another bucket, alter IAM, or make a bucket public.** This release reuses the working AR infrastructure:

- Functions: `publishHallAR`, `getHallAR`, `cleanupHallAR`. The names remain for backward compatibility.
- Private bucket: `configurator-360-hall-ar`.
- Fence objects: `hall-ar/v1/<random-id>/fence.glb` or `fence.usdz`.
- Existing Firestore sessions, quotas, 24-hour expiry, native GET/HEAD/range handling, validation and cleanup.

The backend validates Fence tenant entitlement, not another product's entitlement. Global/network quotas are shared by all enabled products. No Supabase, TUS upload, manual hosting, new credentials or external QR-image service is used.

Phone routes:

- English/tenant: `/fence-configurator/ar.html`
- Romanian: `/configurator-garduri/ar.html`
- German: `/zaun-konfigurator/ar.html`

Existing web server aliases serve these routes. Fence's static build copies its `ar.html`, phone module and local AR icon. Website deployments must include the shared-3d helper and updated shared-ui modules, which are included by the existing build paths.

## Website order

`website/lib/configurators.ts` now provides this order, reindexed from 01 to 10:

1. Window
2. Hall
3. Fence
4. Tiles / pavement and paving
5. Pergola
6. Roof
7. Solar
8. Chair
9. Cardboard box
10. Bookshelf

Localized metadata preserves these indices. Desktop/mobile header menus, homepage, footer and other catalog consumers use that list. Static routes are consistent; the demo-interest selector reorders only the product subset it already supports.

## Repeatable checks

From the repository root:

```bash
node --no-warnings --experimental-loader ./fence-configurator/tests/ar-test-loader.mjs --test fence-configurator/tests/fence-ar.test.mjs
node --no-warnings --experimental-loader ./fence-configurator/tests/ar-test-loader.mjs --test shared-3d/tests/ar/completeness.mjs
node --test firebase-share-backend/functions/tests/hall-ar.test.cjs hall-configurator/tests/ar-policy.test.mjs
node --no-warnings --experimental-loader ./window-configurator/scripts/validation/window-ar-loader.mjs --test window-configurator/scripts/validation/window-firebase-ar.test.mjs
PERGOLA_AR_OFFLINE=1 node --no-warnings --experimental-loader ./pergola-configurator/tools/ar-test-loader.mjs --test pergola-configurator/tools/pergola-ar.test.mjs
node website/scripts/validate-configurator-order.mjs
npm run check --prefix window-configurator
npm run prepare:static --prefix window-configurator
```

The test loaders are offline fixtures using bundled Three r160, not production dependencies. The website validator uses the installed project TypeScript compiler (or global `tsc`) to compile and verify real localized metadata.

Completed locally:

- 58 automated test groups: eight Fence, four cross-product/Hall completeness, 13 Window, 13 Pergola, and 20 backend/policy.
- Fence source-part counts matched all exported parts across 40 layout/panel/foundation combinations, with gate and hardware checks. Actual default and complex mesh-gate GLBs passed backend validation.
- Every Hall template's configured-part counts, including foundations, matched its export; all four real GLBs passed byte/triangle validation.
- The complete Window validation suite and static build passed. The previous open/exploded export and loading-state regression checks remain.
- Website EN/RO/DE ordering, indices, links and common catalog consumers passed validation.
- Offline Chromium tested default Android, iOS-mode switching, QR link contents, publication failures/retry, close/reopen, localized labels and a 390 px mobile layout. Native UI rendering was used, but Firebase responses and the iOS exporter were simulated.
- A real textured Fence GLB was 1,114,648 bytes, with three embedded finish images. Additional browser capture checked eight Pergola maps across 92 parts and physical signage texture retention for commercial/production Halls.

Not tested here: live Firebase publication, a full iOS USDZ conversion, native phone placement, or full editor WebGL rendering. Actual GLB tests use r160 fixtures; deployed Fence/Hall use r169, Window r160, and Pergola its unchanged locked dependency. The Website/Pergola production Vite builds could not be run without their unavailable dependency downloads. Native iOS branch tests are not a physical iPhone acceptance test.

After deployment, test a wood-effect fence with both gate types and each foundation mode on Android and iOS, plus a closed multi-segment layout. Confirm all segments, gates, infill, caps and finish are present and no scenery is exported. Repeat a representative Hall with foundations/equipment, an open sash Window in exploded editor view, and a Pergola with screens/lighting. Check that Tiles remains AR-disabled and that all locale menus show the new order.
