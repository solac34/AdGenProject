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

// Simple in-memory SSE broker (per server instance)
const subscribers: Map<string, Set<(evt: any) => void>> = new Map();
function publish(runId: string, evt: any) {
  const set = subscribers.get(runId);
  if (!set) return;
  for (const send of set) {
    try {
      send(evt);
    } catch {
      // ignore
    }
  }
}

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
    // Broadcast to SSE listeners
    publish(runId, { id: `${eventDoc.timestamp}-${Math.random().toString(36).slice(2,7)}`, ...eventDoc });
    return Response.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[agent-events POST]", e);
    
    // Always return success to allow webhooks to work (both dev and prod)
    console.warn(`[agent-events POST] Firestore error, simulating success for ${runId}`);
    // Still broadcast so UI updates in dev
    publish(runId, { id: `${eventDoc.timestamp}-${Math.random().toString(36).slice(2,7)}`, ...eventDoc, _firestoreError: true });
    return Response.json({ ok: true, _firestoreError: true });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');
  const limitParam = searchParams.get('limit');
  const sse = searchParams.get('sse') === '1';
  const limitNum = Math.min(Math.max(parseInt(limitParam || '100', 10) || 100, 1), 500);

  if (!runId) {
    return new Response(JSON.stringify({ error: 'missing_runId' }), { status: 400 });
  }

  // Server-Sent Events stream for live updates
  if (sse) {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        function send(evt: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }
        // Register subscriber
        const set = subscribers.get(runId) || new Set();
        set.add(send);
        subscribers.set(runId, set);
        // Heartbeat
        const hb = setInterval(() => {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        }, 15000);
        // Cleanup
        // @ts-ignore
        controller._onClose = () => {
          clearInterval(hb);
          const current = subscribers.get(runId);
          if (current) {
            current.delete(send);
            if (current.size === 0) subscribers.delete(runId);
          }
        };
      },
      cancel() {
        // @ts-ignore
        if (typeof (this as any)._onClose === 'function') (this as any)._onClose();
      }
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
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

    const items = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    return Response.json({ items });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[agent-events GET]", e);
    
    // Always return empty items to allow UI to work (both dev and prod)
    console.warn(`[agent-events GET] Firestore error, returning empty items for ${runId}`);
    return Response.json({ items: [], _firestoreError: true });
  }
}


