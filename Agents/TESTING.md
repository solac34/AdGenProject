# AdGen Agents - HTTP API Testing Guide

## 🚀 Quick Start

### 1. Deploy to Cloud Run
```bash
cd /Users/gurkanmutlu/repository/gurkan/AdGenProject/Agents
./deploy.sh
```

**Note:** Uses Google Cloud Build (no local Docker needed!)

The deployment will:
1. ✅ Build the container image in the cloud
2. ✅ Push to Google Container Registry
3. ✅ Deploy to Cloud Run
4. ✅ Set all environment variables automatically

### 2. Get Service URL
After deployment, you'll see the service URL. Save it:
```bash
export SERVICE_URL="https://adgen-agents-710876076445.us-central1.run.app"
```

## 📡 API Endpoints

### Health Check
```bash
curl $SERVICE_URL/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "adgen-agents",
  "agent": "MasterAgent"
}
```

### Get API Info
```bash
curl $SERVICE_URL/
```

**Response:**
```json
{
  "service": "AdGen Agents HTTP API",
  "agent": "MasterAgent",
  "endpoints": {...}
}
```

### Run Agent (Main Endpoint)
```bash
curl -X POST $SERVICE_URL/run \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Do your segmentation task.",
    "max_rounds": 8
  }'
```

**Request Body:**
```json
{
  "prompt": "Your task prompt here",
  "max_rounds": 8  // optional, default 8
}
```

**Success Response:**
```json
{
  "result": {
    "status": "finished",
    "data": {...}
  },
  "rounds": 3,
  "statuses": ["continue", "continue", "finished"],
  "success": true
}
```

**Error Response:**
```json
{
  "error": "Error message here",
  "success": false
}
```

### Pub/Sub Push Endpoint
```bash
# This is called by Google Pub/Sub, not directly
# Message format:
{
  "message": {
    "data": "<base64-encoded-json>",
    "attributes": {...}
  }
}
```

## 📮 Postman Collection

### Configuration
1. **Method:** POST
2. **URL:** `https://adgen-agents-710876076445.us-central1.run.app/run`
3. **Headers:**
   - `Content-Type`: `application/json`
4. **Body (raw JSON):**
   ```json
   {
     "prompt": "Do your segmentation task.",
     "max_rounds": 8
   }
   ```

### Test Cases

#### Test 1: Basic Segmentation Task
```json
{
  "prompt": "Do your segmentation task. Start with reading pending users to segment.",
  "max_rounds": 8
}
```

#### Test 2: Quick Test (1 round)
```json
{
  "prompt": "Analyze the first 10 users and return their basic info.",
  "max_rounds": 1
}
```

#### Test 3: Custom Analysis
```json
{
  "prompt": "Analyze user behavior patterns for users in the 'High Value' segment.",
  "max_rounds": 5
}
```

## 🔍 Debugging

### View Real-time Logs
```bash
gcloud logs tail --service=adgen-agents --region=us-central1 --follow
```

### View Recent Logs
```bash
gcloud logs read --service=adgen-agents --region=us-central1 --limit=50
```

### Check Service Status
```bash
gcloud run services describe adgen-agents --region=us-central1
```

## 🧪 Local Testing

Before deploying, test locally:

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT="eighth-upgrade-475017-u5"
export GOOGLE_CLOUD_LOCATION="us-central1"
export GOOGLE_GENAI_USE_VERTEXAI="True"
export PORT=8080

# Run locally
python main.py
```

Then test with curl:
```bash
curl -X POST http://localhost:8080/run \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Test prompt", "max_rounds": 2}'
```

## 🔐 Authentication

The service is deployed with `--allow-unauthenticated` for easy testing. For production:

### Deploy with Authentication
```bash
gcloud run deploy adgen-agents \
  --image=gcr.io/eighth-upgrade-475017-u5/adgen-agents:latest \
  --region=us-central1 \
  --no-allow-unauthenticated
```

### Call with Authentication
```bash
curl -X POST $SERVICE_URL/run \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Test"}'
```

## ⚡ Performance Tips

1. **Timeout:** Service has 3600s (1 hour) timeout for long-running tasks
2. **Memory:** 2GiB allocated (adjust in deploy.sh if needed)
3. **CPU:** 2 CPUs (adjust in deploy.sh if needed)
4. **Max Rounds:** Control execution time with `max_rounds` parameter

## 🐛 Common Issues

### Issue: Timeout after 60s
**Solution:** Already fixed with `--timeout=3600` in deploy.sh

### Issue: Out of memory
**Solution:** Increase memory in deploy.sh:
```bash
--memory=4Gi
```

### Issue: Agent not responding
**Solution:** Check logs and verify environment variables are set correctly

## 📊 Example Full Workflow

```bash
# 1. Deploy
./deploy.sh

# 2. Save URL
SERVICE_URL="https://adgen-agents-710876076445.us-central1.run.app"

# 3. Health check
curl $SERVICE_URL/health

# 4. Run segmentation
curl -X POST $SERVICE_URL/run \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Do your segmentation task. Start with reading pending users to segment.",
    "max_rounds": 8
  }'

# 5. Watch logs
gcloud logs tail --service=adgen-agents --region=us-central1 --follow
```

## ✅ Success Checklist

- [ ] Service deployed successfully
- [ ] Health check returns 200 OK
- [ ] `/run` endpoint accepts POST requests
- [ ] Agent processes prompt and returns result
- [ ] Logs show agent activity
- [ ] Session rollover works (multiple rounds)
- [ ] Pub/Sub endpoint responds to push messages

---

**Service URL:** https://adgen-agents-710876076445.us-central1.run.app
**Documentation:** This file
**Logs:** `gcloud logs tail --service=adgen-agents --region=us-central1`

