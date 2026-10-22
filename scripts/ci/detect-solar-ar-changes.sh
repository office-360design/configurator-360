#!/usr/bin/env bash
set -euo pipefail

# Manual deployments and unavailable history conservatively run validation.
relevant=true
if [[ "${EVENT_NAME:-}" == push && "${BEFORE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "${BEFORE_SHA}^{commit}" 2>/dev/null; then
  changes=$(mktemp)
  trap 'rm -f "$changes"' EXIT
  if git diff --name-only -z "$BEFORE_SHA" HEAD > "$changes"; then
    relevant=false
    while IFS= read -r -d '' path; do
      case "$path" in
        solar-configurator/*|shared-3d/*|shared-ui/src/ar/*|shared-ui/src/arPolicy.js|shared-ui/src/config.js|shared-ui/src/standaloneShell.js|shared-ui/src/components/topBar.js|shared-ui/src/tenantBootstrap.js|shared-ui/src/tenantCustomization.js|shared-ui/src/tenantShellCustomization.js|shared-ui/styles/ar.css|shared-ui/styles/index.css|shared-ui/styles/standalone.css|firebase-share-backend/functions/hall-ar*|firebase-share-backend/functions/tests/hall-ar.test.cjs|hall-configurator/js/ar/*|hall-configurator/ar.html|hall-configurator/tests/ar-policy.test.mjs|bookshelf-configurator/tests/camera-guard*|scripts/validation/validate_tenant_usage_metering.mjs|scripts/validation/tenant-branding.test.mjs|package.json|package-lock.json|scripts/ci/detect-solar-ar-changes.sh|.github/workflows/deploy-cloudrun.yml|.github/workflows/validate-solar-ar.yml)
          relevant=true
          break
          ;;
      esac
    done < "$changes"
  fi
fi
printf 'relevant=%s\n' "$relevant" >> "$GITHUB_OUTPUT"
printf 'Solar AR deployment check: relevant=%s\n' "$relevant"
