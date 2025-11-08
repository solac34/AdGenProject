#!/bin/bash

# AdGen Agents Cloud Run Deployment Script using ADK CLI
# This script deploys the AdGen Agents using the adk deploy command

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
APP_NAME="agents"

echo -e "${BLUE}🚀 AdGen Agents Cloud Run Deployment (ADK CLI)${NC}"
echo "=============================================="
echo -e "${GREEN}🔧 Includes credential fixes for Cloud Run compatibility${NC}"

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
echo "   App Name: $APP_NAME"
echo ""

# Check if adk CLI is installed
if ! command -v adk &> /dev/null; then
    echo -e "${RED}❌ Error: adk CLI is not installed${NC}"
    echo "Please install it with: pip install google-adk"
    exit 1
fi

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

# Deploy using ADK CLI
echo -e "${BLUE}🚀 Deploying with ADK CLI...${NC}"
# Note: We deploy the entire Agents directory so MasterAgent can access DataAnalyticAgent and CreativeAgent
# Using the directory name as app_name to avoid path issues
adk deploy cloud_run \
    --project=$PROJECT_ID \
    --region=$REGION \
    --service_name=$SERVICE_NAME \
    --app_name="agents" \
    --with_ui \
    .

# # Mount secrets after deployment
# echo -e "${BLUE}🔐 Mounting service account secrets...${NC}"
# gcloud run services update $SERVICE_NAME \
#     --region=$REGION \
#     --update-secrets=/secrets/bigquery-key.json=bigquery-service-account-key:latest \
#     --update-secrets=/secrets/vertex-ai-key.json=vertex-ai-service-account-key:latest \
#     --set-env-vars="GOOGLE_APPLICATION_CREDENTIALS_BQ=/secrets/bigquery-key.json" \
#     --set-env-vars="GOOGLE_APPLICATION_CREDENTIALS_AI=/secrets/vertex-ai-key.json"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)' 2>/dev/null || echo "Unable to get URL")

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
if [ "$SERVICE_URL" != "Unable to get URL" ]; then
    echo -e "${GREEN}🌐 Service URL: ${SERVICE_URL}${NC}"
    echo -e "${GREEN}🖥️  UI URL: ${SERVICE_URL}/ui${NC}"
fi

echo ""
echo -e "${BLUE}💡 Applied credential fixes:${NC}"
echo "   ✅ Removed file-based credential loading in Cloud Run"
echo "   ✅ Prioritized environment-based service account JSON"
echo "   ✅ Added fallback to default Cloud Run service account (ADC)"
echo "   ✅ Clear invalid GOOGLE_APPLICATION_CREDENTIALS paths"

echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Test your agent at the service URL"
echo "2. Use the UI to interact with your agents"
echo "3. Check logs with: gcloud logs tail --service=${SERVICE_NAME} --region=${REGION}"
echo ""
echo -e "${BLUE}🔍 Useful commands:${NC}"
echo "   View service: gcloud run services describe ${SERVICE_NAME} --region=${REGION}"
echo "   View logs: gcloud logs tail --service=${SERVICE_NAME} --region=${REGION}"
echo "   Delete service: gcloud run services delete ${SERVICE_NAME} --region=${REGION}"
