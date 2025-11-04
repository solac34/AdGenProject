import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "eighth-upgrade-475017-u5";
const DATASET = process.env.BQ_DATASET || "adgen_bq";
const ORDERS_TABLE = process.env.BQ_ORDERS_TABLE || "user_orders";

const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;

function buildBQ(): BigQuery {
  try {
    if (SA_JSON) {
      const credentials = typeof SA_JSON === "string" && SA_JSON.trim().startsWith("{")
        ? JSON.parse(SA_JSON)
        : JSON.parse(Buffer.from(SA_JSON as string, "base64").toString("utf8"));
      return new BigQuery({ projectId: PROJECT_ID, credentials });
    }
    if (KEYFILE) return new BigQuery({ projectId: PROJECT_ID, keyFilename: KEYFILE });
    return new BigQuery({ projectId: PROJECT_ID });
  } catch {
    return new BigQuery({ projectId: PROJECT_ID });
  }
}

function toBQDateTime(ts?: string): string {
  if (ts && ts.includes("T")) {
    // ISO string like "2025-11-02T01:04:13.332Z"
    // Convert to "2025-11-02 01:04:13"
    return ts.slice(0, 19).replace("T", " ");
  }
  const d = new Date();
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  return iso.replace("T", " ");
}

function genOrderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // eslint-disable-next-line no-console
    console.log("[orders] Received request:", JSON.stringify(body));
    
    const orderId = String(body?.order_id || genOrderId());
    const sessionId = String(body?.session_id || "unknown");
    const userId = String(body?.user_id || "anonymous");
    const productsPayload = body?.products_payload ?? {};
    const paidAmount = Number(body?.paid_amount || 0) / 100; // cents -> unit currency
    const orderDate = toBQDateTime(body?.order_date);
    const sessionLocation = body?.session_location ? String(body.session_location) : null;

    const rows = [{
      order_id: orderId,
      user_id: userId,
      session_id: sessionId,
      products_payload: JSON.stringify(typeof productsPayload === "string" ? JSON.parse(productsPayload) : productsPayload),
      paid_amount: paidAmount,
      order_date: orderDate,
      session_location: sessionLocation
    }];

    // eslint-disable-next-line no-console
    console.log("[orders] Attempting to insert rows:", JSON.stringify(rows));
    // eslint-disable-next-line no-console
    console.log("[orders] Target: ", `${PROJECT_ID}.${DATASET}.${ORDERS_TABLE}`);

    const bq = buildBQ();
    try {
      await bq.dataset(DATASET).table(ORDERS_TABLE).insert(rows);
      // eslint-disable-next-line no-console
      console.log("[orders] Successfully inserted order:", orderId);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[orders insert error]", err?.errors || err);
      // eslint-disable-next-line no-console
      console.error("[orders full error]", JSON.stringify(err, null, 2));
      return NextResponse.json({ ok: false, error: err?.message || "BigQuery insert failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, order_id: orderId });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[orders] Request failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 400 });
  }
}


