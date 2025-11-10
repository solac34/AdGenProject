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
  const TOTAL_EVENTS = 22;
  const PROGRESS_CAP = 95; // Slow-fill target before completion
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [showStatus, setShowStatus] = useState<boolean>(false);
  const [prompt, setPrompt] = useState('Do your segmentation task. Process pending users and return appropriate status.');
  const [maxRounds, setMaxRounds] = useState(8);
  const [result, setResult] = useState<any>(null);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronMessage, setCronMessage] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const fakeTickerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // Live SSE stream for instant updates (with polling fallback below)
  useEffect(() => {
    if (!runId || !isRunning) return;

    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/agent-events?runId=${encodeURIComponent(runId)}&sse=1`);
      es.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data || '{}');
          const newEvent: AgentEvent = {
            id: String(parsed.id),
            agent: parsed.agent || 'unknown',
            status: parsed.status || 'info',
            message: parsed.message || '',
            step: parsed.step ?? null,
            timestamp: Number(parsed.timestamp || Date.now()),
            receivedAt: Date.now(),
          };
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            const updated = [...prev, newEvent];
            const terminalStatuses = ['completed','finished','failed','error','segmentation_finished','flow_finished'];
            const hasTerminal = terminalStatuses.includes((newEvent.status || '').toLowerCase());
            if (hasTerminal || updated.length >= TOTAL_EVENTS) {
              setProgressPercent(100);
              setIsRunning(false);
            }
            return updated.slice(-500);
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

    return () => {
      try { es?.close(); } catch {}
    };
  }, [runId, isRunning]);

  // Polling for agent events (safety net)
  useEffect(() => {
    if (!runId || !isRunning) {
      startTimeRef.current = null;
      return;
    }

    console.log(`[AgentRunnerPage] Setting up polling for runId: ${runId}`);

    // Set start time for timeout mechanism
    startTimeRef.current = Date.now();

    let lastTimestamp = 0;
    let pollInterval: NodeJS.Timeout | null = null;

    const fetchEvents = async () => {
      try {
        const url = lastTimestamp > 0
          ? `/api/agent-events?runId=${encodeURIComponent(runId)}&since=${lastTimestamp}`
          : `/api/agent-events?runId=${encodeURIComponent(runId)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
          console.log(`[AgentRunnerPage] Fetched ${data.items.length} new events`);

          const newEvents: AgentEvent[] = data.items.map((item: any) => ({
            id: item.id,
            agent: item.agent || 'unknown',
            status: item.status || 'info',
            message: item.message || '',
            step: item.step ?? null,
            timestamp: Number(item.timestamp || Date.now()),
            receivedAt: Date.now(),
          }));

          // Update lastTimestamp
          const maxTimestamp = Math.max(...newEvents.map(e => e.timestamp));
          if (maxTimestamp > lastTimestamp) {
            lastTimestamp = maxTimestamp;
          }

          // Add new events to the list
          setEvents((prevEvents) => {
            const updated = [...prevEvents, ...newEvents];
            const terminalStatuses = ['completed','finished','failed','error','segmentation_finished','flow_finished'];
            const hasTerminal = updated.some(e => terminalStatuses.includes((e.status || '').toLowerCase()));
            if (hasTerminal || updated.length >= TOTAL_EVENTS) {
              setProgressPercent(100);
            }
            return updated.slice(-500); // Keep last 500 events
          });

          // Check if run is completed
          const lastEvent = newEvents[newEvents.length - 1];
          if (
            lastEvent.status === 'completed' ||
            lastEvent.status === 'error' ||
            lastEvent.status === 'finished' ||
            lastEvent.status === 'failed' ||
            lastEvent.status === 'segmentation_finished' ||
            lastEvent.status === 'flow_finished'
          ) {
            console.log(`[AgentRunnerPage] Run completed with status: ${lastEvent.status}, stopping polling`);
            setIsRunning(false);
            setProgressPercent(100);
          }
        }
      } catch (error) {
        console.error('[AgentRunnerPage] Failed to fetch events:', error);
      }
    };

    // Initial fetch
    fetchEvents();

    // Poll every 1.5 seconds for redundancy
    pollInterval = setInterval(fetchEvents, 1500);

    // Timeout mechanism
    const timeout = setTimeout(() => {
      console.log(`[AgentRunnerPage] Timeout reached for runId: ${runId}, stopping polling`);
      setIsRunning(false);
    }, 10 * 60 * 1000); // 10 minutes

    return () => {
      if (pollInterval) {
        console.log(`[AgentRunnerPage] Stopping polling for runId: ${runId}`);
        clearInterval(pollInterval);
      }
      clearTimeout(timeout);
      startTimeRef.current = null;
    };
  }, [runId, isRunning]);

  // Fake progress ticker (show-only). While running, smoothly increases up to PROGRESS_CAP with easing.
  useEffect(() => {
    if (!isRunning) {
      if (fakeTickerRef.current) {
        clearInterval(fakeTickerRef.current);
        fakeTickerRef.current = null;
      }
      return;
    }
    if (fakeTickerRef.current) return;
    fakeTickerRef.current = setInterval(() => {
      setProgressPercent((p) => {
        if (p >= PROGRESS_CAP) return p; // cap until terminal
        // Easing: larger steps early, tiny steps near the cap
        let inc: number;
        if (p < 50) {
          inc = 0.8 + Math.random() * 0.8; // 0.8% - 1.6%
        } else if (p < 85) {
          inc = 0.4 + Math.random() * 0.4; // 0.4% - 0.8%
        } else {
          inc = 0.12 + Math.random() * 0.13; // 0.12% - 0.25%
        }
        // Small chance to skip a tick near the end to avoid rushing to the cap
        if (p > 90 && Math.random() < 0.25) return p;
        const next = Math.min(PROGRESS_CAP, p + inc);
        return next;
      });
    }, 900);
    return () => {
      if (fakeTickerRef.current) {
        clearInterval(fakeTickerRef.current);
        fakeTickerRef.current = null;
      }
    };
  }, [isRunning]);

  const startAgentRun = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setEvents([]);
    setProgressPercent(0);
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
    setProgressPercent(0);
    setResult(null);
    setIsRunning(true); // start UI immediately
    setShowStatus(true);

    try {
      // Seed demo data first
      try {
        const seedResp = await fetch('/api/seedmega', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalUsers: 2,
            anonCount: 0,
            orderChance: 1.0,
            usShare: 100,
            euShare: 0,
            otherShare: 0,
          }),
        });
        const seedData = await seedResp.json().catch(() => ({}));
        console.log('[AgentRunnerPage] seedmega response:', seedData);
        if (!seedResp.ok || seedData?.ok === false) {
          setCronMessage(`Seedmega failed: status ${seedResp.status}`);
        }
      } catch {}

      // Dümdüz cronjob'ı tetikle, cronjob her şeyi halleder
      const resp = await fetch('/api/run-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      console.log('RESPONSE 111', resp);

      const data = await resp.json().catch(() => ({}));

      console.log('RESPONSE 222', resp);


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

  // Human-readable phase based on progress percent
  const phaseLabels = [
    'Retrieving Latest Activity',
    'Comparing Activity Counts',
    'Writing new latest activity to Firestore',
    'Checking users to segmentate',
    'Segmentating users',
    'Writing segmentation results',
    'Checking segmentations to create a content',
    'Creating content',
  ];

  const getPhaseIndex = (pct: number) => {
    if (pct <= 7) return 0;      // 1-7
    if (pct <= 15) return 1;     // 8-15
    if (pct <= 20) return 2;     // 16-20
    if (pct <= 30) return 3;     // 20-30
    if (pct <= 60) return 4;     // 30-60
    if (pct <= 65) return 5;     // 61-65
    if (pct <= 72) return 6;     // 65-72
    return 7;                    // 72-100 (pre-terminal)
  };

  const currentPhaseText = (() => {
    if (progressPercent >= 100) return 'DONE';
    return phaseLabels[getPhaseIndex(progressPercent)] || 'Starting';
  })();

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
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>Progress</span>
                  <span>{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {/* Status pill (visible after pressing the button) */}
                {showStatus && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
                    {progressPercent >= 100 ? (
                      // Check icon
                      <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      // Spinner
                      <span className="inline-block h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    <span className="truncate max-w-[70vw] sm:max-w-none">{currentPhaseText}</span>
                  </div>
                )}
              </div>

              {/* Events List - hidden until first event arrives */}
              {events.length > 0 && (
                <div className="h-96 overflow-y-auto space-y-2 scrollbar-thin scrollbar-track-brand-gray3 scrollbar-thumb-brand-blue/30">
                  <AnimatePresence>
                    {events.map((event, index) => (
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
                    ))}
                  </AnimatePresence>
                  <div ref={eventsEndRef} />
                </div>
              )}
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
