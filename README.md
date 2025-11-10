# AdGen – Cloud Run Hackathon Project

Hi there! This repo contains a small but complete demo system We built for the Cloud Run Hackathon. It shows how to combine Google Cloud Run services with BigQuery, Firestore, GCS and AI agents to create a practical, end‑to‑end marketing workflow:

- a web app or a mobile app demo backend (products, orders, events)
- a web dashboard to trigger and monitor jobs
- data + AI agents that segment users and create content


—

What the system does (in plain words)
- Seed demo data. We generate realistic users, sessions, events and orders, and write them to Firestore and BigQuery.
- Segment users. A Data Analytic Agent pulls activity from BigQuery, compares to the last snapshot, and picks users to segment. Then it writes user segmentation results back to Firestore.
- Create content. A Creative Agent takes segmentation results and generates marketing images per location‑segment pair, saving public URLs.
- Monitor and trigger. A Next.js dashboard shows runs in realtime and a small “Job Schedule” card gives you the idea of when the next hourly runs happen.

—

Repository layout
- AdGen-WebApp: Next.js 14 app (dashboard + API routes). Deploys to Cloud Run (Service).
- adg-ecommerce: Next.js 15 demo ecommerce API (only used for seeding and product catalog). Deploys to Cloud Run (Service).
- Agents: Python service that hosts the MasterAgent with two sub‑agents:
  - DataAnalyticAgent (BigQuery + Firestore reads/writes)
  - CreativeAgent (content generation; image URLs are written back)
  Deploys to Cloud Run (Service).
- agents-cronjob: a small Cloud Run Job that can kick the agent run on schedule (via HTTP call or Pub/Sub).

Main technologies
- Cloud Run (Service + Job)
- BigQuery (tables: adgen_bq.user_events, adgen_bq.user_orders)
- Firestore (database: adgen-db; collections used below)
- Google AI Studio / Vertex AI (agents + image generation)
- Next.js (dashboard, APIs) and Python (Flask for agents)

Key data collections and tables
- Firestore
  - users
  - user_activity_counts
  - users_to_segmentate
  - user_segmentations
  - segmentations (city_country pairs, later used for content)
- BigQuery
  - adgen_bq.user_events
  - adgen_bq.user_orders

How to run locally (quick)
1) Requirements
- Node.js 18+
- Python 3.10+ (the repo uses a venv, but a fresh venv works too)
- A Google Cloud project with BigQuery + Firestore enabled
- Credentials: for local development you can export GOOGLE_APPLICATION_CREDENTIALS to a service account JSON, or set GCP_SERVICE_ACCOUNT_JSON (base64 or plain JSON).

2) Start ecommerce (for product catalog and optional seed forwarding)
```bash
cd adg-ecommerce
npm install
npm run dev
```

3) Start the dashboard
```bash
cd AdGen-WebApp
npm install
npm run dev
```
Then open http://localhost:3000

4) Start the Agents service (optional if you just want UI)
```bash
cd Agents
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```
The service exposes POST /run for the MasterAgent. By default the dashboard forwards to the Cloud Run Agents URL you set in env.

Seeding demo data
There are two seeders:
- WebApp API route: POST /api/seedmega (Node script). It writes:
  - Firestore: users
  - BigQuery: user_events, user_orders
- Ecommerce API route: POST /api/seedmega (a smaller “quick” path for demos)

Tip: In development, if the WebApp does not have local GCP creds, it forwards seeding to the ecommerce service automatically (to keep your setup easy).

Running the workflow from the UI
1) Go to Agent Runner.
2) Press “Run Agent Team”.
   - The UI first seeds a tiny demo set (2 users) so that downstream steps always have data.
   - Then it triggers the MasterAgent flow:
     a) Segmentation rounds until “segmentation_finished”
     b) Content creation round, then “flow_finished”
3) Watch the live event feed update as agents run. You can refresh BigQuery and Firestore to see new rows/docs appear.

Cloud Run deployment (one‑click scripts)
- AdGen-WebApp/deploy.sh – builds a Cloud Run service for the dashboard
- adg-ecommerce/deploy.sh – builds a Cloud Run service for ecommerce/seed APIs
- Agents/deploy.sh – builds a Cloud Run service for the Agents HTTP API
- agents-cronjob/deploy.sh – builds a Cloud Run Job (can be scheduled)

Important environment variables
- Common
  - GOOGLE_CLOUD_PROJECT: your GCP project id
  - FIRESTORE_DB_ID: adgen-db
- WebApp
  - AGENTS_SERVICE_URL: Cloud Run URL of the Agents service (/run endpoint)
  - ECOMMERCE_SERVICE_URL: Cloud Run URL of the ecommerce service (for seed forwarding)
  - WEBHOOK_SECRET: small shared secret for simple event streaming
- Agents
  - AGENTS_API_TOKEN: optional bearer/X-Api-Key to protect /run
  - GOOGLE_API_KEY or Vertex (default ADC): for LLMs and Imagen

How the segmentation works (short)
1) DataAnalyticAgent
   - Reads event and order counts from BigQuery
   - Compares to last snapshot; writes “users_to_segmentate” (pending)
   - Fetches pending users; returns their events + orders
   - Writes per‑user segmentation result
2) CreativeAgent
   - Upserts “segmentations” pairs (segmentation + city + country)
   - Generates one marketing image per pair and stores the URL


Thanks!
This is a hackathon project. The goal is to be useful, simple and clear. If you have feedback or ideas, open an issue or drop me a note. 😊
