# AdGen Agents Cloud Run Deployment Guide

This guide explains how to deploy the AdGen Agents (MasterAgent with DataAnalyticAgent and CreativeAgent) to Google Cloud Run.

## 🏗️ Project Structure

```
Agents/
├── MasterAgent/           # Root agent that orchestrates everything
│   ├── __init__.py       # Exports root_agent
│   ├── agent.py          # MasterAgent implementation
│   └── firestore_helper.py
├── DataAnalyticAgent/     # Sub-agent for BigQuery/Firestore operations
│   ├── __init__.py
│   ├── agent.py          # DataAnalyticAgent implementation
│   └── bq_helper.py      # BigQuery utilities
├── CreativeAgent/         # Sub-agent for content creation
│   ├── __init__.py
│   └── agent.py          # CreativeAgent implementation
├── main.py               # Cloud Run entry point
├── config.py             # Configuration management
├── requirements.txt      # Python dependencies
├── Dockerfile           # Container definition
├── deploy.sh            # Docker-based deployment script
├── deploy-adk.sh        # ADK CLI deployment script
└── .dockerignore        # Docker ignore rules
```

## 🚀 Deployment Options

You have two deployment options:

### Option 1: ADK CLI Deployment (Recommended)

The ADK CLI provides the simplest deployment experience. It deploys the entire Agents directory so that MasterAgent can access all sub-agents:

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
export SERVICE_NAME="adgen-agents"

# Run the deployment script
./deploy-adk.sh
```

**How it works:**
- Deploys the entire `Agents/` directory as a single Cloud Run service
- MasterAgent serves as the root agent with DataAnalyticAgent and CreativeAgent as sub-agents
- All agents run in the same container/process for optimal performance
- Communication between agents happens via direct Python function calls (no network overhead)

### Option 2: Docker-based Deployment

For more control over the deployment process:

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"
export SERVICE_NAME="adgen-agents"

# Run the deployment script
./deploy.sh
```

## 📋 Prerequisites

### 1. Google Cloud Setup

- Google Cloud Project with billing enabled
- Required APIs enabled (done automatically by scripts):
  - Cloud Run API
  - Cloud Build API
  - Container Registry API
  - Vertex AI API (if using Vertex AI)

### 2. Local Setup

```bash
# Install Google Cloud SDK
# Visit: https://cloud.google.com/sdk/docs/install

# Install ADK (for Option 1)
pip install google-adk

# Authenticate with Google Cloud
gcloud auth login
gcloud config set project your-project-id
```

### 3. Service Account Permissions

Your deployment account needs these roles:
- Cloud Run Admin
- Cloud Build Editor
- Storage Admin
- Vertex AI User (if using Vertex AI)
- BigQuery Admin
- Firestore User

## 🔧 Configuration

### Environment Variables

The following environment variables are required:

```bash
# Required
export GOOGLE_CLOUD_PROJECT="your-project-id"

# Optional (with defaults)
export GOOGLE_CLOUD_LOCATION="us-central1"
export SERVICE_NAME="adgen-agents"
export GOOGLE_GENAI_USE_VERTEXAI="True"
```

### Service Account Keys

If you need to use service account keys (not recommended for production):

1. Place your service account JSON files in the Agents directory
2. Update the Dockerfile to copy them
3. Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable

## 🎯 Deployment Steps

### Step 1: Prepare Environment

```bash
cd /path/to/AdGenProject/Agents

# Set your project ID
export GOOGLE_CLOUD_PROJECT="your-project-id"

# Optional: customize service name and region
export SERVICE_NAME="adgen-agents"
export GOOGLE_CLOUD_LOCATION="us-central1"
```

### Step 2: Choose Deployment Method

**For ADK CLI (Recommended):**
```bash
./deploy-adk.sh
```

**For Docker deployment:**
```bash
./deploy.sh
```

### Step 3: Verify Deployment

After deployment, you'll get a service URL. Test it:

```bash
# Health check
curl https://your-service-url/health

# API documentation
curl https://your-service-url/docs

# UI (if deployed with --with_ui)
open https://your-service-url/ui
```

## 🔍 Monitoring and Troubleshooting

### View Logs

```bash
# Real-time logs
gcloud logs tail --service=adgen-agents

# Historical logs
gcloud logs read --service=adgen-agents --limit=50
```

### Service Management

```bash
# View service details
gcloud run services describe adgen-agents --region=us-central1

# Update service
gcloud run services update adgen-agents --region=us-central1

# Delete service
gcloud run services delete adgen-agents --region=us-central1
```

### Common Issues

1. **Import Errors**: Check that all Python paths are correctly set in the agent files
2. **Authentication Errors**: Ensure service account has proper permissions
3. **Memory Issues**: Increase memory allocation in deployment scripts
4. **Timeout Issues**: Increase timeout settings for long-running operations

## 🔐 Security Considerations

1. **Use Vertex AI**: Recommended over API keys for production
2. **Service Account**: Use least-privilege service accounts
3. **Network Security**: Consider VPC connector for private resources
4. **Secrets**: Use Google Secret Manager for sensitive configuration

## 📊 Scaling Configuration

The deployment scripts include these default settings:

- **Memory**: 2Gi
- **CPU**: 1 vCPU
- **Concurrency**: 80 requests per instance
- **Max Instances**: 10
- **Timeout**: 3600 seconds (1 hour)

Adjust these in the deployment scripts based on your needs.

## 🧪 Testing

After deployment, test your agents:

1. **Health Check**: `GET /health`
2. **API Docs**: `GET /docs`
3. **Agent Interaction**: Use the UI or API endpoints
4. **Sub-agent Communication**: Verify MasterAgent can coordinate with sub-agents

## 📝 Next Steps

1. Set up monitoring and alerting
2. Configure custom domains
3. Implement CI/CD pipelines
4. Set up staging environments
5. Configure backup and disaster recovery

## 🆘 Support

If you encounter issues:

1. Check the logs: `gcloud logs tail --service=adgen-agents`
2. Verify environment variables and permissions
3. Test locally first with `python main.py`
4. Review the ADK documentation: https://google.github.io/adk-docs/
