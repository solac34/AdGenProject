import { NextRequest } from 'next/server';
import { getFirestore } from '@/lib/firestore';

type AgentEvent = {
  runId: string;
  agent?: string;
  status?: string;
  message?: string;
  step?: string | number | null;
  meta?: unknown;
  timestamp?: number;
};

export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get('x-webhook-secret');
  const sharedSecret = process.env.WEBHOOK_SECRET;
  if (sharedSecret && secretHeader !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  let body: AgentEvent;
  try {
    body = (await req.json()) as AgentEvent;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  const { runId } = body || {};
  if (!runId || typeof runId !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_runId' }), { status: 400 });
  }

  const db = getFirestore();
  const now = Date.now();
  const eventDoc = {
    agent: body.agent ?? 'unknown',
    status: body.status ?? 'info',
    message: body.message ?? '',
    step: body.step ?? null,
    meta: body.meta ?? null,
    timestamp: typeof body.timestamp === 'number' ? body.timestamp : now,
    receivedAt: now,
  };

  try {
    await db
      .collection('runs')
      .doc(runId)
      .collection('events')
      .add(eventDoc);
    return Response.json({ ok: true });
  } catch (e) {
    // In development, always return success to allow UI to work
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[agent-events POST] Development mode: simulating success for ${runId}`);
      return Response.json({ ok: true, _devMode: true });
    }
    return new Response(JSON.stringify({ error: 'firestore_error' }), { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');
  const limitParam = searchParams.get('limit');
  const limitNum = Math.min(Math.max(parseInt(limitParam || '100', 10) || 100, 1), 500);

  if (!runId) {
    return new Response(JSON.stringify({ error: 'missing_runId' }), { status: 400 });
  }

  try {
    const db = getFirestore();
    const snap = await db
      .collection('runs')
      .doc(runId)
      .collection('events')
      .orderBy('timestamp', 'asc')
      .limit(limitNum)
      .get();

    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    return Response.json({ items });
  } catch (e) {
    // In development, return empty items to allow UI to work
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[agent-events GET] Development mode: returning empty items for ${runId}`);
      return Response.json({ items: [], _devMode: true });
    }
    return new Response(JSON.stringify({ error: 'firestore_error' }), { status: 500 });
  }
}


