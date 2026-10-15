# Segmentation integration — step 3: automatic photo analysis

## Apply and run

Apply this ZIP at the repository root **on top of steps 1 and 2**. Only step-3
added/changed files are included. Baseline: the supplied step-1 and step-2 ZIPs,
with the connected `tiles` branch still at
`f096d0cb4261b009f1920a7304615b482ebe4930` when read for this step.

Use the existing Python environment that runs `segmentation-final.zip`, stop its
old server if it occupies port 8000, then start the new service:

```powershell
cd tiles-configurator\segmentation-service
python -m pip install -r requirements.txt
python -m server
```

Keep the website running as before. There are no new npm dependencies, database
migrations, model files in the ZIP, or changes to the shared UI. Full service,
origin, API and deployment details are in `segmentation-service/README.md`.

## User workflow

**Upload a photo → prepare one working raster → queue → EoMT segmentation →
MoGe camera/plane estimation → step-2 conversion → editable pavement.**

A valid automatic result bypasses the mandatory 1 m square and drawing wizard.
The original photo remains the backdrop; the two models receive the same
proportionally resized, EXIF-oriented JPEG (maximum side 1100 pixels). Alpha is
composited over white. Very extreme aspect ratios and undersized photos get a
manual fallback rather than a stretched/cropped analysis image.

The normal panel includes stage progress, retry, Stop analysis / continue manually,
Restore detected area, Choose another photo, and the 1 m reference-square path.
Existing pavement is the initial target. Grass and dirt are opt-in. Changing
these target checkboxes alone never reruns models or changes the design; Analyze
or Restore applies the chosen target set explicitly.

Detected outer boundaries and holes each target at most 20 corners, configured
by `maxCornersPerBoundary` in `js/segmentationConfig.js` (`null` disables it).
After pixel-tolerance simplification, the least significant corners are removed
while preserving valid boundaries, holes and separate islands. Removals are
ranked by deviation from the original contour and then by swept area; fixed
pixel/area tolerances do not override the requested count. Diagonal bevels can
also be simplified when topology checks permit it. Boundaries retain extra
corners only when topology or the bounded processing budget prevents further
reduction, with a notice in the analysis panel. Manual editing retains its existing geometry limits. Raw
model results remain available for Restore without another model request.

Detected regions smaller than 0.5 m² of estimated ground area are ignored.
The threshold uses the outer area minus its holes, before and after corner
simplification. Holes within retained regions are preserved. Configure it with
`minRegionAreaM2` in `js/segmentationConfig.js`; `0` disables the filter. Manual
drawing and existing saved designs retain their areas. Original masks are kept
for diagnostics and restoring the detection with different settings.

First-use model downloads may be slow. Progress reports stages, not invented
percentages or an unsupported time estimate. Default HTTP timeout is 45 seconds
per request; the overall analysis timeout is 20 minutes and can be configured in
`js/segmentationConfig.js`.

### Recovery and intentional holes

- Failed segmentation does not prevent MoGe/plane fitting. With a valid camera,
  the importer installs an **empty selection**, not a guess that all ground should
  be paved; Add area then uses the imported camera. On a retry with an existing
  design, a camera-only partial result leaves that design and its holes untouched
  instead of erasing them.
- Failed geometry never substitutes a guessed camera. The reference-square
  workflow remains available and an existing design is not erased by the failure.
- An empty valid suggestion is allowed. Add manually or opt into existing
  pavement and restore from the retained result without rerunning models.
- A result that finishes after the user edits the design is retained for review,
  not applied. Restore is an explicit new user action with replacement consent.
- Reanalysis and restoring over an existing design ask for confirmation, including
  intentional holes. Replacing camera and geometry remains a single undo step.
- Start from scratch, Add/Remove, boundary editing, curbs and all hole-capable tile
  layouts from steps 1/2 are preserved. Future edits are not reclipped against the
  original masks. Debug JSON import remains available independently.
- The 1 m reference-square command can also correct an already calibrated photo.
  It reprojects **every existing outer boundary and hole** through the old photo
  pose to the new reference plane. IDs/curb settings are retained; invalid
  projections/topology reject the complete change. Cancel restores the prior
  camera/design, and successful correction is one undoable operation. It does
  not clear the design just to change the scale/perspective.

A model suggestion is not a client design instruction. Semantic object exclusions
can initially leave gaps, but an occlusion mask is not automatically subtracted
as a permanent geometric hole. Step-1 manual holes remain actual geometry and
continue to affect installed quantities.

## Async and safety behavior

Every job keeps the photo ID and design revision captured **before** preparation
and upload. The client checks that token after each await and again before import.
It never takes a fresh token simply to force a late result through. Changing the
photo cancels the old generation and clears its retained result. Clicking manual
calibration, stopping analysis, or importing a local result also cancels inference.
Reference-corner interaction during a retry switches back to manual mode.

Server generation tombstones cover cancellation while the upload is still in
flight, before the client receives a job ID. A slowly arriving older upload
cannot supersede a newer request. Heavy inference is serialized across both
models and all clients, including the compatibility APIs. Cancellation invalidates
results but does not pretend to interrupt an already executing PyTorch kernel.

Only the latest browser analysis bundle is retained for restoring/debugging;
large masks and photos are not added to undo snapshots or share URLs. The server
keeps bounded, expiring in-memory jobs and does not publish repository files.
Upload wording now states that automatic analysis sends a resized photo to the
configured service. This is no longer described as browser-only processing.

## Public API for the next diagnostics step

```js
const api = window.TILES_CONFIGURATOR_API;
await api.runPhotoAnalysis({ replaceExisting: true, targets: ['grass', 'dirt'] });
api.cancelPhotoAnalysis();
api.restoreDetectedArea({ replaceExisting: true, targets: ['grass', 'dirt'] });
api.beginManualCalibration();
api.getAnalysisStatus(); // Phase, errors, stage times, connection base; no large masks.
api.getAnalysisResult(); // COPY of the latest original response bundle for this photo.
```

`replaceExisting: true` represents an explicitly authorized action, not a silent
background default. The normal UI obtains confirmation. The step-2 import API,
its strict image association, and original-mask accessors are unchanged.

## Validation performed

- **302 JavaScript tests passed**: all 262 step-1/step-2 tests plus controller,
  image-size/endpoint selection, upload/calibration transactions, and reference
  reprojection tests. Geometric conversion/layout code is real; app transaction
  tests use a simulated viewer/DOM.
- **53 Python tests passed**: original geometry/semantic/API regressions plus 20
  job/API tests. Predictors are synthetic/mocked; no learned weights are required.
- **8 Chromium DOM/canvas checks passed**: control transitions, replacement
  confirmation, restore/manual actions, responsive widths, EXIF orientation,
  alpha compositing, and script-error checks. The DOM harness uses a mock transport
  and renderer; it is not a live-site or WebGL test.

This environment's managed Chromium blocked URL navigation, so the included
networked browser harness could not be executed here. The backend HTTP tests and
inline DOM/canvas tests were run separately. Full website/WebGL validation and
actual EoMT/MoGe inference on real yard photos were **not** run. No claim is made
about learned-model accuracy, target-machine inference speed or production
readiness from these deterministic tests.

From `tiles-configurator`:

```sh
npm run check
python -m pip install -r tests/requirements-browser.txt
python -m playwright install chromium
python tests/run-analysis-dom.py
```

Optional integrated HTTP browser harness on a machine allowing local navigation:

```sh
python -m pip install -r segmentation-service/requirements-test.txt
python tests/run-analysis-browser.py
```

It uses synthetic predictors with the real HTTP job API, frontend modules and
polygon adapter; the website shell and WebGL viewer are not included. Set
`CHROMIUM_EXECUTABLE` for a custom browser binary. The normal service never mounts
the test harness or the source tree.

## Remaining steps

**Step 4:** unify semantic/support/uncertainty/occlusion overlays, camera diagnostics,
model metadata, timings and exports under the right-hand Debug dropdown. The
existing local JSON importer is retained now; the complete diagnostics UI is not
part of step 3.

**Step 5:** full photo/camera/mask persistence and reopening/sharing, deployment
protection and end-to-end real-browser/real-model validation. Session-local
camera+geometry undo already works, but this patch does not claim durable photo
or inference-result storage.
