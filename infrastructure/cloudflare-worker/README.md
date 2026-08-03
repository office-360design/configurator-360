# Cloudflare Worker + R2 model storage

This Worker receives browser-generated binary GLB files, validates their basic GLB 2.0 structure, stores them in an R2 bucket under a SHA-256 content address, and serves them publicly with byte-range support for Android Scene Viewer.

## Deploy

```powershell
cd infrastructure/cloudflare-worker
npm install
npx wrangler login
npm run create-bucket
npm run deploy
```

Wrangler prints a URL similar to:

```text
https://window-ar-model-storage.<your-subdomain>.workers.dev
```

Copy it into `../src/client/ar-upload-config.js` and keep `/api/models`, for example:

```javascript
endpoint: 'https://window-ar-model-storage.example.workers.dev/api/models'
```

Then run `scripts/windows/prepare_static_site.vbs` and redeploy `dist/site/` to Netlify.

## Allowed origin

`wrangler.jsonc` currently allows the existing Netlify site and local development:

```text
https://brilliant-klepon-fbae3a.netlify.app,http://localhost:3000
```

Change this when the frontend domain changes. The upload route is intended as a proof-of-concept endpoint; origin filtering is not a substitute for user authentication. Add real authorization and rate limiting before exposing this as a production upload service.

## Test

```powershell
Invoke-RestMethod https://<worker>.workers.dev/health
```

The browser uses `POST /api/models`. Scene Viewer downloads the returned `GET /models/...glb` URL. Model URLs are content-addressed and returned with immutable caching headers.
