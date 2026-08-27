# Solar API — Cloud Run backend

This Cloud Run service hosts the Solar configurator's server-side API routes. It replaces the legacy Netlify Google Solar and PVGIS functions while preserving both browser contracts.

Google Solar (`/api/solar/google-solar`):

- `GET ?action=health`
- `POST ?action=login`
- `POST ?action=analyze`

PVGIS (`/api/solar/pvgis`):

- `GET ?tool=health`
- `GET ?tool=PVcalc&...`
- `GET ?tool=printhorizon&...`

Building Insights, Data Layers, hourly shade, DSM, mask, annual/monthly flux and the signed demo session keep the same response shape. PVGIS keeps its existing parameter allow-list and response shape.

## Storage model

- Cloud Storage: Building Insights, Data Layers metadata, raw GeoTIFFs, processed
  DSM/surface models and flux models, plus cached PVGIS JSON responses.
- Firestore: transactional login/analysis rate-limit counters.
- Secret Manager: Google Solar API key, demo access code and HMAC session secret.
- Browser localStorage: still only an optimization for the most recent analysis.

Application TTLs remain unchanged: Building Insights 7 days, Data Layers URL
metadata 45 minutes, GeoTIFF/processed models 30 days, PVGIS `PVcalc` 1 day, and PVGIS horizon responses 7 days. The cache bucket also
has a 31-day lifecycle deletion rule as a final cleanup guard. Cloud Storage
lifecycle deletion is asynchronous, so request-time metadata remains the source
of truth for whether a cached object is still valid.

Local-position reuse is deliberately area-based. The frontend requests one stable
100 m `FULL_LAYERS` footprint around the selected map pin, so moving the
configurable house within that area re-samples the existing shade/DSM/flux
GeoTIFFs instead of creating 50 m, 75 m and 100 m cache variants. Building
Insights are additionally indexed by returned building resource and bounding box:
if a moved house point is still inside a building already resolved for that area,
the cached building is reused; moving onto a different building still performs a
new `buildingInsights:findClosest` request for correctness. Concurrent misses for
the same area are coalesced within a Cloud Run instance.

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
public routes must be:

```text
/api/solar/google-solar
/api/solar/pvgis
```

The Cloud Run service is deployed with `internal-and-cloud-load-balancing`
ingress and no default `run.app` URL, so the load balancer is the intended public
entry point.

## Runtime environment

Non-secret values:

```text
GOOGLE_SOLAR_CACHE_BUCKET=cfg360-solar-cache-89ccb07249b1
PVGIS_CACHE_BUCKET=cfg360-solar-cache-89ccb07249b1  # optional; defaults to GOOGLE_SOLAR_CACHE_BUCKET
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
export PVGIS_CACHE_BUCKET=cfg360-solar-cache-89ccb07249b1  # optional; defaults to GOOGLE_SOLAR_CACHE_BUCKET
export GOOGLE_SOLAR_API_KEY='...'
export GOOGLE_SOLAR_DEMO_ACCESS_CODE='...'
export GOOGLE_SOLAR_SESSION_SECRET='...'
npm install --prefix solar-google-api
npm start --prefix solar-google-api
```

Health checks:

```bash
curl 'http://localhost:8080/api/solar/google-solar?action=health'
curl 'http://localhost:8080/api/solar/pvgis?tool=health'
```

For a local Solar frontend, override the endpoints before `app.js` loads:

```js
window.SOLAR_GOOGLE_SOLAR_ENDPOINT = 'http://localhost:8080/api/solar/google-solar';
window.SOLAR_PVGIS_PROXY_ENDPOINT = 'http://localhost:8080/api/solar/pvgis';
```

Loopback browser origins are accepted automatically.

## Rollback

The previous Netlify implementation remains under
`solar-configurator/pvgis-proxy-netlify/` as a temporary rollback reference. To
roll back either endpoint temporarily, override `window.SOLAR_GOOGLE_SOLAR_ENDPOINT`
or `window.SOLAR_PVGIS_PROXY_ENDPOINT` before `app.js` loads.

## Tier-1 tenant usage metering

Requests arriving on `<slug>.360configurator.com` are resolved against the private `tenants/{slug}` Firestore document by the Solar Cloud Run service. The tenant must be active, use the Go Live Now plan, own the hostname, and have the Solar configurator enabled. This lookup uses the request hostname as the authoritative tenant scope so same-origin GET requests that omit an `Origin` header are still metered correctly.

Per-tenant monthly telemetry is stored under `tenantUsage/{slug}/months/{YYYY-MM}`. The backend meters accepted Google Solar analyses, actual upstream Building Insights requests, actual upstream Data Layers requests, PVGIS requests, and PVGIS upstream cache misses. Building Insights/Data Layers cache hits do not increment the paid-upstream counters.

Limits come from the private tenant's `solarUsageLimits` map. A value of `0` means unlimited. When a positive limit would be exceeded, the backend returns HTTP 429 before issuing the corresponding upstream request. Platform domains retain the existing demo/session and global safety limits and are not written into tenant usage documents.
