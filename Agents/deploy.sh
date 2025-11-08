#!/bin/bash

# AdGen Agents Cloud Run Deployment Script
# This script deploys the AdGen Agents to Google Cloud Run

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-adgen-agents}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo -e "${BLUE}🚀 AdGen Agents Cloud Run Deployment${NC}"
echo "=================================="

# Check if required environment variables are set
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ Error: GOOGLE_CLOUD_PROJECT environment variable is not set${NC}"
    echo "Please set it with: export GOOGLE_CLOUD_PROJECT=your-project-id"
    exit 1
fi

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "   Project ID: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Service Name: $SERVICE_NAME"
echo "   Image: $IMAGE_NAME"
echo ""

# Check if gcloud is installed and authenticated
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

# Set the project
echo -e "${BLUE}🔧 Setting up gcloud configuration...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${BLUE}🔌 Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build the Docker image
echo -e "${BLUE}🏗️  Building Docker image...${NC}"
gcloud builds submit --tag $IMAGE_NAME .

# Deploy to Cloud Run
echo -e "${BLUE}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 1 \
    --timeout 3600 \
    --concurrency 80 \
    --max-instances 10 \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
    --set-env-vars "GOOGLE_CLOUD_LOCATION=${REGION}" \
    --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=True" \
    --set-env-vars "PORT=8080"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 Service URL: ${SERVICE_URL}${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Test your agent at: ${SERVICE_URL}"
echo "2. Check logs with: gcloud logs tail --service=${SERVICE_NAME}"
echo "3. Update service with: gcloud run services update ${SERVICE_NAME} --region=${REGION}"
echo ""
echo -e "${BLUE}🔍 Useful commands:${NC}"
echo "   View service: gcloud run services describe ${SERVICE_NAME} --region=${REGION}"
echo "   View logs: gcloud logs tail --service=${SERVICE_NAME}"
echo "   Delete service: gcloud run services delete ${SERVICE_NAME} --region=${REGION}"
