"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type AgentEvent = {
  id: string;
  agent: string;
  status: string;
  message: string;
  step?: string | number | null;
  timestamp: number;
  receivedAt: number;
};

type RunResult = {
  runId: string;
  forwarded: boolean;
  error?: string;
  result?: any;
};

export default function AgentRunnerPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [prompt, setPrompt] = useState('Do your segmentation task. Process pending users and return appropriate status.');
  const [maxRounds, setMaxRounds] = useState(8);
  const [result, setResult] = useState<any>(null);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronMessage, setCronMessage] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // Live events via SSE + polling fallback
  useEffect(() => {
    if (!runId || !isRunning) {
      startTimeRef.current = null;
      return;
    }

    // Set start time for timeout mechanism
    startTimeRef.current = Date.now();

    // SSE stream
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/agent-events?runId=${encodeURIComponent(runId)}&sse=1`);
      es.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data || '{}') as Partial<AgentEvent> & { id?: string };
          const id = parsed.id || `${parsed.timestamp}-${Math.random().toString(36).slice(2,7)}`;
          setEvents((prev) => {
            if (prev.some((e) => e.id === id)) return prev;
            const next = [...prev, { 
              id,
              agent: parsed.agent || 'unknown',
              status: parsed.status || 'info',
              message: parsed.message || '',
              step: parsed.step ?? null,
              timestamp: Number(parsed.timestamp || Date.now()),
              receivedAt: Date.now(),
            }];
            // Stop if terminal status received
            const last = next[next.length - 1];
            const term = ['completed','finished','failed','error','segmentation_finished','flow_finished'];
            if (last && term.includes((last.status || '').toLowerCase())) {
              setIsRunning(false);
            }
            return next.slice(-500);
          });
        } catch {
          // ignore malformed
        }
      };
      es.onerror = () => {
        try { es?.close(); } catch {}
      };
    } catch {
      // ignore
    }

    const pollEvents = async () => {
      try {
        // Check for timeout (5 minutes max polling)
        if (startTimeRef.current && Date.now() - startTimeRef.current > 5 * 60 * 1000) {
          console.log(`[AgentRunnerPage] Polling timeout reached for runId: ${runId}, stopping polling`);
          setIsRunning(false);
          return;
        }

        const res = await fetch(`/api/agent-events?runId=${runId}&limit=100`);
        const data = await res.json();
        if (data.items) {
          setEvents(data.items);
          
          // Check if run is completed
          const lastEvent = data.items[data.items.length - 1];
          if (lastEvent && (
            lastEvent.status === 'completed' || 
            lastEvent.status === 'error' || 
            lastEvent.status === 'finished' ||
            lastEvent.status === 'failed' ||
            lastEvent.status === 'segmentation_finished' ||
            lastEvent.status === 'flow_finished'
          )) {
            console.log(`[AgentRunnerPage] Run completed with status: ${lastEvent.status}, stopping polling`);
            setIsRunning(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch events:', error);
      }
    };

    // Poll immediately and then every 3 seconds (different from EventFeed to reduce overlap)
    pollEvents();
    const interval = setInterval(pollEvents, 3000);

    return () => {
      clearInterval(interval);
      startTimeRef.current = null;
      try { es?.close(); } catch {}
    };
  }, [runId, isRunning]);

  const startAgentRun = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setEvents([]);
    setResult(null);

    try {
      console.log('🚀 Starting agent run...');
      const res = await fetch('/api/run', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          max_rounds: maxRounds
        })
      });
      
      const data: RunResult = await res.json();
      console.log('📊 Agent run response:', data);
      
      setRunId(data.runId);
      setResult(data.result);
      
      if (!data.forwarded) {
        console.warn('⚠️ Request not forwarded to agents service:', data.error || 'Unknown reason');
        setIsRunning(false);
      } else {
        console.log('✅ Agent run initiated successfully');
      }
    } catch (error) {
      console.error('❌ Failed to start agent run:', error);
      setIsRunning(false);
      setRunId(`error-${Date.now()}`);
    }
  };

  const runAgentTeam = async () => {
    if (cronLoading) return;
    setCronLoading(true);
    setCronMessage(null);
    setEvents([]);
    setResult(null);
    
    try {
      // Dümdüz cronjob'ı tetikle, cronjob her şeyi halleder
      const resp = await fetch('/api/run-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      console.log('🚀 Cronjob response:', resp);

      const data = await resp.json().catch(() => ({}));
      
      console.log('🚀 Cronjob data:', data);

      
      // Cronjob'dan dönen response'dan run_id'yi al
      if (data?.response?.run_id) {
        setRunId(data.response.run_id);
        setIsRunning(true);
        setCronMessage('Agent team run triggered successfully.');
      } else {
        setCronMessage(data?.ok ? 'Agent team run triggered.' : `Trigger returned status ${data?.status || 'unknown'}`);
      }
    } catch (e) {
      setCronMessage('Failed to trigger agent team. Check logs or network.');
      setIsRunning(false);
    } finally {
      setCronLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'started': return 'text-blue-400 bg-blue-400/10';
      case 'progress': return 'text-yellow-400 bg-yellow-400/10';
      case 'completed': 
      case 'finished': return 'text-green-400 bg-green-400/10';
      case 'error': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-brand-blue" /> Agent Runner
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight bg-gradient-to-r from-white via-white to-brand-blue bg-clip-text text-transparent drop-shadow-[0_2px_20px_rgba(0,122,204,0.25)]"
        >
          Agent Control Panel
        </motion.h1>
        <p className="mt-3 text-sm text-zinc-300 max-w-2xl">
          Send custom prompts to the agent system and monitor real-time progress with detailed event tracking.
        </p>
      </div>

      {/* Big Trigger Button for the whole team */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6"
      >
        <button
          onClick={runAgentTeam}
          disabled={cronLoading}
          className="w-full px-10 py-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold text-lg shadow-lg shadow-emerald-600/20 hover:from-emerald-400 hover:to-green-500 disabled:opacity-60 transition flex items-center justify-center gap-3"
        >
          {cronLoading ? (
            <>
              <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              RUNNING…
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              RUN AGENT TEAM
            </>
          )}
        </button>
        {cronMessage && (
          <div className="mt-3 text-sm text-zinc-300">{cronMessage}</div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Events Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-3"
        >
          <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
            <div className="rounded-2xl bg-brand-gray4 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-medium">Real-time Events</h2>
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      Live
                    </div>
                  )}
                  <span className="text-xs text-zinc-400">{events.length} events</span>
                </div>
              </div>

              {/* Events List */}
              <div className="h-96 overflow-y-auto space-y-2 scrollbar-thin scrollbar-track-brand-gray3 scrollbar-thumb-brand-blue/30">
                <AnimatePresence>
                  {events.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-400">
                      {isRunning ? 'Waiting for events...' : 'No events yet. Start an agent run to see real-time progress.'}
                    </div>
                  ) : (
                    events.map((event, index) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-3 bg-brand-gray3/30 rounded-lg border border-white/5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(event.status)}`}>
                                {event.status}
                              </span>
                              <span className="text-xs text-zinc-400">{event.agent}</span>
                              {event.step && (
                                <span className="text-xs text-zinc-500">Step {event.step}</span>
                              )}
                            </div>
                            {event.message && (
                              <p className="text-sm text-zinc-200 break-words">{event.message}</p>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500 whitespace-nowrap">
                            {formatTimestamp(event.timestamp)}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
                <div ref={eventsEndRef} />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Result Panel */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6"
        >
          <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
            <div className="rounded-2xl bg-brand-gray4 p-5">
              <h2 className="text-xl font-medium mb-4">Final Result</h2>
              <pre className="bg-brand-gray3/50 p-4 rounded-lg text-sm text-zinc-200 overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
