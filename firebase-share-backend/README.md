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

App Check protects **share creation** and the public marketing-site contact submission. Opening an existing share by its 16-character bearer ID and using private saved configurations remain reCAPTCHA-free.

The browser does not initialize reCAPTCHA/App Check on page load. The flow is:

1. The user presses **Share**.
2. The browser calls the public `getShareProtectionStatus` function by raw HTTP. This request does not initialize App Check and does not create an assessment.
3. If the current month is below the safety threshold, the browser lazily initializes App Check and calls `createSharedConfiguration`, which has `enforceAppCheck: true`.
4. App Check token auto-refresh is disabled. A cached token is reused while valid; a new assessment occurs only when a protected action needs a new token.
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

The status function caches the metric for 60 seconds. Google's metric itself is sampled every 60 seconds and may appear with additional delay, so the 500-assessment gap between 9,500 and the 10,000 no-cost allowance is intentional safety headroom. Contact-form App Check assessments contribute to the same project-level metric, although the automatic reCAPTCHA-free fallback remains specific to Share.

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

For localhost development, the browser uses the Firebase App Check debug provider. Register the printed debug token in Firebase App Check before testing protected Share or contact submissions locally.

## Marketing website contact form

`submitContact` replaces the old `mailto:` flow with a server-side email submission.

- Delivery: **Google Workspace Gmail API**. No third-party transactional-email provider or API key is required.
- The function uses the attached `configurator-runtime` service account only to sign a short-lived delegated JWT for a dedicated `configurator-mailer` service account. No service-account JSON key is stored.
- Workspace identity: `office@360design.ro`.
- Preferred sender: `360Configurator Website <office@360configurator.com>`. If that Workspace alias is not enabled as a Gmail send-as address yet, the function retries once from `office@360design.ro` so an enquiry is not lost.
- Romanian enquiries are sent to `office@360configurator.ro`.
- English and German enquiries are sent to `office@360configurator.com`.
- `Reply-To` is set to the visitor's validated email address.
- Required fields: name, email, company, message, language and source page.
- Optional fields: phone and configurator interest.
- The function validates the browser origin and requires Firebase App Check.
- Spam protection combines App Check, a hidden honeypot and a Firestore-backed hashed-IP rate limit of five accepted attempts per 10-minute window. Further attempts are blocked for 30 minutes.
- Rate-limit records contain no raw IP address and expire through Firestore TTL after 24 hours.
- Structured logs contain Gmail API status, language, destination/sender domain and source hostname, but never the full contact message, name, email, phone or company.
- The website emits GA4 `generate_lead` only after Gmail accepts the message, and the event contains no form content or personal information.

### One-time Google Cloud / Workspace setup

The implementation intentionally avoids service-account key files. It uses Google IAM Credentials `signJwt` plus Google Workspace domain-wide delegation with the single OAuth scope `gmail.send`.

1. Enable the APIs in project `configurator-360`:

   ```bash
   gcloud services enable \
     gmail.googleapis.com \
     iamcredentials.googleapis.com \
     --project=configurator-360
   ```

2. Create a dedicated service account for Workspace delegation. It does not need project-level application roles:

   ```bash
   gcloud iam service-accounts create configurator-mailer \
     --project=configurator-360 \
     --display-name="360Configurator contact mailer" \
     --description="Dedicated Google Workspace delegated identity for contact-form email"
   ```

3. Allow the existing Firebase runtime service account to sign short-lived JWTs as the mailer identity:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     configurator-mailer@configurator-360.iam.gserviceaccount.com \
     --project=configurator-360 \
     --member="serviceAccount:configurator-runtime@configurator-360.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

4. Get the mailer service account OAuth client ID:

   ```bash
   gcloud iam service-accounts describe \
     configurator-mailer@configurator-360.iam.gserviceaccount.com \
     --project=configurator-360 \
     --format="value(oauth2ClientId)"
   ```

5. Sign in to **Google Admin Console as a super administrator**, then open:

   `Security → Access and data control → API controls → Manage Domain Wide Delegation`

   Add a new client with:

   - Client ID: the numeric value from step 4.
   - OAuth scope: `https://www.googleapis.com/auth/gmail.send`

   Do not add broader Gmail or Admin SDK scopes. The code impersonates only `office@360design.ro`, although Workspace domain-wide delegation itself is organization-wide for the authorized scope.

6. Sign in to Gmail as `office@360design.ro` and check **Settings → Accounts → Send mail as**. If `office@360configurator.com` is available, keep/enable it. The function can fall back to the primary `office@360design.ro` sender if the alias is not ready.

7. In the reCAPTCHA Enterprise key used by Firebase App Check, ensure these marketing-site hostnames are allowed: `360configurator.com`, `www.360configurator.com`, `360configurator.ro`, `www.360configurator.ro`, `360konfigurator.de`, `www.360konfigurator.de`, and `aks.360configurator.com`.

8. Deploy the backend. No Firebase secret is required:

   ```bash
   cd firebase-share-backend
   npx --yes firebase-tools@latest deploy \
     --project configurator-360 \
     --only functions:submitContact,firestore:indexes
   ```

9. Submit one test enquiry in Romanian, English and German. Confirm the destination mailbox, Reply-To header, sender address and the `contact-email-accepted` structured log entry.

### SPF, DKIM and DMARC

Because Google Workspace is now the sending system, the sending-domain DNS must authorize Google rather than Resend. Before changing SPF, inspect the existing TXT record and merge Google into the single SPF record instead of publishing a second SPF record. For a Google-only sender this commonly means including `_spf.google.com`.

In Google Admin Console, configure DKIM for `360configurator.com` under Gmail email authentication, publish the generated TXT record in the DNS zone, then start authentication. Publish/verify a DMARC record for `_dmarc.360configurator.com` as well. If `360configurator.ro` will also be used as a sender in the future, configure SPF/DKIM/DMARC for that domain too.


## Private saved configurations

The top-bar **Save** action now stores the active configurator state in the signed-in Google user's private Firebase area. These records are persistent account data and are separate from the 90-day public `sharedConfigurations` links.

- Storage path: `users/{uid}/savedConfigurations/{product}/items/{configurationId}`.
- Saved configuration operations require Firebase Authentication and use `request.auth.uid` server-side.
- Browser Firestore access to the saved-configuration path is explicitly denied; only the authenticated callable functions use the Admin SDK.
- The saved-configuration functions intentionally do **not** enforce App Check. Their client calls are made with the Firebase Auth ID token directly so saving/opening account data never causes a reCAPTCHA assessment. App Check remains limited to public abuse-sensitive flows such as Share and contact submission.
- Each product currently lists the user's 100 most recently updated saves for that configurator.
- Maximum serialized state per saved configuration: **850,000 UTF-8 bytes**.

Functions: `saveUserConfiguration`, `listUserConfigurations`, `getUserConfiguration`, and `deleteUserConfiguration`.

## Cross-domain authentication handoff

**Change site domain** keeps the Firebase Authentication state synchronized between the `.com`, `.ro`, and `.de` sites without placing Google credentials, Firebase ID tokens, refresh tokens, or passwords in the URL.

- A signed-in source site creates a random 256-bit handoff id through `createDomainAuthHandoff`.
- The handoff is bound to the destination origin, expires after 5 minutes, is stored in the server-only `domainAuthHandoffs` collection, and is deleted when redeemed.
- The destination sends that opaque id to `redeemDomainAuthHandoff` over HTTPS and receives a Firebase custom token in the response body. The custom token is immediately exchanged by the Firebase Auth SDK and is never placed in browser history or the URL.
- A guest source carries only a `guest` marker; the destination signs out any pre-existing local Firebase session before initializing the guest configuration.
- Browser Firestore access to `domainAuthHandoffs` is explicitly denied.

The runtime service account needs `roles/iam.serviceAccountTokenCreator` on itself so Firebase Admin can sign the short-lived custom token. The IAM bootstrap script enables the IAM Service Account Credentials API and grants this binding.

## Deployment

`.github/workflows/deploy-firebase-share.yml` deploys automatically when `firebase-share-backend/**` changes on `main` and can also be run manually.

The one-time IAM helper is `iam/setup-github-deployer.sh`. It grants `roles/monitoring.viewer` and the self-scoped `roles/iam.serviceAccountTokenCreator` binding required by the domain-authentication handoff.
