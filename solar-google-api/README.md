# Google Solar API — Cloud Run backend

This service is the Google Cloud replacement for the legacy Netlify
`google-solar.mjs` function. It intentionally preserves the browser contract:

- `GET ?action=health`
- `POST ?action=login`
- `POST ?action=analyze`

The Solar configurator therefore only changes its endpoint; Building Insights,
Data Layers, hourly shade, DSM, mask, annual/monthly flux and the signed demo
session keep the same response shape.

## Storage model

- Cloud Storage: Building Insights, Data Layers metadata, raw GeoTIFFs, processed
  DSM/surface models and flux models.
- Firestore: transactional login/analysis rate-limit counters.
- Secret Manager: Google Solar API key, demo access code and HMAC session secret.
- Browser localStorage: still only an optimization for the most recent analysis.

Application TTLs remain unchanged: Building Insights 7 days, Data Layers URL
metadata 45 minutes, and GeoTIFF/processed models 30 days. The cache bucket also
has a 31-day lifecycle deletion rule as a final cleanup guard. Cloud Storage
lifecycle deletion is asynchronous, so request-time metadata remains the source
of truth for whether a cached object is still valid.

## First-time setup

From the repository root, authenticated to project `configurator-360`:

```bash
solar-google-api/scripts/bootstrap-gcp.sh
```

Add the three secret values printed by the script. Then deploy through
`.github/workflows/deploy-solar-google-api.yml`.

After the first Cloud Run deployment:

```bash
solar-google-api/scripts/create-load-balancer-backend.sh
```

The script creates the serverless NEG and global backend service, then prints the
URL-map edit required for the existing external Application Load Balancer. The
public route must be:

```text
/api/solar/google-solar
```

The Cloud Run service is deployed with `internal-and-cloud-load-balancing`
ingress and no default `run.app` URL, so the load balancer is the intended public
entry point.

## Runtime environment

Non-secret values:

```text
GOOGLE_SOLAR_CACHE_BUCKET=cfg360-solar-cache-89ccb07249b1
GOOGLE_SOLAR_SECURITY_COLLECTION=googleSolarSecurityV1
GOOGLE_SOLAR_ALLOWED_ORIGIN=https://www.360configurator.com,https://www.360configurator.ro,https://www.360konfigurator.de,https://aks.360configurator.com
GOOGLE_SOLAR_MAX_LOGIN_ATTEMPTS_HOUR=12
GOOGLE_SOLAR_MAX_ANALYSES_PER_IP_DAY=20
GOOGLE_SOLAR_MAX_ANALYSES_DAY=100
```

Secret Manager mappings:

```text
GOOGLE_SOLAR_API_KEY=google-solar-api-key:latest
GOOGLE_SOLAR_DEMO_ACCESS_CODE=google-solar-demo-access-code:latest
GOOGLE_SOLAR_SESSION_SECRET=google-solar-session-secret:latest
```

## Local development

Application Default Credentials are required if you want Cloud Storage and
Firestore locally:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=configurator-360
export GOOGLE_SOLAR_CACHE_BUCKET=cfg360-solar-cache-89ccb07249b1
export GOOGLE_SOLAR_API_KEY='...'
export GOOGLE_SOLAR_DEMO_ACCESS_CODE='...'
export GOOGLE_SOLAR_SESSION_SECRET='...'
npm install --prefix solar-google-api
npm start --prefix solar-google-api
```

Health check:

```bash
curl 'http://localhost:8080/api/solar/google-solar?action=health'
```

For a local Solar frontend, override the endpoint before `app.js` loads:

```js
window.SOLAR_GOOGLE_SOLAR_ENDPOINT = 'http://localhost:8080/api/solar/google-solar';
```

Loopback browser origins are accepted automatically.

## Rollback

The previous Netlify implementation remains under
`solar-configurator/pvgis-proxy-netlify/` during the migration. To roll back the
Google Solar endpoint temporarily, set `window.SOLAR_GOOGLE_SOLAR_ENDPOINT` to
the old Netlify function URL. PVGIS remains on its existing proxy and is not part
of this migration.
