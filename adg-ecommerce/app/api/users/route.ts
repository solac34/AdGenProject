import { NextResponse } from "next/server";
import { Firestore } from "@google-cloud/firestore";
import bcrypt from "bcryptjs";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "eighth-upgrade-475017-u5";
const DATABASE_ID = process.env.FIRESTORE_DB_ID || "adgen-db";

const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON; // raw or base64

function buildFirestore(): Firestore {
  try {
    if (SA_JSON) {
      const credentials = typeof SA_JSON === "string" && SA_JSON.trim().startsWith("{")
        ? JSON.parse(SA_JSON)
        : JSON.parse(Buffer.from(SA_JSON as string, "base64").toString("utf8"));
      return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID, credentials });
    }
    if (KEYFILE) {
      return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID, keyFilename: KEYFILE });
    }
    return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID });
  } catch {
    return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body?.user_id || body?.id || "").trim(); // user_id veya id kabul et
    const email = body?.email ? String(body.email) : "";
    const name = body?.name ? String(body.name) : "";
    const password = body?.password ? String(body.password) : "";
    const userLocation = body?.user_location ? String(body.user_location) : undefined;
    if (!userId) return NextResponse.json({ ok: false, error: "user_id required" }, { status: 400 });
    if (!email || !password) return NextResponse.json({ ok: false, error: "email_password_required" }, { status: 400 });

    const firestore = buildFirestore();
    const now = new Date();
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

    const docRef = firestore.collection("users").doc(userId);
    // Email benzersizliği
    const dup = await firestore.collection("users").where("email", "==", email).limit(1).get();
    if (!dup.empty) {
      return NextResponse.json({ ok: false, error: "email_exists" }, { status: 409 });
    }

    const snapshot = await docRef.get();
    const createdAt = snapshot.exists && (snapshot.get("createdAt") as string) ? (snapshot.get("createdAt") as string) : iso;

    const data: Record<string, unknown> = {
      user_id: userId, // DEĞİŞTİ: id → user_id
      email,
      name,
      updatedAt: iso,
      createdAt
    };
    if (userLocation) data.user_location = userLocation;
    const hashed = await bcrypt.hash(password, 10);
    data.hashedPassword = hashed;

    await docRef.set(data, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[users upsert error]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


