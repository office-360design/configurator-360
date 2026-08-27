# Shared configuration Firebase backend

This backend owns temporary configurator share links stored in `sharedConfigurations`.

## Active storage policy

- Maximum logical share payload storage: **200 MiB**.
- When a new share would cross the limit, the oldest shares are deleted until at least **1 MiB** is freed (or more if required to return below the limit).
- Maximum one share payload: **850,000 UTF-8 bytes**.
- Share lifetime: **90 days**.
- Firestore TTL is enabled on `sharedConfigurations.expiresAt`.
- `sharedConfigurations.s` is not indexed because it is only read by document ID.
- `sharedConfigurations.expiresAt` has TTL enabled and ordinary indexing disabled.

## Lazy App Check / reCAPTCHA Enterprise policy

App Check protects **share creation only**. Opening an existing share by its 16-character bearer ID stays reCAPTCHA-free.

The browser does not initialize reCAPTCHA/App Check on page load. The flow is:

1. The user presses **Share**.
2. The browser calls the public `getShareProtectionStatus` function by raw HTTP. This request does not initialize App Check and does not create an assessment.
3. If the current month is below the safety threshold, the browser lazily initializes App Check and calls `createSharedConfiguration`, which has `enforceAppCheck: true`.
4. App Check token auto-refresh is disabled. A cached token is reused while valid; a new assessment occurs only when a later Share action needs a new token.
5. If the monthly safety threshold is active, the browser uses the existing direct-Firestore share path instead. The Firestore-created trigger still applies the same 200 MiB/90-day policy.

### Monthly assessment safety threshold

- Hard safety threshold: **9,500 assessments per UTC calendar month**.
- Internal warning thresholds: **8,000**, **9,000**, and **9,400**.
- At 9,500 or more, `getShareProtectionStatus` records `legacyFallbackEnabled = true` until the first instant of the next UTC month.
- Firestore rules then temporarily reopen direct share creation even after secure App Check mode has already been activated.
- At the next month boundary, `fallbackUntil` expires automatically. The next Share interaction reads the new month's count and returns to App Check without manual intervention.
- If Cloud Monitoring cannot be read, Share temporarily falls back to the reCAPTCHA-free path for 10 minutes, preserving availability while avoiding unmetered assessments.

Cloud Monitoring metric used:

`recaptchaenterprise.googleapis.com/assessment_count`

The status function caches the metric for 60 seconds. Google's metric itself is sampled every 60 seconds and may appear with additional delay, so the 500-assessment gap between 9,500 and the 10,000 no-cost allowance is intentional safety headroom.

### Internal warning / mode-change logs

Search Cloud Logging for these structured event values:

- `recaptcha-assessment-usage-warning`
- `recaptcha-hard-cap-fallback-activated`
- `recaptcha-protection-auto-restored`
- `recaptcha-monitoring-unavailable-fallback`

The current internal state is also stored in:

`sharedConfigurationSystem/appCheckUsage`

Clients cannot read or write that document. It records the current month, latest assessment count, warning level, emitted warning thresholds, fallback window, and whether secure mode has been activated successfully at least once.

## Rollout and direct-Firestore fallback security

Before the first successful App Check-protected Share, direct Firestore create remains available so deploying the code before the reCAPTCHA site key cannot break Share.

The first successful `createSharedConfiguration` call sets `secureModeActive = true` in the private control document. From then on, Firestore Security Rules reject direct share creation unless the backend has explicitly opened a valid fallback window because the 9,500 threshold was reached or Monitoring temporarily failed.

This means an external client cannot simply bypass App Check by choosing the direct Firestore endpoint after secure mode has been activated.

## reCAPTCHA Enterprise / App Check setup

1. In Google Cloud Console, enable **reCAPTCHA Enterprise API** if required.
2. Create a **Website** score-based key. Do not enable a checkbox challenge.
3. Add every production hostname that serves a configurator.
4. In Firebase Console, open **Security → App Check**, select the second `360configurator` web app (App ID `1:719238533149:web:9e0b8a97375731b8eaf6f4`) and register **reCAPTCHA Enterprise** using that site key.
5. Keep the default **1-hour token TTL** initially and the default/recommended risk threshold unless metrics justify changing it.
6. Put the public site key in `shared-ui/firebase-app-check.json`.
7. Ensure the runtime service account has `roles/monitoring.viewer` and the Cloud Monitoring API is enabled.
8. Deploy and press Share once. Confirm the protected callable succeeds and `sharedConfigurationSystem/appCheckUsage.secureModeActive` becomes `true`.

Do **not** enable project-wide Cloud Firestore App Check enforcement just for this feature, because this Firebase project contains unrelated collections and may have other clients. Per-function `enforceAppCheck: true` protects secure share creation without affecting those applications.

For localhost development, `debugOnLocalhost` uses the Firebase App Check debug provider. Register the printed debug token in Firebase App Check before testing secure Share locally.


## Private saved configurations

The top-bar **Save** action now stores the active configurator state in the signed-in Google user's private Firebase area. These records are persistent account data and are separate from the 90-day public `sharedConfigurations` links.

- Storage path: `users/{uid}/savedConfigurations/{product}/items/{configurationId}`.
- Saved configuration operations require Firebase Authentication and use `request.auth.uid` server-side.
- Browser Firestore access to the saved-configuration path is explicitly denied; only the authenticated callable functions use the Admin SDK.
- The saved-configuration functions intentionally do **not** enforce App Check. Their client calls are made with the Firebase Auth ID token directly so saving/opening account data never causes a reCAPTCHA assessment. reCAPTCHA remains exclusive to **Share**.
- Each product currently lists the user's 100 most recently updated saves for that configurator.
- Maximum serialized state per saved configuration: **850,000 UTF-8 bytes**.

Functions: `saveUserConfiguration`, `listUserConfigurations`, `getUserConfiguration`, and `deleteUserConfiguration`.

## Cross-domain authentication handoff

**Change site domain** keeps the Firebase Authentication state synchronized between the `.com`, `.ro`, `.de`, and active Tier-1 customer sites without placing Google credentials, Firebase ID tokens, refresh tokens, or passwords in the URL.

- A signed-in source site creates a random 256-bit handoff id through `createDomainAuthHandoff`.
- The handoff is bound to the destination origin, expires after 5 minutes, is stored in the server-only `domainAuthHandoffs` collection, and is deleted when redeemed.
- The destination sends that opaque id to `redeemDomainAuthHandoff` over HTTPS and receives a Firebase custom token in the response body. The custom token is immediately exchanged by the Firebase Auth SDK and is never placed in browser history or the URL.
- A guest source carries only a `guest` marker; the destination signs out any pre-existing local Firebase session before initializing the guest configuration.
- Browser Firestore access to `domainAuthHandoffs` is explicitly denied.
- Active `*.360configurator.com` tenant origins are validated server-side against the private `tenants/{slug}` record before they can create or redeem a handoff; arbitrary wildcard hostnames are not trusted just because DNS resolves.

The runtime service account needs `roles/iam.serviceAccountTokenCreator` on itself so Firebase Admin can sign the short-lived custom token. The IAM bootstrap script enables the IAM Service Account Credentials API and grants this binding.

## Deployment

`.github/workflows/deploy-firebase-share.yml` deploys automatically when `firebase-share-backend/**` changes on `main` and can also be run manually.

The one-time IAM helper is `iam/setup-github-deployer.sh`. It grants `roles/monitoring.viewer` and the self-scoped `roles/iam.serviceAccountTokenCreator` binding required by the domain-authentication handoff.

## Tier-1 tenant provisioning

`provisionTenant` is the internal backend for **Go Live Now** customer creation. Before creating Firestore records, it automatically adds `<slug>.360configurator.com` to Firebase Authentication's project-level `authorizedDomains` list so Google popup login works directly on the new customer hostname. It then creates the private `tenants/{slug}` and public `tenantPublic/{slug}` records in one Firestore transaction. If either document already exists, the operation fails with `already-exists`.

Provisioning is deliberately serialized (`concurrency: 1`, `maxInstances: 1`) because `authorizedDomains` is a project-level read/modify/write list. This prevents simultaneous customer creation requests from overwriting one another's authentication-domain updates.

Provisioning requires all of the following:

- Firebase Authentication with a verified Google account.
- The caller UID must have an active private allowlist record at `tenantProvisioningAdmins/{uid}`.
- The request must originate from `https://www.360configurator.com` (localhost is accepted for development).
- The slug must be a non-reserved single DNS label using lowercase letters, numbers, and hyphens.
- At least one of `window`, `pergola`, `roof`, `solar`, `hall`, or `fence` must be enabled.
- Optional logos are optimized by the internal admin page and limited server-side to 200 KB PNG/JPEG/WebP data URLs. SVG is intentionally not accepted.

The browser cannot read or write `tenantProvisioningAdmins` or private `tenants` documents. `provisionTenant` uses the Admin SDK and records the provisioning UID/email in the private tenant document.

### Internal admin page

After the Cloud Run/static site deployment, open:

`https://www.360configurator.com/internal/tenant-provisioning/`

The page is intentionally not linked from the public website. Sign in with Google; the page displays the Firebase UID of the signed-in account.

### One-time provisioning-admin authorization

Creating customers is intentionally disabled for every account until its Firebase UID is added to the private allowlist. After signing in on the internal page, copy the displayed UID and run this once from an authorized Google Cloud Shell account:

```bash
ACCESS_TOKEN="$(gcloud auth print-access-token)"
UID="PASTE_FIREBASE_UID_HERE"
EMAIL="admin@example.com"

curl -sS -X PATCH \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: configurator-360" \
  -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/configurator-360/databases/(default)/documents/tenantProvisioningAdmins/${UID}" \
  -d "{\
    \"fields\": {\
      \"active\": {\"booleanValue\": true},\
      \"email\": {\"stringValue\": \"${EMAIL}\"}\
    }\
  }" | jq .
```

The optional `email` field binds the UID to the expected verified Firebase email as an additional safeguard. Set `active` to `false` to revoke provisioning access without deleting the document.

The repository also includes a helper for the same one-time operation:

```bash
bash firebase-share-backend/iam/authorize-tenant-provisioning-admin.sh \
  FIREBASE_UID \
  verified-admin@example.com
```

Append `disable` as the third argument to revoke that UID later.

This is a one-time administrative setup, not a per-customer deployment step. Normal Tier-1 customers are subsequently created entirely through the provisioning page.

### One-time Firebase Auth domain IAM setup

Automatic customer-domain authorization requires the runtime service account to read and update only the Firebase Authentication project configuration. Run this once from an authorized Cloud Shell/repository checkout:

```bash
bash firebase-share-backend/iam/setup-tenant-auth-domain-manager.sh
```

The helper enables `identitytoolkit.googleapis.com`, creates/updates the project custom role `tenantAuthDomainManager` with only `firebaseauth.configs.get` and `firebaseauth.configs.update`, and grants that custom role to `configurator-runtime@configurator-360.iam.gserviceaccount.com`. It does not grant user-management permissions.

This is infrastructure bootstrap only. Future tenants created through the internal provisioning UI are added to Firebase Auth automatically.

### Existing Tier-1 tenants created before automatic Auth registration

A tenant that already exists in Firestore (for example the initial `tier1-test`) predates the automatic Auth-domain step. Authorize it once with:

```bash
bash firebase-share-backend/iam/authorize-existing-tenant-auth-domain.sh tier1-test
```

The helper verifies that the private tenant exists, is active, and owns exactly `tier1-test.360configurator.com` before changing Firebase Authentication. It is a migration/repair helper, not part of normal customer provisioning.

### Tenant authentication behavior

After provisioning:

- Google `signInWithPopup` continues to use the existing Firebase Web App and `configurator-360.firebaseapp.com` auth helper, but Firebase recognizes the customer hostname as an authorized application domain.
- Saved-configuration callable functions work with the resulting Firebase ID token exactly as they do on the standard 360Configurator domains.
- Cross-domain authentication handoffs accept an active customer hostname only after validating it against the private tenant record.
- Disabling/removing a tenant does not currently remove its hostname from Firebase Auth automatically; that cleanup should be paired with the future tenant lifecycle/deprovisioning flow.
