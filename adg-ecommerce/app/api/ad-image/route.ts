import { NextResponse } from "next/server";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";

const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "eighth-upgrade-475017-u5";
const DATABASE_ID = process.env.FIRESTORE_DB_ID || "adgen-db";
const BUCKET = process.env.GCS_CONTENT_BUCKET || "ecommerce-ads-contents";
const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS_AI || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;

function buildFirestore(): Firestore {
  try {
    if (SA_JSON) {
      const credentials = typeof SA_JSON === "string" && SA_JSON.trim().startsWith("{")
        ? JSON.parse(SA_JSON)
        : JSON.parse(Buffer.from(SA_JSON as string, "base64").toString("utf8"));
      return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID, credentials });
    }
    if (KEYFILE) return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID, keyFilename: KEYFILE });
    return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID });
  } catch {
    return new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID });
  }
}

function buildStorage(): Storage {
  try {
    if (SA_JSON) {
      const credentials = typeof SA_JSON === "string" && SA_JSON.trim().startsWith("{")
        ? JSON.parse(SA_JSON)
        : JSON.parse(Buffer.from(SA_JSON as string, "base64").toString("utf8"));
      return new Storage({ projectId: PROJECT_ID, credentials });
    }
    if (KEYFILE) return new Storage({ projectId: PROJECT_ID, keyFilename: KEYFILE });
    return new Storage({ projectId: PROJECT_ID });
  } catch {
    return new Storage({ projectId: PROJECT_ID });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.user_id || body?.id || "").trim();
    if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });

    const firestore = buildFirestore();

    // 1) Read user city/country from users/{userId}.user_location ("City, Country")
    const userDoc = await firestore.collection("users").doc(userId).get();
    const userLocation = (userDoc.exists ? (userDoc.get("user_location") as string | undefined) : undefined) || "";
    const [cityRaw, countryRaw] = userLocation.split(",").map((s) => (s || "").trim());
    const city = cityRaw || "";
    const country = countryRaw || "";

    // 2) Read segmentation from user_segmentations
    let segDoc = await firestore.collection("user_segmentations").doc(`user_${userId}`).get();
    if (!segDoc.exists) {
      const q = await firestore.collection("user_segmentations").where("user_id", "==", userId).limit(1).get();
      if (!q.empty) segDoc = q.docs[0];
    }
    const segmentation: string = (segDoc.exists ? (segDoc.get("segmentation_result") as string | undefined) : undefined) || "";
    if (!segmentation || !city) {
      return NextResponse.json({ ok: false, error: "missing_segmentation_or_city", segmentation, city, country }, { status: 404 });
    }

    // 3) Find in 'segmentations' collection
    const normalize = (s: string) => String(s).trim().replace(/[\\/]/g, "_").replace(/,/g, "").replace(/\s+/g, "_");
    // underscore-separated doc id as segmentation_city_country
    const docId = `${normalize(segmentation)}_${normalize(city)}_${normalize(country)}`;
    let segRef = firestore.collection("segmentations").doc(docId);
    let segData = (await segRef.get());
    if (!segData.exists) {
      const q = await firestore.collection("segmentations")
        .where("segmentation_name", "==", segmentation)
        .where("city", "==", city)
        .where("country", "==", country)
        .limit(1)
        .get();
      if (!q.empty) segData = q.docs[0];
    }

    const imageUrl = segData.exists ? (segData.get("imageUrl") as string | undefined) : undefined;
    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "image_not_found_in_segmentations", docId }, { status: 404 });
    }

    return NextResponse.json({ ok: true, imageUrl, docId });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ad-image error]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


