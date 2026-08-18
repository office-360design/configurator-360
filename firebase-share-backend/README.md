# Shared-configuration quota backend

This Firebase Cloud Function enforces the application-level storage policy for
`sharedConfigurations` without changing the configurator clients.

## Policy implemented

- Maximum logical payload storage: **200 MiB** (`209,715,200` bytes).
- When a new share crosses the limit, delete the **oldest shares first** until at
  least **1 MiB** (`1,048,576` bytes) has been freed. If the actual overflow is
  larger than 1 MiB, enough data is removed to get back under 200 MiB.
- Maximum individual serialized state (`s`): **850,000 UTF-8 bytes**.
- Every new document receives trusted server metadata:
  - `sizeBytes`
  - `createdAt`
  - `expiresAt` (= creation + 90 days)
  - `quotaVersion`

The `expiresAt` field is prepared for the later 90-day TTL implementation, but
this package does **not** yet enable Firestore TTL or reject expired reads.

## Why no configurator files are changed

The existing Share button can keep creating documents with only `v`, `p`, and
`s`, exactly as it does now. `onDocumentCreated` runs on Firebase after the write,
adds server metadata, calculates current usage, and performs FIFO cleanup if
necessary.

The Admin SDK used by Cloud Functions is privileged and does not depend on the
browser Firestore rules for its metadata update/deletes.

## Deploy

From this `firebase-share-backend` directory:

```bash
npm install -g firebase-tools
firebase login
cd functions
npm install
cd ..
firebase deploy --only functions:enforceSharedConfigurationQuota
```

The `.firebaserc` in this folder points to the Firebase project:

```text
configurator-360
```

If `firebase login` and Firebase CLI are already configured, only the `npm
install` and `firebase deploy` portions are needed.

## Existing Firestore rules

No rule change is required for this quota-only step. Keep the current
`sharedConfigurations` rule block for now.

Later, when creation/read are moved behind callable functions and App Check, the
client rules can be tightened to `allow read, write: if false;` for this
collection.

## Verify after deployment

Create one share from a configurator and inspect its Firestore document. Within a
short time it should have these additional fields:

```text
createdAt
expiresAt
quotaVersion = 1
sizeBytes
```

Cloud Functions logs for `enforceSharedConfigurationQuota` show current logical
usage. Actual cleanup only happens when total `sizeBytes` exceeds 200 MiB.

## What the 200 MiB number means

This is an application-level quota over the UTF-8 byte size of the saved `s`
payloads. Firestore's billable physical storage also contains document names,
field names, metadata, and index entries, so the Firebase console's physical
storage figure will not equal this 200 MiB counter exactly.
