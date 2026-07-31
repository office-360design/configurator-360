# Configurator 360 — Android and iOS AR publication

The production configurator remains the source of the window geometry. Before generating a QR, the operator selects one target platform:

```text
Android selected                         iOS selected
       ↓                                      ↓
Optimized GLB generated                  Optimized USDZ generated
       ↓                                      ↓
Netlify creates a short-lived Supabase upload ticket
       ↓
The browser uploads the selected binary directly to Supabase Storage
       ↓
One platform-specific QR opens the shared Netlify phone page
       ↓                                      ↓
Google Scene Viewer                    Apple AR Quick Look
```

Only the selected representation is generated and uploaded for that QR. An Android publication contains a GLB; an iOS publication contains a USDZ. Existing publications are not deleted when another platform is selected, so previously generated QR codes remain valid.

The model bytes never pass through the Netlify Function. The Function receives only a small JSON request, keeps the Supabase secret key server-side, validates platform/format/size metadata, applies storage limits, and returns a temporary signed-upload token.

Setup and deployment instructions are in [`SUPABASE_NETLIFY_SETUP.md`](SUPABASE_NETLIFY_SETUP.md).

## Main AR files

- `index.html` — Android/iOS segmented selector and platform-specific QR workflow.
- `ar-export.js` — shared geometry optimization, GLB/USDZ export, validation, hashing, and direct Supabase upload.
- `ar-upload-config.js` — public frontend export limits and upload endpoint.
- `ar-viewer.html` — shared phone page, device/platform mismatch handling, Scene Viewer, and Quick Look launcher.
- `netlify/functions/ar-upload-ticket.mjs` — origin-restricted signed upload-ticket endpoint for GLB and USDZ.
- `netlify.toml` — Netlify static-site and Functions configuration.
- `.env.example` — required Netlify environment variables and safe defaults.

The manual fallback remains available through the format-aware **Download optimized GLB/USDZ** button.
