import { NextResponse } from "next/server";
import { Firestore } from "@google-cloud/firestore";
import bcrypt from "bcryptjs";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "eighth-upgrade-475017-u5";
const DATABASE_ID = process.env.FIRESTORE_DB_ID || "adgen-db";

const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;

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
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ ok: false, error: "email_password_required" }, { status: 400 });

    const firestore = buildFirestore();
    const q = await firestore.collection("users").where("email", "==", String(email)).limit(1).get();
    if (q.empty) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 401 });
    const doc = q.docs[0];
    const data = doc.data() as any;
    const hashed = data?.hashedPassword as string | undefined;
    if (!hashed) return NextResponse.json({ ok: false, error: "password_not_set" }, { status: 401 });
    const valid = await bcrypt.compare(String(password), hashed);
    if (!valid) return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });

    const user = { id: doc.id, name: String(data?.name || ""), email: String(data?.email || "") };
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[auth login error]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


