<#
=============================================================================
Grant Engine -> Google Cloud Run + Cloud SQL (Postgres) + Secret Manager
=============================================================================
Windows / PowerShell version of deploy/gcloud-deploy.sh. Use this on Windows so
gcloud runs in the same shell where you authenticated (Git Bash does not share
gcloud credentials with PowerShell).

Run from the REPO ROOT in PowerShell:   .\deploy\gcloud-deploy.ps1

It reads the API keys / Supabase creds from your local .env and pushes them to
Secret Manager. The DB connection string is built for Cloud SQL (unix socket).
Everything is prefixed "grants-engine-". Re-running is safe (create-if-missing).

PREREQS (one-time):
  - gcloud CLI installed + logged in:   gcloud auth login
  - Owner on the project:               gcloud config set project project-dump-ss
  - A .env in the repo root with the app's keys (OPENAI_API_KEY, SUPABASE_*, etc.)
  - The image is built by Cloud Build, so no local Docker is required.

NOTE: "describe" checks may print a red NOT_FOUND on first run — that's expected
(it's how the create-if-missing logic detects a resource doesn't exist yet).
=============================================================================
#>

# --- Config (edit if needed) ------------------------------------------------
$PROJECT      = "project-dump-ss"
$REGION       = "us-central1"            # matches the existing playwright-service
$PREFIX       = "grants-engine"
$SQL_INSTANCE = "$PREFIX-pg"
$SQL_DB       = "$PREFIX-db"
$SQL_USER     = "$PREFIX-app"
$SQL_TIER     = "db-f1-micro"            # smallest ENTERPRISE (shared-core) tier; scale later
$SERVICE      = "$PREFIX"                # Cloud Run service name
$RUNTIME_SA   = "$PREFIX-run@$PROJECT.iam.gserviceaccount.com"
# Container Registry (gcr.io) — GCS-backed; the bucket is auto-created on first
# push, so there's no repo to pre-create and no artifactregistry.writer needed.
$IMAGE        = "gcr.io/$PROJECT/${PREFIX}:v1"
$TZ_SCHED     = "Africa/Johannesburg"
$PW_FILE      = "deploy/.cloudsql-password"

if (-not (Test-Path ".env")) { Write-Error "Run from the repo root (no .env found here)."; exit 1 }

# --- Load .env (handles Windows CRLF + surrounding quotes) -------------------
# Get-Content already strips line terminators; we also trim a stray CR and any
# surrounding quotes so values match what `source .env` would yield in bash.
$envVars = @{}
foreach ($line in (Get-Content -Path ".env")) {
  $t = $line.Trim()
  if ($t -eq "" -or $t.StartsWith("#")) { continue }
  $idx = $t.IndexOf("=")
  if ($idx -lt 1) { continue }
  $k = $t.Substring(0, $idx).Trim()
  $v = $t.Substring($idx + 1).Trim().TrimEnd("`r")
  if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
    $v = $v.Substring(1, $v.Length - 2)
  }
  $envVars[$k] = $v
}
function EnvVal([string]$k) { if ($envVars.ContainsKey($k)) { return $envVars[$k] } else { return "" } }

# --- Helpers ----------------------------------------------------------------
$script:SecretsFlag = @()   # array of "ENV=secret:latest"

function Get-SecretName([string]$name) { return "$PREFIX-" + (($name -replace '_','-').ToLower()) }

function Assert-LastExit([string]$msg) {
  if ($LASTEXITCODE -ne 0) { Write-Error $msg; exit 1 }
}

# put_secret + register in the --set-secrets flag. The value is written to a temp
# file (NOT piped) so no trailing newline is appended — a stray newline would
# corrupt the secret exactly like a stray CR would.
function Add-Secret([string]$envName, [string]$val) {
  if ([string]::IsNullOrEmpty($val)) { Write-Host "  - skip $envName (empty)"; return }
  $name = Get-SecretName $envName
  gcloud secrets describe $name --project=$PROJECT 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    gcloud secrets create $name --replication-policy=automatic --project=$PROJECT | Out-Null
    Assert-LastExit "Failed to create secret $name"
  }
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $val, (New-Object System.Text.UTF8Encoding($false)))
    gcloud secrets versions add $name --data-file=$tmp --project=$PROJECT | Out-Null
    Assert-LastExit "Failed to add version to secret $name"
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
  Write-Host "  - set $name"
  $script:SecretsFlag += "${envName}=${name}:latest"
}

Write-Host "=== 0. Enable APIs =========================================================="
gcloud services enable run.googleapis.com cloudbuild.googleapis.com sqladmin.googleapis.com `
  secretmanager.googleapis.com cloudscheduler.googleapis.com containerregistry.googleapis.com `
  --project=$PROJECT
Assert-LastExit "Failed to enable APIs"

Write-Host "=== 1. Container Registry (gcr.io - no repo to create) ======================"
# gcr.io is GCS-backed: the storage bucket is created automatically on the first
# image push (Cloud Build, step 5), so there's nothing to provision here.

Write-Host "=== 2. Cloud SQL instance + database + user ================================="
gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gcloud sql instances create $SQL_INSTANCE --database-version=POSTGRES_16 `
    --tier=$SQL_TIER --edition=ENTERPRISE --region=$REGION --project=$PROJECT
  Assert-LastExit "Failed to create Cloud SQL instance"
}
gcloud sql databases describe $SQL_DB --instance=$SQL_INSTANCE --project=$PROJECT 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gcloud sql databases create $SQL_DB --instance=$SQL_INSTANCE --project=$PROJECT
  Assert-LastExit "Failed to create database"
}

# DB password: generated once, saved locally (KEEP THIS FILE SAFE, it's gitignored).
if (Test-Path $PW_FILE) {
  $DB_PASS = (Get-Content -Raw $PW_FILE).Trim()
} else {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $DB_PASS = ([Convert]::ToBase64String($bytes) -replace '[/+=]','')
  Set-Content -Path $PW_FILE -Value $DB_PASS -NoNewline -Encoding ascii
}
gcloud sql users describe $SQL_USER --instance=$SQL_INSTANCE --project=$PROJECT 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gcloud sql users create $SQL_USER --instance=$SQL_INSTANCE --password=$DB_PASS --project=$PROJECT
  Assert-LastExit "Failed to create database user"
}

$CONN = "${PROJECT}:${REGION}:${SQL_INSTANCE}"   # Cloud SQL connection name
# DATABASE_URL for the Cloud SQL unix socket (consumed by the db.js socket branch):
$DATABASE_URL = "postgresql://${SQL_USER}:${DB_PASS}@/${SQL_DB}?host=/cloudsql/${CONN}"

Write-Host "=== 3. Secret Manager (all env vars) ========================================"
Add-Secret "DATABASE_URL"          $DATABASE_URL              # Cloud SQL (NOT the Supabase URL from .env)
# Storage stays on Supabase - these remain required:
Add-Secret "SUPABASE_URL"          (EnvVal "SUPABASE_URL")
Add-Secret "SUPABASE_SERVICE_KEY"  (EnvVal "SUPABASE_SERVICE_KEY")
# AI providers
Add-Secret "OPENAI_API_KEY"        (EnvVal "OPENAI_API_KEY")
Add-Secret "OPENAI_MODEL"          (EnvVal "OPENAI_MODEL")
Add-Secret "OPENAI_SEARCH_MODEL"   (EnvVal "OPENAI_SEARCH_MODEL")
Add-Secret "ANTHROPIC_API_KEY"     (EnvVal "ANTHROPIC_API_KEY")
Add-Secret "ANTHROPIC_MODEL"       (EnvVal "ANTHROPIC_MODEL")
# Email
Add-Secret "RESEND_API_KEY"        (EnvVal "RESEND_API_KEY")
Add-Secret "EMAIL_FROM"            (EnvVal "EMAIL_FROM")
# Auth / admin / cron
Add-Secret "SUPER_ADMIN_KEY"       (EnvVal "SUPER_ADMIN_KEY")
Add-Secret "CRON_SECRET"           (EnvVal "CRON_SECRET")
# Google Calendar OAuth
Add-Secret "GOOGLE_CLIENT_ID"      (EnvVal "GOOGLE_CLIENT_ID")
Add-Secret "GOOGLE_CLIENT_SECRET"  (EnvVal "GOOGLE_CLIENT_SECRET")
# Playwright autofill service (already on Cloud Run; reference by URL+secret)
Add-Secret "PLAYWRIGHT_SERVICE_URL" (EnvVal "PLAYWRIGHT_SERVICE_URL")
Add-Secret "PLAYWRIGHT_SECRET"      (EnvVal "PLAYWRIGHT_SECRET")
# Scraper
Add-Secret "IATI_API_KEY"          (EnvVal "IATI_API_KEY")
# URL-dependent vars (APP_URL / CORS_ORIGIN / GOOGLE_REDIRECT_URI) are set in Phase 2
# below, after the first deploy assigns the run.app URL.

Write-Host "=== 4. Runtime service account + IAM ========================================"
gcloud iam service-accounts describe $RUNTIME_SA --project=$PROJECT 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  gcloud iam service-accounts create "$PREFIX-run" --display-name="Grant Engine Cloud Run" --project=$PROJECT
  Assert-LastExit "Failed to create runtime service account"
}
foreach ($role in @("roles/cloudsql.client", "roles/secretmanager.secretAccessor")) {
  gcloud projects add-iam-policy-binding $PROJECT `
    --member="serviceAccount:$RUNTIME_SA" --role=$role --condition=None | Out-Null
  Assert-LastExit "Failed to bind $role"
}

Write-Host "=== 5. Build image (Cloud Build) ============================================"
gcloud builds submit --tag $IMAGE --project=$PROJECT .
Assert-LastExit "Cloud Build failed"

Write-Host "=== 6. Deploy to Cloud Run =================================================="
$SecretsString = ($script:SecretsFlag -join ",")
gcloud run deploy $SERVICE `
  --image=$IMAGE --region=$REGION --project=$PROJECT `
  --service-account=$RUNTIME_SA `
  --add-cloudsql-instances=$CONN `
  "--set-secrets=$SecretsString" `
  --memory=1Gi --cpu=1 --timeout=600 --min-instances=0 --max-instances=10 `
  --allow-unauthenticated
Assert-LastExit "Cloud Run deploy failed"

$RUN_URL = (gcloud run services describe $SERVICE --region=$REGION --project=$PROJECT '--format=value(status.url)')
$RUN_URL = ("$RUN_URL").Trim()
Write-Host "Service URL: $RUN_URL"

Write-Host "=== 7. Set URL-dependent secrets + redeploy ================================="
Add-Secret "APP_URL"             $RUN_URL
Add-Secret "CORS_ORIGIN"         $RUN_URL
Add-Secret "GOOGLE_REDIRECT_URI" "$RUN_URL/api/auth/google/callback"
# Re-apply the full secret set (now incl. the URL vars) without rebuilding the image:
$SecretsString = ($script:SecretsFlag -join ",")
gcloud run services update $SERVICE --region=$REGION --project=$PROJECT "--set-secrets=$SecretsString"
Assert-LastExit "Cloud Run update failed"

Write-Host "=== 8. Cloud Scheduler -> cron endpoints (Bearer CRON_SECRET) ==============="
# The /api/cron/* routes are CRON_SECRET-gated, so the scheduler just sends the
# bearer header (no OIDC needed; the service is public but the routes are gated).
$CRON_SECRET = EnvVal "CRON_SECRET"
function New-SchedulerJob([string]$name, [string]$schedule, [string]$path) {
  gcloud scheduler jobs describe $name --location=$REGION --project=$PROJECT 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $verb = "update" } else { $verb = "create" }
  # `create` takes --headers; `update` takes --update-headers (different flag).
  if ($verb -eq "update") { $hdrFlag = "--update-headers" } else { $hdrFlag = "--headers" }
  gcloud scheduler jobs $verb http $name --location=$REGION --project=$PROJECT `
    --schedule=$schedule --time-zone=$TZ_SCHED --uri="$RUN_URL$path" --http-method=POST `
    "$hdrFlag=Authorization=Bearer $CRON_SECRET"
  Assert-LastExit "Failed to $verb scheduler job $name"
}
New-SchedulerJob "$PREFIX-scout"     "0 0 * * *"    "/api/cron/scout"       # nightly 00:00 SAST
New-SchedulerJob "$PREFIX-reminders" "*/30 * * * *" "/api/cron/reminders"   # every 30 min

Write-Host ""
Write-Host "============================================================================"
Write-Host "DONE. App: $RUN_URL"
Write-Host "MANUAL FOLLOW-UPS:"
Write-Host "  1. Add this redirect URI in the Google Cloud OAuth consent / credentials:"
Write-Host "       $RUN_URL/api/auth/google/callback"
Write-Host "  2. First boot auto-runs schema + seeds the d-lab org (check Cloud Run logs)."
Write-Host "  3. Verify:  curl $RUN_URL/api/health   ->  {""ok"":true,""dbConnected"":true}"
Write-Host "  4. DB password saved at $PW_FILE (keep it; it's gitignored)."
Write-Host "  5. Test a scheduler job once:"
Write-Host "       gcloud scheduler jobs run $PREFIX-scout --location=$REGION --project=$PROJECT"
Write-Host "============================================================================"
