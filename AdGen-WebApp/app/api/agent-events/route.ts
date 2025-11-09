import { NextRequest } from 'next/server';

// Webhook secret for security
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-here';

// In-memory cache for events (per runId)
// Note: This works in Cloud Run with a single instance
// For multiple instances, consider using Redis or another shared cache
const eventsCache = new Map<string, Array<{
  id: string;
  agent: string;
  status: string;
  message: string;
  step?: string | number | null;
  timestamp: number;
  receivedAt: number;
}>>();

// Live SSE subscribers per runId
const subscribers = new Map<string, Set<(evt: any) => void>>();

function publish(runId: string, evt: any) {
  const subs = subscribers.get(runId);
  if (!subs || subs.size === 0) return;
  for (const send of subs) {
    try {
      send(evt);
    } catch {
      // ignore failing client
    }
  }
}

// Clean up old runs from cache (keep only last 30 minutes)
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [runId, events] of eventsCache.entries()) {
    if (events.length > 0) {
      const lastEventTime = events[events.length - 1].timestamp;
      if (now - lastEventTime > CACHE_TTL) {
        eventsCache.delete(runId);
        console.log(`[agent-events] Cleaned up old run: ${runId}`);
      }
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// POST endpoint for receiving webhook events from agents
export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret
    const providedSecret = req.headers.get('x-webhook-secret');
    if (providedSecret !== WEBHOOK_SECRET) {
      console.warn('[agent-events] Invalid webhook secret');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { runId, agent, status, message, step, timestamp } = body;

    if (!runId || !agent || !status) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`[agent-events] Received event: ${runId} ${agent} ${status} ${message || ''}`);

    // Store event in cache
    const eventTimestamp = timestamp || Date.now();
    const event = {
      id: `${runId}-${eventTimestamp}-${Math.random().toString(36).slice(2,7)}`,
      agent,
      status,
      message: message || '',
      step: step ?? null,
      timestamp: eventTimestamp,
      receivedAt: Date.now(),
    };

    if (!eventsCache.has(runId)) {
      eventsCache.set(runId, []);
    }

    const events = eventsCache.get(runId)!;
    events.push(event);

    // Keep only last 500 events per run (memory replay)
    if (events.length > 500) {
      events.shift();
    }

    // Broadcast live to SSE subscribers (best-effort)
    publish(runId, event);

    return Response.json({ ok: true });

  } catch (error) {
    console.error('[agent-events] Webhook error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET endpoint for fetching events (polling)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');
  const since = parseInt(searchParams.get('since') || '0');
  const sse = searchParams.get('sse') === '1';

  if (!runId) {
    return Response.json({ error: 'runId is required' }, { status: 400 });
  }

  try {
    // Live SSE stream
    if (sse) {
      const abortSignal = req.signal;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let closed = false;

          const safeEnqueue = (data: any) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {
              cleanup();
            }
          };

          const send = (evt: any) => safeEnqueue(evt);

          const set = subscribers.get(runId) || new Set<(evt: any) => void>();
          set.add(send);
          subscribers.set(runId, set);

          // Replay recent events so UI shows history immediately
          const recent = (eventsCache.get(runId) || []).slice(-100);
          for (const e of recent) safeEnqueue(e);

          const hb = setInterval(() => {
            if (!closed) {
              try { controller.enqueue(new TextEncoder().encode(`: ping\n\n`)); } catch { cleanup(); }
            }
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
            try { controller.close(); } catch {}
          };

          // @ts-ignore
          (controller as any)._cleanup = cleanup;
          try {
            if (abortSignal && typeof abortSignal.addEventListener === 'function') {
              abortSignal.addEventListener('abort', cleanup, { once: true } as any);
            }
          } catch {}
        },
        cancel() {
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
          'X-Accel-Buffering': 'no'
        },
      });
    }

    // Return from local memory cache
    const memEvents = eventsCache.get(runId) || [];
    const newEvents = since > 0 ? memEvents.filter(e => e.timestamp > since) : memEvents;
    return Response.json({ items: newEvents, total: memEvents.length });
  } catch (error) {
    console.error('[agent-events] GET error:', error);
    return Response.json({ items: [], total: 0 });
  }
}
