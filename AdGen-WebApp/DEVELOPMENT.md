# AdGen WebApp Development Setup

## Overview
This Next.js application provides a dashboard for managing AdGen agents, monitoring segmentation jobs, and viewing analytics.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Firestore Configuration

### For Local Development

The application is configured to work without Firestore authentication in development mode. When Firestore is not properly configured, the API routes will:

1. Return empty data for GET requests (allowing the UI to render)
2. Simulate successful saves for PUT requests (with warnings in console)

### To Enable Full Firestore Functionality

#### Option 1: Application Default Credentials (Recommended)
```bash
# Authenticate with Google Cloud
gcloud auth application-default login

# Set your project
gcloud config set project eighth-upgrade-475017-u5
```

#### Option 2: Service Account Key File
1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Set the environment variable:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

#### Option 3: Environment Variables
Create a `.env.local` file:
```env
GOOGLE_CLOUD_PROJECT=eighth-upgrade-475017-u5
GCP_PROJECT_ID=eighth-upgrade-475017-u5
FIRESTORE_DB_ID=adgen-db
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

## Environment Variables

### Required for Production
- `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID
- `WEBHOOK_SECRET`: Secret for webhook authentication (must match agents service)
- `AGENTS_SERVICE_URL`: URL of the agents service
- `AGENTS_API_TOKEN`: API token for agents service

### Webhook Configuration
For real-time agent events, set these environment variables:
- `WEBHOOK_SECRET`: Shared secret between webapp and agents (default: "your-webhook-secret-here")

The agents will automatically send events to: `https://your-webapp-url/api/agent-events`

### Optional for Development
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account key file
- `GCP_SERVICE_ACCOUNT_JSON`: Base64 encoded service account JSON
- `FIRESTORE_DB_ID`: Firestore database ID (defaults to "(default)")

## API Routes

### `/api/instructions/[doc]`
- **GET**: Retrieve instruction document
- **PUT**: Update instruction document

### `/api/agent-events`
- **GET**: Retrieve agent events for a run
- **POST**: Create new agent event

### `/api/run`
- **POST**: Trigger a new agent run

## Components

### Main Components
- `SegmentationChart`: Real-time segmentation analytics
- `JobTable`: Job schedule monitoring
- `RunStatusPanel`: Live run status tracking
- `InstructionEditor`: Agent instruction management

### Pages
- `/`: Main dashboard
- `/agent-settings`: Agent configuration
- `/segmentations`: Segmentation settings
- `/settings`: Application settings

## Troubleshooting

### Firestore Errors
If you see "NOT_FOUND" or "PERMISSION_DENIED" errors:
1. The application will continue to work with mock data
2. Check console warnings for specific issues
3. Follow the Firestore configuration steps above

### YAxis Warning (Fixed)
The Recharts YAxis defaultProps warning has been resolved by explicitly setting component props.

## Deployment

The application is configured for deployment to Google Cloud Run. See `deploy.sh` for the deployment script.

### Cloud Run Environment
The deployment script automatically sets required environment variables for production.

## Development Notes

- The application uses Next.js 14 with App Router
- Styling is done with Tailwind CSS
- Charts are powered by Recharts
- State management uses React hooks
- Firestore is used for data persistence (with graceful fallbacks)
