#!/usr/bin/env bash
# Idempotent, dedicated Hall AR storage; does not change the default Firebase bucket.
set -euo pipefail
PROJECT="${GCP_PROJECT_ID:-configurator-360}"
[[ "$PROJECT" == configurator-360 ]] || { echo 'This AR deployment is configured only for configurator-360.' >&2; exit 1; }
BUCKET="${PROJECT}-hall-ar"
RUNTIME="configurator-runtime@${PROJECT}.iam.gserviceaccount.com"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
trap 'echo "Hall AR provisioning failed. The deploying service account needs serviceusage.services.enable, storage bucket creation/IAM/update, and firebasestorage.buckets.addFirebase permissions. See hall-configurator/AR_IMPLEMENTATION.md. No existing bucket is made public." >&2' ERR

gcloud services enable storage.googleapis.com firebasestorage.googleapis.com cloudscheduler.googleapis.com --project="$PROJECT" --quiet
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
# List within THIS project rather than treating a generic 403 as an absent bucket.
gcloud storage buckets list --project="$PROJECT" --format='value(name)' > "$TMP/buckets.txt"
if ! grep -Eq "^(gs://)?${BUCKET}/?$" "$TMP/buckets.txt"; then
  gcloud storage buckets create "gs://${BUCKET}" --project="$PROJECT" --location=europe-west1 \
    --uniform-bucket-level-access --public-access-prevention --quiet
fi
# This bucket is dedicated to short-lived models. No rules/lifecycle of the main
# application bucket are touched. Soft-delete is disabled for these temporary files.
cat > "$TMP/lifecycle.json" <<'JSON'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":2,"matchesPrefix":["hall-ar/"]}}]}
JSON
gcloud storage buckets update "gs://${BUCKET}" --uniform-bucket-level-access --public-access-prevention \
  --clear-soft-delete --lifecycle-file="$TMP/lifecycle.json" --quiet
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${RUNTIME}" --role=roles/storage.objectAdmin --quiet > /dev/null

# Register the additional GCS bucket with Firebase Storage so the narrowly scoped
# Firebase CLI target below can deploy its explicit-deny client security rules.
API="https://firebasestorage.googleapis.com/v1beta/projects/${NUMBER}/buckets/${BUCKET}"
TOKEN="$(gcloud auth print-access-token)"
STATUS="$(curl --silent --show-error --retry 3 -o "$TMP/firebase-bucket.json" -w '%{http_code}' \
  -H "Authorization: Bearer ${TOKEN}" -H "X-Goog-User-Project: ${PROJECT}" "$API")"
case "$STATUS" in
  200) ;;
  404)
    curl --fail-with-body --silent --show-error --retry 3 -X POST \
      -H "Authorization: Bearer ${TOKEN}" -H "X-Goog-User-Project: ${PROJECT}" \
      "${API}:addFirebase" > "$TMP/firebase-bucket.json"
    ;;
  *) cat "$TMP/firebase-bucket.json" >&2; echo "Firebase bucket lookup failed: HTTP ${STATUS}" >&2; exit 1 ;;
esac
unset TOKEN
printf 'Private Hall AR bucket ready: %s (Firebase project %s)\n' "$BUCKET" "$PROJECT"
