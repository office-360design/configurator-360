# Window Configurator — browser GLB export, R2 storage, Scene Viewer

This revision replaces the failed custom WebXR path with the native Android AR route that was proven to work on the test phone.

## Runtime architecture

```text
Netlify static site opened on the laptop
    ↓
The laptop browser builds the current Three.js window
    ↓
GLTFExporter creates a binary GLB in browser memory
    ↓
The page sanitizes it and re-imports it with GLTFLoader
    ↓
The page uploads the exact validated bytes to a Cloudflare Worker
    ↓
The Worker validates the GLB header and stores it in Cloudflare R2
    ↓
The Worker returns a public HTTPS model URL
    ↓
The QR opens src/client/ar-viewer.html on the phone
    ↓
The phone launches Google Scene Viewer with the uploaded GLB URL
```

The laptop does not directly send the model to the phone. The laptop browser uploads it to public object storage, and Scene Viewer downloads it from there.

## Main files

- `src/client/index.html` — configurator UI, Three.js scene, current pose, QR workflow.
- `src/client/ar-export.js` — portable GLB export, material/geometry sanitation, structural inspection, browser round-trip validation, download, and upload.
- `src/client/ar-upload-config.js` — public upload endpoint configuration. Contains no secret credentials.
- `src/client/ar-viewer.html` — phone page that checks the public model URL, previews it, and launches native Scene Viewer.
- `src/server/server.js` — local static server plus a local-only GLB upload emulator for desktop testing.
- `scripts/build/prepare_static_site.js` — generates a build ID and prepares all public frontend files in `dist/site/`.
- `infrastructure/cloudflare-worker/` — Worker and R2 storage service used by the public Netlify site.

## First setup

### 1. Deploy the Worker and R2 bucket

```powershell
cd infrastructure/cloudflare-worker
npm install
npx wrangler login
npm run create-bucket
npm run deploy
```

The deployment prints a URL such as:

```text
https://window-ar-model-storage.<your-subdomain>.workers.dev
```

### 2. Connect the frontend to the Worker

Edit `src/client/ar-upload-config.js`:

```javascript
endpoint: 'https://window-ar-model-storage.<your-subdomain>.workers.dev/api/models'
```

Do not place Cloudflare account credentials, API tokens, or R2 keys in that file.

### 3. Prepare and deploy Netlify

Double-click:

```text
scripts/windows/prepare_static_site.vbs
```

or run:

```powershell
npm run prepare:static
```

Upload the complete `dist/site/` folder to Netlify Drop. Verify the build badge and `/version.json` after deployment.

## Using the configurator

1. Open the Netlify site on the laptop.
2. Configure the profile, dimensions, active components, opening mode, angle, and exploded state.
3. Press **Generate AR QR**.
4. Wait for the three stages: export, browser validation, storage upload.
5. Review the displayed GLB statistics.
6. The **Download diagnostic GLB** button downloads the exact bytes that were uploaded.
7. Scan the QR on Android.
8. Confirm that the 3D preview loads on `src/client/ar-viewer.html`.
9. Press **Open in AR** to launch Scene Viewer.

## Why the export is stricter than the previous attempt

The exporter does not send the complete Three.js scene. It creates a clean model that contains only visible window meshes. It:

- applies the current frame, sash, opening, handle, and exploded-view transforms;
- bakes mesh world transforms into geometry;
- converts indexed geometry to non-indexed triangles;
- removes unused attributes;
- recomputes normals;
- rejects non-finite vertex data;
- normalizes materials to portable PBR `MeshStandardMaterial` values;
- reuses equivalent materials;
- centers the model horizontally and moves its bottom to `Y = 0`;
- exports binary glTF 2.0;
- parses the GLB header and JSON chunk;
- re-imports the produced GLB with Three.js `GLTFLoader` before upload.

This browser round trip does not replace the Khronos validator, but it catches malformed files and exporter/runtime incompatibilities before object storage is involved.

## Local testing

Run:

```powershell
npm start
```

and open:

```text
http://localhost:3000
```

On localhost, `src/client/ar-upload-config.js` automatically uses the local `POST /api/models` endpoint. The generated model URL is only reachable from the laptop, so local mode tests export and upload but not the public phone flow.

## Storage behavior

The Worker stores files by SHA-256 hash:

```text
/models/ab/<64-character-sha256>.glb
```

Uploading the same GLB again reuses the same object and URL. Public GET responses use the correct GLB content type, immutable caching, CORS, and byte-range support. The Worker accepts files up to 25 MB; Scene Viewer performs best with significantly smaller models.

The current upload endpoint is a proof of concept. It restricts browser uploads to configured origins, but origin checking alone is not production authentication. Add user authentication, quotas, rate limiting, and an R2 lifecycle policy before production use.

## Debugging order

1. **Export failed:** use the error shown by the laptop page; no upload occurred.
2. **Export passed, upload failed:** verify Worker `/health`, `ALLOWED_ORIGINS`, and `src/client/ar-upload-config.js`.
3. **Upload passed, phone preview failed:** download the uploaded GLB from the phone page and validate that exact file.
4. **Phone preview works, Scene Viewer fails:** compare the GLB statistics with Scene Viewer limits and run the Khronos glTF Validator.
5. **Everything works on a small profile but not a large one:** reduce triangles, mesh count, material count, and total GLB size.
