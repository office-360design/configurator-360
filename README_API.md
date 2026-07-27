# Odoo render API proof of concept

Copy `server.js`, `index.html`, and `package.json` over the corresponding files
in the configurator project.

Keep the existing `svg/`, `dwg/`, `intermediate/`, and conversion files.

## Install

```bash
npm install
npx playwright install chromium
npm start
```

On Linux, if Chromium system dependencies are missing:

```bash
npx playwright install --with-deps chromium
```

## Health test

```bash
curl http://localhost:3000/api/health
```

## Render test

```bash
curl -X POST http://localhost:3000/api/render   -H "Content-Type: application/json"   -d "{"request_id":"TEST-001","width_mm":1200,"height_mm":1500,"colour":"#1f5d3a"}"   --output preview.png
```

## Odoo URL

When Odoo runs directly on the host:

```text
http://localhost:3000/api/render
```

When Odoo runs in Docker Desktop and the configurator runs on the host:

```text
http://host.docker.internal:3000/api/render
```

Disable mock rendering in the Window Configurator settings.
