# AdGen Agents - Cloud Run Ready

This directory contains the AdGen Agents prepared for Google Cloud Run deployment.

## 🚀 Quick Start

1. **Set your project ID:**
   ```bash
   export GOOGLE_CLOUD_PROJECT="your-project-id"
   ```

2. **Verify setup:**
   ```bash
   python3 verify-setup.py
   ```

3. **Deploy (choose one):**
   ```bash
   # Option A: Using ADK CLI (recommended)
   ./deploy-adk.sh
   
   # Option B: Using Docker
   ./deploy.sh
   ```

## 📁 Files Created/Modified

### Core Files
- **`main.py`** - Cloud Run entry point
- **`config.py`** - Configuration management
- **`requirements.txt`** - Updated with all dependencies
- **`Dockerfile`** - Container definition for Cloud Run

### Deployment Files
- **`deploy-adk.sh`** - ADK CLI deployment script (recommended)
- **`deploy.sh`** - Docker-based deployment script
- **`verify-setup.py`** - Setup verification script
- **`.dockerignore`** - Docker ignore rules

### Documentation
- **`DEPLOYMENT.md`** - Comprehensive deployment guide
- **`README.md`** - This file

### Agent Files (Modified)
- **`MasterAgent/agent.py`** - Fixed import paths
- **`DataAnalyticAgent/agent.py`** - Fixed import paths

## 🏗️ Architecture

```
AdGen Agents (Cloud Run Service)
├── MasterAgent (Root Agent)
│   ├── Coordinates all operations
│   └── Contains sub-agents
├── DataAnalyticAgent (Sub-agent)
│   ├── BigQuery operations
│   └── Firestore operations
└── CreativeAgent (Sub-agent)
    └── Content creation
```

## 🔧 Key Changes Made

1. **Fixed Import Paths**: Updated relative imports to work in Cloud Run
2. **Added Entry Point**: Created `main.py` for Cloud Run deployment
3. **Updated Dependencies**: Added all required packages to `requirements.txt`
4. **Created Dockerfile**: Optimized for Cloud Run deployment
5. **Deployment Scripts**: Two options for deployment (ADK CLI and Docker)
6. **Configuration**: Environment-based configuration management

## 📋 Prerequisites

Before deploying, ensure you have:

- Google Cloud Project with billing enabled
- `gcloud` CLI installed and authenticated
- `google-adk` package installed (`pip install google-adk`)
- Required environment variables set

## 🎯 Deployment Options

### Option 1: ADK CLI (Recommended)
- Simpler deployment process
- Automatic UI inclusion
- Better integration with ADK ecosystem

### Option 2: Docker
- More control over deployment
- Custom container configuration
- Direct Cloud Run deployment

## 🔍 Verification

Run the verification script to check your setup:

```bash
python3 verify-setup.py
```

This will check:
- Required files exist
- Commands are available
- Environment variables are set
- Python imports work
- Authentication is configured

## 📚 Next Steps

1. Review `DEPLOYMENT.md` for detailed instructions
2. Set up your environment variables
3. Run the verification script
4. Choose and execute a deployment script
5. Test your deployed agents

## 🆘 Troubleshooting

Common issues and solutions:

1. **Import Errors**: Check Python path configuration
2. **Authentication**: Run `gcloud auth login`
3. **Permissions**: Ensure service account has required roles
4. **Dependencies**: Install missing packages with `pip install -r requirements.txt`

For detailed troubleshooting, see `DEPLOYMENT.md`.

## 🔐 Security Notes

- Use Vertex AI authentication (recommended)
- Store secrets in Google Secret Manager
- Use least-privilege service accounts
- Enable audit logging for production

---

Your AdGen Agents are now ready for Cloud Run deployment! 🎉
