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

PROJECT_ID="${1:-}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-adgen-agents-cron}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Usage: $0 <GCP_PROJECT_ID> <REGION> [SERVICE_NAME]"
  exit 1
fi

gcloud config set project "${PROJECT_ID}"

gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "AGENTS_SERVICE_URL=${AGENTS_SERVICE_URL:-https://adgen-agents-710876076445.us-central1.run.app}" \
  --set-env-vars "AGENTS_PROMPT=${AGENTS_PROMPT:-Do your segmentation task.}" \
  --set-env-vars "AGENTS_MAX_ROUNDS=${AGENTS_MAX_ROUNDS:-8}"

echo "Deployed ${SERVICE_NAME} to ${REGION} in project ${PROJECT_ID}"
echo "Remember to create a Cloud Scheduler job to invoke this service on your desired schedule."


