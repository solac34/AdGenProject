#!/bin/bash

# AdGen E-commerce Cloud Run Deployment Script
# Simple deployment for Next.js application

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
SERVICE_NAME="adgen-ecommerce"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo -e "${BLUE}🚀 AdGen E-commerce Cloud Run Deployment${NC}"
echo "========================================="

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

# Build the Docker image for AMD64 platform and push
echo -e "${BLUE}🏗️  Building Docker image for AMD64 platform...${NC}"
docker buildx build --platform linux/amd64 -t $IMAGE_NAME . --push

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
    --set-env-vars "NODE_ENV=production"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}🌐 E-commerce URL: ${SERVICE_URL}${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Visit your e-commerce site: ${SERVICE_URL}"
echo "2. Check logs: gcloud logs tail --service=${SERVICE_NAME}"
echo "3. Monitor performance in Cloud Console"
echo ""
echo -e "${BLUE}🔍 Useful commands:${NC}"
echo "   View service: gcloud run services describe ${SERVICE_NAME} --region=${REGION}"
echo "   View logs: gcloud logs tail --service=${SERVICE_NAME}"
echo "   Delete service: gcloud run services delete ${SERVICE_NAME} --region=${REGION}"
