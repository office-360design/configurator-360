# Shared configuration Firebase backend

This backend enforces temporary share-link storage for `sharedConfigurations`.

## Policy

- Maximum logical serialized configuration payload storage: **200 MiB**.
- If a new share pushes usage over the limit, delete the **oldest** shares until at least **1 MiB** has been freed (or more when required to return below 200 MiB).
- Maximum one saved state: **850,000 UTF-8 bytes**.
- Every new share receives trusted server metadata: `sizeBytes`, `createdAt`, `expiresAt`, and `quotaVersion`.
- `expiresAt` is exactly 90 days after the Firestore document creation time.
- Firestore Security Rules refuse reads after `expiresAt`.
- Firestore TTL physically removes expired documents automatically. TTL deletion is asynchronous, so the Security Rule is what makes the public link stop working at the 90-day boundary.

## Index policy

`firestore.indexes.json` configures:

- `sharedConfigurations.s`: no automatic single-field index. The large state string is retrieved by document ID and is never queried.
- `sharedConfigurations.expiresAt`: TTL enabled and ordinary indexing disabled.
- `createdAt`: left indexed because FIFO cleanup orders by it.
- `sizeBytes`: left indexed because the quota code uses a Firestore SUM aggregation.

## GitHub Actions deployment

`.github/workflows/deploy-firebase-share.yml` automatically deploys when `firebase-share-backend/**` changes on `main`, and can also be launched manually with `workflow_dispatch`.

It reuses the repository's existing Google Cloud Workload Identity Federation variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

No long-lived Google service-account JSON key is added to GitHub.

The workflow deploys:

- `functions:enforceSharedConfigurationQuota`
- `firestore:rules`
- `firestore:indexes` (including TTL and index exemptions)

## Required IAM for the existing GitHub deployer

The existing deployer is expected to be:

`github-deployer@configurator-360.iam.gserviceaccount.com`

The function explicitly runs as:

`configurator-runtime@configurator-360.iam.gserviceaccount.com`

Before the first GitHub deployment, make sure the deployer can deploy Cloud Functions and Firestore index configuration, and the runtime identity can read/write Firestore. See the accompanying ChatGPT instructions for the one-time IAM commands.

## First-time Google service-agent propagation

The first local attempt enabled Eventarc and related APIs and then failed while Google's Eventarc service-agent permissions were still propagating. That is a project-side first-use condition, not a requirement for the frontend website to be deployed first. Retrying after propagation is normal.

### One-time IAM bootstrap

Run `iam/setup-github-deployer.sh` once from Google Cloud Shell while signed in as a project administrator. It augments the existing GitHub deployer rather than introducing a new credential. IAM changes can take several minutes to propagate before the first workflow succeeds.
