"use client";

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SegmentationChart from '../components/SegmentationChart';
import JobTable from '../components/JobTable';
import RunStatusPanel from '../components/RunStatusPanel';
import RunButton from '../components/RunButton';
import InstructionCard from '../components/InstructionCard';

export default function HomePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  const headerTitle = useMemo(
    () => (
      <div className="relative w-full overflow-hidden">
        <div className="pointer-events-none absolute -inset-x-40 -top-24 -z-10 h-56 rotate-6 bg-[radial-gradient(closest-side,_rgba(0,122,204,0.35),_transparent_70%)] blur-2xl" />
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-brand-blue" /> Google Cloud Run + ADK
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-tight bg-gradient-to-r from-white via-white to-brand-blue bg-clip-text text-transparent drop-shadow-[0_2px_20px_rgba(0,122,204,0.25)]"
        >
          Agent Control Center
        </motion.h1>
        <p className="mt-3 text-sm text-zinc-300 max-w-2xl">
          Elegant, fast, and focused—monitor schedules, segmentation output, and trigger on-demand agent runs.
        </p>
      </div>
    ),
    []
  );

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <header className="mb-8">{headerTitle}</header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <motion.section
          layout
          className="lg:col-span-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
            <div className="rounded-2xl bg-brand-gray4 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-medium">Segmentation per Run</h2>
                <span className="text-xs text-zinc-400">realtime</span>
              </div>
              <AnimatePresence mode="wait">
                {isRunning ? (
                  <RunStatusPanel key="status" runId={runId} onComplete={() => setIsRunning(false)} />
                ) : (
                  <SegmentationChart key="chart" />
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>

        <motion.aside
          layout
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
            <div className="rounded-2xl bg-brand-gray4 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-medium">Job Schedule</h2>
                <span className="text-xs text-zinc-400">Google Cloud Scheduler</span>
              </div>
              <JobTable />
            </div>
          </div>
        </motion.aside>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-4 flex items-center justify-center"
      >
        <div className="relative">
          <div className="pointer-events-none absolute -inset-x-16 -top-10 z-[-1] h-24 rounded-full bg-brand-blue/30 blur-3xl" />
          <RunButton
            size="lg"
            isRunning={isRunning}
            onClick={async () => {
              if (isRunning) return;
              setIsRunning(true);
              try {
                console.log('🚀 Starting agent run...');
                const res = await fetch('/api/run', { method: 'POST' });
                const data = (await res.json()) as { 
                  runId: string; 
                  forwarded?: boolean; 
                  error?: string;
                  agentsUrl?: string;
                };
                
                console.log('📊 Agent run response:', data);
                console.log('🆔 Setting runId:', data.runId);
                setRunId(data.runId);
                
                if (!data.forwarded) {
                  console.warn('⚠️ Request not forwarded to agents service:', data.error || 'Unknown reason');
                } else {
                  console.log('✅ Agent run initiated successfully');
                  console.log('🔄 EventFeed should start polling for runId:', data.runId);
                }
              } catch (error) {
                console.error('❌ Failed to start agent run:', error);
                setRunId(`error-${Date.now()}`);
              }
            }}
          />
        </div>
      </motion.div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <InstructionCard docId="masterAgentInstruction" title="Master Agent Instruction" />
        <InstructionCard docId="dataAnalyticAgentInstruction" title="Data Analytic Agent Instruction" />
        <InstructionCard docId="creativeAgentInstruction" title="Creative Agent Instruction" />
      </div>
      <div className="mt-6">
        <a href="/segmentations" className="text-sm text-brand-blue hover:underline">
          Go to Segmentations ›
        </a>
      </div>
    </div>
  );
}


