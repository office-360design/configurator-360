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

## Deployment

Apply the update at the repository root and push using the normal deployment process. **Both the website deployment and `Deploy Firebase share backend` must succeed** before testing QR sharing.

The updated Firebase workflow:

1. Uses the existing Workload Identity Federation authentication; no interactive login or new client-side secret.
2. Runs source, policy and backend tests; validates all three new function exports.
3. Runs `firebase-share-backend/scripts/provision-hall-ar-storage.sh` to create/configure the dedicated bucket, register it with Firebase and enable the Storage/Scheduler APIs.
4. Deploys Storage rules only to the `hall-ar` target.
5. Deploys the three AR functions along with the existing explicit function allow-list.
6. Deploys existing Firestore rules/indexes with the two new TTL overrides.

The first deployment principal (`GCP_SERVICE_ACCOUNT` in the workflow) must be authorized for these additional operations. If provisioning fails, the workflow stops with a diagnostic; do not treat a successful website build alone as AR being ready. Relevant permissions include project lookup and service API enablement, bucket list/create/get/update and bucket IAM policy access, Firebase Storage `firebasestorage.buckets.addFirebase`, and the normal Firebase rules/Functions/Scheduler deploy permissions. The existing runtime account needs its existing Firestore access plus the dedicated-bucket object role provisioned by the script. Grant permissions at the narrowest useful scope through project administration; do not expose service-account keys to the browser.

The script is scoped to `configurator-360`, is rerunnable, and does not make any bucket public. It intentionally does not change broad project IAM bindings or the existing default bucket's lifecycle/rules. Rules and the new target are in `.firebaserc`, `firebase.json` and `hall-ar.storage.rules`.

Phone routes preserve IDs on public country domains:

- COM/tenant hosts: `/hall-configurator/ar.html`
- RO public hosts: `/configurator-hala/ar.html`
- DE public hosts: `/hallen-konfigurator/ar.html`

These use the existing Nginx localized-route mappings and avoid redirects to a configuration index that would lose AR parameters. To test with a real phone, use a deployed HTTPS origin; a localhost QR points to the phone's localhost, not the development computer.

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
