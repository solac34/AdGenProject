"use client";
import { useEffect, useState } from "react";

type Data = {
  instruction: string;
  model: string;
  modelName: string;
  description: string;
};

export default function InstructionEditor({
  docId,
  defaultModel = "gemini-2.5-pro",
  defaultModelName = "Gemini 2.5 Pro",
  defaultDescription = "",
  modelOptions = [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ],
  title,
  hideModel = false,
}: {
  docId: string;
  defaultModel?: string;
  defaultModelName?: string;
  defaultDescription?: string;
  modelOptions?: { id: string; name: string }[];
  title?: string;
  hideModel?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Data>({
    instruction: "",
    model: defaultModel,
    modelName: defaultModelName,
    description: defaultDescription,
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(`/api/instructions/${encodeURIComponent(docId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`status_${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!mounted) return;
        setData({
          instruction: d?.instruction ?? "",
          model: d?.model || defaultModel,
          modelName: d?.modelName || defaultModelName,
          description: d?.description || defaultDescription,
        });
      })
      .catch((e) => {
        if (!mounted) return;
        setError(String(e?.message || e));
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [docId, defaultModel, defaultModelName, defaultDescription]);

  async function save() {
    try {
      setSaving(true);
      setOk(false);
      setError(null);
      const res = await fetch(`/api/instructions/${encodeURIComponent(docId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`status_${res.status}`);
      setOk(true);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
      setTimeout(() => setOk(false), 2000);
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-b from-brand-gray3/80 to-brand-gray4 p-1 shadow-glow">
      <div className="rounded-2xl bg-brand-gray4 p-6">
        <div className="mb-6 text-center">
          {!hideModel && (
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
              <span className="h-2 w-2 rounded-full bg-brand-blue" /> {data.model || defaultModel}
            </div>
          )}
          <h3 className="text-2xl font-semibold">{title || data.modelName}</h3>
          <p className="mt-2 text-sm text-zinc-300">{data.description || "—"}</p>
        </div>

        {!hideModel && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <label className="mb-1 block text-xs text-zinc-400">Model</label>
              <select
                className="w-full bg-transparent outline-none"
                value={data.model}
                onChange={(e) => {
                  const id = e.target.value;
                  const option = modelOptions.find((o) => o.id === id);
                  setData((d) => ({
                    ...d,
                    model: id,
                    modelName: option?.name || d.modelName,
                  }));
                }}
              >
                {modelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-brand-gray4">
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
                value={data.modelName}
                onChange={(e) => setData((d) => ({ ...d, modelName: e.target.value }))}
                placeholder="Model name (e.g., Gemini 2.5 Pro)"
              />
            </div>
            <div>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
                value={data.description}
                onChange={(e) => setData((d) => ({ ...d, description: e.target.value }))}
                placeholder="Short description"
              />
            </div>
          </div>
        )}

        <label className="mb-2 block text-sm text-zinc-300">Instruction</label>
        <textarea
          className="min-h-[220px] w-full resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/40"
          value={data.instruction}
          onChange={(e) => setData((d) => ({ ...d, instruction: e.target.value }))}
          placeholder="Enter instruction text..."
        />

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm">
            {loading && <span className="text-zinc-400">Loading…</span>}
            {error && <span className="text-red-300">Error: {error}</span>}
            {ok && <span className="text-emerald-300">Saved</span>}
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
              <path strokeWidth="2" d="M5 12l5 5L20 7" />
            </svg>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}


