#!/bin/bash

# AdGen WebApp Cloud Run Deployment Script
# Deployment for Next.js dashboard application

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
SERVICE_NAME="adgen-webapp"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

WEBHOOK_SECRET="${WEBHOOK_SECRET:-change-me}"
AGENTS_SERVICE_URL="${AGENTS_SERVICE_URL:-https://adgen-agents-710876076445.us-central1.run.app/run}"
AGENTS_API_TOKEN="${AGENTS_API_TOKEN:-change-me}"

echo -e "${BLUE}🚀 AdGen WebApp Cloud Run Deployment${NC}"
echo "====================================="

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "   Project ID: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Service Name: $SERVICE_NAME"
echo "   Image: $IMAGE_NAME"
echo ""

# Check if gcloud is installed and authenticated
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
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
gcloud services enable storage.googleapis.com

# Create Cloud Build bucket if it doesn't exist
BUCKET_NAME="${PROJECT_ID}_cloudbuild"
echo -e "${BLUE}🪣 Setting up Cloud Build storage...${NC}"
if ! gsutil ls -b gs://$BUCKET_NAME &>/dev/null; then
    gsutil mb gs://$BUCKET_NAME
fi

# Build the Docker image using Google Cloud Build
echo -e "${BLUE}🏗️  Building Docker image with Google Cloud Build...${NC}"
gcloud builds submit --tag $IMAGE_NAME .

# Deploy to Cloud Run
echo -e "${BLUE}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 8080 \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300 \
    --concurrency 100 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},WEBHOOK_SECRET=${WEBHOOK_SECRET},AGENTS_SERVICE_URL=${AGENTS_SERVICE_URL},AGENTS_API_TOKEN=${AGENTS_API_TOKEN}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 AdGen WebApp URL: ${SERVICE_URL}${NC}"
echo ""
echo -e "${BLUE}📊 Dashboard Features:${NC}"
echo "   ✅ Agent Settings Management"
echo "   ✅ Segmentation Analytics"
echo "   ✅ Job Monitoring"
echo "   ✅ Real-time Charts"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Visit your dashboard: ${SERVICE_URL}"
echo "2. Configure agent settings"
echo "3. Monitor segmentation jobs"
echo "4. Check logs: gcloud logs tail --service=${SERVICE_NAME}"
echo ""
echo -e "${BLUE}🔍 Useful commands:${NC}"
echo "   View service: gcloud run services describe ${SERVICE_NAME} --region=${REGION}"
echo "   View logs: gcloud logs tail --service=${SERVICE_NAME}"
echo "   Delete service: gcloud run services delete ${SERVICE_NAME} --region=${REGION}"
echo ""
echo -e "${GREEN}🎉 Your AdGen Dashboard is now live!${NC}"
