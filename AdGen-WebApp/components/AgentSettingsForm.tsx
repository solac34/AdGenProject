"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type AgentKey = "MasterAgent" | "DataAnalyticAgent" | "CreativeAgent";

type AgentSettings = {
  model: string;
  instructions: string;
  runPrompt: string;
};

type SettingsStore = {
  agents: Record<AgentKey, AgentSettings>;
};

const DEFAULTS: SettingsStore = {
  agents: {
    MasterAgent: {
      model: "gemini-2.5-pro",
      instructions:
        "Orchestrate sub-agents, route tasks, enforce priorities. Keep logs concise and actionable.",
      runPrompt: "Coordinate all sub-agents and do your task."
    },
    DataAnalyticAgent: {
      model: "gemini-2.5-pro",
      instructions:
        "Analyze user, order, and traffic data to produce segments and KPIs. Optimize for speed.",
      runPrompt: "Segment users and compute analytics now."
    },
    CreativeAgent: {
      model: "gemini-2.5-pro",
      instructions:
        "Generate compelling copy and assets based on latest segments. Maintain brand tone.",
      runPrompt: "Create ad creatives for latest segments."
    }
  }
};

const STORAGE_KEY = "adgen.settings";

export default function AgentSettingsForm() {
  const [store, setStore] = useState<SettingsStore>(DEFAULTS);
  const [agentKey, setAgentKey] = useState<AgentKey>("MasterAgent");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SettingsStore;
        setStore(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const active = store.agents[agentKey];

  const setActive = (partial: Partial<AgentSettings>) => {
    setStore((s) => ({
      agents: {
        ...s.agents,
        [agentKey]: { ...s.agents[agentKey], ...partial }
      }
    }));
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  };

  const handleReset = () => {
    setStore(DEFAULTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2000);
  };

  const agentOptions = useMemo(
    () =>
      (Object.keys(DEFAULTS.agents) as AgentKey[]).map((k) => ({
        value: k,
        label: k
      })),
    []
  );

  return (
    <div className="space-y-6">
      <div className="card-surface">
        <div className="card-inner space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-medium">Agent Settings</h2>
              <p className="text-sm text-zinc-400">
                Demo-only editor. Model:{" "}
                <span className="text-white">{active.model}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={agentKey}
                onChange={(e) => setAgentKey(e.target.value as AgentKey)}
                className="rounded-lg border border-brand-gray2 bg-brand-gray4 px-3 py-2 text-sm outline-none"
              >
                {agentOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">System Instructions</label>
              <textarea
                value={active.instructions}
                onChange={(e) => setActive({ instructions: e.target.value })}
                rows={8}
                className="w-full resize-y rounded-xl border border-brand-gray2 bg-brand-gray4/80 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-blue/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-zinc-300">Run Prompt</label>
              <textarea
                value={active.runPrompt}
                onChange={(e) => setActive({ runPrompt: e.target.value })}
                rows={8}
                className="w-full resize-y rounded-xl border border-brand-gray2 bg-brand-gray4/80 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-blue/50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-400">
              Model (read-only demo): <span className="text-white">{active.model}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
              >
                Reset Demo Data
              </button>
              <button
                onClick={handleSave}
                className="rounded-xl px-4 py-2 text-sm text-white shadow-glow"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,122,204,0.9), rgba(0,122,204,0.7))"
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: savedAt ? 1 : 0, y: savedAt ? 0 : 6 }}
        className="pointer-events-none mx-auto w-fit rounded-full border border-white/15 bg-brand-gray3/70 px-4 py-2 text-xs text-zinc-200 backdrop-blur-sm"
      >
        Saved locally for demo
      </motion.div>
    </div>
  );
}


