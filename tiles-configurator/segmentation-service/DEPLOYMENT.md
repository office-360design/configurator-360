# Step-5 deployment templates

Existing local usage stays `python -m server` in this directory and the website's
normal frontend command. Model weights are not bundled. Reuse the working Python
GPU environment rather than replacing a functioning PyTorch installation.

## Optional container deployment

From this directory, copy `.env.example` to `.env` and set the exact frontend
origin(s) and allowed Host values. These are local settings; do not commit real
credentials. `.env` is consumed by Compose, **not automatically by python -m server**.

```sh
# CPU; builds/downloads dependencies but downloads checkpoints only on prefetch/use.
docker compose up --build -d
docker compose exec paving-analysis python -m server.prefetch
docker compose logs -f paving-analysis

# GPU alternative, after setting up the host driver and NVIDIA Container Toolkit.
docker compose -f compose.yaml -f compose.gpu.yaml up --build -d
```

The default wheel pair is torch 2.10.0 / torchvision 0.25.0 with the official CPU index.
The optional GPU build uses the CUDA 12.6 wheel index; check host-driver support
before selecting it. Versions are explicit build arguments, not a claim to be
the newest releases. Existing requirements keep the project's pinned MoGe commit
and Transformers constraint. Other Python packages remain within the supplied
requirements ranges; run a dependency/security review and lock resolved versions
for your production release. No Docker image build or GPU run was performed here.

Only port 8000 is published, and only on 127.0.0.1 by default. The process runs as
non-root, with dropped capabilities, a read-only root filesystem and a temporary
/tmp. A named volume retains only model cache data. Uploaded images, jobs and
results are not durable project storage; multipart temporary files may use /tmp.
Do not add a repository-root static mount. The container health check does not
load models; a healthy API is not proof that the checkpoints are available or
that inference succeeds.

A named Docker volume is separate from your host Hugging Face cache. Prefetch may
download weights again. An optional host bind mount needs deliberate access and
UID 10001 write permission. Avoid mounting your entire home directory or reusing a
cache through world-writable permissions. Back up/cache models separately from
clients' downloaded project files.

`docker compose down` preserves the named model cache; adding `-v` deletes it.

## Exact configuration

| Variable | Default | Accepted values / meaning |
| --- | --- | --- |
| PAVING_ALLOWED_ORIGINS | Existing local defaults; Compose explicitly uses localhost:3000 | Comma-separated exact http(s) origins, no trailing slash or wildcard |
| PAVING_ALLOWED_HOSTS | Unset for direct-run compatibility; explicit local list in Compose | Hostnames/IPs without schemes, paths or ports; include the hostname forwarded by your proxy |
| PAVING_MAX_PENDING | 4 | 1–16 outstanding queued/running job slots |
| PAVING_MAX_RESULTS | 8 | 1–32 retained terminal results |
| PAVING_RESULT_TTL_SECONDS | 900 | 60–3600 seconds; process restart also clears results |
| PAVING_MAX_CLIENTS | 128 | 1–4096 tracked generation/ownership clients |
| PAVING_ENABLE_LEGACY_API | 1 direct; 0 in container | 0 disables /api/segment and /api/camera; normal /api/paving jobs still work |
| PAVING_ENABLE_BACKGROUND_JOBS | 0 | Keep 0 for request-based billing; 1 re-enables the old asynchronous POST /api/paving/jobs and requires instance-based billing |
| PAVING_HOST / PAVING_PORT | 127.0.0.1 / 8000 direct | Listening address/port; container sets 0.0.0.0 internally |

Invalid limits/host configuration fail startup. Health exposes these non-secret
limits. Configure **one Uvicorn worker and one service instance**: the job cache,
latest-generation checks and model lock are process-local. Multi-instance
production scaling requires a shared job broker/session routing design; adding
workers is not a safe substitute.

## Hosted frontend

### Cloud Run with request-based billing

The new `POST /api/paving/analyze` keeps its HTTP response open until both models
have finished. Inference does not depend on work continuing after a 202 response.
The frontend consumes this response directly; no polling is needed. Health must
show `analysis_api_version: 1`, `deployment.request_bound_analysis: true` and
`deployment.background_jobs: false`.

Rebuild the backend image: changing billing on the existing `cpu-test` image alone
does not update the Python code. From the newly uploaded segmentation-service
directory in Cloud Shell:

```sh
gcloud config set project configurator-360
gcloud builds submit --tag europe-central2-docker.pkg.dev/configurator-360/configurators/tiles-analysis:request-analysis --timeout=30m
gcloud run deploy tiles-analysis-test \
  --project=configurator-360 --region=europe-central2 \
  --image=europe-central2-docker.pkg.dev/configurator-360/configurators/tiles-analysis:request-analysis \
  --port=8000 --cpu-throttling --min=0 --max=1 --timeout=360 \
  --update-env-vars=PAVING_ENABLE_BACKGROUND_JOBS=0
```

This preserves the service's existing CPU, memory, allowed origins and access
policy. In the console the equivalent billing choice is **Request-based**, with
minimum instances **0**, maximum **1**, and timeout **360 seconds**. Keep the
default startup probe; do not add a periodic uptime checker that wakes an idle
service unless needed. Request processing, startup and shutdown are still billed;
container image storage, logs and network charges can also remain.

Publish the matching tiles frontend after deploying the backend. Existing tabs
need a reload. Set `SEGMENTATION_CONFIG.apiBase` to
`https://tiles-analysis-test-719238533149.europe-central2.run.app/api/paving` for a
direct cloud connection; an empty value intentionally retains the local/same-origin
proxy behavior. Do not overwrite a local-development choice when preparing a
different release. Keep the exact live origin, such as
`https://www.360configurator.com`, in `PAVING_ALLOWED_ORIGINS`.

The browser's total analysis deadline is five minutes. Cloud Run and any reverse
proxy must allow longer (360 seconds here), including cold model loading and the
bounded queue. Cancellation invalidates the result and skips the next stage, but
cannot interrupt a running PyTorch call; the handler waits for that call to drain.
Forced process termination, a network disconnect or a platform timeout cannot
guarantee completion. Do not add automatic retries that rerun a costly analysis
without the user's knowledge.

For acceptance, use a real yard photo on the deployed service after it scales to
zero, then repeat while warm. Confirm DevTools shows one completed 200
`POST /api/paving/analyze`, no POST /jobs or polling, both model results, and timing
metadata. Also test Stop analysis, choosing another photo, and manual edits during
the request. The deterministic tests use synthetic models and cannot measure
real Cloud Run latency or CPU-throttling behavior.

References: https://docs.cloud.google.com/run/docs/configuring/billing-settings
and https://docs.cloud.google.com/run/docs/configuring/request-timeout

Keep `../js/segmentationConfig.js` apiBase empty to use the HTTPS site's
`/api/paving` reverse proxy. Or set an explicit HTTPS analysis prefix and allow
that frontend origin. Browsers on HTTPS must not call an HTTP analysis URL.
Account/API secrets do not belong in public JavaScript.

Nginx examples are split by include context: `deploy/nginx-http.conf.example`
goes inside `http {}`, `deploy/nginx-server.conf.example` inside the existing HTTPS
`server {}`. Preserve the API prefix and forward the original hostname. With the
container Host allowlist, add the public hostname or requests will be rejected.
For a proxy in a different container, change its upstream to paving-analysis:8000
and configure trusted proxy forwarding for that specific network/address. Do not
trust forwarded headers from arbitrary public clients.

The examples set body limits, request limits and no-cache proxying. **They are not
an authentication system.** X-Paving-Client protects job ownership from accidental
cross-tab access; it is not a login credential. CORS/Host validation likewise do
not stop arbitrary non-browser clients. Before exposing a public inference
service, use the site's authenticated gateway and per-account quotas (or an
explicit controlled public-access policy with abuse/billing limits). Apply the
policy to submission, result reads, cancellation and health consistently. TLS
certificates, real domain names and account-provider integration are deployment
operator inputs, not generated credentials in this patch.

The examples do not modify Firebase, provision cloud resources or migrate any
existing database. Browser photo storage stays on the frontend's origin and
full-photo cross-device exchange uses the explicit project file.

## Release acceptance

1. Run JS/Python and native IndexedDB tests in `../tests/PROJECT_ACCEPTANCE.md`.
2. Build/check Compose and validate your merged Nginx config with `nginx -t`.
3. Prefetch then submit a real representative yard photo with the full-site
   runner's --live-photo option. Test both cold and warm inference.
4. Confirm old/new-photo races, deliberate holes, free-camera switching, missing
   cache recovery and separate-device full-file opening. Check gateway rejects
   unauthenticated requests according to your policy.

Official references for the template choices:
https://docs.docker.com/compose/how-tos/gpu-support/
https://pytorch.org/get-started/previous-versions/
https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
