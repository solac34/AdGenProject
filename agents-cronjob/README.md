# Agents Cronjob (Functions Framework)

HTTP-triggered cron job that calls the AdGen Agents service `/run` endpoint on a schedule.

## What it does
- Exposes a single HTTP function `cronjob`
- When invoked (by Cloud Scheduler or manually), it sends a POST to the Agents service:
  - URL: `${AGENTS_SERVICE_URL}/run`
  - Body: `{"prompt": AGENTS_PROMPT, "max_rounds": AGENTS_MAX_ROUNDS}`
  - Optional `Authorization: Bearer ${AGENTS_API_TOKEN}` header if token is set
  - Adds `X-Run-Id` header like `cron-YYYYMMDDHHMMSS`

## Configuration
Set the following env vars (in Cloud Run/Functions or locally):

- `AGENTS_SERVICE_URL` (required): Base URL of the Agents service, e.g.
  `https://adgen-agents-710876076445.us-central1.run.app`
- `AGENTS_API_TOKEN` (optional): Token for Authorization header (Bearer). If omitted, no auth header is set.
- `AGENTS_PROMPT` (optional): Prompt sent to `/run`. Default: `Do your segmentation task.`
- `AGENTS_MAX_ROUNDS` (optional): Max rounds. Default: `8`
- `REQUEST_TIMEOUT_SECONDS` (optional): HTTP timeout. Default: `60`

## Local run

```bash
cd agents-cronjob
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set env (adjust as needed)
export AGENTS_SERVICE_URL="https://adgen-agents-710876076445.us-central1.run.app"
# export AGENTS_API_TOKEN="your-token"
export AGENTS_PROMPT="Do your segmentation task."
export AGENTS_MAX_ROUNDS="8"

# Start the function locally
functions-framework --target=cronjob --port=8081
```

Invoke locally:

```bash
curl -X POST "http://localhost:8081/"
```

## Deploy to Cloud Run
Deploy this as a Cloud Run service (uses functions framework entrypoint):

```bash
gcloud run deploy adgen-agents-cron \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars AGENTS_SERVICE_URL="https://adgen-agents-710876076445.us-central1.run.app" \
  --set-env-vars AGENTS_PROMPT="Do your segmentation task." \
  --set-env-vars AGENTS_MAX_ROUNDS="8"
# Add --set-env-vars AGENTS_API_TOKEN="YOUR_TOKEN" if your Agents service requires it
```

## Schedule with Cloud Scheduler
Once deployed, create a scheduler job to hit the Cloud Run URL on a cron schedule:

```bash
gcloud scheduler jobs create http adgen-agents-cron-job \
  --schedule="*/15 * * * *" \
  --uri="https://YOUR_CLOUD_RUN_URL" \
  --http-method=POST \
  --oidc-service-account-email="YOUR_SA@YOUR_PROJECT.iam.gserviceaccount.com"
```

- Adjust the `--schedule` as needed (above is every 15 minutes).
- Prefer OIDC authentication with a service account that has permission to invoke your Cloud Run service.

## Notes
- If `AGENTS_SERVICE_URL` already ends with `/run`, it will be used as-is; otherwise `/run` is appended.
- The target Agents service is implemented in `Agents/main.py` and accepts:
  - Headers: optional `Authorization: Bearer <token>`, `X-Run-Id`
  - Body: `{"prompt": "...", "max_rounds": 8}`


