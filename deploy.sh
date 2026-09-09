#!/usr/bin/env bash
# Deploy Greenlight to Cloud Run. Keys live in Secret Manager and are injected as env vars at runtime
# (the container image never contains a secret). Idempotent — safe to re-run.
#
#   GCLOUD_ACCOUNT=you@example.com GCLOUD_PROJECT=my-project ./deploy.sh   # build in Cloud Build + deploy
#   PARALLEL_API_KEY=... ./deploy.sh # also (re)store the Parallel key as a new secret version
#   GEMINI_API_KEY=...   ./deploy.sh # also (re)store the Gemini key
set -euo pipefail

ACCOUNT="${GCLOUD_ACCOUNT:?set GCLOUD_ACCOUNT to the gcloud account that owns the project}"
PROJECT="${GCLOUD_PROJECT:?set GCLOUD_PROJECT to your Google Cloud project id}"
REGION="${GCLOUD_REGION:-us-central1}"
SERVICE="${SERVICE:-greenlight}"
GEMINI_SECRET="greenlight-gemini-api-key"
PARALLEL_SECRET="greenlight-parallel-api-key"
G="gcloud --account=$ACCOUNT --project=$PROJECT --quiet"

$G services enable run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com >/dev/null

ensure_secret() { # name value
  local name="$1" value="$2"
  if ! $G secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "${value:-pending}" | $G secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
    echo "created secret $name"
  elif [ -n "$value" ]; then
    printf '%s' "$value" | $G secrets versions add "$name" --data-file=- >/dev/null
    echo "added new version to $name"
  fi
}
ensure_secret "$GEMINI_SECRET" "${GEMINI_API_KEY:-}"
ensure_secret "$PARALLEL_SECRET" "${PARALLEL_API_KEY:-}"

# Least privilege: the service's runtime identity may read exactly these two secrets, nothing else.
PROJECT_NUMBER=$($G projects describe "$PROJECT" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in "$GEMINI_SECRET" "$PARALLEL_SECRET"; do
  $G secrets add-iam-policy-binding "$s" --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor" >/dev/null
done

$G run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --cpu 1 --memory 512Mi --concurrency 20 --timeout 300 --min-instances 0 --max-instances 3 \
  --set-env-vars "GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.5-flash},PARALLEL_MODE=${PARALLEL_MODE:-advanced}" \
  --set-secrets "GEMINI_API_KEY=${GEMINI_SECRET}:latest,PARALLEL_API_KEY=${PARALLEL_SECRET}:latest"

URL=$($G run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo "deployed: $URL"
curl -fsS "$URL/healthz" && echo
