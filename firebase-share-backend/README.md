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

## App Check share transport

The secure production transport uses two callable Functions:

- `createSharedConfiguration`
- `getSharedConfiguration`

Both set `enforceAppCheck: true`. No Firebase Authentication account is required; App Check attests the web application, not the end user.

The browser initializes App Check with the reCAPTCHA Enterprise provider from `shared-ui/src/firebaseAppCheck.js`. The public site key lives in `shared-ui/firebase-app-check.json`.

During rollout, an empty `siteKey` keeps the previous direct-Firestore share path active. This is deliberate: deploy the backend first, register the web app in Firebase App Check, configure the site key, deploy the frontend, and verify App Check metrics before removing the legacy Firestore access rules.

Do **not** enable project-wide Cloud Firestore App Check enforcement solely for the configurator share feature unless every other web/mobile app using this Firebase project's Firestore has also been registered with App Check. This Firebase project contains other collections and clients. The callable Functions provide per-feature enforcement without disrupting them.

## reCAPTCHA Enterprise / App Check setup

1. In Google Cloud Console, open **reCAPTCHA Enterprise** and create a **Website** score-based key. Do not enable a checkbox challenge.
2. Add every production hostname that serves a configurator, for example:
   - `aks.360configurator.com`
   - `360configurator.com`
   - `www.360configurator.com`
   - `360configurator.ro`
   - `www.360configurator.ro`
   - `360konfigurator.de`
   - `www.360konfigurator.de`
3. In Firebase Console, open **Security → App Check**, select the second `360configurator` web app (App ID `1:719238533149:web:9e0b8a97375731b8ea6f4`) and register the reCAPTCHA Enterprise provider with that site key.
4. Keep the default 1-hour App Check token TTL initially and the default risk threshold unless monitoring shows a reason to change them.
5. Paste the public site key into `shared-ui/firebase-app-check.json` and deploy.
6. Create and open several share links from production. Check **Firebase → App Check → Metrics** and confirm the callable Functions receive valid App Check traffic.
7. After verification, remove the legacy direct Firestore share path/rules in a follow-up hardening change.

For localhost development, `debugOnLocalhost` enables the App Check debug provider automatically. The browser console prints a debug token the first time; register that token under Firebase App Check debug tokens before local secure-share calls will succeed.

## Deployment

`.github/workflows/deploy-firebase-share.yml` deploys automatically when `firebase-share-backend/**` changes on `main`, and can also be run manually.

The workflow deploys Functions first, then Firestore rules/indexes only after Functions succeed. This prevents a failed Functions deployment from changing client-access policy halfway through a release.

The one-time IAM bootstrap is `iam/setup-github-deployer.sh`.
