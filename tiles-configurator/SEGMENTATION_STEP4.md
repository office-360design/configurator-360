# Segmentation integration — step 4: unified diagnostics

## Apply

Extract the changed-files ZIP at the repository root **on top of steps 1, 2 and
3**. Reload the website and restart the existing `python -m server` process in
`tiles-configurator/segmentation-service` so its corrected uncertainty metadata
is loaded. No additional npm/Python packages, model weights, database migrations,
or changes to the service address are required by this patch.

The connected `tiles` branch was read at
`f096d0cb4261b009f1920a7304615b482ebe4930`. The previous three patches are the
cumulative application baseline; this ZIP is incremental, not a full repository.

## Find the dropdown

After loading a photograph, open **Debug · Segmentation**. It is collapsed by
default, appears at the upper right during photo setup, and moves into the normal
right sidebar after setup. There is one Debug dropdown; the previous local JSON
importer is nested under **Export / import**.

All new panel labels support English, Romanian and German, with light/dark mode
and narrow-screen layouts. Technical JSON metadata keeps its original field names.
Normal analysis, manual calibration and pavement editing controls remain outside
Debug.

## Masks and comparison

Choose **Latest analysis** or **Last imported suggestion**, then a raster layer.
Unavailable layers are disabled rather than represented by an invented empty mask.
Available retained data can include:

- Semantic labels, with separate class visibility switches and pixel percentages.
- Model uncertainty, protected non-ground labels and the semantic ground hint.
- Fitted ground support, requested/selected pavement and selected ground support.
- The exact effective mask used by a successful import, unsupported selection,
  and additional pixels excluded during projection.
- A foreground occlusion mask, only when one was actually supplied.

The effective mask is retained from the original import. Opening Debug never
reruns mask-to-polygon conversion to approximate that mask. A pending or failed
import can expose valid semantic diagnostics without claiming an effective paving
result. Prototype exports only expose the information their export contains.
Unknown semantic IDs remain counted and visible in the unknown category.

**Current pavement** adds cyan outlines/light fill for the edited design and
orange dashed boundaries around its holes. **Effective imported mask** is
magenta. These are independent layers: a new client-created hole can remain open
in the current design while the original model mask still marks that location as
paving. Hide the **3D preview** to inspect a raster against the photograph.

Current-design fill uses the even-odd rule, so intentional holes stay transparent.
The optional grid has one-metre spacing in the current calibration; its physical
accuracy is not established by the fact that it is visible. Model scale remains
labelled estimated. Reference calibration and later client edits are not undone
merely to align an old model result.

An occlusion layer is a visibility diagnostic, **not an instruction to cut a
permanent hole**. Protected labels and uncertainty are likewise read-only here.
Use the normal Add/Remove tools to alter the actual pavement.

Overlays are clipped to the photograph's displayed rectangle, including its
letterboxing and margins. They cannot intercept pointer input. They pause in
free-camera mode and use the current camera when returning to photo mode.
Closing Debug hides its overlays and restores the 3D preview. Switching photos
clears the mask cache and resets overlay choices.

## Pipeline, geometry and results

The remaining sections contain the last job phase, service address/status, model
metadata, stage timings, errors/warnings, class percentages, current region/hole
counts and net area, import clipping statistics, current calibration, source
camera intrinsics, ground-plane parameters and plane-fit diagnostics.

Service status is a **last-check snapshot**. **Check service** explicitly performs
only the health GET; it does not submit an image, start a job, load models or apply
results. Merely opening a section, changing opacity or selecting an overlay does
not make a request. No extra health polling was introduced.

Original source cameras and the current calibration are shown separately. A
retained result whose import is not currently active is labelled historical/not
the active import. That can occur after undo, reference recalibration, or a newer
analysis result being held for review. Manual edits remain independent of either
retained mask source.

Percentages are fractions of the working image, **not fractions of physical square
metres**. Plane-fit consistency/inlier diagnostics are not verified reconstruction
accuracy. Uncertainty is reported with the model's actual definition; it is not
relabeled as a calibrated confidence probability. The service's legacy
`low_patch_text_class_margin` label has been replaced by the supplied EoMT
uncertainty definition (with a panoptic-score/void fallback), without changing
inference or masks.

## Export and local import

**Download JSON** and **Copy JSON** create a report with schema
`tiles.segmentation.debug`, version `1`. Default exports omit raw model masks and
photo bytes. They contain bounded metadata, current camera information, and the
current edited regions/holes/origin in a separate `design` field.

Enable **Include RLE masks** to also include the retained raw `model_result` and
import selection/effective masks. Raster dimensions and encoding names are
explicit. The mask export uses compact JSON and avoids repeating all derived
layers. Clipboard permissions can prevent copying; downloading remains available.

**Overlay PNG** exports the transparent diagnostic overlay at the displayed
resolution, without the photograph. **Mask PNG** exports the chosen colored mask
at its working-image resolution, honoring semantic class visibility. PNGs do not
contain camera calibration and are not importable paving configurations.

The nested importer accepts the prototype's existing JSON exports, raw response
bundles, paired response files, and the new report when it includes model masks.
Use the same original photograph. Dimensions alone cannot verify image identity.
Importing requires explicit replacement confirmation and uses the existing
photo/revision and undo safeguards. Imports remain limited to one result or two
response files, each no larger than 32 MB.

**Reimporting a Debug report restores its original model suggestion, not the
client's edited design.** The original selected mask is preserved, including
non-default target classes; normal topology/projection validation runs again.
The separately exported `design` field is diagnostic information, not an alternate
model mask. Metadata-only exports are not accepted as model imports. These
reports are not a substitute for the durable photo/configuration save work in
step 5.

## Implementation boundaries

`segmentationDebugData.js` inspects cached results, accounts for labels/masks and
builds reports. `debugProjection.js` clips and projects diagnostic geometry.
`debugOverlay.js` draws a pointer-transparent Canvas2D layer.
`segmentationDebugPanel.js` owns the unified UI and embeds the existing importer;
`segmentationDebugCopy.js` contains its translations.

The application exposes small read-only diagnostics adapters:

- `getDebugState()` provides current photo/revision, calibration, measurement
  status, source identity/active flags, last analysis status and service snapshot.
- `getDebugSource(kind)` returns a copy of the selected retained source. Large
  results are requested lazily and cached by result/photo identity, not every frame.
- `getDebugView()` supplies the current view/projection matrices and photo rectangle.
- `setDebugPreviewVisible(boolean)` changes viewer visibility only.
- `checkAnalysisService()` explicitly reads health without running inference.

Raw results and derived diagnostic masks remain session-local and outside the
ordinary save/share state and undo stack. Opening/toggling Debug does not call
pavement import/setters, change camera calibration, rebuild tile quantities or
record history. The local importer remains the one explicit, guarded design-write
action inside Debug. Model metadata is rendered as bounded text rather than HTML.

## Validation performed

Run from `tiles-configurator`:

```sh
npm run check
python tests/run-analysis-dom.py
python tests/run-debug-dom.py
```

Browser checks use the existing `tests/requirements-browser.txt` dependencies and
a Chromium executable; `CHROMIUM_EXECUTABLE` can override its path. They bundle
local modules without CDN downloads. Set `BROWSER_SCREENSHOT_DIR` to optionally
save the Debug harness screenshot.

Run from `tiles-configurator/segmentation-service`:

```sh
python -m unittest server.test_camera server.test_segmentation server.test_jobs server.test_debug_metadata -q
```

Results in this environment:

- **340 JavaScript tests passed**, including all 302 tests from steps 1–3. Added
  coverage includes malformed/partial/stale masks, unknown classes, RLE roundtrips,
  source/design separation, target-selection preservation, camera projection,
  health-only requests and source identity isolation.
- **55 Python tests passed** with synthetic/mocked inference. Both compatibility
  and job response metadata preserve the uncertainty definition.
- **29 Chromium DOM/canvas checks passed**: 8 existing analysis checks and 21 Debug
  checks. New checks inspect actual canvas pixels for holes and semantic filters,
  resize through portrait/landscape/portrait, check readonly controls, stale-photo
  cleanup, partial diagnostics, local import confirmation, JSON/PNG blobs,
  translations and text-only rendering of hostile metadata.

The browser harness mounts the real new UI/data/Canvas2D modules around mocked
application/viewer/service adapters. It does **not** mount the complete tenant
website or render Three.js/WebGL. No real EoMT/MoGe inference or model weights were
run here. Full live-model and full configurator browser verification remain
outstanding; these tests do not establish reconstruction accuracy.

## Remaining step 5

Complete durable photograph/camera/result persistence and reopening/sharing,
define retention/storage behavior, finalize deployment configuration and run
full-site/manual/mobile/WebGL checks with the real inference service. Debug reports
and these session-local caches do not implement that persistence layer.
