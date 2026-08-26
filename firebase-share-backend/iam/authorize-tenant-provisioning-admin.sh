#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="configurator-360"
DATABASE_ID="(default)"
UID="${1:-}"
EMAIL="${2:-}"
ACTION="${3:-enable}"

if [[ -z "$UID" || -z "$EMAIL" ]]; then
  echo "Usage: $0 <firebase-uid> <verified-email> [enable|disable]" >&2
  exit 2
fi

if [[ ! "$UID" =~ ^[A-Za-z0-9:_-]{1,128}$ ]]; then
  echo "Invalid Firebase UID format." >&2
  exit 2
fi

if [[ ! "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "Invalid email address." >&2
  exit 2
fi

case "$ACTION" in
  enable) ACTIVE=true ;;
  disable) ACTIVE=false ;;
  *)
    echo "Action must be 'enable' or 'disable'." >&2
    exit 2
    ;;
esac

ACCESS_TOKEN="$(gcloud auth print-access-token)"
URL="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/tenantProvisioningAdmins/${UID}"

curl -fsS -X PATCH \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  -H "Content-Type: application/json" \
  "$URL" \
  -d "{\
    \"fields\": {\
      \"active\": {\"booleanValue\": ${ACTIVE}},\
      \"email\": {\"stringValue\": \"${EMAIL}\"}\
    }\
  }"

echo
echo "Provisioning admin ${ACTION}d: ${EMAIL} (${UID})"
