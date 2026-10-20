# Segmentation integration — step 2: result geometry and model camera

## Apply

Apply this ZIP **on top of the step-1 patch**, at the repository root. It contains
only step-2 changes, not another copy of the step-1 geometry/editor modules.
Baseline: the step-1 ZIP from this conversation, built on `tiles` commit
`f096d0cb4261b009f1920a7304615b482ebe4930`. The connected branch still had that
commit when step 2 was prepared.

There are no new npm packages, database changes, build steps, Python dependencies,
model downloads or service requests in this patch. Use the normal existing site
workflow and reload the configurator after replacing the files.

## What this step does

- Decodes the Python service's schema-1 semantic and binary RLE responses.
- Converts the effective paving mask into separate outer boundaries and holes.
- Simplifies dense boundaries while preserving the ring hierarchy; retries with
  less simplification if the proposed contours would invalidate the topology.
- Projects pixel-cell boundaries into the model's metric ground plane.
- Imports the actual model camera/plane/intrinsics into Three.js. It does not
  synthesize a 1 m square and does not guess a height, pose, or focal length.
- Applies the new camera and paving state as one local undo/redo action.
- Provides a local JSON importer under a collapsed **Debug · Model result import**
  dropdown. This is the step-2 testing/import utility, not the complete diagnostic
  interface planned for step 4.

Automatic upload -> inference remains **step 3**. No model is run by this patch.

## Try a real exported result

1. In the segmentation prototype, analyze the desired photograph and export its
   JSON with **Include RLE masks** enabled. A normal summary-only JSON has no
   usable mask; the importer reports this instead of inventing an outline.
2. Load the **same original, uncropped, oriented photograph** in the tiles
   configurator. Stop at the reference-square screen; manual calibration is not
   required for a valid model-result import.
3. Open **Debug · Model result import** at the upper right and select the JSON.
   The same dropdown appears inside the normal right sidebar after setup.
4. The camera and paving appear together and the initial setup completes. Use
   Add area, Remove area, Edit boundary, Undo/Redo, and Free camera as usual.

The importer also accepts one JSON object containing `{ segmentation, geometry }`
(the raw `/api/segment` and `/api/camera` response bodies), or those two bodies in
separate JSON files selected together. Individual files are limited to 32 MB.

An existing pavement, including client-made holes, is not overwritten without an
explicit replacement confirmation. Finish or cancel an unfinished outline before
importing. Import is undoable; it never silently applies a later result over an
edited design. Starting from scratch clears only the paving, preserving the valid
imported camera and photo.

Dimension/aspect checks and response image IDs catch mismatched jobs. They cannot
prove that two independently selected local image files have identical contents.
Selecting a saved export explicitly associates its old prototype image ID with
the current photo. The dialog explains this; use the same photo, not a crop or a
second image with similar dimensions.

Prototype exports that use only a reference-rectangle homography, and exports
without a valid metric model camera, are rejected by this 3D import path. The
existing manual reference-square workflow remains available independently.

## Synthetic visual fixture (does not run models)

For a deterministic browser check:

- Upload `tiles-configurator/tests/fixtures/server-model-photo.png`.
- Import `tiles-configurator/tests/fixtures/server-model-result.json` through Debug.

Expected: **two disconnected paving regions and one internal hole**, aligned to
colored shapes in the image; the blue-gray hole remains unpaved. The photograph
is a small, explicitly labeled synthetic test image, not a model prediction.
The camera JSON was produced by the uploaded segmentation project's real
`server.geometry.fit_camera` using synthetic points on a known plane. Semantic
labels are synthetic as well. This checks the response contract, not ML accuracy.
The fixture's vector area is about **6.653785795 m²** before further edits.

Check Photo view -> Free camera without moving the view first, return to Photo
view, open/close the sidebar, and resize to portrait/landscape. Then add another
hole, move one of its points, change tile pattern/direction, clear, undo, and redo.
Try H-Beton as well as a rectangular tile.

## JavaScript integration for step 3

The public browser API now includes:

```js
const api = window.TILES_CONFIGURATOR_API;
const token = api.getPhotoSource();
// { photoId, width, height, designRevision, drawing, draftVertices }
// width/height describe the oriented ORIGINAL photo. The service may use a
// proportionally resized working image (32..1100 pixels per side).

// Send token.photoId as image_id when the step-3 service client is implemented.
// Retain this exact token across asynchronous inference. Do not get a new token
// after a response arrives simply to bypass the stale-result guard.
const summary = api.importModelResult(
  { segmentation: segmentResponse, geometry: cameraResponse },
  {
    photoId: token.photoId,
    designRevision: token.designRevision,
    replaceExisting: true, // Explicit user-authorized replacement, not a default.
    targets: ['grass', 'dirt'], // 'pavement' is available as an opt-in target.
    tolerancePx: 0.75,         // 0..4 working-image pixels; 0 disables RDP.
  },
);
```

By default, the response `image_id` must equal the active photo token. The local
file importer additionally passes `associateWithCurrentPhoto: true` to explicitly
associate an old export; an automatic inference client should not use that flag.

Pure module integration is available independently of the DOM:

```js
import { prepareModelImport } from './js/segmentationAdapter.js';
const result = prepareModelImport({ segmentation, geometry }, {
  expectedImage: { image_id: requestId, image: { width: workingW, height: workingH } },
});
// result.camera, result.regions, result.origin, result.pixelRegions,
// result.masks, result.diagnostics, result.warnings
```

A valid camera plus an explicit selection can be prepared without segmentation:
`prepareModelImport({ geometry, selection: encodedBinaryRLE })`. An all-zero
selection is valid and can supply the camera for subsequent manual drawing.
No original semantic diagnostics are claimed for this case.

Additional API reads:

```js
api.getModelCamera();        // Small calibration copy; null in manual-only mode.
api.getModelImportSummary(); // Original import counts/warnings, not current edits.
api.getModelImportMasks();   // Copies of ORIGINAL imported masks, not current edits.
api.getEstimate();           // Includes measurementStatus: 'estimated' for model scale.
```

Masks from an older undone import are not returned as though they belonged to a
newer one: the mask reader returns null when the retained result does not match
the current import summary. Only the latest import's large mask buffers are kept.

## Coordinate and camera contract

The server returns OpenCV camera coordinates (X right, Y down, Z forward) and a
metric plane frame. Its `axis_x_camera = normal_camera × axis_z_camera` fixes the
handedness. The browser mapping is:

```text
geometry.x = model_ground.x
geometry.z = -model_ground.z
scene.x = geometry.x - areaOrigin.x
scene.y = groundY + elevationAboveGround
scene.z = geometry.z - areaOrigin.z
```

That ground-Z sign is essential: keeping both model ground axes with scene +Y
above ground would create an improper reflection instead of a camera rotation.
The imported area origin is `{ x: 0, z: 0 }`; disconnected regions and holes are
never individually recentered. The model's full `origin_camera_m` is retained.

The projection uses independent fx/fy, skew, principal point and the photo's
actual content rectangle. The inverse projection is refreshed alongside it for
ray picking. Resizing updates projection without fitting a different camera.
Entering free camera keeps the imported pose and projection; ordinary orbit
controls take over only when the user interacts. The background image and camera
now use the identical padded content rectangle, including manual photo mode.
Handle screen sizes use the actual projection rather than a symmetric-FOV guess.

## Selection, holes and occlusion

Raw semantic labels are never relabeled from geometric support. Defaults select
canonical grass (10) and dirt (6); existing pavement (4) is opt-in. Other labels,
including unknowns, are protected in this initial automatic suggestion.
Uncertainty and the broad camera ground hint are retained for diagnostics, not
silently applied as additional paving categories or masks.

A prototype export's explicit paving mask is authoritative as its initial
selection, including manual holes and intentional semantic overrides. The export
does not contain original semantic labels; diagnostics report them unavailable.

Ground-support/projection filtering affects only the imported suggestion. Future
client edits use the step-1 vector editor and are not silently reset/reclipped
against the original model mask.

Optional explicitly supplied `occlusion` binary RLE is retained separately. It is
not subtracted from design geometry or quantities. A conservative segmentation
suggestion may initially leave an object-shaped gap; that is not a declaration
that the client wants a permanent hole. A client can add paving there deliberately.
Foreground compositing is not implemented in this patch.

Mask contours represent complete pixel cells, not a hull of foreground pixels.
The tracer uses 4-connected foreground / 8-connected background. At diagonal
pixel contacts, a 0.02-pixel inward bevel resolves zero-width contacts without
changing any pixel-centre classification. A diagonal channel to the exterior is
an exterior notch, not an enclosed hole. The beveled corners are locked during
simplification. Enclosed one-pixel holes are retained; no minimum-size hole fill,
connected-component deletion or silent point truncation is performed.

Simplification can move a boundary within its requested pixel tolerance; it is
not an exact area-preserving operation. Diagnostics include the unsimplified
projected-pixel area, the final vector area and their difference. Actual tile
geometry and quantities use the same final vector regions, including their holes.

Whole-pixel projection checks reject support mismatches, cells crossing the
horizon/behind the camera, cells beyond 80 m camera range, and cells over 1 m².
Options may make those two upper limits stricter, not disable them. The existing
step-1 topology/layout budgets remain in effect, plus a 100,000 boundary-edge
trace budget. Budget failures are reported, not converted into truncated masks.

## Scale, history and persistence scope

Model-derived scale is **estimated**, even with a good plane fit. This is shown
in the main area badge, the import summary, `getEstimate()` and the CSV status row.
No result is labeled physically verified. Tile product choices and rates are
preserved. An unrelated 3D demo-house exclusion is disabled on model-result import.

Local undo snapshots carry the camera/calibration, setup mode and vector state
as one transaction. They do not copy large image/mask buffers into every edit.
The ordinary saved/share state remains the step-1 geometry state; complete photo,
camera and result persistence/reopening is still step 5. A reopened configuration
requires its photo and model result to be imported again at this stage. Do not
use this intermediate patch as a completed production persistence workflow.

## Verification

Run the focused suite from `tiles-configurator`:

```sh
node --test tests/regions.test.mjs tests/regions-layout.test.mjs tests/model-camera.test.mjs tests/mask-contours.test.mjs tests/segmentation-adapter.test.mjs tests/model-import-session.test.mjs
```

**262 tests passed**: the 123 step-1 tests and 139 new tests. Coverage includes
all tile formats/patterns at four rotations for imported holes, camera handedness
and round-trips with roll/unequal intrinsics/skew/off-centre principal points,
portrait/landscape viewport changes, strict result/RLE validation, intentional
hole edits, conservative masks, projection limits, one-transaction undo/redo,
stale-result rejection and rollback. One contour test exhaustively checks all
512 binary 3×3 masks at pixel centres. The camera-contract fixture additionally
uses the uploaded Python fitter's real output from synthetic geometry.

JavaScript syntax checks also passed. The session tests execute the actual app
transaction functions with a simulated viewer/DOM. They do not exercise WebGL.
A Chromium launch was attempted, but the browser executable was absent. Therefore
live-site/browser/WebGL checks and real learned-model inference were **not run**.
The full original repository test suite was not run in this focused workspace.

## Remaining implementation

3. Add the Python service and automatic upload/inference flow, image preparation,
   progress, model-result cancellation/staleness handling, and normal suggestion /
   restoration / scale-correction controls using these validated import APIs.
4. Complete the right-hand Debug dropdown with masks, overlays, stage timings,
   diagnostics, service/model status and exports. The importer added here can be
   incorporated into that same panel rather than duplicated.
5. Complete photo/camera/result persistence, deployment configuration and full
   end-to-end browser/device testing with real models. Preserve deliberate holes
   throughout save/restore and every recalculation.
