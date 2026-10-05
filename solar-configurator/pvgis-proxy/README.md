# PVGIS proxy (Cloudflare Worker)

PVGIS 5.3 rejects browser AJAX/CORS requests, so the static GitHub Pages configurator needs a tiny server-side relay.

## Deploy

```bash
cd solar-configurator/pvgis-proxy
npm install
npx wrangler login
npm run deploy
```

Wrangler prints a URL such as:

```text
https://solar-pvgis-proxy.<your-subdomain>.workers.dev/
```

Paste that URL into **Tools → Location & environment → PVGIS exact-site model → PVGIS proxy settings** and click **Apply proxy URL**.

For production you can change `ALLOWED_ORIGIN` in `wrangler.toml` from `*` to your exact GitHub Pages origin.

The worker exposes only two read-only JRC calls used by the configurator:

- `tool=PVcalc` — exact-location fixed-system monthly/annual PV yield.
- `tool=printhorizon` — terrain horizon profile.

Responses are cached at Cloudflare for 1 day (`PVcalc`) or 7 days (`printhorizon`) and 429/529 upstream responses are retried briefly.
