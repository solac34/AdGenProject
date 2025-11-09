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
        
        console.log(`[agent-events SSE] Client connected for runId: ${runId}, total subscribers: ${set.size}`);
        
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
            if (current.size === 0) {
              subscribers.delete(runId);
            }
            console.log(`[agent-events SSE] Client disconnected for runId: ${runId}, remaining subscribers: ${current.size}`);
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

  // Regular GET: return stored events
  const events = eventStore.get(runId) || [];
  const limitedEvents = events.slice(-limitNum); // Get last N events
  
  console.log(`[agent-events GET] Returning ${limitedEvents.length} events for runId: ${runId} (total: ${events.length})`);
  
  return Response.json({ items: limitedEvents });
}


