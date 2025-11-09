import { NextResponse } from "next/server";
import { getFirestore } from "@/lib/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { doc: string } }) {
  const docId = params.doc;

  try {
    const firestore = getFirestore();
    const ref = firestore.collection("instructions").doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      // Return an empty payload so UI can render and allow saving
      return NextResponse.json({
        ok: true,
        doc: docId,
        instruction: "",
        model: "",
        modelName: "",
        description: ""
      });
    }

    const data = snap.data() || {};
    const instruction = (data["instruction"] as string | undefined) || "";
    const model = (data["model"] as string | undefined) || "";
    const modelName = (data["modelName"] as string | undefined) || "";
    const description = (data["description"] as string | undefined) || "";

    return NextResponse.json({
      ok: true,
      doc: docId,
      instruction,
      model,
      modelName,
      description
    });
  } catch (e) {
    // In development, always return empty data to allow UI to work
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[instructions doc api] Development mode: returning empty data for ${docId}`);
      return NextResponse.json({
        ok: true,
        doc: docId,
        instruction: "",
        model: "",
        modelName: "",
        description: "",
        _devMode: true
      });
    }

    // eslint-disable-next-line no-console
    console.error("[instructions doc api]", e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        doc: docId,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: { doc: string } }) {
  const docId = params.doc;

  try {
    const body = await request.json();
    const firestore = getFirestore();
    const ref = firestore.collection("instructions").doc(docId);

    const payload: Record<string, unknown> = {};
    if (typeof body?.instruction === "string") payload["instruction"] = body.instruction;
    if (typeof body?.model === "string") payload["model"] = body.model;
    if (typeof body?.modelName === "string") payload["modelName"] = body.modelName;
    if (typeof body?.description === "string") payload["description"] = body.description;

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // In development, always return success to allow UI to work
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[instructions doc api PUT] Development mode: simulating success for ${docId}`);
      return NextResponse.json({
        ok: true,
        _devMode: true,
        _message: "Data not persisted in development mode"
      });
    }

    // eslint-disable-next-line no-console
    console.error("[instructions doc api PUT]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}


