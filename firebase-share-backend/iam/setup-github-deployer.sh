#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="configurator-360"
PROJECT_NUMBER="719238533149"
DEPLOYER="github-deployer@configurator-360.iam.gserviceaccount.com"
RUNTIME="configurator-runtime@configurator-360.iam.gserviceaccount.com"
APP_ENGINE_DEFAULT="configurator-360@appspot.gserviceaccount.com"
EVENTARC_AGENT="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Project-level permissions used by Firebase CLI for this backend deployment.
for ROLE in \
  roles/cloudfunctions.developer \
  roles/datastore.indexAdmin \
  roles/firebaserules.admin \
  roles/serviceusage.serviceUsageConsumer \
  roles/eventarc.developer \
  roles/firebase.viewer \
  roles/run.admin
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" \
    --role="$ROLE" \
    --quiet
done

# The dedicated runtime identity reads/writes the share collection and is also
# the Eventarc identity for the legacy Firestore-created backstop trigger.
for ROLE in \
  roles/datastore.user \
  roles/eventarc.eventReceiver \
  roles/run.invoker
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME}" \
    --role="$ROLE" \
    --quiet
done

# Firebase/Cloud Functions deployment must be able to act as the runtime account.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet

# Firebase CLI also inspects the project's default Firebase/App Engine execution
# identity during deployment, even though the share functions use RUNTIME.
gcloud iam service-accounts add-iam-policy-binding "$APP_ENGINE_DEFAULT" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet

# Cloud Functions source deployment may need to act as the Cloud Build service account.
if gcloud iam service-accounts describe "$CLOUD_BUILD_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts add-iam-policy-binding "$CLOUD_BUILD_SA" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" \
    --role="roles/iam.serviceAccountUser" \
    --quiet
fi

# Keep the Google-managed Eventarc service agent on its required service-agent role.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${EVENTARC_AGENT}" \
  --role="roles/eventarc.serviceAgent" \
  --quiet

echo "Firebase share-backend IAM bootstrap complete for ${PROJECT_ID}."
