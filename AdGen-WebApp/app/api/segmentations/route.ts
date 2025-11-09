import { NextRequest } from "next/server";
import { getFirestore } from "@/lib/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit") || "50");
  const limit = isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 500);
  try {
    const firestore = getFirestore();
    const col = firestore.collection("segmentations");
    const snap = await col.limit(limit).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));
    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[segmentations api]", e);
    return new Response(JSON.stringify({ ok: true, items: [], _firestoreError: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}


