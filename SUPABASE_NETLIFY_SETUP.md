# Supabase + Netlify dual-platform AR publication

## Workflow

The selector beside **Generate AR QR** defaults to Android.

```text
Android → optimized GLB → Supabase → shared phone page → Scene Viewer
iOS     → optimized USDZ → Supabase → shared phone page → AR Quick Look
```

Each QR contains:

- the public Supabase model URL;
- the selected platform (`android` or `ios`);
- the selected format (`glb` or `usdz`);
- the configurator build and model title.

The phone page detects the actual device. When an Android QR is opened on iOS, or an iOS QR is opened on Android, it hides the incompatible AR action and tells the user which selector option must be used on the configurator.

The model bytes do **not** pass through Netlify Functions. Netlify creates a short-lived signed upload ticket, after which the browser uploads directly to Supabase using signed resumable TUS with signed PUT as a compatibility fallback.

## Storage protections

The Function enforces these defaults:

- GLB maximum: 15 MiB;
- USDZ maximum: 60 MiB;
- maximum stored AR files: 90;
- maximum combined model storage: 800 MiB;
- Android accepts only `model/gltf-binary` and `.glb`;
- iOS accepts only `model/vnd.usdz+zip` and `.usdz`;
- object paths use the binary SHA-256 hash, so identical assets of the same format are reused;
- requests are accepted only from `AR_ALLOWED_ORIGINS`.

Stored files look like:

```text
models/<sha256>.glb
models/<sha256>.usdz
```

The application does not automatically delete an earlier publication when the selector changes. This prevents old QR codes from becoming invalid.

## 1. Supabase bucket

Create or keep the public Storage bucket:

```text
window-ar-models
```

The bucket must allow both MIME types and a file size large enough for the USDZ limit:

```text
model/gltf-binary
model/vnd.usdz+zip
```

Recommended bucket file-size limit:

```text
60 MB or higher
```

A public bucket permits public downloads. Uploads remain protected because the trusted Netlify Function creates short-lived signed tokens; no public anonymous INSERT policy is required.

## 2. Netlify environment variables

Set these under **Project configuration → Environment variables**:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR_REAL_SECRET_KEY
SUPABASE_BUCKET=window-ar-models
AR_ALLOWED_ORIGINS=https://brilliant-klepon-fbae3a.netlify.app
```

Optional safety overrides:

```text
AR_MAX_GLB_BYTES=15728640
AR_MAX_USDZ_BYTES=62914560
AR_MAX_MODELS=90
AR_MAX_TOTAL_BYTES=838860800
```

The old `AR_MAX_FILE_BYTES` variable is still accepted as the GLB limit when `AR_MAX_GLB_BYTES` is absent. It intentionally does not limit USDZ files.

Do not put `SUPABASE_SECRET_KEY` in frontend files, Git, URLs, or QR codes.

## 3. Deploy the full site and Function

From the repository root:

```powershell
npm.cmd run prepare:static
npx.cmd --yes netlify-cli@latest deploy --prod --dir=static-site --functions=netlify/functions
```

The included script performs the same deployment:

```text
DEPLOY_NETLIFY_WITH_FUNCTIONS.cmd
```

Do not use a static-only Netlify Drop deployment because it does not update the Function.

## 4. Verify the Function

Open:

```text
https://brilliant-klepon-fbae3a.netlify.app/api/ar-upload-ticket
```

The response should contain:

```json
{
  "ok": true,
  "service": "ar-upload-ticket",
  "configured": true,
  "acceptedFormats": [
    { "format": "glb", "platform": "android" },
    { "format": "usdz", "platform": "ios" }
  ]
}
```

## 5. Test Android

1. Leave **Android** selected.
2. Press **Generate AR QR**.
3. Confirm that the dialog reports a GLB export.
4. Scan the QR on an Android phone.
5. Press **View in AR**.
6. Confirm that Google Scene Viewer opens.

Opening this QR on an iPhone must show the platform-mismatch message and no usable AR button.

## 6. Test iOS

1. Select **iOS**.
2. Press **Generate AR QR**.
3. Confirm that the dialog reports a USDZ export.
4. Scan the QR using the iPhone Camera app or open it in Safari.
5. Press **View in AR**.
6. Confirm that Apple AR Quick Look opens.

Opening this QR on Android must show the platform-mismatch message and no usable AR button.

## 7. Common errors

### `SERVER_NOT_CONFIGURED`

One or more required Netlify environment variables are missing. Set them and redeploy.

### `ORIGIN_NOT_ALLOWED`

`AR_ALLOWED_ORIGINS` does not exactly match the public Netlify origin.

### `PLATFORM_FORMAT_MISMATCH`

The request attempted an invalid pair, such as Android + USDZ or iOS + GLB. The frontend selector should always send Android + GLB or iOS + USDZ.

### `INVALID_SIZE` for USDZ

Check all three limits:

- `ar-upload-config.js` → `maxUsdzBytes`;
- Netlify → `AR_MAX_USDZ_BYTES`;
- Supabase bucket → file-size limit.

### Quick Look downloads instead of opening AR

Confirm that:

- the phone page is opened in Safari or through the iPhone Camera QR flow;
- the public file ends in `.usdz`;
- Supabase serves `Content-Type: model/vnd.usdz+zip`;
- the visible action is the `rel="ar"` link on `ar-viewer.html`.

### Scene Viewer fails but the preview works

Use the phone page download action to inspect the exact GLB. In this case the storage and QR pipeline are already functioning.

## Signed resumable endpoint

The Function uses:

```text
/storage/v1/upload/resumable/sign
```

The similar endpoint without `/sign` is for normal JWT-authenticated resumable uploads and rejects a signed-upload token.
