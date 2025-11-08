import { NextResponse } from "next/server";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";

const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "eighth-upgrade-475017-u5";
const DATABASE_ID = process.env.FIRESTORE_DB_ID || "adgen-db";
const BUCKET = process.env.GCS_EC_BUCKET_NAME || process.env.GCS_CONTENT_BUCKET || "ecommerce-ad-contents";
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

function normalize(s: string): string {
  return String(s || "")
    .trim()
    .replace(/[\\/]/g, "_")
    .replace(/,/g, "")
    .replace(/\s+/g, "_");
}

function parseCityCountry(input?: string | null): { city: string; country: string } {
  const raw = String(input || "").trim();
  if (!raw) return { city: "", country: "" };
  const [c, k] = raw.split(",").map((s) => (s || "").trim());
  return { city: c || "", country: k || "" };
}

function publicUrlFor(objectName: string): string {
  // objectName may contain slashes; encodeURI keeps them
  return `https://storage.googleapis.com/${BUCKET}/${encodeURI(objectName)}`;
}

async function findImageFromSegmentationsDoc(
  firestore: Firestore,
  segmentation: string,
  city: string,
  country: string
): Promise<string | null> {
  if (!segmentation || !city) return null;
  const docId = `${normalize(segmentation)}_${normalize(city)}_${normalize(country)}`;
  let segData: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> = await firestore
    .collection("segmentations")
    .doc(docId)
    .get();
  if (!segData.exists) {
    const q = await firestore
      .collection("segmentations")
      .where("segmentation_name", "==", segmentation)
      .where("city", "==", city)
      .where("country", "==", country)
      .limit(1)
      .get();
    if (!q.empty) segData = q.docs[0];
  }
  const imageUrl = segData.exists ? (segData.get("imageUrl") as string | undefined) : undefined;
  return imageUrl ? imageUrl : null;
}

async function pickRandomGcsImageForLocation(
  storage: Storage,
  city: string,
  country: string,
  segmentation?: string
): Promise<string | null> {
  try {
    const bucket = storage.bucket(BUCKET);
    // New strategy per spec:
    // 1) Traverse segmentation parts split by '-' as nested folders.
    // 2) When next part not found (no files matching the deeper prefix) OR all parts consumed,
    //    continue with location: /<country>/<city>.
    // 3) Pick image under the deepest existing prefix; if city not found use country;
    //    if country not found use deepest segmentation-only folder; finally any image in bucket.
    const segParts = (segmentation || "")
      .split("-")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const normCity = normalize(city);
    const normCountry = normalize(country);

    const folderHasAny = async (prefix: string) => {
      try {
        const [files] = await bucket.getFiles({ prefix, maxResults: 1, autoPaginate: false });
        return (files?.length || 0) > 0;
      } catch {
        return false;
      }
    };
    const pickUnder = async (prefix: string): Promise<string | null> => {
      try {
        const [files] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 500 });
        const imgs = (files || []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
        if (imgs.length === 0) return null;
        const pick = imgs[Math.floor(Math.random() * imgs.length)];
        return publicUrlFor(pick.name);
      } catch {
        return null;
      }
    };

    let base = "";
    for (const part of segParts) {
      const next = `${base}${part}/`;
      if (await folderHasAny(next)) {
        base = next;
      } else {
        break;
      }
    }

    // Try country-level under current base
    if (normCountry) {
      const countryPrefix = `${base}${normCountry}/`;
      if (await folderHasAny(countryPrefix)) {
        // Try city under country
        if (normCity) {
          const cityPrefix = `${countryPrefix}${normCity}/`;
          if (await folderHasAny(cityPrefix)) {
            const cityPick = await pickUnder(cityPrefix);
            if (cityPick) return cityPick;
          }
        }
        // City not found or empty → country default
        const countryPick = await pickUnder(countryPrefix);
        if (countryPick) return countryPick;
      }
    }

    // Country not found → use deepest segmentation folder
    if (base) {
      const segPick = await pickUnder(base);
      if (segPick) return segPick;
    }

    // As a last resort, any image in bucket
    const [anyFiles] = await bucket.getFiles({ autoPaginate: false, maxResults: 200 });
    const imgs = (anyFiles || []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
    if (imgs.length > 0) {
      const pick = imgs[Math.floor(Math.random() * imgs.length)];
      return publicUrlFor(pick.name);
    }
  } catch {}
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.user_id || body?.id || "").trim();
    const bodyCity = String(body?.city || "").trim();
    const bodyCountry = String(body?.country || "").trim();
    const bodyLoc = String(body?.location || "").trim();
    const { city: locCityFromBody, country: locCountryFromBody } = parseCityCountry(bodyLoc);

    const firestore = buildFirestore();
    const storage = buildStorage();

    let city = "";
    let country = "";
    let segmentation = "";

    if (userId) {
      // Location from user profile (users/{id}.user_location)
      const userDoc = await firestore.collection("users").doc(userId).get();
      const userLocation = (userDoc.exists ? (userDoc.get("user_location") as string | undefined) : undefined) || "";
      const fromDoc = parseCityCountry(userLocation);
      city = fromDoc.city || bodyCity || locCityFromBody || "";
      country = fromDoc.country || bodyCountry || locCountryFromBody || "";

      // Segmentation from user_segmentations
      let segDoc = await firestore.collection("user_segmentations").doc(`user_${userId}`).get();
      if (!segDoc.exists) {
        // Some writers use doc id = userId
        segDoc = await firestore.collection("user_segmentations").doc(userId).get();
      }
      if (!segDoc.exists) {
        const q = await firestore.collection("user_segmentations").where("user_id", "==", userId).limit(1).get();
        if (!q.empty) segDoc = q.docs[0];
      }
      segmentation = (segDoc.exists ? (segDoc.get("segmentation_result") as string | undefined) : undefined) || "";
    } else {
      // Anonymous – use body-provided location
      city = bodyCity || locCityFromBody || "";
      country = bodyCountry || locCountryFromBody || "";
    }

    // If we have both segmentation and location, prefer the curated Firestore mapping
    if (segmentation && city) {
      const fsImage = await findImageFromSegmentationsDoc(firestore, segmentation, city, country);
      if (fsImage) {
        return NextResponse.json({ ok: true, imageUrl: fsImage, strategy: "firestore_segmentation" });
      }
    }

    // Fallbacks:
    // - If we know city/country → pick a random image from GCS for this location (seg ignored)
    // - Else → random image from entire bucket
    let gcsImage: string | null = null;
    if (city || country) {
      gcsImage = await pickRandomGcsImageForLocation(storage, city, country, segmentation || undefined);
    }
    if (!gcsImage) {
      // Ultimate fallback: any image in bucket
      try {
        const [any] = await storage.bucket(BUCKET).getFiles({ autoPaginate: false, maxResults: 200 });
        const imgs = (any || []).filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
        if (imgs.length > 0) {
          const pick = imgs[Math.floor(Math.random() * imgs.length)];
          gcsImage = publicUrlFor(pick.name);
        }
      } catch {}
    }
    if (gcsImage) {
      return NextResponse.json({ ok: true, imageUrl: gcsImage, strategy: "gcs_fallback", city, country, segmentation });
    }

    return NextResponse.json({ ok: false, error: "no_image_available", city, country, segmentation }, { status: 404 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ad-image error]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


