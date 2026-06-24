#!/usr/bin/env bash
# =============================================================================
# Grant Engine → Google Cloud Run + Cloud SQL (Postgres) + Secret Manager
# =============================================================================
# Run this YOURSELF (it needs your gcloud auth + owner on project-dump-ss).
# Run from the REPO ROOT:   bash deploy/gcloud-deploy.sh
#
# It reads the API keys / Supabase creds from your local .env and pushes them to
# Secret Manager. The DB connection string is built for Cloud SQL (unix socket).
# Everything is prefixed "grants-engine-". Re-running is safe (create-if-missing).
#
# PREREQS (one-time):
#   - gcloud CLI installed + logged in:   gcloud auth login
#   - Owner on the project:               gcloud config set project project-dump-ss
#   - A .env in the repo root with the app's keys (OPENAI_API_KEY, SUPABASE_*, etc.)
#   - The image is built by Cloud Build, so no local Docker is required.
# =============================================================================
set -euo pipefail

# ── Config (edit if needed) ─────────────────────────────────────────────────
PROJECT="project-dump-ss"
REGION="us-central1"            # matches the existing playwright-service
PREFIX="grants-engine"
SQL_INSTANCE="${PREFIX}-pg"
SQL_DB="${PREFIX}-db"
SQL_USER="${PREFIX}-app"
SQL_TIER="db-f1-micro"          # smallest ENTERPRISE (shared-core) tier; scale later
SERVICE="${PREFIX}"             # Cloud Run service name
RUNTIME_SA="${PREFIX}-run@${PROJECT}.iam.gserviceaccount.com"
# Container Registry (gcr.io) — GCS-backed; the bucket is auto-created on first
# push, so there's no repo to pre-create and no artifactregistry.writer needed.
IMAGE="gcr.io/${PROJECT}/${PREFIX}:v1"
TZ_SCHED="Africa/Johannesburg"

[ -f .env ] || { echo "ERROR: run from the repo root (no .env found here)."; exit 1; }

# Load the app's env (API keys, Supabase, CRON_SECRET, ...). Ensure values with
# spaces are quoted in .env (e.g. EMAIL_FROM="Grants Engine <...>").
# Strip Windows CRLF first — a trailing \r would otherwise corrupt every secret
# value (e.g. an API key with a hidden carriage return).
ENV_TMP="$(mktemp)"
trap 'rm -f "$ENV_TMP"' EXIT
tr -d '\r' < .env > "$ENV_TMP"
set -a; . "$ENV_TMP"; set +a

# ── Helpers ─────────────────────────────────────────────────────────────────
SECRETS_FLAG=""   # accumulates "ENV=secret:latest,ENV2=secret2:latest,..."

secret_name() { echo "${PREFIX}-$(echo "$1" | tr 'A-Z_' 'a-z-')"; }

put_secret() {  # put_secret ENV_NAME VALUE  → create-if-missing + add version
  local env="$1" val="$2" name; name="$(secret_name "$env")"
  if [ -z "${val:-}" ]; then echo "  · skip ${env} (empty in .env)"; return; fi
  gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1 \
    || gcloud secrets create "$name" --replication-policy=automatic --project="$PROJECT" >/dev/null
  printf '%s' "$val" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT" >/dev/null
  echo "  · set ${name}"
}

add() {  # add ENV_NAME VALUE  → put secret AND register it in the --set-secrets flag
  local env="$1" val="$2"
  [ -z "${val:-}" ] && { echo "  · skip ${env} (empty)"; return; }
  put_secret "$env" "$val"
  SECRETS_FLAG="${SECRETS_FLAG:+$SECRETS_FLAG,}${env}=$(secret_name "$env"):latest"
}

echo "=== 0. Enable APIs =========================================================="
gcloud services enable run.googleapis.com cloudbuild.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com containerregistry.googleapis.com \
  --project="$PROJECT"

echo "=== 1. Container Registry (gcr.io — no repo to create) ======================"
# gcr.io is GCS-backed: the storage bucket is created automatically on the first
# image push (Cloud Build, step 5), so there's nothing to provision here.

echo "=== 2. Cloud SQL instance + database + user ================================="
gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 \
       --tier="$SQL_TIER" --edition=ENTERPRISE --region="$REGION" --project="$PROJECT"
gcloud sql databases describe "$SQL_DB" --instance="$SQL_INSTANCE" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud sql databases create "$SQL_DB" --instance="$SQL_INSTANCE" --project="$PROJECT"

# DB password: generated once, saved locally (KEEP THIS FILE SAFE, it's gitignored).
PW_FILE="deploy/.cloudsql-password"
if [ -f "$PW_FILE" ]; then DB_PASS="$(cat "$PW_FILE")"; else
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=')"; echo "$DB_PASS" > "$PW_FILE"; chmod 600 "$PW_FILE"
fi
gcloud sql users describe "$SQL_USER" --instance="$SQL_INSTANCE" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud sql users create "$SQL_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS" --project="$PROJECT"

CONN="${PROJECT}:${REGION}:${SQL_INSTANCE}"     # Cloud SQL connection name
# DATABASE_URL for the Cloud SQL unix socket (consumed by the db.js socket branch):
DATABASE_URL="postgresql://${SQL_USER}:${DB_PASS}@/${SQL_DB}?host=/cloudsql/${CONN}"

echo "=== 3. Secret Manager (all env vars) ========================================"
add DATABASE_URL          "$DATABASE_URL"            # Cloud SQL (NOT the Supabase URL from .env)
# Storage stays on Supabase — these remain required:
add SUPABASE_URL          "${SUPABASE_URL:-}"
add SUPABASE_SERVICE_KEY  "${SUPABASE_SERVICE_KEY:-}"
# AI providers
add OPENAI_API_KEY        "${OPENAI_API_KEY:-}"
add OPENAI_MODEL          "${OPENAI_MODEL:-}"
add OPENAI_SEARCH_MODEL   "${OPENAI_SEARCH_MODEL:-}"
add ANTHROPIC_API_KEY     "${ANTHROPIC_API_KEY:-}"
add ANTHROPIC_MODEL       "${ANTHROPIC_MODEL:-}"
# Email
add RESEND_API_KEY        "${RESEND_API_KEY:-}"
add EMAIL_FROM            "${EMAIL_FROM:-}"
# Auth / admin / cron
add SUPER_ADMIN_KEY       "${SUPER_ADMIN_KEY:-}"
add CRON_SECRET           "${CRON_SECRET:-}"
# Google Calendar OAuth
add GOOGLE_CLIENT_ID      "${GOOGLE_CLIENT_ID:-}"
add GOOGLE_CLIENT_SECRET  "${GOOGLE_CLIENT_SECRET:-}"
# Playwright autofill service (already on Cloud Run; reference by URL+secret)
add PLAYWRIGHT_SERVICE_URL "${PLAYWRIGHT_SERVICE_URL:-}"
add PLAYWRIGHT_SECRET      "${PLAYWRIGHT_SECRET:-}"
# Scraper
add IATI_API_KEY          "${IATI_API_KEY:-}"
# URL-dependent vars (APP_URL / CORS_ORIGIN / GOOGLE_REDIRECT_URI) are set in Phase 2
# below, after the first deploy assigns the run.app URL.

echo "=== 4. Runtime service account + IAM ========================================"
gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "${PREFIX}-run" --display-name="Grant Engine Cloud Run" --project="$PROJECT"
for ROLE in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role="$ROLE" --condition=None >/dev/null
done

echo "=== 5. Build image (Cloud Build) ============================================"
gcloud builds submit --tag "$IMAGE" --project="$PROJECT" .

echo "=== 6. Deploy to Cloud Run =================================================="
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" --region="$REGION" --project="$PROJECT" \
  --service-account="$RUNTIME_SA" \
  --add-cloudsql-instances="$CONN" \
  --set-secrets="$SECRETS_FLAG" \
  --memory=1Gi --cpu=1 --timeout=600 --min-instances=0 --max-instances=10 \
  --allow-unauthenticated

RUN_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)')"
echo "Service URL: $RUN_URL"

echo "=== 7. Set URL-dependent secrets + redeploy ================================="
add APP_URL             "$RUN_URL"
add CORS_ORIGIN         "$RUN_URL"
add GOOGLE_REDIRECT_URI "$RUN_URL/api/auth/google/callback"
# Re-apply the full secret set (now incl. the URL vars) without rebuilding the image:
gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --set-secrets="$SECRETS_FLAG"

echo "=== 8. Cloud Scheduler → cron endpoints (Bearer CRON_SECRET) ================"
# The /api/cron/* routes are CRON_SECRET-gated, so the scheduler just sends the
# bearer header (no OIDC needed; the service is public but the routes are gated).
mk_job() {  # mk_job NAME SCHEDULE PATH
  gcloud scheduler jobs describe "$1" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1 && local verb=update || local verb=create
  # `create` takes --headers; `update` takes --update-headers (different flag).
  local hdr_flag="--headers"
  [ "$verb" = "update" ] && hdr_flag="--update-headers"
  gcloud scheduler jobs "$verb" http "$1" --location="$REGION" --project="$PROJECT" \
    --schedule="$2" --time-zone="$TZ_SCHED" --uri="${RUN_URL}$3" --http-method=POST \
    "${hdr_flag}=Authorization=Bearer ${CRON_SECRET}"
}
mk_job "${PREFIX}-scout"     "0 0 * * *"    "/api/cron/scout"       # nightly 00:00 SAST
mk_job "${PREFIX}-reminders" "*/30 * * * *" "/api/cron/reminders"   # every 30 min

cat <<EOF

============================================================================
DONE. App: $RUN_URL
MANUAL FOLLOW-UPS:
  1. Add this redirect URI in the Google Cloud OAuth consent / credentials:
       ${RUN_URL}/api/auth/google/callback
  2. First boot auto-runs schema + seeds the d-lab org (check Cloud Run logs).
  3. Verify:  curl ${RUN_URL}/api/health   →  {"ok":true,"dbConnected":true}
  4. DB password saved at ${PW_FILE} (keep it; it's gitignored).
  5. Test a scheduler job once:
       gcloud scheduler jobs run ${PREFIX}-scout --location=${REGION} --project=${PROJECT}
============================================================================
EOF
