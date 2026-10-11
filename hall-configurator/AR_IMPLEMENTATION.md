# Hall AR — Android/iOS QR sharing (`hall-ar-1`)

## User workflow

The top-bar AR cube is enabled only for `productId: hall` with `capabilities.viewAR: true`. A shared policy checks both rendering and click handling; other configurators remain unavailable, including the legacy Supabase window-AR path. Existing hidden buttons remain hidden. No Supabase API or credential is used by Hall AR.

Opening Hall AR captures the current configuration and defaults to **Android**. The dialog exports and publishes that snapshot, then shows a QR only after the publish endpoint and asset HEAD request succeed. Switching to **iOS / iPadOS** publishes a USDZ for that same snapshot. The last four successful snapshot/format combinations are reused in memory while valid; closing and reopening captures any changes to the hall. A change of platform, close, or rapid reopen cannot overwrite the current QR with a stale asynchronous result.

The QR opens a localized, standalone phone landing page. The user taps **Open AR** to launch the native viewer. This intentional tap handles browser user-activation restrictions; scanning is not claimed to force-launch a camera view in every QR reader.

- **Android:** self-contained GLB, Google Scene Viewer with `ar_preferred`. Use Chrome on an ARCore-compatible phone with an up-to-date Google app and Google Play Services for AR. Unsupported devices may fall back to native 3D; missing viewer support returns to an explanatory page.
- **iOS/iPadOS:** self-contained USDZ, Safari's `rel="ar"` Quick Look handoff. The anchor has exactly one image child as required by Quick Look; its localized label is provided with CSS and an accessible label. Open the link in Safari rather than assuming all in-app QR browsers support AR.

The browser does not request a user's camera or upload camera footage. Camera access and ground placement occur in the native viewer. Models use **metres** and retain real dimensions. A hall can be very large; the viewers permit resizing for a tabletop presentation. This is not surveying, safety clearance assessment, or precision site positioning. Lighting/glass may differ from the configurator because the native renderer uses its own environment.

## Model preparation

`js/ar/exportHall.js` builds an independent model from the captured state and leaves the live configuration unchanged. It exports configured openings, current door poses, structural geometry, and configured physical fittings/equipment. It restores the assembled cladding, rather than exporting exploded/section-cut inspection states. Scenery, dimensions, selection handles, underground pad/pedestal foundations and planning overlays are excluded. Visible geometry is flattened and batched by PBR material; mirrored transforms and thin double-sided surfaces are handled explicitly. UV transforms are baked into geometry, texture dimensions are capped at 1024, and the model's bottom is anchored at ground level.

Production exporters are lazy imports from the project's existing Three.js **r169** import map. No exporter network request occurs before using AR. QR generation is local code (`vendor/qr.js` and its license); it does not send configuration URLs to an external QR service.

Publication limits are **10 MiB for GLB**, **24 MiB for USDZ**, and **300,000 exported triangles**. Exports outside the limits or with invalid openings/dimensions are rejected with a localized message, not a broken QR. Models are capability links: anyone who receives a QR/link can view/download that snapshot for its lifetime. No account is required on the phone.

## Firebase architecture and retention

The existing Firebase project is `configurator-360`; all new resources use that project.

| Resource | Purpose |
| --- | --- |
| `publishHallAR` (europe-west1) | Validate a binary upload, charge count/byte budgets, save the private model and its manifest, return an opaque random session ID. |
| `getHallAR` (europe-west1) | Return session metadata or serve the model without login, after checking session ID, format, expected object path and expiry. |
| `cleanupHallAR` | Hourly removal of expired model objects followed by their manifests. |
| `gs://configurator-360-hall-ar` | Dedicated private Firebase Storage bucket for temporary AR model objects, under `hall-ar/v1/`. |
| `hallARSessions` | Firestore manifest with format, byte count, hash, object path and timestamps. |
| `hallARRateLimits` | Temporary hashed network/hour and global/day publication budgets. |

The bucket is registered with Firebase Storage. Its rules explicitly deny direct client reads/writes; uniform bucket access and public-access prevention are enabled. The existing runtime service account receives object access **only on this dedicated bucket**. The public Functions endpoint authorizes model reads using 192-bit random IDs and 24-hour expiry, rather than a public bucket or permanent Firebase download tokens. Model links do not contain service credentials.

Asset responses support GET, HEAD and single byte ranges, with appropriate `model/gltf-binary` / `model/vnd.usdz+zip` MIME types. USDZ responses are buffered within the 24 MiB cap to stay within the second-generation Functions non-streaming response limit; they are not streamed beyond the smaller streaming limit. Backend validation requires embedded GLB resources and aligned, uncompressed USDZ archives without external references.

The URL lifetime is **24 hours**. Hourly cleanup removes expired objects; a dedicated two-day bucket lifecycle is an orphan-cleanup backstop. Soft deletion is disabled only for this temporary bucket. Firestore `purgeAt` TTLs are set to three days to allow file cleanup before manifests disappear. Expiry cannot revoke a file already downloaded to someone's phone.

Publication is restricted by Origin to the existing public country sites, localhost development, or active Hall-enabled tenant hosts. Origin is not authentication. Server-side budgets additionally limit attempts to 12 and 160 MiB per network/hour, and 300 and 1 GiB globally/day. Failed/invalid attempts count. Network identifiers are daily hashed; shared proxies can share a budget. Native model reads must remain usable without cookies or login. **These limits are not a hard bandwidth/cost ceiling:** configure project budgets/alerts and review metrics before opening AR to heavy public traffic. Functions use bounded concurrency/instance counts, but repeated reads still cost resources.

No existing default storage bucket, bookshelf recipient, email workflow or template definition is changed.

## Deployment (administrator setup separated from CI)

The original `hall-ar-1` workflow ran API enablement, bucket creation, bucket IAM
updates and Firebase registration on every deployment. An authenticated
`github-deployer` without `serviceusage.services.enable` therefore failed before
any AR function was deployed. A successful Cloud Run website deployment does not
mean the Firebase backend has been deployed.

The revised workflow does **not** attempt administrative provisioning. It invokes:

```bash
bash firebase-share-backend/scripts/provision-hall-ar-storage.sh --check
```

No argument also means `--check`. The check makes read-only API calls and fails
with a specific diagnostic if setup is missing or access is denied. It never
silently skips an error or interprets a 403 as a nonexistent bucket.

### 1. Run one-time setup as a project administrator

Use Google Cloud Shell signed in as the project owner or an administrator with the
required delegated permissions, **not** the GitHub deployment service account.
The shell script is self-contained: it can be uploaded to your Cloud Shell home
directory without cloning the repository or installing Firebase CLI. It requires
`gcloud`, `curl` and `python3`.

For a standalone upload of the **updated** script:

```bash
gcloud config set project configurator-360
gcloud auth list --filter=status:ACTIVE --format='value(account)'
# Confirm the active identity is your administrator account.
bash ~/provision-hall-ar-storage.sh --setup
```

Or, from an updated repository checkout in Cloud Shell:

```bash
bash firebase-share-backend/scripts/provision-hall-ar-storage.sh --setup
```

`--setup` is explicitly blocked inside GitHub Actions. Do not add it to the
workflow or upload a service-account key. The project is fixed to
`configurator-360` / `719238533149`; the only bucket it changes is
`configurator-360-hall-ar` in `europe-west1`.

Setup enables only missing APIs: `storage.googleapis.com`,
`firebasestorage.googleapis.com`, and `cloudscheduler.googleapis.com`. It creates
or configures the dedicated private bucket, adds its two-day `hall-ar/` lifecycle,
disables soft deletion for those temporary assets, grants runtime object access,
and registers the bucket with Firebase. It does not delete existing objects or
modify the default application bucket. Unexpected project ownership, location,
retention, versioning, or public IAM bindings stop the script for manual review.

The administrator needs service enablement; project lookup; bucket creation,
get/update and get/set IAM; Firebase bucket get/addFirebase; project custom-role
list/get/create; project IAM binding changes; and get/set IAM on the named service
accounts. Owner or equivalent delegated permissions can perform these operations,
subject to organization policies. The script cannot elevate its caller's own
permissions. Do not grant Owner/Editor to `github-deployer` to work around an error.

### Deployment/runtime access added by setup

| Identity | Access added | Scope |
| --- | --- | --- |
| `github-deployer@configurator-360.iam.gserviceaccount.com` | Custom `hallArBucketInspector`: `storage.buckets.get`, `storage.buckets.getIamPolicy` only | Dedicated AR bucket only; no model-object access or bucket writes |
| Same deployer | Custom `hallArDeploymentPrerequisites`: project lookup, Service Usage read/use, Firebase Storage read, Scheduler job create/get/list/update/delete/fullView and location reads | Project scope; job creation cannot be granted only on a job that does not exist yet. These job-management permissions can affect other project jobs; no job run/pause or API enable permissions are added. |
| Same deployer | `roles/iam.serviceAccountUser` | On the existing `configurator-runtime` and default Compute service accounts individually, not project-wide |
| `configurator-runtime@configurator-360.iam.gserviceaccount.com` | `roles/storage.objectAdmin` | Dedicated AR bucket only, as required by the original publication/download/cleanup code |

The default Compute identity is
`719238533149-compute@developer.gserviceaccount.com`. Firebase's scheduled-function
handoff uses that identity for the Scheduler invocation; the function's execution
identity remains `configurator-runtime`. Allowing act-as permits deployment under
those identities; it is not a service-account key or a global act-as grant.

The two custom roles deliberately exclude `serviceusage.services.enable`, bucket
creation, bucket update, bucket IAM changes and model-object access. Existing
Firebase Functions, Firestore index/rules and Cloud Run deployment roles are
retained and still required. Pre-existing broad grants are not automatically
revoked by this fix. An existing custom role with the same name but unexpected
permissions/status is not overwritten.

Setup is rerunnable: existing resources and roles are checked before creation.
The same bucket settings/IAM bindings can safely be applied again after a partial
setup failure. API enablement, custom-role creation and Firebase registration
are not repeated when already present.

### 2. Deploy the updated revision, not the old failed run

Apply the update ZIP at the repository root and push with the normal update
script. It includes `commit_message.md` and no enclosing folder. Let the new
**Deploy Firebase share backend** run finish, or start **Run workflow** on the
updated `main` branch. Re-running the previous failed job uses its old commit and
old setup script.

After the tests, the new workflow:

1. Verifies API enablement, project ownership, Firebase registration, private
   bucket settings, orphan lifecycle and the explicit runtime bucket binding.
2. Deploys the deny-client-access Storage rules to `storage:hall-ar` only.
3. Deploys `publishHallAR`, `getHallAR`, `cleanupHallAR` alongside the preserved
   existing function allow-list.
4. Deploys the existing Firestore rules/indexes and AR TTL overrides.

IAM changes may need several minutes to propagate. A just-granted permission can
still produce a temporary 403; wait and retry the **new revision**. If it persists,
review the specific permission/operation in the log. A successful check validates
infrastructure metadata and the expected explicit bucket binding; it is not a
live end-to-end AR test or a guarantee against organization-level deny policies.

### Useful diagnostics

```bash
# Read-only infrastructure verification from an updated checkout:
bash firebase-share-backend/scripts/provision-hall-ar-storage.sh --check

# After a successful backend deploy, inspect the scheduled cleanup job:
gcloud scheduler jobs describe firebase-schedule-cleanupHallAR-europe-west1 \
  --project=configurator-360 --location=europe-west1
```

Do not manually recreate the scheduled job or expose its private function to
`allUsers`. Firebase deploys the schedule with the function. A scheduler permission
error after preflight is different from the original Service Usage denial and
should be reviewed from that new log.

Phone routes preserve IDs on public country domains:

- COM/tenant hosts: `/hall-configurator/ar.html`
- RO public hosts: `/configurator-hala/ar.html`
- DE public hosts: `/hallen-konfigurator/ar.html`

These use the existing localized-route mappings. Use a deployed HTTPS origin for
phone tests; a localhost QR points to the phone, not the development computer.

### Infrastructure regression tests

```bash
bash -n firebase-share-backend/scripts/provision-hall-ar-storage.sh
python3 firebase-share-backend/scripts/tests/test_hall_ar_provisioning.py
```

The tests execute the actual Bash script with mocked `gcloud`/`curl` commands.
They cover read-only defaults, missing APIs/resources, 403 handling, private
bucket constraints, project/identity guards, explicit setup, limited grants,
reruns, role-conflict handling and preserved deployment targets. They do not
contact Google Cloud or modify live IAM.

Official references for the deployment changes:

- [Service Usage enable/disable permissions](https://docs.cloud.google.com/service-usage/docs/enable-disable)
- [Firebase bucket registration](https://firebase.google.com/docs/reference/rest/storage/rest/v1beta/projects.buckets/addFirebase)
- [Storage IAM roles and scope](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)
- [Custom IAM roles](https://docs.cloud.google.com/iam/docs/creating-custom-roles)
- [Firebase scheduled functions](https://firebase.google.com/docs/functions/schedule-functions)
- [Scheduler HTTP service-account authentication](https://docs.cloud.google.com/scheduler/docs/http-target-auth)
- [IAM propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [GitHub workflow rerun revision](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

## Validation performed before delivery

Run the included automated tests from the repository root:

```sh
node --test firebase-share-backend/functions/tests/hall-ar.test.cjs hall-configurator/tests/ar-policy.test.mjs
bash -n firebase-share-backend/scripts/provision-hall-ar-storage.sh
```

Twelve test groups passed for policy, localization, local QR generation, native links, public country routes, the Quick Look anchor contract, file validation, private storage/manifest handling, upload failures, quotas, MIME, GET/HEAD/ranges, expiry, and cleanup. Backend Storage/Firestore/Functions were **mocked**; this was not a live cloud deployment.

Additional offline Chromium tests executed the real dialog and landing-page logic with mocked Firebase responses: Android default, switching both ways, reusing an existing snapshot, new snapshots, retry/error feedback, rapid platform changes, close/immediate reopen, 390 px layout, Android/iOS links and expired sessions. The resulting QR was decoded and matched its exact landing-page URL.

Actual GLB exports of all four templates were generated in a local browser using the repository's bundled **r160 test runtime/exporter** and passed the new backend asset validator:

| Template | GLB bytes | Triangles | Batched meshes |
| --- | ---: | ---: | ---: |
| Agricultural | 1,355,424 | 23,292 | 18 |
| Commercial | 1,275,348 | 22,226 | 26 |
| Storage | 2,292,604 | 42,284 | 27 |
| Production | 2,065,268 | 35,100 | 34 |

The deployed import map remains r169. The USDZ exporter interface was checked against official r169 source, and aligned USDZ validation/HTTP handling were tested using fixtures. **A full r169 USDZ export, actual native Android/iOS placement and the live Firebase deployment were not tested in this environment.** Those checks remain required; successful offline tests do not establish device-level AR support.

### Physical-device acceptance checklist

After both deployments finish, open Hall AR and confirm Android is selected, a QR appears after upload, and scanning it in Chrome on a compatible Android phone opens the correct hall through Open AR. Check scale/ground alignment and a visible customized door/roof change. Switch the desktop dialog to iOS and scan the new QR on an iPhone/iPad in Safari; confirm Quick Look opens and its AR mode places the same hall. Repeat with the four templates, different colours, open gates, and a larger custom hall. Verify another configurator's AR button remains disabled. Test an expired link and ensure generating a fresh QR recovers. Repeat on the public RO/DE hosts and an active Hall-enabled tenant if those are in use.

## Troubleshooting

- **Preparation/service unavailable:** confirm all three functions are in the successful Firebase deployment, the dedicated bucket exists, and the runtime account has access. Check the function logs; inspect failed upload/HEAD responses rather than retrying the website build alone.
- **Quota reached:** wait for the server budget window; repeatedly changing modes also creates uploads for uncached formats.
- **Model too large:** reduce optional equipment/size or complexity; the code does not silently discard the building to get below the limit.
- **Expired/not found:** generate a fresh QR from the current configuration.
- **Native viewer does not open:** open the landing page in the supported browser, check Android services/device compatibility or iOS Quick Look, and tap Open AR. An in-app browser may not support native AR handoff.
- **No camera on desktop:** the modal is a transfer UI; desktop webcam AR is not implemented.

## Primary implementation references

- Google Scene Viewer: https://developers.google.com/ar/develop/scene-viewer
- WebKit AR Quick Look link/MIME contract: https://webkit.org/blog/8421/viewing-augmented-reality-assets-in-safari-for-ios/
- Three.js r169 USDZ exporter: https://github.com/mrdoob/three.js/blob/r169/examples/jsm/exporters/USDZExporter.js
- Firebase Functions limits: https://firebase.google.com/docs/functions/quotas
- Firebase deploy targets: https://firebase.google.com/docs/cli/targets
- Firebase additional-bucket registration: https://firebase.google.com/docs/reference/rest/storage/rest/v1beta/projects.buckets/addFirebase


## Window rollout extension (`firebase-ar-2`)

Hall and Window now share the Firebase QR dialog, phone-page implementation and
publication transport in `shared-ui/src/ar/`. Hall geometry export is unchanged.
The existing AR bucket, functions, object prefix and scheduled cleanup serve both
allow-listed products. Hall URLs and existing records remain compatible.
Other configurators remain disabled by the shared AR policy.

After applying the Window update, deploy the website and Firebase backend from
the new commit. A successful previous Hall administrator setup is reused; no
additional bucket, setup script or IAM grant is required. See
`window-configurator/AR_IMPLEMENTATION.md` for Window-specific export details
and the phone-testing checklist.
