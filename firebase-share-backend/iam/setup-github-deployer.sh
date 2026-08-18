#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="configurator-360"
PROJECT_NUMBER="719238533149"
DEPLOYER="github-deployer@configurator-360.iam.gserviceaccount.com"
RUNTIME="configurator-runtime@configurator-360.iam.gserviceaccount.com"
EVENTARC_AGENT="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Project-level permissions used by Firebase CLI for this backend deployment.
for ROLE in \
  roles/cloudfunctions.developer \
  roles/datastore.indexAdmin \
  roles/firebaserules.admin \
  roles/serviceusage.serviceUsageConsumer \
  roles/eventarc.developer
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" \
    --role="$ROLE" \
    --quiet
 done

# The deployed function reads/writes/deletes shared configuration documents.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME}" \
  --role="roles/datastore.user" \
  --quiet

# The existing deployer already has Service Account User on configurator-runtime.
# Re-applying the binding is harmless and makes this setup script self-contained.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet

# Cloud Functions source deployment may need to act as the Cloud Build service account.
# If this legacy-named account does not exist in the project, the command is skipped.
if gcloud iam service-accounts describe "$CLOUD_BUILD_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts add-iam-policy-binding "$CLOUD_BUILD_SA" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" \
    --role="roles/iam.serviceAccountUser" \
    --quiet
fi

# The user's first 2nd-gen deployment failed while the newly-created Eventarc
# service agent was waiting for this role to propagate. Granting it explicitly is
# safe because the member is the Google-managed Eventarc service-agent identity.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${EVENTARC_AGENT}" \
  --role="roles/eventarc.serviceAgent" \
  --quiet

echo "Firebase share-backend IAM bootstrap complete for ${PROJECT_ID}."
