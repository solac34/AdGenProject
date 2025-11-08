/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";

export default function InstructionCard({ docId, title }: { docId: string; title: string }) {
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function Icon() {
    if (docId === "masterAgentInstruction") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path strokeWidth="2" d="m3 8 5 4 4-6 4 6 5-4v10H3V8z" />
        </svg>
      );
    }
    if (docId === "dataAnalyticAgentInstruction") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path strokeWidth="2" d="M4 20h16M6 16v-5m6 5V8m6 8v-3" />
        </svg>
      );
    }
    if (docId === "creativeAgentInstruction") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path strokeWidth="2" d="M12 3v3m0 12v3m8-9h3M1 12h3m12.02 3.02 2.12 2.12M4.86 4.86 6.98 7m0 10-2.12 2.12m12.02-12.02 2.12-2.12" />
        </svg>
      );
    }
    return null;
  }

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
        setText(d?.instruction || "");
      })
      .catch((e) => {
        if (!mounted) return;
        setError(String(e?.message || e));
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [docId]);

  return (
    <div className="rounded-xl bg-brand-gray4 p-5 border border-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-medium inline-flex items-center gap-2">
          <span className="h-4 w-4">
            <Icon />
          </span>
          {title}
        </h3>
        {loading && <span className="text-xs text-zinc-400">loading…</span>}
      </div>
      {error ? (
        <div className="text-sm text-red-300">Error: {error}</div>
      ) : (
        <pre className="whitespace-pre-wrap text-sm text-zinc-200">{text || "—"}</pre>
      )}
    </div>
  );
}


