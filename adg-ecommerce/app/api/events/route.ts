import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "eighth-upgrade-475017-u5";
const DATASET = process.env.BQ_DATASET || "adgen_bq";
const TABLE = process.env.BQ_TABLE || "user_events";

const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON; // optional: JSON string or base64 JSON

let bigquery: BigQuery;
try {
  if (SA_JSON) {
    const credentials = typeof SA_JSON === "string" && SA_JSON.trim().startsWith("{")
      ? JSON.parse(SA_JSON)
      : JSON.parse(Buffer.from(SA_JSON as string, "base64").toString("utf8"));
    bigquery = new BigQuery({ projectId: PROJECT_ID, credentials });
  } else if (KEYFILE) {
    bigquery = new BigQuery({ projectId: PROJECT_ID, keyFilename: KEYFILE });
  } else {
    bigquery = new BigQuery({ projectId: PROJECT_ID }); // ADC fallback (gcloud or metadata)
  }
} catch {
  bigquery = new BigQuery({ projectId: PROJECT_ID });
}

function genEventId(): string {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `${Date.now()}${rand}`; // as string to avoid JS int limits
}

function toBQDateTime(ts?: string): string {
  // Expecting 'YYYY-MM-DDTHH:mm:ss', convert to DATETIME 'YYYY-MM-DD HH:mm:ss'
  if (ts && ts.includes("T")) return ts.replace("T", " ");
  const d = new Date();
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  return iso.replace("T", " ");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const events = Array.isArray(body?.events) ? body.events : [];
    // eslint-disable-next-line no-console
    console.log("[events]", JSON.stringify(events));

    if (events.length > 0) {
      const rows = events.map((e: any) => ({
        event_id: [genEventId()], // array because table shows REPEATED; single-value array
        session_id: String(e.sessionId || "unknown"),
        user_id: String(e.userId || "anonymous"),
        event_name: String(e.event || "unknown"),
        event_time: toBQDateTime(e.ts),
        path_name: e.pathname ? String(e.pathname) : null,
        payload: JSON.stringify(e.payload ?? {}),
        event_location: e.eventLocation ? String(e.eventLocation) : null
      }));
      try {
        const table = bigquery.dataset(DATASET).table(TABLE);
        await table.insert(rows);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("[bq insert error]", err?.errors || err);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

