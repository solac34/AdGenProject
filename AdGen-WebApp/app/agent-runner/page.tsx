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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      const sseUrl = `/api/agent-events?runId=${encodeURIComponent(runId)}&sse=1`;
      console.log('🔌 Opening SSE connection:', sseUrl);
      es = new EventSource(sseUrl);
      
      es.onopen = () => {
        console.log('✅ SSE connection opened successfully');
      };
      
      es.onmessage = (evt) => {
        console.log('📨 SSE message received:', evt.data);
        try {
          const parsed = JSON.parse(evt.data || '{}') as Partial<AgentEvent> & { id?: string };
          const id = parsed.id || `${parsed.timestamp}-${Math.random().toString(36).slice(2,7)}`;
          console.log('📦 Parsed event:', { id, agent: parsed.agent, status: parsed.status, message: parsed.message });
          setEvents((prev) => {
            if (prev.some((e) => e.id === id)) {
              console.log('⏭️  Skipping duplicate event:', id);
              return prev;
            }
            const next = [...prev, { 
              id,
              agent: parsed.agent || 'unknown',
              status: parsed.status || 'info',
              message: parsed.message || '',
              step: parsed.step ?? null,
              timestamp: Number(parsed.timestamp || Date.now()),
              receivedAt: Date.now(),
            }];
            console.log('✨ Added event, total:', next.length);
            // Stop if terminal status received
            const last = next[next.length - 1];
            const term = ['completed','finished','failed','error','segmentation_finished','flow_finished'];
            if (last && term.includes((last.status || '').toLowerCase())) {
              console.log('🏁 Terminal status received:', last.status);
              setIsRunning(false);
            }
            return next.slice(-500);
          });
        } catch (err) {
          console.error('❌ Failed to parse SSE message:', err);
        }
      };
      
      es.onerror = (err) => {
        console.error('❌ SSE error:', err);
        try { es?.close(); } catch {}
      };
    } catch (err) {
      console.error('❌ Failed to create SSE connection:', err);
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
      console.log('📝 Prompt:', prompt);
      console.log('🔄 Max rounds:', maxRounds);
      
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
      console.log('🆔 Run ID:', data.runId);
      console.log('📡 Forwarded:', data.forwarded);
      
      setRunId(data.runId);
      setResult(data.result);
      
      if (!data.forwarded) {
        console.warn('⚠️  Request not forwarded to agents service:', data.error || 'Unknown reason');
        setIsRunning(false);
      } else {
        console.log('✅ Agent run initiated successfully, listening for events on:', data.runId);
        console.log('🎧 SSE endpoint:', `/api/agent-events?runId=${data.runId}&sse=1`);
      }
    } catch (error) {
      console.error('❌ Failed to start agent run:', error);
      setIsRunning(false);
      setRunId(`error-${Date.now()}`);
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

      {/* Main Action Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
          <div className="rounded-2xl bg-brand-gray4 p-6">
            <button
              onClick={startAgentRun}
              disabled={isRunning || !prompt.trim()}
              className="w-full px-8 py-6 bg-gradient-to-r from-brand-blue to-blue-600 hover:from-brand-blue/90 hover:to-blue-600/90 disabled:from-brand-blue/30 disabled:to-blue-600/30 disabled:cursor-not-allowed text-white font-semibold text-lg rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-brand-blue/20 relative overflow-hidden group"
            >
              {isRunning ? (
                <>
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Running Agent Flow...</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Manually Run Agent Flow</span>
                </>
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
            </button>

            {/* Advanced Settings Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full mt-4 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-2 transition-colors"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
            </button>

            {/* Advanced Settings Panel */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 mt-4 border-t border-white/10 space-y-4">
                    {/* Prompt Input */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Custom Prompt
                      </label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isRunning}
                        className="w-full h-24 px-3 py-2 bg-brand-gray3 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/50 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                        placeholder="Enter your custom prompt here..."
                      />
                    </div>

                    {/* Max Rounds Input */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Max Rounds
                      </label>
                      <input
                        type="number"
                        value={maxRounds}
                        onChange={(e) => setMaxRounds(parseInt(e.target.value) || 8)}
                        disabled={isRunning}
                        min="1"
                        max="20"
                        className="w-full px-3 py-2 bg-brand-gray3 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-zinc-500">Number of agent execution rounds (1-20)</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Run Info */}
            {runId && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-3 bg-brand-gray3/50 rounded-lg border border-white/5"
              >
                <div className="text-xs text-zinc-400 mb-1">Active Run ID</div>
                <div className="text-sm font-mono text-zinc-200 break-all">{runId}</div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Events Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
          <div className="rounded-2xl bg-brand-gray4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-medium">Live Events</h2>
              <div className="flex items-center gap-3">
                {isRunning && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400"></span>
                    </div>
                    Live
                  </div>
                )}
                <span className="text-xs text-zinc-400 px-2 py-1 bg-brand-gray3/50 rounded-full">{events.length} events</span>
              </div>
            </div>

            {/* Events List */}
            <div className="h-[500px] overflow-y-auto space-y-2 scrollbar-thin scrollbar-track-brand-gray3 scrollbar-thumb-brand-blue/30">
              <AnimatePresence>
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                    <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">{isRunning ? 'Waiting for events...' : 'No events yet. Start an agent run to see real-time progress.'}</p>
                  </div>
                ) : (
                  events.map((event, index) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.3) }}
                      className="p-3 bg-brand-gray3/30 rounded-lg border border-white/5 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
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
