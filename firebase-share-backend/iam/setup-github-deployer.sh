#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="configurator-360"
PROJECT_NUMBER="719238533149"
DEPLOYER="github-deployer@configurator-360.iam.gserviceaccount.com"
RUNTIME="configurator-runtime@configurator-360.iam.gserviceaccount.com"
APP_ENGINE_DEFAULT="configurator-360@appspot.gserviceaccount.com"
COMPUTE_DEFAULT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
EVENTARC_AGENT="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Firebase Admin uses the IAM Service Account Credentials API to sign the
# short-lived custom token used by cross-domain authentication handoff.
gcloud services enable iamcredentials.googleapis.com --project="$PROJECT_ID" --quiet

# Project-level permissions used by Firebase CLI for backend deployment.
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

# Runtime access: Firestore share storage, Eventarc delivery for the fallback
# trigger, Cloud Run invocation, and read-only Cloud Monitoring access so the
# status function can count this month's reCAPTCHA Enterprise assessments.
for ROLE in \
  roles/datastore.user \
  roles/eventarc.eventReceiver \
  roles/run.invoker \
  roles/monitoring.viewer
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

# Firebase Admin creates a short-lived custom token when a signed-in user moves
# between the .com/.ro/.de origins. The runtime account must be allowed to sign
# that token; grant the permission only on its own service-account identity.
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --quiet

# Firebase CLI inspects the default App Engine execution identity during deploy.
gcloud iam service-accounts add-iam-policy-binding "$APP_ENGINE_DEFAULT" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet

# Keep the default 2nd-gen execution identity prepared for Eventarc as well. This
# mirrors the one-time roles that were required during the first deployment.
for ROLE in roles/eventarc.eventReceiver roles/run.invoker; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${COMPUTE_DEFAULT}" \
    --role="$ROLE" \
    --quiet
done

if gcloud iam service-accounts describe "$CLOUD_BUILD_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts add-iam-policy-binding "$CLOUD_BUILD_SA" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER}" \
    --role="roles/iam.serviceAccountUser" \
    --quiet
fi

# Preserve the Google-managed Eventarc service agent on its required role.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${EVENTARC_AGENT}" \
  --role="roles/eventarc.serviceAgent" \
  --quiet

echo "Firebase share-backend IAM bootstrap complete for ${PROJECT_ID}."
