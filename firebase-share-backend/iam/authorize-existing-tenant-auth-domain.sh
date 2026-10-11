#!/usr/bin/env bash
set -euo pipefail

# Uses the active gcloud account via IAM, never a Firebase browser UID or key.
# Registers authorizedDomains for tenants/${SLUG} without changing entitlement,
# owner or subscription data. The Node helper sends X-Goog-User-Project.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/authorize-existing-tenant-auth-domains.mjs" "$@"
