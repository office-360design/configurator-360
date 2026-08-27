#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="configurator-360"
DATABASE_ID="(default)"
SLUG="${1:-}"

if [[ -z "$SLUG" ]]; then
  echo "Usage: $0 <tenant-slug>" >&2
  exit 2
fi

if [[ ! "$SLUG" =~ ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$ ]]; then
  echo "Invalid tenant slug." >&2
  exit 2
fi

DOMAIN="${SLUG}.360configurator.com"
ACCESS_TOKEN="$(gcloud auth print-access-token)"
TENANT_URL="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/tenants/${SLUG}"
CONFIG_URL="https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config"

TENANT_JSON="$(curl -fsS \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  "$TENANT_URL")"

TENANT_STATUS="$(jq -r '.fields.status.stringValue // empty' <<<"$TENANT_JSON")"
TENANT_DOMAIN="$(jq -r '.fields.domain.stringValue // empty' <<<"$TENANT_JSON")"
if [[ "$TENANT_STATUS" != "active" || "$TENANT_DOMAIN" != "$DOMAIN" ]]; then
  echo "Tenant ${SLUG} is not an active Tier-1 tenant for ${DOMAIN}." >&2
  exit 1
fi

CONFIG_JSON="$(curl -fsS \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  "$CONFIG_URL")"

if jq -e --arg domain "$DOMAIN" '(.authorizedDomains // []) | index($domain) != null' >/dev/null <<<"$CONFIG_JSON"; then
  echo "Firebase Auth domain already authorized: ${DOMAIN}"
  exit 0
fi

UPDATED_DOMAINS="$(jq -c --arg domain "$DOMAIN" '((.authorizedDomains // []) + [$domain]) | unique | sort' <<<"$CONFIG_JSON")"
BODY="$(jq -cn --arg name "projects/${PROJECT_ID}/config" --argjson domains "$UPDATED_DOMAINS" '{name:$name, authorizedDomains:$domains}')"

curl -fsS -X PATCH \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  -H "Content-Type: application/json" \
  "${CONFIG_URL}?updateMask=authorizedDomains" \
  -d "$BODY" \
  | jq --arg domain "$DOMAIN" '{authorized: ((.authorizedDomains // []) | index($domain) != null), domain: $domain}'
