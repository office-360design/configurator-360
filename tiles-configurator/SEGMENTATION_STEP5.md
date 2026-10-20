# Step 5 — project persistence, sharing safeguards and deployment

Apply this ZIP at the repository root **after steps 1–4**. It is a step-5 delta,
not a replacement for the preceding ZIPs. The source branch was read through the
GitHub connector at `f096d0cb4261b009f1920a7304615b482ebe4930`; no repository write,
commit, push or deployment was performed. The four supplied patches are preserved.

## Save and reopen

There is a normal **Project · Save and open** dropdown, separate from Debug. It
is available on the first upload screen and moves into the sidebar once a design
is open. The expanded startup card scrolls on short/mobile displays.

**Save new copy in browser** stores a named snapshot. **Update selected save**
asks before overwriting. **Open selected** restores the photograph, reference or
model calibration, free/photo-camera choice, current paving regions, intentional
holes, curb choices, house geometry and tile settings. Existing unfinished
outlines or a reference recalibration must be finished/cancelled before saving.
A second-tab revision conflict is rejected instead of silently overwriting work.

The original detection is not the saved design. Reopening never reruns the models
and never regenerates the current pavement from a mask. An optional cached model
result is reopened only for Debug and explicit **Restore detected area**. If its
camera differs from the current calibration, it is labelled historical. Undo
history is deliberately reset when opening another project.

### Where each action stores information

| Action | Photograph and model masks | Current design/calibration |
| --- | --- | --- |
| Project → Save in browser | Binary assets in IndexedDB on this origin/browser | Versioned local project manifest |
| Existing account Save / draft / cart snapshot | Only local content-hash references; no cloud photo upload | Geometry at the root plus compact photo/calibration metadata |
| Existing Share link | **No photograph, photo hash, calibration, masks or precise house-map location** | Current edited geometry, holes and product settings through the existing short-link service |
| Download full project | Photo embedded; original result/masks optional and unchecked by default | Current edited design and validated camera in `.paving.json` |

**A normal Share link is a photo-free 3D design link.** It asks for confirmation
when a photo/calibration exists. No image or mask is inserted into the URL.
This patch does not add a cloud photo bucket, account photo ACLs, or public photo
links. A complete cross-device/photo handoff uses **Download full project** and
**Open project file**. Existing account storage and share infrastructure are not
modified or deployed by this patch.

Local storage is shared by this site's users in this browser profile; it is not
an account-private vault. Use care on shared computers. HTTP/HTTPS, hostname,
port, profile and device changes use a different browser storage origin/profile.
An account record opened there may therefore lack its referenced photograph.

### Missing photographs and older saves

If a saved photo is absent, the edited pavement and all holes still open in 3D.
The Project dropdown offers **Reattach original photo**. SHA-256 and oriented
image dimensions must match the original file; a crop, resized copy or different
image is refused rather than applied to the wrong calibration. A full project
file is the alternative. Older geometry-only snapshots remain supported and
explicitly clear any unrelated photo instead of inheriting the previous backdrop.

**Start from scratch** retains the active photo/calibration and clears paving.
The separate global Reset/New Configuration detaches the photo and starts a new
upload flow. Loading another photo invalidates requests associated with the old
photo. Slow project reads cannot replace edits/new photos made after Open began.

### Retention, backups and limits

Uploaded/sample photographs are cached locally after loading; the upload wording
now says so. The edited design is saved by the explicit Project commands (or the
existing account draft/save mechanisms), not by an unannounced new autosave.
Binary assets are content-addressed and separated from normal undo snapshots.

Deleting one browser project leaves the shared photo cache intact so account
references and other local projects can continue to resolve. **Clear local
projects and photo cache** explicitly deletes all tiles IndexedDB projects and
assets on this origin; it does not delete cloud account records. The open design
can remain in memory until leaving. A save/file import after clearing is an
explicit request to store the assets again. Pending older cache writes cannot
silently repopulate the cleared database.

**Protect browser storage** requests persistent storage; a browser can decline.
Clearing browser data can still erase local work. Keep downloaded backups.
No fixed retention deadline or cloud durability is promised for browser storage.

Limits: original JPEG/PNG/WebP photo ≤ 24 MiB, ≤ 40 megapixels, minimum 32 × 32 pixels,
maximum 20,000 per side; optional result ≤ 32 MiB; compact metadata ≤ 700,000 bytes;
portable file ≤ 80 MiB. Animated PNG/WebP, external photo URLs inside project
files, incomplete base64, wrong hashes and invalid geometry/calibrations are
rejected. Header dimensions are checked before image decoding. Project-file
photos retain their original bytes, including any embedded EXIF/GPS metadata;
the UI warns about this before deliberate file sharing. Debug exports still do
not include photographs.

## Installation and service deployment

No new npm dependencies are required. For an existing working service, restart
`python -m server` after applying the patch; the normal local startup stays the
same. Use HTTPS or localhost for browser photo hashing/storage.

The service directory now contains a CPU Dockerfile, loopback-bound Compose
configuration, optional NVIDIA GPU override, environment example and Nginx
include examples. They are **deployment templates, not a deployed server**.
See `segmentation-service/DEPLOYMENT.md` before using them. There are no secrets
or hardcoded customer domains in these files.

Job queue/result-cache size, result TTL and maximum client count are configurable
with bounded environment settings. Optional exact Host validation is enabled in
the Compose setup. Legacy synchronous inference routes can be disabled; Compose
disables them. The job API stays the frontend's normal integration path. The
service does not provide durable photo/project storage.

## Validation

The step-5 deliverable adds format/asset, orchestration, actual application
transaction and storage-wrapper tests. Fixtures are synthetic; they do not claim
real model accuracy.

Executed in the editing environment:
- 396 JavaScript tests across the available patch regression suites, including
  56 new project/storage/application checks.
- 65 Python tests, including ten new deployment/configuration tests.
- 54 Chromium DOM/canvas checks: 8 analysis, 21 Debug, 25 Project controls.
- Compose YAML parsing and `nginx -t` against both Nginx snippets in an isolated
  local test configuration. This is syntax validation, not a deployed TLS gateway.

DOM browser checks use a mock application/storage/renderer API. Application
transaction tests execute the real app opening/rollback functions against a
simulated viewer. Storage-wrapper tests use controlled transaction objects.
**These are not native IndexedDB reload, full tenant-site WebGL, cloud account,
actual Docker build, CUDA or live EoMT/MoGe validation.** Browser URL navigation is
blocked by the managed Chromium policy here; full navigation/IndexedDB acceptance
could not be completed. Model weights and a GPU were not available for inference.

Runnable acceptance commands are in `tests/PROJECT_ACCEPTANCE.md`. Do not mark a
production release fully validated until the native browser and full-site/live
service checks have been run in its actual environment. The image/camera/geometry
integration and deployment templates are implemented; those external acceptance
checks remain outstanding.

## Main files

`pavingProject.js`: versioned manifests, strict camera/state validation and share
filter. `projectAssets.js`: bounded raster/JSON assets, integrity hashes and full
project file codec. `projectStore.js`: atomic IndexedDB commits and revision/clear
protection. `projectSession.js`: saving, missing-photo recovery and guarded opens.
`projectPanel.js`: normal user controls. `app.js`/`viewer.js`: full-scene restore
and account/share integration. The Python model implementations are unchanged.
