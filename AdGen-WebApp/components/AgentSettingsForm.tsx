"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type AgentKey = "MasterAgent" | "DataAnalyticAgent" | "CreativeAgent";

type AgentSettings = {
  model: string;
  instructions: string;
};

type SettingsStore = {
  agents: Record<AgentKey, AgentSettings>;
};

const DEFAULTS: SettingsStore = {
  agents: {
    MasterAgent: {
      model: "gemini-2.5-pro",
      instructions:
        "Orchestrate sub-agents, route tasks, enforce priorities. Keep logs concise and actionable."
    },
    DataAnalyticAgent: {
      model: "gemini-2.5-pro",
      instructions:
        "Analyze user, order, and traffic data to produce segments and KPIs. Optimize for speed."
    },
    CreativeAgent: {
      model: "gemini-2.5-pro",
      instructions:
        "Generate compelling copy and assets based on latest segments. Maintain brand tone."
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

  const agentIcon = (key: AgentKey) => {
    switch (key) {
      case "MasterAgent":
        return "🧠";
      case "DataAnalyticAgent":
        return "📊";
      case "CreativeAgent":
        return "🎨";
      default:
        return "🤖";
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-surface">
        <div className="card-inner">
          {/* Agent selector centered */}
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-sm">
              {agentOptions.map((o) => {
                const activeTab = agentKey === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => setAgentKey(o.value)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      activeTab
                        ? "bg-brand-blue text-white shadow-[0_8px_30px_rgba(0,122,204,0.35)]"
                        : "text-zinc-300 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <span className="text-base">{agentIcon(o.value as AgentKey)}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description + model */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300">
              <span className="opacity-80">Model</span>
              <span className="text-white">{active.model}</span>
            </div>
            <p className="mt-3 text-[13px] text-zinc-300/90">
              {agentKey === "MasterAgent" && "Orchestrates all agents and enforces priorities."}
              {agentKey === "DataAnalyticAgent" && "Owns BigQuery/Firestore; prepares segments and KPIs."}
              {agentKey === "CreativeAgent" && "Produces compelling creatives aligned to brand tone."}
            </p>
          </div>

          {/* Single textarea for instructions */}
          <div className="mt-6 space-y-2">
            <label className="text-sm text-zinc-300">Instructions</label>
            <textarea
              value={active.instructions}
              onChange={(e) => setActive({ instructions: e.target.value })}
              rows={10}
              className="w-full resize-y rounded-2xl border border-brand-gray2 bg-brand-gray4/80 p-4 text-sm outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:ring-2 focus:ring-brand-blue/40"
            />
          </div>

          {/* Actions */}
          <div className="mt-5 flex items-center justify-end gap-3">
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


