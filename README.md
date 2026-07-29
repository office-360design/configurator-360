# Configurator 360 — automated Scene Viewer AR

The production configurator remains the source of the window geometry. Its AR workflow is now:

```text
Browser exports and optimizes the current window as GLB
        ↓
Netlify Function validates the request and creates a short-lived upload ticket
        ↓
Browser uploads the GLB directly to Supabase Storage with resumable TUS
        ↓
Supabase returns a public, content-addressed GLB URL
        ↓
The configurator creates the phone QR automatically
        ↓
Google Scene Viewer opens the uploaded model in native Android AR
```

The 7–15 MB GLB never passes through the Netlify Function. The Function receives only a small JSON request, keeps the Supabase secret key server-side, applies storage safety limits, and returns a temporary signed-upload token.

Setup and deployment instructions are in [`SUPABASE_NETLIFY_SETUP.md`](SUPABASE_NETLIFY_SETUP.md).

## Main AR files

- `ar-export.js` — GLB sanitation, simplification, validation, hashing, and direct Supabase upload.
- `ar-upload-config.js` — public, non-secret frontend settings.
- `ar-viewer.html` — phone preview and native Scene Viewer launcher.
- `netlify/functions/ar-upload-ticket.mjs` — protected signed-upload-ticket endpoint.
- `netlify.toml` — Netlify static-site and Functions configuration.
- `.env.example` — names and safe defaults for required Netlify environment variables.

The former static/manual model publication remains available as a fallback through the **Download optimized GLB** button. The old Cloudflare files are retained only as historical project material and are not used by this implementation.
