import { NextResponse } from "next/server";
import { getFirestore } from "@/lib/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const docs = [
    "masterAgentInstruction",
    "dataAnalyticAgentInstruction",
    "creativeAgentInstruction",
    "segmentationInstruction",
  ];
  try {
    const firestore = getFirestore();
    const col = firestore.collection("instructions");
    const results: Record<string, any> = {};
    for (const id of docs) {
      try {
        const snap = await col.doc(id).get();
        if (snap.exists) {
          results[id] = snap.data() || {};
        } else {
          results[id] = {};
        }
      } catch {
        results[id] = { _firestoreError: true };
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[instructions index api]", e);
    return NextResponse.json({
      ok: true,
      results: {},
      _firestoreError: true,
    });
  }
}


