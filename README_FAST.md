# Faster Odoo render API proof of concept

This version implements the first 5 performance improvements:

1. loads SVG profile files in parallel;
2. loads Three.js locally from `node_modules` instead of a CDN;
3. removes the Google font dependency by using a system font;
4. uses `domcontentloaded` instead of `networkidle` for page readiness;
5. reuses a persistent Playwright render page instead of creating a new page/context per request.

## Replace in your configurator project

Copy these files over the matching files in your configurator project:

- `server.js`
- `index.html`
- `package.json`

Keep the existing `svg/`, `dwg/`, `intermediate/`, and conversion files.

## Install / update dependencies

```bash
npm install
npx playwright install chromium
npm start
```

## Test

```bash
curl http://localhost:3000/api/health
```

```bash
curl -X POST http://localhost:3000/api/render   -H "Content-Type: application/json"   -d '{"request_id":"TEST-001","width_mm":1200,"height_mm":1500,"colour":"#1f5d3a"}'   --output preview.png
```

The first render may still be slower because the page is initialized and the first profile is cached.
Subsequent renders should be noticeably faster.
