#!/bin/bash

# AdGen Agents Pub/Sub Setup Script
# This script creates Pub/Sub topics and subscriptions for AdGen Agents

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
TOPIC_NAME="adgen-trigger"
SUBSCRIPTION_NAME="adgen-trigger-sub"
PUSH_ENDPOINT_PATH="/pubsub/push"

echo -e "${BLUE}🔔 AdGen Agents Pub/Sub Setup${NC}"
echo "=================================="

# Check if required tools are installed
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

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "   Project ID: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Service Name: $SERVICE_NAME"
echo "   Topic Name: $TOPIC_NAME"
echo "   Subscription Name: $SUBSCRIPTION_NAME"
echo ""

# Get the service URL
echo -e "${BLUE}🔍 Getting Cloud Run service URL...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)' 2>/dev/null || echo "")

if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}❌ Error: Could not find Cloud Run service '$SERVICE_NAME' in region '$REGION'${NC}"
    echo "Please make sure the service is deployed first using deploy-adk.sh"
    exit 1
fi

PUSH_ENDPOINT="${SERVICE_URL}${PUSH_ENDPOINT_PATH}"
echo -e "${GREEN}✅ Service URL: $SERVICE_URL${NC}"
echo -e "${GREEN}🔔 Push Endpoint: $PUSH_ENDPOINT${NC}"
echo ""

# Enable required APIs
echo -e "${BLUE}🔧 Enabling required APIs...${NC}"
gcloud services enable pubsub.googleapis.com
gcloud services enable run.googleapis.com

# Create Pub/Sub topic if it doesn't exist
echo -e "${BLUE}📝 Creating Pub/Sub topic...${NC}"
if gcloud pubsub topics describe $TOPIC_NAME &>/dev/null; then
    echo -e "${YELLOW}⚠️  Topic '$TOPIC_NAME' already exists${NC}"
else
    gcloud pubsub topics create $TOPIC_NAME
    echo -e "${GREEN}✅ Topic '$TOPIC_NAME' created${NC}"
fi

# Delete existing subscription if it exists (to update push endpoint)
echo -e "${BLUE}🔄 Checking existing subscription...${NC}"
if gcloud pubsub subscriptions describe $SUBSCRIPTION_NAME &>/dev/null; then
    echo -e "${YELLOW}⚠️  Deleting existing subscription '$SUBSCRIPTION_NAME' to update endpoint${NC}"
    gcloud pubsub subscriptions delete $SUBSCRIPTION_NAME
fi

# Create push subscription
echo -e "${BLUE}📝 Creating push subscription...${NC}"
gcloud pubsub subscriptions create $SUBSCRIPTION_NAME \
    --topic=$TOPIC_NAME \
    --push-endpoint=$PUSH_ENDPOINT \
    --ack-deadline=600

echo -e "${GREEN}✅ Push subscription '$SUBSCRIPTION_NAME' created${NC}"

# Grant Pub/Sub service account permission to invoke Cloud Run
echo -e "${BLUE}🔐 Setting up IAM permissions...${NC}"

# Get the Pub/Sub service account
PUBSUB_SERVICE_ACCOUNT="service-$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@gcp-sa-pubsub.iam.gserviceaccount.com"

# Grant Cloud Run Invoker role to Pub/Sub service account
gcloud run services add-iam-policy-binding $SERVICE_NAME \
    --region=$REGION \
    --member="serviceAccount:$PUBSUB_SERVICE_ACCOUNT" \
    --role="roles/run.invoker"

echo -e "${GREEN}✅ IAM permissions configured${NC}"

# Test the setup
echo ""
echo -e "${BLUE}🧪 Testing the setup...${NC}"

# Publish a test message
TEST_MESSAGE='{"task": "test", "message": "Hello from Pub/Sub setup script!"}'
echo -e "${YELLOW}📤 Publishing test message...${NC}"
echo "$TEST_MESSAGE" | gcloud pubsub topics publish $TOPIC_NAME --message=-

echo -e "${GREEN}✅ Test message published${NC}"
echo ""

# Display summary
echo -e "${GREEN}🎉 Pub/Sub setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Summary:${NC}"
echo "   ✅ Topic: $TOPIC_NAME"
echo "   ✅ Subscription: $SUBSCRIPTION_NAME"
echo "   ✅ Push Endpoint: $PUSH_ENDPOINT"
echo "   ✅ IAM Permissions: Configured"
echo "   ✅ Test Message: Sent"
echo ""

echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Check Cloud Run logs to see if the test message was processed:"
echo "   gcloud logs tail --service=$SERVICE_NAME --region=$REGION"
echo ""
echo "2. Publish messages to trigger your agents:"
echo "   echo 'Do your task' | gcloud pubsub topics publish $TOPIC_NAME --message=-"
echo ""
echo "3. For structured messages:"
echo '   echo '"'"'{"task": "segmentation", "message": "Run user segmentation"}'"'"' | gcloud pubsub topics publish '$TOPIC_NAME' --message=-'
echo ""

echo -e "${BLUE}🔍 Useful commands:${NC}"
echo "   List topics: gcloud pubsub topics list"
echo "   List subscriptions: gcloud pubsub subscriptions list"
echo "   Delete topic: gcloud pubsub topics delete $TOPIC_NAME"
echo "   Delete subscription: gcloud pubsub subscriptions delete $SUBSCRIPTION_NAME"
echo "   View logs: gcloud logs tail --service=$SERVICE_NAME --region=$REGION"
echo ""

echo -e "${GREEN}🚀 Your AdGen Agents are now ready to receive Pub/Sub messages!${NC}"
