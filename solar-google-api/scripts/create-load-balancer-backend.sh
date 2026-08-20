#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-configurator-360}"
REGION="${GCP_REGION:-europe-central2}"
SERVICE="${GOOGLE_SOLAR_CLOUD_RUN_SERVICE:-solar-google-api}"
NEG="${GOOGLE_SOLAR_SERVERLESS_NEG:-solar-google-api-neg}"
BACKEND="${GOOGLE_SOLAR_BACKEND_SERVICE:-solar-google-api-backend}"
SCHEME="${GOOGLE_SOLAR_LB_SCHEME:-EXTERNAL_MANAGED}"

gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" >/dev/null

if ! gcloud compute network-endpoint-groups describe "${NEG}" \
  --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  gcloud compute network-endpoint-groups create "${NEG}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --network-endpoint-type=serverless \
    --cloud-run-service="${SERVICE}"
fi

if ! gcloud compute backend-services describe "${BACKEND}" \
  --project="${PROJECT_ID}" --global >/dev/null 2>&1; then
  gcloud compute backend-services create "${BACKEND}" \
    --project="${PROJECT_ID}" \
    --global \
    --load-balancing-scheme="${SCHEME}" \
    --protocol=HTTP \
    --timeout=300s
fi

if ! gcloud compute backend-services describe "${BACKEND}" \
  --project="${PROJECT_ID}" --global \
  --format='value(backends[].group)' | grep -q "/networkEndpointGroups/${NEG}$"; then
  gcloud compute backend-services add-backend "${BACKEND}" \
    --project="${PROJECT_ID}" \
    --global \
    --network-endpoint-group="${NEG}" \
    --network-endpoint-group-region="${REGION}"
fi

BACKEND_URL="https://www.googleapis.com/compute/v1/projects/${PROJECT_ID}/global/backendServices/${BACKEND}"

cat <<MSG

Serverless NEG/backend created:
  NEG:     ${NEG}
  Backend: ${BACKEND}

One load-balancer step remains because the repository does not own your existing
URL-map resource. Add these paths to the path matcher already used by the three
360Configurator production hosts:

  /api/solar/google-solar
  /api/solar/google-solar/*

and point them to:

  ${BACKEND_URL}

Inspect the current URL map first:

  gcloud compute url-maps list --project=${PROJECT_ID}
  gcloud compute url-maps describe YOUR_URL_MAP --global --project=${PROJECT_ID} \\
    --format='yaml(hostRules,pathMatchers)'

Then edit it without replacing the existing website routes:

  gcloud compute url-maps edit YOUR_URL_MAP --global --project=${PROJECT_ID}

After the URL map propagates, verify:

  curl -fsS 'https://www.360configurator.com/api/solar/google-solar?action=health' | jq .

Expected platform: google-cloud-run

MSG
