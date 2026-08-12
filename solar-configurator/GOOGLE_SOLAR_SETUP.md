# Google Solar showcase setup

The public GitHub Pages configurator talks only to the Netlify function. The Google API key must remain a Netlify environment variable.

## 1. Google Cloud

1. Enable billing for the Google Cloud project.
2. Enable **Solar API**.
3. Create a dedicated API key for the Netlify server-side Solar API calls.
4. Restrict the key to **Solar API** only.
5. Configure conservative daily quotas for both Building Insights and Data Layers so Google Cloud is the final billing hard-stop for the demo.

## 2. Netlify environment variables

On the existing `pvgis-proxy` Netlify project set:

```bash
netlify env:set GOOGLE_SOLAR_API_KEY 'YOUR_SOLAR_API_KEY'
netlify env:set GOOGLE_SOLAR_DEMO_ACCESS_CODE 'YOUR_PRIVATE_DEMO_CODE'
netlify env:set GOOGLE_SOLAR_SESSION_SECRET "$(openssl rand -hex 32)"
netlify env:set GOOGLE_SOLAR_ALLOWED_ORIGIN 'https://aks.360configurator.com'
```

The Google Solar proxy also permits loopback development origins automatically, on any port:

- `http://localhost:<port>`
- `http://127.0.0.1:<port>`
- `http://0.0.0.0:<port>`
- IPv6 loopback (`::1`)

You do not need to add these to `GOOGLE_SOLAR_ALLOWED_ORIGIN`. The production origin remains restricted by the environment variable. If you develop through a LAN hostname/IP rather than a loopback URL, add that exact origin to the comma-separated environment variable instead.

Optional limits:

```bash
netlify env:set GOOGLE_SOLAR_MAX_LOGIN_ATTEMPTS_HOUR '12'
netlify env:set GOOGLE_SOLAR_MAX_ANALYSES_PER_IP_DAY '20'
netlify env:set GOOGLE_SOLAR_MAX_ANALYSES_DAY '100'
```

The access code and signing secret must not be committed to GitHub.

## 3. Deploy the Netlify proxy

The Google function adds npm runtime dependencies, so install them before deployment:

```bash
cd solar-configurator/pvgis-proxy-netlify
npm install
netlify deploy --prod
```

Health check:

```text
https://pvgis-proxy.netlify.app/.netlify/functions/google-solar?action=health
```

Expected response includes:

```json
{
  "ok": true,
  "googleSolarConfigured": true,
  "accessCodeConfigured": true
}
```

## 4. Deploy GitHub Pages

Commit the updated `solar-configurator/` folder and push to `main`. The existing Pages workflow already publishes that folder to:

```text
https://aks.360configurator.com/solar-configurator/
```

The frontend already defaults to:

```text
https://pvgis-proxy.netlify.app/.netlify/functions/google-solar
```

No Google API key is present in the GitHub Pages source.

## 5. Use the showcase feature

1. Open **Tools → Location & environment**.
2. Select an exact property and load the local context.
3. Under **Google Solar detailed site analysis**, enter the private demo access code.
4. Select **Unlock Google Solar**.
5. Select **Analyze selected property**.

The first uncached property can issue one Building Insights and one Data Layers request. After the hourly shade GeoTIFFs are cached, panel-layout changes reuse those server-side raster files rather than making another Data Layers acquisition for the same site/radius.

## Security scope

This is a showcase gate, not full account authentication. The practical billing protections are layered:

- Google API key stays server-side.
- The browser needs the private access code to receive a signed two-hour session.
- The token is bound to origin and client IP.
- Netlify applies best-effort per-IP/global demo limits.
- Google Cloud daily quotas are the final hard cost ceiling.


## Diagnosing `fetch failed`

If the UI unlocks successfully but analysis reports `fetch failed`, the browser-to-Netlify path is already working. The failure is an outbound request made by the Netlify Function to Google Solar or to one of the Google GeoTIFF URLs.

The proxy now retries transient network/429/5xx failures and reports the exact stage, for example:

- `Building Insights request`
- `Data Layers request`
- `Google hourly-shade GeoTIFF month 4`

It also reports the underlying Node network cause code/message when one exists. Check **Netlify → Logs & Metrics → Functions → google-solar** for the same detailed message.

## Step A — DSM + building mask

The Google Solar analysis now also consumes two additional GeoTIFF URLs returned by the same Data Layers request:

- `dsmUrl` — Google Digital Surface Model, used as a detailed local surface mesh.
- `maskUrl` — Google's rooftop/building mask, used to distinguish roof pixels and identify the mapped building that the configurable house is replacing.

These GeoTIFF downloads do not create additional Data Layers billable requests. The Netlify function caches both raw TIFFs and the processed browser-friendly surface grid for up to 30 days.

In the configurator, **Use Google DSM for local environment** adds the Google surface inside the analyzed radius. OSM buildings/trees that overlap the Google-covered surface are suppressed to avoid duplicate geometry. **Highlight Google rooftop mask** colors detected rooftop cells and outlines the host roof. If **Replace overlapping mapped building** is enabled, the detected host roof is flattened so the configurable Three.js house can occupy that footprint cleanly.
