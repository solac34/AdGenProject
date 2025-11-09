"use client";
import { useState } from 'react';
import { motion } from 'framer-motion';
import InstructionEditor from '@/components/InstructionEditor';

type AgentKey = "master" | "dataAnalytic" | "creative";

const agentMeta: Record<AgentKey, { title: string; docId: string; description: string }> = {
  master: {
    title: "Master Agent",
    docId: "masterAgentInstruction",
    description: "Master agent orchestrates sub-agents and returns compact JSON status.",
  },
  dataAnalytic: {
    title: "Data Analytic Agent",
    docId: "dataAnalyticAgentInstruction",
    description: "Data analytic agent handles BigQuery + Firestore operations end-to-end.",
  },
  creative: {
    title: "Creative Agent",
    docId: "creativeAgentInstruction",
    description: "Creative agent generates marketing content and updates Firestore.",
  },
};

export default function AgentSettingsPage() {
  const [agent, setAgent] = useState<AgentKey>("master");
  const active = agentMeta[agent];
  const agents: [AgentKey, string, JSX.Element][] = [
    [
      "master",
      "Master",
      (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path strokeWidth="2" d="m3 8 5 4 4-6 4 6 5-4v10H3V8z" />
        </svg>
      ),
    ],
    [
      "dataAnalytic",
      "Data Analytics",
      (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path strokeWidth="2" d="M4 20h16M6 16v-5m6 5V8m6 8v-3" />
        </svg>
      ),
    ],
    [
      "creative",
      "Creative",
      (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path strokeWidth="2" d="M12 3v3m0 12v3m8-9h3M1 12h3m12.02 3.02 2.12 2.12M4.86 4.86 6.98 7m0 10-2.12 2.12m12.02-12.02 2.12-2.12" />
        </svg>
      ),
    ],
  ];
  const activeIndex = agents.findIndex(([key]) => key === agent);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <h1 className="text-3xl font-semibold">Agent Settings</h1>

      <div className="relative w-full max-w-xl">
        <div className="relative grid grid-cols-3 rounded-full border border-white/10 bg-white/5 p-1">
          <motion.div
            className="absolute top-1 bottom-1 rounded-full bg-brand-blue/25 shadow-glow"
            style={{ width: `${100 / agents.length}%`, left: `calc(${activeIndex} * (100% / ${agents.length}))` }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
          />
          {agents.map(([key, label, icon], idx) => {
            const isActive = key === agent;
            return (
              <button
                key={key}
                onClick={() => setAgent(key)}
                className={`relative z-10 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                  isActive ? "text-white" : "text-zinc-300 hover:text-white"
                }`}
              >
                <span className="h-4 w-4">{icon}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <InstructionEditor
        key={active.docId}
        docId={active.docId}
        defaultModel="gemini-2.5-pro"
        defaultModelName="Gemini 2.5 Pro"
        defaultDescription={active.description}
        title={agentMeta[agent].title}
      />
    </div>
  );
}


