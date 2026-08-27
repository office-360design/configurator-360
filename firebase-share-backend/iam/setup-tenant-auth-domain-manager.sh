#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="configurator-360"
RUNTIME="configurator-runtime@configurator-360.iam.gserviceaccount.com"
ROLE_ID="tenantAuthDomainManager"
ROLE_NAME="projects/${PROJECT_ID}/roles/${ROLE_ID}"
PERMISSIONS="firebaseauth.configs.get,firebaseauth.configs.update"

# The provisioning function updates Firebase Authentication's project-level
# authorizedDomains list when a new Tier-1 customer is created.
gcloud services enable identitytoolkit.googleapis.com \
  --project="$PROJECT_ID" \
  --quiet

if gcloud iam roles describe "$ROLE_ID" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam roles update "$ROLE_ID" \
    --project="$PROJECT_ID" \
    --title="Tier-1 Auth Domain Manager" \
    --description="Allows the configurator runtime to read and update Firebase Authentication authorized domains for Tier-1 provisioning." \
    --permissions="$PERMISSIONS" \
    --stage=GA \
    --quiet
else
  gcloud iam roles create "$ROLE_ID" \
    --project="$PROJECT_ID" \
    --title="Tier-1 Auth Domain Manager" \
    --description="Allows the configurator runtime to read and update Firebase Authentication authorized domains for Tier-1 provisioning." \
    --permissions="$PERMISSIONS" \
    --stage=GA \
    --quiet
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME}" \
  --role="$ROLE_NAME" \
  --quiet

echo "Tier-1 Firebase Auth domain IAM configured for ${RUNTIME}."
