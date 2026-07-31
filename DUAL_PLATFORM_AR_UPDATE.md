# Dual-platform AR update

## Implemented workflow

- The AR selector defaults to **Android**.
- Android generates and uploads only a `.glb` file.
- iOS generates and uploads only a `.usdz` file.
- Every QR opens the shared `ar-viewer.html` page and includes its intended platform and format.
- A platform mismatch hides the native AR action and tells the user which selector option to choose.
- Existing publications are not deleted when another platform is selected, so previously generated QR codes remain valid.

## Deployment requirements

Before deploying, confirm that the Supabase bucket:

- is public for model downloads;
- allows `model/gltf-binary` and `model/vnd.usdz+zip`;
- has a per-file limit of at least 60 MB.

Recommended Netlify variables:

```text
AR_MAX_GLB_BYTES=15728640
AR_MAX_USDZ_BYTES=62914560
AR_MAX_MODELS=90
AR_MAX_TOTAL_BYTES=838860800
```

Deploy with:

```text
DEPLOY_NETLIFY_WITH_FUNCTIONS.cmd
```

## Required device tests

1. Generate Android QR → open on Android → Scene Viewer starts.
2. Open the same Android QR on iPhone → mismatch message appears.
3. Generate iOS QR → open on iPhone → Quick Look starts.
4. Open the same iOS QR on Android → mismatch message appears.
5. Compare the iOS model scale, orientation, glass transparency, and materials with the Android model.

Native Apple Quick Look must be validated on a real iPhone or iPad after deployment.
