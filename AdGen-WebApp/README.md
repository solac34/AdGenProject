# AdGen WebApp

A polished dashboard for the ADK (Agent Development Kit) running on Google Cloud Run.

## Getting Started

1. Install dependencies

```bash
npm i
```

2. Run the dev server

```bash
npm run dev
```

Visit http://localhost:3000.

## Features

- VS Code dark palette with electric blue accent (#007acc)
- Segmentation per run chart (Recharts)
- Job table showing last run and live countdown to next run
- Large animated "Run Agents Now" button
- Dynamic status panel during manual runs with progress + live graph

## Integrations

- Replace `app/api/run/route.ts` with a call to your Cloud Run endpoint or a local bridge to the Python Agents.
- For real job metadata, wire `components/JobTable.tsx` to your scheduler API.

## Tech

- Next.js App Router, TypeScript
- Tailwind CSS, Framer Motion, Recharts


