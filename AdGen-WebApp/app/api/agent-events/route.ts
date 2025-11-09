import { NextRequest } from 'next/server';

type AgentEvent = {
  runId: string;
  agent?: string;
  status?: string;
  message?: string;
  step?: string | number | null;
  meta?: unknown;
  timestamp?: number;
};

type StoredEvent = {
  id: string;
  agent: string;
  status: string;
  message: string;
  step: string | number | null;
  meta: unknown;
  timestamp: number;
  receivedAt: number;
};

// Canonical UI event (strict shape expected by frontend)
type UiEvent = {
  id: string;
  agent: string;
  status: string;
  message: string;
  step: string | number | null;
  timestamp: number;
  receivedAt: number;
};

// In-memory event store (per server instance)
// Map: runId -> array of events
const eventStore: Map<string, StoredEvent[]> = new Map();

// SSE subscribers
const subscribers: Map<string, Set<(evt: any) => void>> = new Map();

function publish(runId: string, evt: any) {
  const set = subscribers.get(runId);
  if (!set) return;
  for (const send of set) {
    try {
      // Ensure we publish only the canonical UI shape
      const uiEvt: UiEvent = {
        id: String(evt?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
        agent: String(evt?.agent || 'unknown'),
        status: String(evt?.status || 'info'),
        message: String(evt?.message || ''),
        step: (evt?.step ?? null) as string | number | null,
        timestamp: Number(evt?.timestamp || Date.now()),
        receivedAt: Number(evt?.receivedAt || Date.now()),
      };
      send(uiEvt);
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

  const now = Date.now();
  const eventId = `${now}-${Math.random().toString(36).slice(2, 9)}`;
  
  const storedEvent: StoredEvent = {
    id: eventId,
    agent: body.agent ?? 'unknown',
    status: body.status ?? 'info',
    message: body.message ?? '',
    step: body.step ?? null,
    meta: body.meta ?? null,
    timestamp: typeof body.timestamp === 'number' ? body.timestamp : now,
    receivedAt: now,
  };

  // Store in memory
  const events = eventStore.get(runId) || [];
  events.push(storedEvent);
  eventStore.set(runId, events);

  // Log for debugging
  console.log(`[agent-events POST] Received event for ${runId}:`, {
    agent: storedEvent.agent,
    status: storedEvent.status,
    message: storedEvent.message,
    totalEvents: events.length
  });

  // Broadcast to SSE listeners
  publish(runId, storedEvent);

  return Response.json({ ok: true, eventId, totalEvents: events.length });
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
    const abortSignal = req.signal;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;

        const safeEnqueue = (chunk: Uint8Array) => {
          if (closed) return;
          try {
            controller.enqueue(chunk);
          } catch {
            // Controller likely closed; trigger cleanup
            cleanup();
          }
        };

        function send(evt: any) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }

        const set = subscribers.get(runId) || new Set();
        set.add(send);
        subscribers.set(runId, set);

        console.log(`[agent-events SSE] Client connected for runId: ${runId}, total subscribers: ${set.size}`);

        const hb = setInterval(() => {
          safeEnqueue(encoder.encode(`: ping\n\n`));
        }, 15000);

        const cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(hb);
          const current = subscribers.get(runId);
          if (current) {
            current.delete(send);
            if (current.size === 0) subscribers.delete(runId);
          }
          try {
            // Closing the stream signals the client
            controller.close();
          } catch {}
          const remaining = subscribers.get(runId)?.size || 0;
          console.log(`[agent-events SSE] Client disconnected for runId: ${runId}, remaining subscribers: ${remaining}`);
        };

        // Attach cleanup so cancel() can call it
        // @ts-ignore
        (controller as any)._cleanup = cleanup;

        // If client disconnects, Next.js signals via req.signal
        try {
          if (abortSignal && typeof abortSignal.addEventListener === 'function') {
            abortSignal.addEventListener('abort', cleanup, { once: true } as any);
          }
        } catch {}
      },
      cancel(reason) {
        try {
          // @ts-ignore
          const cleanup = (this as any)._cleanup as (() => void) | undefined;
          if (typeof cleanup === 'function') cleanup();
        } catch {}
      }
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Cache-Tag': 'sse',
      },
    });
  }

  // Regular GET: return stored events (canonical UI shape)
  const events = eventStore.get(runId) || [];
  const limitedEvents = events.slice(-limitNum).map((e): UiEvent => ({
    id: String(e.id),
    agent: String(e.agent || 'unknown'),
    status: String(e.status || 'info'),
    message: String(e.message || ''),
    step: (e.step ?? null) as string | number | null,
    timestamp: Number(e.timestamp || Date.now()),
    receivedAt: Number(e.receivedAt || Date.now()),
  }));

  console.log(`[agent-events GET] Returning ${limitedEvents.length} events for runId: ${runId} (total: ${events.length})`);

  return Response.json({ items: limitedEvents });
}


