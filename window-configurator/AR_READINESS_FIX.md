# Window AR readiness fix — window-ar-2

## Root cause reproduced

Applying/restoring a configuration with the already-loaded profile selection
uses `refreshProfileMaterials()` instead of loading the CAD profiles again.
That function referenced `windowBuilder` without declaring it in its scope.
The similarly named local inside `loadProfileSelection()` is not accessible there.

The resulting `ReferenceError: windowBuilder is not defined` interrupted
`applyConfiguration()` after it set `window.CONFIGURATOR_READY = false` and before
it restored that flag to `true`. The previous geometry remained visible, while
the correctly guarded AR controller reported “The window is still loading”.
The failure occurs before the Firebase publication request. Explosion and sash
opening are not the cause of this readiness failure.

## Change

`refreshProfileMaterials()` now obtains the current builder through the existing
`getWindowBuilder()` accessor. The rest of the refresh sequence, readiness gate,
CAD geometry, exporter, and Firebase service are unchanged. A genuinely failed
rebuild still rejects; the AR check is not removed or forced to succeed.

The main entry and profile-controller import are cache-busted with `window-ar-2`.

## Deployment

Apply the update ZIP at repository root and push normally. Wait for the website
build/deployment and reload the Window configurator. Existing saved configuration
records remain compatible; no data reset is needed.

This patch requires **no Firebase backend changes, administrator setup, bucket
provisioning, or IAM grants**. The shared Hall/Window AR service and Hall itself
are untouched.

## Validation performed

- The new regression fails against the previous profile controller with the
  original `ReferenceError`, and passes against the corrected controller.
- All 13 Window AR test groups passed, including three new regression checks.
- The complete `npm run check` suite and `npm run prepare:static` passed.
- An offline browser loaded the actual CAD/profile modules and restored an
  existing-profile configuration five times (closed, open, exploded/open,
  opposite handle side, then closed again). Readiness returned to `true` each time.
- The exploded/open export geometry matched the assembled/open export geometry
  exactly, retaining the 25-degree sash pose. Source transforms and camera were
  unchanged by capture.
- Actual GLB export produced a 6,100,588-byte (5.82 MiB) self-contained asset,
  which passed the Firebase backend's existing asset validator. A repeat export
  had the same content hash.
- With Firebase responses simulated, the real shared dialog/export/publisher
  pipeline reached the Android QR state and recovered using Try again after a
  deliberately simulated loading state.

The browser test used a simulated renderer and cloud/account services, with real
CAD geometry and GLB serialization. No live cloud writes were made. Physical
Android/iOS placement and a fresh complete USDZ export were not tested in this
fix. Do not treat the offline QR as a live share link.

Run the automated checks from `window-configurator`:

```bash
npm run check:ar
npm run check
npm run prepare:static
```

After website deployment, reopen a saved window, set it open and exploded, and
click AR. The editor should stay exploded; the exported model should be assembled
with the same sash opening. Test Android and iOS with your existing Firebase setup.
