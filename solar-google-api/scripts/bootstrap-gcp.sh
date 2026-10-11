#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-configurator-360}"
REGION="${GCP_REGION:-europe-central2}"
RUNTIME_SA="${GOOGLE_SOLAR_RUNTIME_SA:-configurator-runtime@${PROJECT_ID}.iam.gserviceaccount.com}"
CACHE_BUCKET="${GOOGLE_SOLAR_CACHE_BUCKET:-cfg360-solar-cache-89ccb07249b1}"
SECURITY_COLLECTION="${GOOGLE_SOLAR_SECURITY_COLLECTION:-googleSolarSecurityV1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIFECYCLE_FILE="${SCRIPT_DIR}/../infrastructure-storage-lifecycle.json"

API_KEY_SECRET="${GOOGLE_SOLAR_API_KEY_SECRET:-google-solar-api-key}"
ACCESS_CODE_SECRET="${GOOGLE_SOLAR_ACCESS_CODE_SECRET:-google-solar-demo-access-code}"
SESSION_SECRET="${GOOGLE_SOLAR_SESSION_SECRET_NAME:-google-solar-session-secret}"

echo "Project: ${PROJECT_ID}"
echo "Region:  ${REGION}"
echo "Runtime: ${RUNTIME_SA}"
echo "Bucket:  gs://${CACHE_BUCKET}"

if [[ "${CACHE_BUCKET}" == goog* || "${CACHE_BUCKET}" == *google* ]]; then
  echo "ERROR: Cloud Storage bucket names cannot begin with 'goog' or contain 'google'." >&2
  echo "Choose a different GOOGLE_SOLAR_CACHE_BUCKET value." >&2
  exit 2
fi

gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  compute.googleapis.com \
  solar.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud storage buckets describe "gs://${CACHE_BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${CACHE_BUCKET}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --uniform-bucket-level-access
fi

gcloud storage buckets update "gs://${CACHE_BUCKET}" \
  --project="${PROJECT_ID}" \
  --lifecycle-file="${LIFECYCLE_FILE}"

gcloud storage buckets add-iam-policy-binding "gs://${CACHE_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/storage.objectUser" \
  --project="${PROJECT_ID}" >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/datastore.user" >/dev/null

for secret in "${API_KEY_SECRET}" "${ACCESS_CODE_SECRET}" "${SESSION_SECRET}"; do
  if ! gcloud secrets describe "${secret}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${secret}" --project="${PROJECT_ID}" --replication-policy=automatic
  fi
  gcloud secrets add-iam-policy-binding "${secret}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
done

# Counter documents already carry an expireAt timestamp. Firestore TTL keeps the
# rate-limit collection bounded without requiring application-side cleanup.
gcloud firestore fields ttls update expireAt \
  --project="${PROJECT_ID}" \
  --database="(default)" \
  --collection-group="${SECURITY_COLLECTION}" \
  --enable-ttl \
  --async >/dev/null || true

cat <<MSG

Google Solar GCP resources are ready.

Add secret VALUES before deploying:

  printf '%s' 'YOUR_RESTRICTED_SOLAR_API_KEY' | \\
    gcloud secrets versions add ${API_KEY_SECRET} --project=${PROJECT_ID} --data-file=-

  printf '%s' 'YOUR_PRIVATE_DEMO_CODE' | \\
    gcloud secrets versions add ${ACCESS_CODE_SECRET} --project=${PROJECT_ID} --data-file=-

  openssl rand -hex 32 | \\
    gcloud secrets versions add ${SESSION_SECRET} --project=${PROJECT_ID} --data-file=-

Then run the GitHub workflow "Deploy Google Solar API to Cloud Run" or deploy manually.
After the Cloud Run service exists, run:

  solar-google-api/scripts/create-load-balancer-backend.sh

MSG
