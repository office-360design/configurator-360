# Main + AR branch merge report

## Merge policy

The production `main` archive was used as the base and had priority for every exact-path conflict.
The AR branch was applied additively only where it did not replace production behavior, except for the QR/AR transport code inside `src/client/index.html`, which was deliberately upgraded from the temporary Node-hosted GLB route to browser GLB export plus Cloudflare Worker/R2 storage.

## Production files preserved from main

- Full production `src/client/index.html` layout, window construction, 2_4/2_5/2_6 profiles, glass-thickness logic, handle-side logic, CAD screenshot viewer, capture/render API integration, and current defaults.
- `src/server/server.js` Playwright render endpoint, CAD screenshot endpoint, legacy `/api/ar-model` endpoint, static hosting behavior, and shutdown behavior.
- `convert.js`, `test_convert.js`, `generate_screenshots_json.js`, `Dockerfile`, `render.yaml`, `src/client/ar.html`, `src/client/lib/`, `src/client/cad_screenshots/`, all production DWG/DXF/SVG data, and all production documentation.
- Production `package.json` dependencies and GitHub Pages workflow structure.

## AR functionality merged

- `src/client/ar-export.js`: browser-side sanitized GLB export, structural inspection, GLTFLoader round-trip validation, diagnostic download, and upload client.
- `src/client/ar-upload-config.js`: public Worker endpoint configuration.
- `src/client/ar-viewer.html`: phone launcher/preview page for native Android Scene Viewer.
- `infrastructure/cloudflare-worker/`: GLB validation, content-addressed R2 storage, public model URLs, CORS, HEAD, and byte-range support.
- QR dialog export statistics, diagnostic GLB download, public upload, launcher URL, and Scene Viewer QR generation.
- Export pose now follows the production branch's opening mode, left/right handle, angle, and exploded state.
- Additive local `/api/models` and `/models/...` routes for browser export testing. Existing production routes remain unchanged.
- Static Netlify preparation that includes production `src/client/lib/`, `src/client/svg/`, `src/client/cad_screenshots/`, and AR files.

## Deliberate conflict resolutions

- `src/client/index.html`: production main was retained; only the AR dialog/import/export/upload sections were integrated.
- `src/server/server.js`: production main was retained; AR-compatible local routes were added rather than replacing the server.
- `package.json` and `package-lock.json`: production dependencies were retained. Only additional npm scripts were added to `package.json`; no dependency change was required.
- `.github/workflows/deploy-pages.yml`: production workflow retained and extended to copy the new AR files.
- Exact-path DWG/DXF/SVG conflicts: production main files retained. Non-conflicting AR source assets were added.
- `README.md`: production main version retained. AR documentation remains in `GLB_PIPELINE.md` and `infrastructure/cloudflare-worker/README.md`.

## Required configuration

Before public AR upload works, set the deployed Worker URL in `src/client/ar-upload-config.js` and confirm the frontend origin in `infrastructure/cloudflare-worker/wrangler.jsonc`.

The AR branch's original README is preserved as `README_AR_R2.md` so its setup instructions are available without replacing the production README.
