# AdGen Agents - Cloud Run HTTP API

🚀 **HTTP API for MasterAgent with session rollover using Google ADK InMemoryRunner**

## Overview

This service deploys the MasterAgent (with DataAnalyticAgent and CreativeAgent sub-agents) as a Cloud Run HTTP API. It accepts POST requests with prompts and returns agent responses after processing.

## Architecture

```
HTTP Request → Flask API (/run endpoint)
    ↓
InMemoryRunner (ADK)
    ↓
MasterAgent
    ├── DataAnalyticAgent (BigQuery analysis)
    └── CreativeAgent (Content generation)
    ↓
HTTP Response (JSON)
```

## Quick Start

### 1. Deploy to Cloud Run

```bash
cd Agents
./deploy.sh
```

**Note:** This uses Google Cloud Build - no local Docker required! ☁️

### 2. Test the API

```bash
# Health check
curl https://adgen-agents-710876076445.us-central1.run.app/health

# Run agent
curl -X POST https://adgen-agents-710876076445.us-central1.run.app/run \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Do your segmentation task.", "max_rounds": 8}'
```

### 3. View Logs

```bash
gcloud logs tail --service=adgen-agents --region=us-central1 --follow
```

## API Documentation

See [TESTING.md](./TESTING.md) for complete API documentation, Postman examples, and debugging tips.

### Endpoints

- `GET /` - API info and documentation
- `GET /health` - Health check
- `POST /run` - Run agent with prompt (main endpoint)
- `POST /pubsub/push` - Pub/Sub trigger endpoint

### Request Format

```json
{
  "prompt": "Your task description here",
  "max_rounds": 8
}
```

### Response Format

```json
{
  "result": {...},
  "rounds": 3,
  "statuses": ["continue", "continue", "finished"],
  "success": true
}
```

## Local Development

### Run Locally

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT="eighth-upgrade-475017-u5"
export GOOGLE_GENAI_USE_VERTEXAI="True"
export PORT=8080

# Run the HTTP server
python main.py
```

### Test Locally

```bash
# In another terminal, test the API
curl -X POST http://localhost:8080/run \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Test prompt", "max_rounds": 2}'
```

## Environment Variables

These are automatically set during deployment:

- `GOOGLE_CLOUD_PROJECT` - GCP project ID
- `GOOGLE_CLOUD_LOCATION` - GCP region (us-central1)
- `GOOGLE_GENAI_USE_VERTEXAI` - Use Vertex AI (True)
- `BQ_DATASET` - BigQuery dataset name
- `BQ_LOCATION` - BigQuery location
- `FIRESTORE_DATABASE` - Firestore database name

## Files

### ✅ Core Files (Production)
- **`main.py`** - Flask HTTP API server with InMemoryRunner and session rollover
- **`Dockerfile`** - Container image definition for Cloud Run
- **`deploy.sh`** - Deployment script using Cloud Build
- **`requirements.txt`** - Python dependencies
- **`.env`** - Environment variables (not in git, create locally)

### 🤖 Agent Modules
- **`MasterAgent/agent.py`** - Main orchestrator agent
- **`DataAnalyticAgent/agent.py`** - BigQuery analytics agent
- **`CreativeAgent/agent.py`** - Content generation agent

### 📝 Configuration & Documentation
- **`config.py`** - Configuration module (environment variables)
- **`.dockerignore`** - Docker ignore rules
- **`README.md`** - This file (main documentation)
- **`TESTING.md`** - API testing guide and examples

### 🔑 Credentials (Local Development Only)
- **`eighth-upgrade-475017-u5-5f7f40ad1003.json`** - Vertex AI service account (not in git)
- **`bigquery-serviceacc.json`** - BigQuery service account (not in git)

## Key Features

✅ **HTTP API** - RESTful endpoints for easy integration  
✅ **Session Rollover** - Automatic session management for long tasks  
✅ **Cloud Run** - Serverless, auto-scaling deployment  
✅ **Vertex AI** - Uses Google's managed AI models  
✅ **BigQuery Integration** - DataAnalyticAgent queries BigQuery  
✅ **Firestore Integration** - Persistent storage  
✅ **Pub/Sub Support** - Async job triggering  
✅ **Health Checks** - Built-in monitoring endpoints  
✅ **Comprehensive Logging** - Full request/response logging  

## Architecture Details

### Session Rollover

The system supports long-running tasks by:
1. Running agent in rounds (max 8 by default)
2. Checking response status after each round
3. If status is "continue", creating a fresh session and continuing
4. If status is "finished" or max rounds reached, returning results

This prevents context window exhaustion and allows multi-step workflows.

### Authentication

The service uses Cloud Run's default service account with ADC (Application Default Credentials):
- No credential files in the container
- Automatic authentication to GCP services
- Secure by default

### Resource Limits

- Memory: 2GiB
- CPU: 2 cores
- Timeout: 3600s (1 hour)
- Max instances: 10

Adjust these in `deploy.sh` if needed.

## Troubleshooting

### Issue: Agent times out
**Solution:** Increase `max_rounds` in request or timeout in `deploy.sh`

### Issue: Out of memory
**Solution:** Increase memory limit in `deploy.sh`: `--memory=4Gi`

### Issue: Can't connect to BigQuery
**Solution:** Verify Cloud Run service account has BigQuery permissions

### Issue: Vertex AI errors
**Solution:** Check `GOOGLE_GENAI_USE_VERTEXAI=True` and project ID is correct

## Monitoring

```bash
# Real-time logs
gcloud logs tail --service=adgen-agents --region=us-central1 --follow

# Recent logs
gcloud logs read --service=adgen-agents --region=us-central1 --limit=100

# Service status
gcloud run services describe adgen-agents --region=us-central1

# Service metrics (in Cloud Console)
https://console.cloud.google.com/run/detail/us-central1/adgen-agents/metrics
```

## Next Steps

1. ✅ Deploy with `./deploy.sh`
2. ✅ Test with curl or Postman (see TESTING.md)
3. 📊 Monitor logs and metrics
4. 🔐 Optional: Add authentication for production

## Support

- **Documentation**: TESTING.md
- **Logs**: `gcloud logs tail --service=adgen-agents --region=us-central1`
- **Service URL**: https://adgen-agents-710876076445.us-central1.run.app

---

**Last Updated**: November 2024  
**Version**: 2.0 (HTTP API with InMemoryRunner)
