import { NextResponse } from "next/server";
import { Firestore } from "@google-cloud/firestore";
import { products, categories } from "@/lib/data";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "eighth-upgrade-475017-u5";
const DATABASE_ID = process.env.FIRESTORE_DB_ID || "adgen-db";
const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;
const SEED_SECRET = process.env.SEED_SECRET || "dev";

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

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  if ((searchParams.get("secret") || "") !== SEED_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const firestore = buildFirestore();
    const batch = firestore.batch();
    for (const p of products) {
      const prodDoc = firestore.collection("products").doc(p.id);
      batch.set(prodDoc, {
        product_id: p.id,
        product_name: p.title,
        product_price: p.priceCents / 100,
        product_description: p.description || "",
        product_category: categories.find((c) => c.id === p.categoryId)?.name || "",
        product_image_urls: [p.image || "https://picsum.photos/seed/img/400/300"],
        product_payload: {}
      }, { merge: true });

      const numbersDoc = firestore.collection("products_numbers").doc(p.id);
      batch.set(numbersDoc, {
        product_id: p.id,
        product_clicked_count: 0,
        product_shared_count: 0,
        product_cart_added_count: 0,
        product_cart_removed_count: 0,
        product_bought_count: 0,
        product_average_clicked_quantity_per_user: 0,
        product_average_bought_quantity_per_user: 0,
        product_bought_countries_count: { us: 0 }
      }, { merge: true });
    }
    await batch.commit();
    return NextResponse.json({ ok: true, count: products.length });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[seed-products error]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


