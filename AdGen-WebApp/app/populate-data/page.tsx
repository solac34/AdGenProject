"use client";
import { useState } from "react";

export default function PopulateDataPage() {
  const [totalUsers, setTotalUsers] = useState(50);
  const [orderChance, setOrderChance] = useState(0.25);
  const [anonCount, setAnonCount] = useState(20);
  const [usShare, setUsShare] = useState(0.5);
  const [euShare, setEuShare] = useState(0.4);
  const [otherShare, setOtherShare] = useState(0.1);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>("");

  async function runSeed() {
    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/seedmega", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalUsers,
          orderChance,
          anonCount,
          usShare,
          euShare,
          otherShare,
        }),
      });
      const data = await res.json();
      setOutput(data.output || JSON.stringify(data, null, 2));
    } catch (e: any) {
      setOutput(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const sum = (Number(usShare) || 0) + (Number(euShare) || 0) + (Number(otherShare) || 0);
  const sumOk = Math.abs(sum - 1.0) < 1e-6;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <h1 className="text-2xl font-semibold mb-4">Populate Data</h1>
      <div className="grid grid-cols-1 gap-4">
        <label className="space-y-1">
          <span className="text-sm text-zinc-300">Total users</span>
          <input
            type="number"
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
            value={totalUsers}
            onChange={(e) => setTotalUsers(parseInt(e.target.value || "0", 10))}
            min={1}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-zinc-300">Order chance (0.0 - 1.0)</span>
          <input
            type="number"
            step="0.01"
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
            value={orderChance}
            onChange={(e) => setOrderChance(parseFloat(e.target.value || "0"))}
            min={0}
            max={1}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-zinc-300">Anonymous session count</span>
          <input
            type="number"
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
            value={anonCount}
            onChange={(e) => setAnonCount(parseInt(e.target.value || "0", 10))}
            min={0}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-sm text-zinc-300">US share</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              value={usShare}
              onChange={(e) => setUsShare(parseFloat(e.target.value || "0"))}
              min={0}
              max={1}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-zinc-300">EU share</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              value={euShare}
              onChange={(e) => setEuShare(parseFloat(e.target.value || "0"))}
              min={0}
              max={1}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-zinc-300">Other share</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2"
              value={otherShare}
              onChange={(e) => setOtherShare(parseFloat(e.target.value || "0"))}
              min={0}
              max={1}
            />
          </label>
        </div>
        <div className="text-xs text-zinc-400">Sum: {sum.toFixed(2)} {sumOk ? '' : '(should equal 1.00)'}</div>
        <button
          disabled={loading || !sumOk}
          onClick={runSeed}
          className="mt-2 inline-flex items-center justify-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-50"
        >
          {loading ? "Seeding..." : "Run seedMega"}
        </button>
        <pre className="mt-4 whitespace-pre-wrap rounded-md bg-black/40 p-3 text-xs leading-5">
          {output || "Output will appear here..."}
        </pre>
      </div>
    </div>
  );
}


