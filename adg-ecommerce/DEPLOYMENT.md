# AdGen E-commerce Cloud Run Deployment

Simple deployment guide for the Next.js e-commerce application.

## 🚀 Quick Deploy

```bash
# Navigate to the project directory
cd /Users/gurkanmutlu/repository/gurkan/AdGenProject/adg-ecommerce

# Run the deployment script
./deploy.sh
```

## 📋 What Gets Deployed

- **Next.js 14** application with App Router
- **Standalone output** optimized for containers
- **Google Cloud services** integration (BigQuery, Firestore)
- **Production-ready** configuration

## 🔧 Configuration

The deployment uses these settings:

- **Service Name**: `adgen-ecommerce`
- **Region**: `us-central1`
- **Memory**: 1Gi
- **CPU**: 1 vCPU
- **Port**: 8080
- **Concurrency**: 100 requests per instance
- **Max Instances**: 10

## 🌐 After Deployment

Your e-commerce site will be available at:
```
https://adgen-ecommerce-710876076445.us-central1.run.app
```

## 🔍 Monitoring

```bash
# View logs
gcloud logs tail --service=adgen-ecommerce

# View service details
gcloud run services describe adgen-ecommerce --region=us-central1

# Update service
gcloud run services update adgen-ecommerce --region=us-central1
```

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 📦 Files Added for Deployment

- `Dockerfile` - Container definition
- `deploy.sh` - Deployment script
- `.dockerignore` - Docker ignore rules
- `DEPLOYMENT.md` - This guide

## 🔐 Environment Variables

The app uses these environment variables in Cloud Run:
- `NODE_ENV=production`
- `PORT=8080`

For Google Cloud services, it uses the default service account credentials.

---

**Ready to deploy!** Just run `./deploy.sh` 🚀
