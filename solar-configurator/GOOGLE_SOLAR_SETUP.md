# Google Solar API setup — Google Cloud Run

The Solar configurator now sends paid Google Solar requests to the same-origin
Google Cloud endpoint:

```text
/api/solar/google-solar
```

The browser never receives the Google Solar API key. The backend runs as the
separate Cloud Run service `solar-google-api` and is intended to be reachable
only through the existing external Application Load Balancer.

The old Netlify Google Solar function remains in `pvgis-proxy-netlify/` only as
an emergency rollback path. PVGIS itself is unchanged by this migration.

## 1. Enable Google Solar API and create backend resources

From the repository root in Cloud Shell:

```bash
solar-google-api/scripts/bootstrap-gcp.sh
```

The script enables the required APIs and creates/configures:

- `gs://cfg360-solar-cache-89ccb07249b1`
- a 31-day Cloud Storage lifecycle cleanup rule
- Secret Manager secret containers
- Storage/Firestore/Secret Manager IAM for
  `configurator-runtime@configurator-360.iam.gserviceaccount.com`
- Firestore TTL on the `expireAt` field in `googleSolarSecurityV1`

## 2. Add secret values

Use the restricted Google Maps Platform Solar API key you already used on
Netlify:

```bash
printf '%s' 'YOUR_RESTRICTED_SOLAR_API_KEY' | \
  gcloud secrets versions add google-solar-api-key \
  --project=configurator-360 --data-file=-

printf '%s' 'YOUR_PRIVATE_DEMO_CODE' | \
  gcloud secrets versions add google-solar-demo-access-code \
  --project=configurator-360 --data-file=-

openssl rand -hex 32 | \
  gcloud secrets versions add google-solar-session-secret \
  --project=configurator-360 --data-file=-
```

Keep the Google API key restricted to the Solar API. Google Cloud API quotas
remain the final billing hard-stop.

## 3. Deploy the Cloud Run service

Run the GitHub Actions workflow:

```text
Deploy Google Solar API to Cloud Run
```

or push changes under `solar-google-api/` to `main`.

The workflow deploys:

```text
service: solar-google-api
region: europe-central2
runtime SA: configurator-runtime@configurator-360.iam.gserviceaccount.com
ingress: internal-and-cloud-load-balancing
public run.app URL: disabled
CPU: 2
memory: 2 GiB
request timeout: 300 s
concurrency: 4
max instances: 3
```

The three secrets are mounted as environment variables from Secret Manager.

## 4. Attach the service to the existing Application Load Balancer

After the Cloud Run service exists:

```bash
solar-google-api/scripts/create-load-balancer-backend.sh
```

This creates:

```text
solar-google-api-neg
solar-google-api-backend
```

The script then prints the remaining URL-map edit. Add these two paths to the
path matcher already serving the 360Configurator production hosts:

```text
/api/solar/google-solar
/api/solar/google-solar/*
```

Both must route to the global backend service `solar-google-api-backend`.
Do not replace the existing website path matcher or host rules.

Google Cloud Application Load Balancers route paths to backend services through
the URL map, and serverless NEGs are the backend bridge to Cloud Run.

## 5. Health check

After the URL-map change propagates:

```bash
curl -sS 'https://www.360configurator.com/api/solar/google-solar?action=health'
```

Expected shape:

```json
{
  "ok": true,
  "service": "google-solar-demo-proxy",
  "platform": "google-cloud-run",
  "googleSolarConfigured": true,
  "accessCodeConfigured": true
}
```

Repeat on `.ro` and `.de` if desired; all three domains use the same backend.

## 6. Security model

The existing browser contract is preserved:

1. user submits the private demo access code;
2. the Cloud Run service checks a Firestore transactional login counter;
3. the service returns a 2-hour HMAC-signed session token;
4. the token remains bound to the requesting IP and origin;
5. paid analysis requests use per-IP and global daily Firestore counters;
6. the restricted Google Solar API key is read only from Secret Manager;
7. Google Solar API quota remains the final billing cap.

Default application limits:

```text
GOOGLE_SOLAR_MAX_LOGIN_ATTEMPTS_HOUR=12
GOOGLE_SOLAR_MAX_ANALYSES_PER_IP_DAY=20
GOOGLE_SOLAR_MAX_ANALYSES_DAY=100
```

## 7. Cache model

The data and response contract are unchanged from the previous implementation.
Only the storage provider changes.

```text
Building Insights             7 days
Data Layers URL metadata      45 minutes
Hourly shade GeoTIFFs         30 days
DSM / building mask GeoTIFFs  30 days
Processed surface model       30 days
Annual/monthly flux GeoTIFFs  30 days
Processed flux model          30 days
```

Cloud Storage stores the shared cache. Each object carries its logical expiry in
metadata, and the service rejects expired objects on read. Bucket lifecycle
management deletes old objects after 31 days as a cleanup guard.

For local house movement, the configurator keeps the Data Layers request anchored
at the original exact-location pin and uses a stable 100 m `FULL_LAYERS` radius.
This lets nearby panel positions be re-sampled from the same 30-day GeoTIFF cache
instead of changing cache keys at 50/75/100 m thresholds. Building Insights are
indexed per cached area by Google's building resource name and bounding box, so a
new coordinate inside an already-resolved building can reuse that 7-day result. A
move onto a different building still causes one Building Insights lookup. The
browser also retains up to the three most recent exact analysis signatures when
localStorage capacity allows, so returning to a previous position/layout can avoid
the proxy request completely.

Rate-limit counters are stored transactionally in Firestore and carry an
`expireAt` TTL timestamp.

## 8. Local development

The production frontend defaults to the same-origin GCP path. To run the backend
locally, override it before the configurator loads:

```js
window.SOLAR_GOOGLE_SOLAR_ENDPOINT =
  'http://localhost:8080/api/solar/google-solar';
```

Then:

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

Loopback browser origins are accepted automatically.

## 9. Rollback

The old Netlify implementation has intentionally not been deleted yet. If the
Cloud Run migration needs to be rolled back temporarily, set:

```js
window.SOLAR_GOOGLE_SOLAR_ENDPOINT =
  'https://pvgis-proxy.netlify.app/.netlify/functions/google-solar';
```

Once the Cloud Run path has been stable in production, the legacy Google Solar
Netlify function and its Blob cache can be retired separately. Do not remove the
PVGIS Netlify function as part of this migration.
