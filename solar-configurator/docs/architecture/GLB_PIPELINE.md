# GLB pipeline diagnostic checklist

The new QR workflow reports exactly where a failure occurs.

## Stage 1 — browser export

The page prepares the visible window, bakes transforms, creates clean meshes, exports a binary GLB, inspects its JSON structure, and re-imports it with `GLTFLoader`.

A failure here means object storage and the phone are not involved.

## Stage 2 — object storage upload

The exact validated `ArrayBuffer` is sent as `model/gltf-binary` to `POST /api/models`. The Worker checks the GLB header and JSON chunk again before writing to R2.

A failure here is normally one of:

- Worker URL still contains the placeholder;
- Worker or R2 bucket was not deployed;
- Netlify origin is missing from `ALLOWED_ORIGINS`;
- request exceeded 25 MB;
- Worker runtime error.

## Stage 3 — public download

The phone launcher performs a `HEAD` request to the model URL and `<model-viewer>` parses the same public GLB. The Worker supports `GET`, `HEAD`, CORS, and `Range` requests.

If the 3D preview loads but native AR does not, the file is reachable and parseable; focus on Scene Viewer-specific model constraints.

## Files to preserve when reporting a failure

- the build ID shown on the configurator;
- the export statistics shown in the QR dialog;
- the downloaded diagnostic GLB;
- the model URL from the phone launcher diagnostics;
- the exact phone-page or Scene Viewer error.
