# Solar data proxy — Netlify Functions

This small Netlify site hosts the server-side functions required by the public GitHub Pages solar configurator:

- `/.netlify/functions/pvgis` — read-only JRC PVGIS relay.
- `/.netlify/functions/google-solar` — protected Google Solar showcase endpoint.

The Google endpoint intentionally keeps the Google Maps Platform API key on Netlify instead of exposing it in the static GitHub Pages application.

## Install and deploy

```bash
cd solar-configurator/pvgis-proxy-netlify
npm install
netlify deploy --prod
```

The project now has runtime dependencies because the Google Solar function uses Netlify Blobs plus Google's documented GeoTIFF parsing stack (`geotiff`, `geotiff-geokeys-to-proj4`, and `proj4`).

## PVGIS endpoint

```text
https://YOUR-SITE.netlify.app/.netlify/functions/pvgis
```

Health test:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/pvgis?tool=health
```

`pvgis` supports only `PVcalc`, `printhorizon`, and `health`. Successful responses use Netlify CDN caching and temporary PVGIS overload/rate-limit responses are retried briefly.

Set the existing `ALLOWED_ORIGIN` variable to the public configurator origin if you want to restrict browser CORS access.

## Google Solar endpoint

```text
https://YOUR-SITE.netlify.app/.netlify/functions/google-solar
```

Health test:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/google-solar?action=health
```

The endpoint exposes only three actions:

- `GET action=health` — configuration status only; no paid Google request.
- `POST action=login` — validates the private showcase access code and returns a two-hour HMAC-signed demo session.
- `POST action=analyze` — protected Building Insights + Data Layers/hourly-shade analysis.

### Required Google environment variables

```bash
netlify env:set GOOGLE_SOLAR_API_KEY 'YOUR_RESTRICTED_SOLAR_API_KEY'
netlify env:set GOOGLE_SOLAR_DEMO_ACCESS_CODE 'YOUR_PRIVATE_SHOWCASE_CODE'
netlify env:set GOOGLE_SOLAR_SESSION_SECRET 'YOUR_LONG_RANDOM_SECRET'
netlify env:set GOOGLE_SOLAR_ALLOWED_ORIGIN 'https://aks.360configurator.com'
```

Loopback development origins (`localhost`, `127.0.0.1`, `0.0.0.0`, and IPv6 loopback) are accepted automatically on any port. They do not need to be added to `GOOGLE_SOLAR_ALLOWED_ORIGIN`. For a development server opened through a LAN IP/hostname, add that exact origin to the environment variable as a comma-separated value.

A signing secret can be generated locally, for example:

```bash
openssl rand -hex 32
```

Optional demo limits:

```bash
netlify env:set GOOGLE_SOLAR_MAX_LOGIN_ATTEMPTS_HOUR '12'
netlify env:set GOOGLE_SOLAR_MAX_ANALYSES_PER_IP_DAY '20'
netlify env:set GOOGLE_SOLAR_MAX_ANALYSES_DAY '100'
```

After changing Netlify environment variables, publish a new production deploy so the function runs with the intended configuration.

### Google Cloud setup

Use a dedicated Google Cloud API key for this server-side function and restrict that key to the **Solar API**. Do not put the key into `index.html`, GitHub Actions variables used to generate frontend JavaScript, query strings in the public site, or browser storage.

For a public showcase, also configure low daily Building Insights and Data Layers quotas in Google Cloud. The proxy's Blob counters are defense-in-depth/best-effort controls; the Google Cloud quota is the final cost ceiling.

### Demo authentication

The access code is not embedded in the public site. A successful login creates a two-hour signed token, stored by the browser only in `sessionStorage`. The token is bound to the login origin and client IP before an `analyze` request is accepted.

This is intentionally a lightweight demo gate. If the configurator becomes a real customer-facing product, replace the shared access code with a proper user identity system.

### Persistent caching

The Google function uses site-wide Netlify Blobs so cache data survives new deploys:

- Building Insights: 7 days.
- Data Layers URL metadata: 45 minutes, safely below the temporary GeoTIFF URL lifetime.
- Downloaded monthly hourly-shade GeoTIFFs: 30 days.

The expensive Data Layers acquisition is keyed by geographic center + radius. Once the twelve shade TIFFs are present, the proxy can sample new panel layouts from those same cached files without another Data Layers call. The returned browser payload contains compact shade masks rather than the TIFF binaries.

## Local development

```bash
cd solar-configurator/pvgis-proxy-netlify
netlify dev
```

Typical local endpoints are:

```text
http://localhost:8888/.netlify/functions/pvgis?tool=health
http://localhost:8888/.netlify/functions/google-solar?action=health
```

Set the environment variables in your Netlify development environment before testing paid Google Solar analysis.

## Cloudflare alternative

The older PVGIS Cloudflare Worker remains in `../pvgis-proxy/` as an optional PVGIS relay. The Google Solar demo integration is implemented in the Netlify project because it also uses persistent Netlify Blobs caching.
