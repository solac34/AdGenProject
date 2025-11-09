#!/usr/bin/env bash
set -euo pipefail

# Simple deploy script for the cronjob function running on Cloud Run (functions-framework).
# Usage:
#   ./deploy.sh <GCP_PROJECT_ID> <REGION> [SERVICE_NAME]
#
# Example:
#   ./deploy.sh my-proj us-central1 adgen-agents-cron
#
# Required env vars to set (or add via --set-env-vars):
#   AGENTS_SERVICE_URL="https://adgen-agents-710876076445.us-central1.run.app"
# Optional:
#   AGENTS_API_TOKEN, AGENTS_PROMPT, AGENTS_MAX_ROUNDS, REQUEST_TIMEOUT_SECONDS
#

PROJECT_ID="eighth-upgrade-475017-u5"
REGION="us-central1"
SERVICE_NAME="adgen-agents-cron"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Usage: $0 <GCP_PROJECT_ID> <REGION> [SERVICE_NAME]"
  exit 1
fi

gcloud config set project "${PROJECT_ID}"

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \

echo "Deployed ${SERVICE_NAME} to ${REGION} in project ${PROJECT_ID}"
echo "Configuring Cloud Scheduler to invoke this service hourly..."

# Resolve the deployed Cloud Run service URL
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')"
if [[ -z "${SERVICE_URL}" ]]; then
  echo "Failed to resolve Cloud Run service URL for ${SERVICE_NAME}"
  exit 1
fi

# Scheduler settings (hourly)
SCHEDULE="0 * * * *" # every hour at minute 0
SCHEDULER_JOB_NAME="${SERVICE_NAME}-hourly"
# Service account used by Cloud Scheduler for OIDC auth; override with SCHEDULER_SERVICE_ACCOUNT if needed
SCHEDULER_SA="${SCHEDULER_SERVICE_ACCOUNT:-${PROJECT_ID}@appspot.gserviceaccount.com}"

# Create or update the scheduler job
if gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${SCHEDULER_JOB_NAME}" \
    --location "${REGION}" \
    --schedule "${SCHEDULE}" \
    --uri "${SERVICE_URL}" \
    --http-method POST \
    --oidc-service-account-email "${SCHEDULER_SA}"
  echo "Updated Cloud Scheduler job '${SCHEDULER_JOB_NAME}' (${SCHEDULE}) -> ${SERVICE_URL}"
else
  gcloud scheduler jobs create http "${SCHEDULER_JOB_NAME}" \
    --location "${REGION}" \
    --schedule "${SCHEDULE}" \
    --uri "${SERVICE_URL}" \
    --http-method POST \
    --oidc-service-account-email "${SCHEDULER_SA}"
  echo "Created Cloud Scheduler job '${SCHEDULER_JOB_NAME}' (${SCHEDULE}) -> ${SERVICE_URL}"
fi


