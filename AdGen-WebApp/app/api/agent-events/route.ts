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
}>>();

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
      id: `${runId}-${eventTimestamp}`,
      agent,
      status,
      message: message || '',
      step: step ?? null,
      timestamp: eventTimestamp
    };

    if (!eventsCache.has(runId)) {
      eventsCache.set(runId, []);
    }

    const events = eventsCache.get(runId)!;
    events.push(event);

    // Keep only last 500 events per run
    if (events.length > 500) {
      events.shift();
    }

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

  if (!runId) {
    return Response.json({ error: 'runId is required' }, { status: 400 });
  }

  try {
    const events = eventsCache.get(runId) || [];

    // Filter events after 'since' timestamp (for incremental updates)
    const newEvents = since > 0
      ? events.filter(e => e.timestamp > since)
      : events;

    return Response.json({
      items: newEvents,
      total: events.length
    });
  } catch (error) {
    console.error('[agent-events] GET error:', error);
    return Response.json({ items: [], total: 0 });
  }
}
