# Playwright Service — Grants Engine Auto-Fill

Standalone Node.js service that uses Playwright + Chromium to auto-fill online grant application forms. Deployed separately on Google Cloud Run.

## What it does

1. Receives form-fill jobs from the main Grants Engine (Vercel)
2. Opens a headless Chromium browser
3. Navigates to the funder's application URL
4. Logs in (if credentials provided)
5. Fills form fields with values from the user's proposal
6. Takes screenshots and uploads to Supabase
7. Waits for user approval before final submission
8. Submits only when the user clicks "Submit application"

## Endpoints

- `GET /health` — health check (no auth)
- `POST /fill` — fill form, return screenshots, keep session open 15 min
- `POST /submit` — click final submit on an open session
- `POST /cancel` — close a session without submitting

All endpoints except `/health` require `X-Service-Key` header matching `PLAYWRIGHT_SECRET`.

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | no (default 8080) | Cloud Run sets this |
| `PLAYWRIGHT_SECRET` | yes | Shared secret with main app |
| `SUPABASE_URL` | yes | For uploading screenshots |
| `SUPABASE_SERVICE_KEY` | yes | Supabase service role key |

## Local development

```bash
cd playwright-service
npm install
npx playwright install chromium
PLAYWRIGHT_SECRET=dev-secret node server.js
```

Test with:
```bash
curl http://localhost:8080/health
```

## Deploy to Google Cloud Run

### Prerequisites

1. `gcloud` CLI installed and logged in (`gcloud auth login`)
2. Project selected: `gcloud config set project grants-engine-493122`
3. APIs enabled:
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```
4. Billing enabled on the project with a budget cap (see main README)

### Build and deploy

```bash
cd playwright-service

# Build image via Cloud Build (no local Docker needed)
gcloud builds submit --tag gcr.io/grants-engine-493122/playwright-service

# Deploy to Cloud Run
gcloud run deploy playwright-service \
  --image gcr.io/grants-engine-493122/playwright-service \
  --region us-central1 \
  --platform managed \
  --memory 2Gi \
  --cpu 1 \
  --timeout 600 \
  --max-instances 5 \
  --min-instances 0 \
  --allow-unauthenticated \
  --set-env-vars PLAYWRIGHT_SECRET=YOUR_SECRET_HERE,SUPABASE_URL=https://xxx.supabase.co,SUPABASE_SERVICE_KEY=xxx
```

After deploy, `gcloud` prints a service URL like `https://playwright-service-xxxx.a.run.app`.

### Wire into main app

Add to Vercel environment variables:
- `PLAYWRIGHT_SERVICE_URL=https://playwright-service-xxxx.a.run.app`
- `PLAYWRIGHT_SECRET=YOUR_SECRET_HERE` (same value as on Cloud Run)

## Cost control

- **Max instances: 5** — caps runaway scaling
- **Min instances: 0** — scales to zero when idle (pays nothing)
- **Timeout: 600s** — individual requests can't run longer than 10 min
- **Memory: 2Gi** — just enough for Chromium

Set a $5 budget alert in Google Cloud Billing to be safe.

## Security notes

- Credentials are passed per-session in request body — never stored
- Sessions auto-expire after 15 minutes
- Service is behind a shared secret
- Only the main Vercel app should have the secret
