# Tiles segmentation service

This is the **tiles analysis API service (steps 3–5)**, not the old segmentation prototype webpage.
It runs the unchanged EoMT-S / MoGe-2 inference and plane-fit implementations from
`segmentation-final.zip`. The tiles website remains the frontend.

## Start locally

Use the Python environment that already runs the segmentation prototype. Stop its
old server before using the same port for this service.

From the repository root, in PowerShell:

```powershell
cd tiles-configurator\segmentation-service
python -m pip install -r requirements.txt
python -m server
```

On macOS/Linux:

```sh
cd tiles-configurator/segmentation-service
python -m pip install -r requirements.txt
python -m server
```

The service listens on `127.0.0.1:8000`. Keep running the website with the project's
normal frontend command. Visiting port 8000 shows service information, not the
configurator page. The health endpoint is `/api/paving/health`.

Requirements are copied from the supplied working prototype, including the
pinned MoGe implementation and Transformers constraint. A new environment needs
the appropriate PyTorch build for its CPU/CUDA setup; reuse the working prototype
environment rather than changing a functioning GPU installation. Python 3.11 or
3.12 is recommended by the original requirements. Model weights are not in this
patch. The existing Hugging Face cache is reused under the same OS user. An
initial run can download missing weights.

Optional prefetch (uses the real checkpoints):

```sh
python -m server.prefetch
```

Do not start multiple Uvicorn workers. Serialization and job ownership are
in-process, and each worker would load another set of models.

## Frontend address and CORS

`../js/segmentationConfig.js` is the only frontend deployment setting:

- On HTTP localhost/127.0.0.1, an empty `apiBase` uses port 8000 at the same host.
- On a hosted site, an empty `apiBase` uses the site's `/api/paving` reverse proxy.
- An explicit `apiBase` must end at the API prefix, for example
  `https://analysis.example.com/api/paving`.
- HTTPS pages must use HTTPS analysis, not an HTTP localhost service.
- No API secrets belong in this public JavaScript file.

The default exact allowed origins are HTTP `localhost`, `127.0.0.1`, and `[::1]`
on ports 3000, 5173, 5500, 8000, and 8080. To use another website origin, set it
**before starting the service**:

```powershell
$env:PAVING_ALLOWED_ORIGINS = "http://localhost:3001,http://127.0.0.1:3001"
python -m server
```

Or:

```sh
PAVING_ALLOWED_ORIGINS='http://localhost:3001' python -m server
```

The environment variable replaces the default list. Use exact scheme/host/port
origins, without paths or trailing slashes. Wildcards and `null` are rejected.
`PAVING_HOST` and `PAVING_PORT` can change the listening address; update the
frontend API base when changing the port. Loopback binding is the safe default.

For a hosted frontend, either reverse-proxy `/api/paving/*` to this service without
stripping the prefix, or configure its explicit HTTPS API base and allow the
frontend's exact origin. A reverse proxy should forward the original Host and
scheme. Authentication, per-account quotas, public deployment and image sharing
are deployment work, not provided by CORS alone. Put a trusted authenticated,
rate-limited gateway in front of a public inference service. Do not expose the
repository root with a generic static-file mount.

## Job API

All API responses are `no-store`. Send a unique per-tab `client_id` and a strictly
increasing integer `generation` for that tab. The frontend handles both.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/paving/health` | Job API version and model-loaded state; does not load weights. |
| POST | `/api/paving/jobs` | Multipart `image_id`, `client_id`, `generation`, `image`; returns 202 and job ID. |
| GET | `/api/paving/jobs/{id}` | State and stage; requires `X-Paving-Client`. |
| GET | `/api/paving/jobs/{id}/result` | Original segmentation/camera bundle, per-stage errors and timing. |
| DELETE | `/api/paving/jobs/{id}` | Cancel one owned job. |
| DELETE | `/api/paving/requests/{generation}` | Invalidate a request even when the upload's job ID was never received. |

The last four routes require `X-Paving-Client`. It is an ownership/session nonce,
**not a substitute for authentication**. Job IDs are independently random. One
client cannot retrieve or cancel another client's job by substituting its own
client ID. Old generation cancellation cannot cancel a newer request.

The original `/api/segment`, `/api/camera`, and `/api/health` response contracts are
retained for compatibility. They share the same heavy-inference lock as jobs.
The old static prototype page and sample photo are deliberately not served.

Limits: 32..1100 pixels on each working-image side, 8 MB working upload, bounded
multipart bodies, at most four unfinished job tasks and eight retained completed
job records. Results expire after 15 minutes, pruned on access and every 30 seconds.
Queued/running inputs and model predictions consume additional bounded memory.
Results are ephemeral, not a persistence or sharing mechanism. Multipart upload
handling may use temporary spool files; request files are closed and not saved as
site assets. No photo archive or database is created. The optional original MoGe
prediction cache remains governed by `MOGE_CACHE_TTL_SECONDS`.

Cancellation cannot interrupt a running PyTorch call. Its result is invalidated
immediately; the lock remains held until that call returns, then the next stage is
skipped. This is why manual editing can be available while the service is still
finishing an abandoned inference.

## Existing model environment variables

The copied model implementations retain `MOGE_MODEL_ID`, `MOGE_MODEL_REVISION`,
`MOGE_CHECKPOINT`, `MOGE_DEVICE`, `MOGE_RESOLUTION_LEVEL`, `MOGE_CACHE_TTL_SECONDS`,
`EOMT_MODEL_ID`, `EOMT_MODEL_REVISION`, `SEGMENTATION_DEVICE`, and EoMT thresholds.
Do not relabel semantic materials from geometric support. Camera fitting still
runs with an empty semantic hint when segmentation fails.

## Deterministic tests

```sh
python -m pip install -r requirements-test.txt
python -m unittest server.test_camera server.test_segmentation server.test_jobs -v
```

These tests use synthetic/mocked predictors and do not download models. They do
not measure learned-model accuracy or the runtime on the client's hardware.

Framework references used for the integration: FastAPI's CORS and UploadFile
documentation, and Starlette's thread-pool and lifespan documentation:
https://fastapi.tiangolo.com/tutorial/cors/
https://fastapi.tiangolo.com/tutorial/request-files/
https://starlette.dev/threadpool/
https://starlette.dev/lifespan/

## Step-5 deployment and persistence

See `DEPLOYMENT.md` for the optional non-root CPU/GPU container, bounded job-cache
settings, exact Host checking and HTTPS reverse-proxy templates. The default
direct Python startup remains compatible. The inference service is not a durable
photo store: browser projects/portable files are described in
`../SEGMENTATION_STEP5.md`. No cloud photo bucket or database migration is needed
for those features.
