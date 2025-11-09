#!/bin/bash

# AdGen Agents Cloud Run Deployment Script (Standard Docker)
# This script deploys Flask HTTP API for MasterAgent

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="eighth-upgrade-475017-u5"
REGION="us-central1"
SERVICE_NAME="adgen-agents"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

WEBAPP_BASE_URL="${WEBAPP_BASE_URL:-https://adgen-webapp-gcojamrsfq-uc.a.run.app}"
WEBHOOK_URL="${WEBHOOK_URL:-${WEBAPP_BASE_URL}/api/agent-events}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-change-me}"
AGENTS_API_TOKEN="${AGENTS_API_TOKEN:-change-me}"
echo -e "${BLUE}🚀 AdGen Agents Cloud Run Deployment${NC}"
echo "=========================================="
echo -e "${GREEN}📡 HTTP API with InMemoryRunner${NC}"

# Check if required tools are installed
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${RED}❌ Error: Not authenticated with gcloud${NC}"
    echo "Please run: gcloud auth login"
    exit 1
fi

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "   Project ID: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Service Name: $SERVICE_NAME"
echo "   Image: $IMAGE_NAME"
echo ""

# Set the project
echo -e "${BLUE}🔧 Setting up gcloud configuration...${NC}"
gcloud config set project $PROJECT_ID

# Build and push using Cloud Build (no local Docker required!)
echo -e "${BLUE}🔨 Building Docker image with Cloud Build...${NC}"
echo -e "${YELLOW}   (This builds in the cloud - no local Docker needed!)${NC}"
gcloud builds submit --tag $IMAGE_NAME:latest .

# Deploy to Cloud Run
echo -e "${BLUE}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_NAME:latest \
    --platform=managed \
    --region=$REGION \
    --allow-unauthenticated \
    --port=8080 \
    --memory=2Gi \
    --cpu=2 \
    --timeout=3600 \
    --max-instances=10 \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
    --set-env-vars="GOOGLE_CLOUD_LOCATION=${REGION}" \
    --set-env-vars="GOOGLE_GENAI_USE_VERTEXAI=True" \
    --set-env-vars="BQ_DATASET=adgen_bq" \
    --set-env-vars="BQ_LOCATION=US" \
    --set-env-vars="FIRESTORE_DATABASE=(default)" \
    --set-env-vars="WEBHOOK_URL=${WEBHOOK_URL}" \
    --set-env-vars="WEBHOOK_SECRET=${WEBHOOK_SECRET}" \
    --set-env-vars="AGENTS_API_TOKEN=${AGENTS_API_TOKEN}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --platform=managed \
    --region=$REGION \
    --format='value(status.url)' 2>/dev/null || echo "Unable to get URL")

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo -e "${GREEN}🌐 Service URL: ${SERVICE_URL}${NC}"
echo ""
echo -e "${BLUE}📡 Available Endpoints:${NC}"
echo -e "   ${GREEN}GET${NC}  ${SERVICE_URL}/"
echo -e "   ${GREEN}GET${NC}  ${SERVICE_URL}/health"
echo -e "   ${GREEN}POST${NC} ${SERVICE_URL}/run"
echo -e "   ${GREEN}POST${NC} ${SERVICE_URL}/pubsub/push"
echo ""
echo -e "${BLUE}🧪 Test with curl:${NC}"
echo ""
echo -e "${YELLOW}# Health check${NC}"
echo "curl ${SERVICE_URL}/health"
echo ""
echo -e "${YELLOW}# Run agent${NC}"
echo "curl -X POST ${SERVICE_URL}/run \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"prompt\": \"Do your segmentation task.\", \"max_rounds\": 8}'"
echo ""
echo -e "${BLUE}📮 Postman Configuration:${NC}"
echo "   Method: POST"
echo "   URL: ${SERVICE_URL}/run"
echo "   Headers: Content-Type: application/json"
echo "   Body (raw JSON):"
echo "   {"
echo "     \"prompt\": \"Do your segmentation task.\","
echo "     \"max_rounds\": 8"
echo "   }"
echo ""
echo -e "${BLUE}🔍 Useful commands:${NC}"
echo "   View logs:    gcloud logs tail --service=${SERVICE_NAME} --region=${REGION}"
echo "   View service: gcloud run services describe ${SERVICE_NAME} --region=${REGION}"
echo "   Delete:       gcloud run services delete ${SERVICE_NAME} --region=${REGION}"
echo ""
echo -e "${GREEN}✨ Your HTTP API is ready to use!${NC}"

