# Static Scene Viewer workflow

This version does not require Cloudflare, R2, or any paid object-storage account.

## What changed

1. The browser exports the configured production window to GLB.
2. AR-only geometry optimization targets 90,000 triangles.
3. The export is indexed where possible and validated by re-importing it in the browser.
4. The downloaded filename includes the first 12 characters of the GLB SHA-256 hash.
5. The configurator checks the matching URL under `dist/site/models/`.
6. Once the exact file is public, the page creates the phone QR.
7. The Scene Viewer launch now pairs `mode=ar_preferred` with the correct `com.google.ar.core` package.

## First use

1. Open the updated Netlify configurator.
2. Configure the window and press **Generate AR QR**.
3. Wait for optimization and browser round-trip validation.
4. Press **Download optimized GLB**.
5. Copy the downloaded file, unchanged, into:

   `dist/site/models/`

6. Run `scripts/windows/prepare_static_site.vbs` or `npm run prepare:static` if other site files changed. The preparation script now preserves `dist/site/models/`.
7. Deploy `dist/site/` to the existing Netlify site.
8. Return to the still-open dialog and press **Check published model and create QR**. Alternatively, generate it again; the same configuration should generate the same hashed filename.
9. Scan the QR and press **Open in AR**.

## Optional future server upload

`src/client/ar-upload-config.js` defaults to:

```js
mode: 'static'
```

A future own server can receive the GLB automatically by changing the mode to `api` and setting `endpoint` to a public HTTPS endpoint accepting `POST` requests with `Content-Type: model/gltf-binary`.

## Important files

- `src/client/ar-export.js`: GLB optimization, export, validation, hashing, and download.
- `src/client/ar-upload-config.js`: static/API publishing mode and AR limits.
- `src/client/index.html`: static publication verification and QR generation.
- `src/client/ar-viewer.html`: phone preview and corrected Scene Viewer launch.
- `scripts/build/prepare_static_site.js`: prepares Netlify files without deleting published models.
- `static_headers.txt`: explicit GLB headers for `/models/*`.
