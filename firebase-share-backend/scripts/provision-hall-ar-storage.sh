#!/usr/bin/env bash
# Hall AR infrastructure: read-only checks by default, explicit administrator setup.
# This script is also self-contained for upload to Google Cloud Shell.
# No service-account keys, public bucket bindings, default-bucket changes or object
# deletion commands are used. --setup must not run in GitHub Actions.
set +x
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage: bash provision-hall-ar-storage.sh [--check | --setup]
  --check  Verify existing infrastructure; do not enable APIs or modify cloud state.
           This is the default and the only mode used by GitHub Actions.
  --setup  One-time setup, run by the project administrator in Cloud Shell.
           Enables missing APIs, configures the dedicated private Hall AR bucket,
           registers it with Firebase, and adds limited deployment/runtime access.
Project: configurator-360    Bucket: configurator-360-hall-ar
Optional HALL_AR_DEPLOYER overrides the default github-deployer service account
but must still be a service account in this project.
HELP
}
fail() { printf '\nHall AR: %s\n' "$*" >&2; exit 1; }
MODE="${1:---check}"
[[ $# -le 1 ]] || { usage >&2; exit 2; }
case "$MODE" in --help|-h) usage; exit 0 ;; --check|--setup) ;; *) usage >&2; exit 2 ;; esac
PROJECT="${GCP_PROJECT_ID:-configurator-360}"
[[ "$PROJECT" == configurator-360 ]] || fail 'Only project configurator-360 is supported.'
BUCKET="${PROJECT}-hall-ar"
RUNTIME="configurator-runtime@${PROJECT}.iam.gserviceaccount.com"
DEPLOYER="${HALL_AR_DEPLOYER:-github-deployer@${PROJECT}.iam.gserviceaccount.com}"
[[ "$DEPLOYER" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]@configurator-360\.iam\.gserviceaccount\.com$ ]] || fail 'Invalid deployment service account.'
[[ "$DEPLOYER" != "$RUNTIME" ]] || fail 'The deployment and runtime identities must remain separate.'
if [[ "$MODE" == --setup && "${GITHUB_ACTIONS:-false}" == true ]]; then
  fail 'Do not run --setup in GitHub Actions. Run it once as a project administrator in Cloud Shell.'
fi
for binary in gcloud curl python3; do
  command -v "$binary" >/dev/null || fail "Missing ${binary}. Run this script in Google Cloud Shell."
done
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGE='initialization'
on_error() {
  local rc=$?
  trap - ERR
  printf '\nHall AR %s failed at: %s (exit %s).\n' "$MODE" "$STAGE" "$rc" >&2
  if [[ "$MODE" == --check ]]; then
    echo 'Run the updated provision-hall-ar-storage.sh --setup once as a project administrator, then deploy the NEW workflow revision. Do not grant Owner/Editor to GitHub Actions.' >&2
  else
    echo 'Setup requires an administrator able to enable APIs, manage this bucket, register it with Firebase, create project custom roles, and grant the documented IAM bindings. Resolve the specific error above and rerun --setup; do not rerun unrelated IAM bootstrap scripts.' >&2
  fi
  exit "$rc"
}
trap on_error ERR

STAGE='project lookup'
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$NUMBER" == 719238533149 ]] || fail "Unexpected project number: ${NUMBER}. No changes made."
COMPUTE="${NUMBER}-compute@developer.gserviceaccount.com"
printf 'Hall AR %s | project %s (%s) | bucket %s\n' "$MODE" "$PROJECT" "$NUMBER" "$BUCKET"
if [[ "$MODE" == --setup ]]; then
  STAGE='administrator identity check'
  ACTOR="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"
  [[ "$ACTOR" != "$DEPLOYER" ]] || fail 'Use your project-administrator account, not the deployment service account, for --setup.'
  printf 'Administrator setup requested by: %s\n' "${ACTOR:-configured gcloud identity}"
  echo 'Setup changes only the Hall AR bucket and the named deployment/runtime IAM bindings. Existing functions and application objects are not redeployed or deleted.'
fi

STAGE='required API status'
gcloud services list --enabled --project="$PROJECT" --format='value(config.name)' > "$TMP/services.txt"
MISSING=()
for api in storage.googleapis.com firebasestorage.googleapis.com cloudscheduler.googleapis.com; do
  if ! grep -Fxq "$api" "$TMP/services.txt"; then MISSING+=("$api"); fi
done
if (( ${#MISSING[@]} )); then
  if [[ "$MODE" == --check ]]; then
    fail "Missing required API(s): ${MISSING[*]}. Run this script with --setup once as a project administrator. Check mode does not enable services."
  fi
  STAGE='enabling missing APIs'
  gcloud services enable "${MISSING[@]}" --project="$PROJECT" --quiet
fi

# Keep OAuth tokens out of process arguments and logs. The temporary header file
# has mode 600 and is removed on exit. Never run this script with HTTP tracing.
refresh_auth() {
  local token
  token="$(gcloud auth print-access-token)"
  printf 'Authorization: Bearer %s\nX-Goog-User-Project: %s\n' "$token" "$PROJECT" > "$TMP/headers"
  unset token
}
request() {
  local method="$1" url="$2" output="$3"
  curl --silent --show-error --retry 3 --retry-max-time 60 --connect-timeout 15 --max-time 120 \
    --request "$method" --header "@$TMP/headers" --output "$output" --write-out '%{http_code}' "$url"
}
expect_http() {
  local status="$1" expected="$2" file="$3" operation="$4"
  if [[ "$status" != "$expected" ]]; then
    cat "$file" >&2
    fail "${operation}: HTTP ${status}. A 403 is an authorization failure, not evidence that the resource is missing."
  fi
}
validate_bucket() {
  python3 - "$TMP/bucket.json" "$BUCKET" "$NUMBER" "$1" <<'PY'
import json, sys
from pathlib import Path
bucket = json.loads(Path(sys.argv[1]).read_text())
name, project, mode = sys.argv[2:]
errors = []
if bucket.get('name') != name or str(bucket.get('projectNumber')) != project:
    errors.append('Bucket identity/project does not match; no bucket changes are permitted.')
if bucket.get('location', '').upper() != 'EUROPE-WEST1':
    errors.append('The Hall AR bucket must be in europe-west1; do not delete/recreate a bucket to fix this automatically.')
# Do not silently remove retention/holds or versioning from an existing bucket.
if int(bucket.get('retentionPolicy', {}).get('retentionPeriod', 0)) > 0:
    errors.append('A retention policy prevents temporary-model cleanup; administrator review required.')
if bucket.get('defaultEventBasedHold') or bucket.get('versioning', {}).get('enabled'):
    errors.append('Unexpected hold/versioning policy; administrator review required.')
if mode == 'complete':
    iam = bucket.get('iamConfiguration', {})
    if iam.get('uniformBucketLevelAccess', {}).get('enabled') is not True:
        errors.append('Uniform bucket-level access is not enabled.')
    if iam.get('publicAccessPrevention') != 'enforced':
        errors.append('Public access prevention is not enforced.')
    if int(bucket.get('softDeletePolicy', {}).get('retentionDurationSeconds', 0)) != 0:
        errors.append('Soft deletion must be disabled for the dedicated temporary AR bucket.')
    rules = bucket.get('lifecycle', {}).get('rule', [])
    required = {'action': {'type': 'Delete'}, 'condition': {'age': 2, 'matchesPrefix': ['hall-ar/']}}
    if required not in rules:
        errors.append('The two-day hall-ar/ orphan-cleanup lifecycle is missing or changed.')
if errors:
    raise SystemExit('\n'.join('Hall AR: ' + error for error in errors))
PY
}

STAGE='dedicated bucket lookup'
refresh_auth
STORAGE_API="https://storage.googleapis.com/storage/v1/b/${BUCKET}"
STATUS="$(request GET "$STORAGE_API" "$TMP/bucket.json")"
if [[ "$STATUS" == 404 ]]; then
  [[ "$MODE" == --setup ]] || fail 'Hall AR bucket is not set up. Run this script with --setup once as a project administrator.'
  STAGE='creating dedicated private bucket'
  gcloud storage buckets create "gs://${BUCKET}" --project="$PROJECT" --location=europe-west1 \
    --uniform-bucket-level-access --public-access-prevention --quiet
  STATUS="$(request GET "$STORAGE_API" "$TMP/bucket.json")"
fi
expect_http "$STATUS" 200 "$TMP/bucket.json" 'Reading dedicated bucket'
validate_bucket identity

if [[ "$MODE" == --setup ]]; then
  STAGE='runtime and deployment service-account checks'
  for sa in "$RUNTIME" "$DEPLOYER" "$COMPUTE"; do
    gcloud iam service-accounts describe "$sa" --project="$PROJECT" --format='value(email)'
  done
  STAGE='dedicated bucket settings'
  cat > "$TMP/lifecycle.json" <<'JSON'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":2,"matchesPrefix":["hall-ar/"]}}]}
JSON
  gcloud storage buckets update "gs://${BUCKET}" --project="$PROJECT" \
    --uniform-bucket-level-access --public-access-prevention --clear-soft-delete \
    --lifecycle-file="$TMP/lifecycle.json" --quiet
  STAGE='runtime object access on the dedicated bucket'
  gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --project="$PROJECT" \
    --member="serviceAccount:${RUNTIME}" --role=roles/storage.objectAdmin --condition=None --quiet >/dev/null
fi

STAGE='Firebase Storage registration'
FIREBASE_API="https://firebasestorage.googleapis.com/v1beta/projects/${NUMBER}/buckets/${BUCKET}"
refresh_auth
STATUS="$(request GET "$FIREBASE_API" "$TMP/firebase-bucket.json")"
if [[ "$STATUS" == 404 ]]; then
  [[ "$MODE" == --setup ]] || fail 'The dedicated bucket is not registered with Firebase. Run --setup as the project administrator.'
  STATUS="$(request POST "${FIREBASE_API}:addFirebase" "$TMP/firebase-bucket.json")"
fi
expect_http "$STATUS" 200 "$TMP/firebase-bucket.json" 'Firebase bucket registration'
python3 - "$TMP/firebase-bucket.json" "$NUMBER" "$BUCKET" <<'PY'
import json, sys
from pathlib import Path
value = json.loads(Path(sys.argv[1]).read_text())
expected = f'projects/{sys.argv[2]}/buckets/{sys.argv[3]}'
if value.get('name') != expected:
    raise SystemExit('Hall AR: unexpected Firebase bucket resource; refusing to continue.')
PY

# These roles supplement the existing Firebase deployment roles. They do not
# enable APIs, create/delete buckets, edit bucket IAM, or read model objects.
ensure_custom_role() {
  local role_id="$1" title="$2" permissions="$3" role_name="projects/${PROJECT}/roles/$1"
  python3 - "$title" "$permissions" > "$TMP/role.json" <<'PY'
import json, sys
print(json.dumps({'title': sys.argv[1], 'description': 'Hall AR deployment prerequisites; managed by provision-hall-ar-storage.sh.',
                  'stage': 'GA', 'includedPermissions': sorted(sys.argv[2].split(','))}))
PY
  if grep -Fxq "$role_name" "$TMP/roles.txt"; then
    gcloud iam roles describe "$role_id" --project="$PROJECT" --format=json > "$TMP/current-role.json"
    python3 - "$TMP/current-role.json" "$TMP/role.json" <<'PY'
import json, sys
from pathlib import Path
actual, wanted = (json.loads(Path(p).read_text()) for p in sys.argv[1:])
if actual.get('deleted') or actual.get('stage') == 'DISABLED' or set(actual.get('includedPermissions', [])) != set(wanted['includedPermissions']):
    raise SystemExit('Hall AR: an existing custom role has unexpected permissions/status. Review it manually; setup will not overwrite it.')
PY
  else
    gcloud iam roles create "$role_id" --project="$PROJECT" --file="$TMP/role.json" --quiet >/dev/null
  fi
}
if [[ "$MODE" == --setup ]]; then
  STAGE='limited custom deployment roles'
  gcloud iam roles list --project="$PROJECT" --show-deleted --format='value(name)' > "$TMP/roles.txt"
  ensure_custom_role hallArBucketInspector 'Hall AR bucket inspector' 'storage.buckets.get,storage.buckets.getIamPolicy'
  ensure_custom_role hallArDeploymentPrerequisites 'Hall AR deployment prerequisites' \
    'resourcemanager.projects.get,serviceusage.services.get,serviceusage.services.list,serviceusage.services.use,firebasestorage.buckets.get,firebasestorage.buckets.list,cloudscheduler.jobs.create,cloudscheduler.jobs.delete,cloudscheduler.jobs.get,cloudscheduler.jobs.list,cloudscheduler.jobs.update,cloudscheduler.jobs.fullView,cloudscheduler.locations.get,cloudscheduler.locations.list'
  STAGE='deployment access bindings'
  gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --project="$PROJECT" \
    --member="serviceAccount:${DEPLOYER}" --role="projects/${PROJECT}/roles/hallArBucketInspector" --condition=None --quiet >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${DEPLOYER}" \
    --role="projects/${PROJECT}/roles/hallArDeploymentPrerequisites" --condition=None --quiet >/dev/null
  # Firebase creates a private scheduled function and authenticates its Scheduler
  # invocation using the default Compute identity. Runtime remains configurator-runtime.
  # Act-as is scoped to these two identities, never to every account in the project.
  for sa in "$RUNTIME" "$COMPUTE"; do
    gcloud iam service-accounts add-iam-policy-binding "$sa" --project="$PROJECT" \
      --member="serviceAccount:${DEPLOYER}" --role=roles/iam.serviceAccountUser --condition=None --quiet >/dev/null
  done
fi

STAGE='private bucket settings and runtime-access verification'
refresh_auth
STATUS="$(request GET "$STORAGE_API" "$TMP/bucket.json")"
expect_http "$STATUS" 200 "$TMP/bucket.json" 'Verifying bucket settings'
validate_bucket complete
STATUS="$(request GET "${STORAGE_API}/iam" "$TMP/bucket-iam.json")"
expect_http "$STATUS" 200 "$TMP/bucket-iam.json" 'Verifying bucket IAM (read only)'
python3 - "$TMP/bucket-iam.json" "$RUNTIME" <<'PY'
import json, sys
from pathlib import Path
bindings = json.loads(Path(sys.argv[1]).read_text()).get('bindings', [])
if any(member in ('allUsers', 'allAuthenticatedUsers') for b in bindings for member in b.get('members', [])):
    raise SystemExit('Hall AR: unexpected public IAM binding. No binding was removed automatically; ask the administrator to review it.')
member = 'serviceAccount:' + sys.argv[2]
if not any(b.get('role') == 'roles/storage.objectAdmin' and member in b.get('members', []) and not b.get('condition') for b in bindings):
    raise SystemExit('Hall AR: the expected runtime bucket binding is missing. Run --setup as an administrator.')
PY
if [[ "$MODE" == --setup ]]; then
  echo 'Hall AR administrator setup complete.'
  echo 'Apply the deployment fix ZIP, then run Deploy Firebase share backend on the updated main branch.'
  echo 'IAM changes can take time to propagate. The workflow uses --check, not --setup.'
else
  echo 'Hall AR infrastructure verified (read only); no APIs, buckets or IAM policies changed.'
fi
