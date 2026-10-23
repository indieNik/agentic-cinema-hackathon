#!/usr/bin/env bash
# Deploy Greenlight to Cloud Run. Keys live in Secret Manager and are injected as env vars at runtime
# (the container image never contains a secret). Idempotent — safe to re-run.
#
#   GCLOUD_ACCOUNT=you@example.com GCLOUD_PROJECT=my-project VERTEX_PROJECT=my-vertex-project ./deploy.sh
#   PARALLEL_API_KEY=... ./deploy.sh # also (re)store the Parallel key as a new secret version
#
# Gemini runs on Vertex AI (ADR 0002) as the service's runtime identity, which needs roles/aiplatform.user
# on VERTEX_PROJECT. No Gemini key is mounted. Revert path: GENAI_BACKEND=studio [GEMINI_API_KEY=...] ./deploy.sh
# mounts the AI Studio key from Secret Manager again.
set -euo pipefail

ACCOUNT="${GCLOUD_ACCOUNT:?set GCLOUD_ACCOUNT to the gcloud account that owns the project}"
PROJECT="${GCLOUD_PROJECT:?set GCLOUD_PROJECT to your Google Cloud project id}"
REGION="${GCLOUD_REGION:-us-central1}"
SERVICE="${SERVICE:-greenlight}"
BACKEND="${GENAI_BACKEND:-vertex}"
if [ "$BACKEND" = "vertex" ]; then
  VERTEX_PROJECT="${VERTEX_PROJECT:?set VERTEX_PROJECT to the project that runs Vertex AI (GENAI_BACKEND=vertex)}"
fi
VERTEX_LOCATION="${VERTEX_LOCATION:-us-central1}"
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
SECRETS=("$PARALLEL_SECRET")
SECRET_ENV="PARALLEL_API_KEY=${PARALLEL_SECRET}:latest"
if [ "$BACKEND" = "studio" ]; then
  ensure_secret "$GEMINI_SECRET" "${GEMINI_API_KEY:-}"
  SECRETS+=("$GEMINI_SECRET")
  SECRET_ENV="GEMINI_API_KEY=${GEMINI_SECRET}:latest,${SECRET_ENV}"
fi
ensure_secret "$PARALLEL_SECRET" "${PARALLEL_API_KEY:-}"

# Least privilege: the service's runtime identity may read exactly the secrets it mounts, nothing else.
PROJECT_NUMBER=$($G projects describe "$PROJECT" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in "${SECRETS[@]}"; do
  $G secrets add-iam-policy-binding "$s" --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor" >/dev/null
done

$G run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --cpu 1 --memory 512Mi --concurrency 20 --timeout 300 --min-instances 0 --max-instances 3 \
  --set-env-vars "GENAI_BACKEND=${BACKEND},VERTEX_PROJECT=${VERTEX_PROJECT:-},VERTEX_LOCATION=${VERTEX_LOCATION},GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.5-flash},PARALLEL_MODE=${PARALLEL_MODE:-advanced}" \
  --set-secrets "$SECRET_ENV"

URL=$($G run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo "deployed: $URL"
curl -fsS "$URL/api/health" && echo
