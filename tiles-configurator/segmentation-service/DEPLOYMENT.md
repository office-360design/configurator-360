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
| PAVING_HOST / PAVING_PORT | 127.0.0.1 / 8000 direct | Listening address/port; container sets 0.0.0.0 internally |

Invalid limits/host configuration fail startup. Health exposes these non-secret
limits. Configure **one Uvicorn worker and one service instance**: the job cache,
latest-generation checks and model lock are process-local. Multi-instance
production scaling requires a shared job broker/session routing design; adding
workers is not a safe substitute.

## Hosted frontend

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
