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

const DOC_MAP: Record<AgentKey, string> = {
  MasterAgent: "masterAgentInstruction",
  DataAnalyticAgent: "dataAnalyticAgentInstruction",
  CreativeAgent: "creativeAgentInstruction"
};

export default function AgentSettingsForm() {
  const [store, setStore] = useState<SettingsStore>(DEFAULTS);
  const [agentKey, setAgentKey] = useState<AgentKey>("MasterAgent");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = store.agents[agentKey];

  async function loadAgent(key: AgentKey) {
    try {
      setLoading(true);
      setError(null);
      const docId = DOC_MAP[key];
      const r = await fetch(`/api/instructions/${encodeURIComponent(docId)}`);
      if (!r.ok) throw new Error(`status_${r.status}`);
      const d = await r.json();
      setStore((s) => ({
        agents: {
          ...s.agents,
          [key]: {
            model: d?.model || s.agents[key].model,
            instructions: d?.instruction ?? s.agents[key].instructions
          }
        }
      }));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgent(agentKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  const setActive = (partial: Partial<AgentSettings>) => {
    setStore((s) => ({
      agents: {
        ...s.agents,
        [agentKey]: { ...s.agents[agentKey], ...partial }
      }
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      const docId = DOC_MAP[agentKey];
      const res = await fetch(`/api/instructions/${encodeURIComponent(docId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: active.instructions,
          model: active.model
        })
      });
      if (!res.ok) throw new Error(`status_${res.status}`);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      setLoading(true);
      setError(null);
      // Reset current agent to defaults and save to Firestore
      const defaults = DEFAULTS.agents[agentKey];
      setActive({ instructions: defaults.instructions, model: defaults.model });
      const docId = DOC_MAP[agentKey];
      const res = await fetch(`/api/instructions/${encodeURIComponent(docId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: defaults.instructions,
          model: defaults.model
        })
      });
      if (!res.ok) throw new Error(`status_${res.status}`);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
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

  const activeIndex = agentOptions.findIndex((o) => o.value === agentKey);

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
        <div className="rounded-2xl bg-brand-gray4 p-6">
          <div className="flex items-center justify-center">
            <div className="relative grid grid-cols-3 items-center rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-sm w-full max-w-xl">
              <motion.div
                className="absolute top-1 bottom-1 rounded-full bg-brand-blue shadow-[0_8px_30px_rgba(0,122,204,0.35)]"
                style={{ width: "calc(100% / 3)", left: `calc(${activeIndex} * (100% / 3))` }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
              />
              {agentOptions.map((o) => {
                const activeTab = agentKey === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => setAgentKey(o.value)}
                    className={`relative z-10 flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition ${
                      activeTab ? "text-white" : "text-zinc-300 hover:text-white"
                    }`}
                  >
                    <span className="text-base">{agentIcon(o.value as AgentKey)}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

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

          <div className="mt-6 space-y-2">
            <label className="text-sm text-zinc-300">Instructions</label>
            <textarea
              value={active.instructions}
              onChange={(e) => setActive({ instructions: e.target.value })}
              rows={10}
              className="w-full resize-y rounded-2xl border border-brand-gray2 bg-brand-gray4/80 p-4 text-sm outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:ring-2 focus:ring-brand-blue/40"
            />
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              onClick={handleReset}
              disabled={loading}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-60"
            >
              Reset Demo Data
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="rounded-xl px-4 py-2 text-sm text-white shadow-glow disabled:opacity-60"
              style={{
                background: "linear-gradient(180deg, rgba(0,122,204,0.9), rgba(0,122,204,0.7))"
              }}
            >
              Save
            </button>
          </div>

          <div className="mt-3 text-sm">
            {loading && <span className="text-zinc-400">Loading…</span>}
            {error && <span className="text-red-300"> Error: {error}</span>}
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: savedAt ? 1 : 0, y: savedAt ? 0 : 6 }}
        className="pointer-events-none mx-auto w-fit rounded-full border border-white/15 bg-brand-gray3/70 px-4 py-2 text-xs text-zinc-200 backdrop-blur-sm"
      >
        Saved
      </motion.div>
    </div>
  );
}


