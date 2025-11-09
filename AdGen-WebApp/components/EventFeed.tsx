"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

type FeedEvent = {
  id: string;
  agent?: string;
  status?: string;
  message?: string;
  step?: string | number | null;
  timestamp?: number;
};

export default function EventFeed({ runId }: { runId: string | null }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const fetchOnce = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/agent-events?runId=${encodeURIComponent(runId)}&limit=200`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as { items: FeedEvent[] };
        setEvents(Array.isArray(data.items) ? data.items : []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    // initial + poll
    fetchOnce();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(fetchOnce, 1500);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [runId]);

  const rows = useMemo(() => {
    return events.map((e) => {
      const t = e.timestamp ? new Date(e.timestamp) : null;
      const time = t ? t.toLocaleTimeString() : '—';
      const status = (e.status || 'info').toLowerCase();
      const color =
        status === 'error'
          ? 'text-red-400'
          : status === 'completed'
          ? 'text-emerald-400'
          : status === 'started'
          ? 'text-sky-400'
          : 'text-zinc-300';
      return { ...e, time, color };
    });
  }, [events]);

  return (
    <div className="rounded-xl border border-brand-gray2/80 bg-brand-gray4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-brand-gray2/60">
        <div className="text-sm text-zinc-300">Live Events</div>
        <div className="text-xs text-zinc-500">{loading ? 'updating…' : ''}</div>
      </div>
      <div className="max-h-56 overflow-auto divide-y divide-brand-gray2/50">
        {rows.length === 0 ? (
          <div className="p-4 text-sm text-zinc-400">No events yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="px-4 py-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${r.color}`}>{r.status}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-300">{r.agent ?? '—'}</span>
                  {r.step != null && (
                    <>
                      <span className="text-zinc-400">·</span>
                      <span className="text-zinc-400">step: {String(r.step)}</span>
                    </>
                  )}
                </div>
                <div className="text-zinc-500">{r.time}</div>
              </div>
              {r.message ? <div className="mt-1 text-zinc-300">{r.message}</div> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}


