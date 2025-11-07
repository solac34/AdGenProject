"use client";

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

type Step = {
  key: string;
  label: string;
};

const steps: Step[] = [
  { key: 'bootstrap', label: 'Bootstrap agents' },
  { key: 'fetch', label: 'Fetch data' },
  { key: 'analyze', label: 'Analyze & segment' },
  { key: 'store', label: 'Store results' },
  { key: 'finalize', label: 'Finalize' }
];

export default function RunStatusPanel({ runId, onComplete }: { runId: string | null; onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [series, setSeries] = useState<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const start = Date.now();
    const total = 12000; // demo 12s
    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / total);
      setProgress(p);
      setSeries((s) => [...s.slice(-40), { x: Date.now(), y: Math.max(0, Math.sin(p * 6.28) * 200) + 200 + Math.random() * 40 }]);
      const stepIndex = Math.min(steps.length - 1, Math.floor(p * steps.length));
      setCurrentStep(stepIndex);
      if (p >= 1) {
        clearInterval(timer);
        setTimeout(onComplete, 800);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [onComplete, runId]);

  const percent = Math.round(progress * 100);
  const chartData = useMemo(() => series.map((d, i) => ({ name: i, value: d.y })), [series]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-300">Run id: {runId ?? '—'}</p>
        <p className="text-sm text-zinc-300">{percent}%</p>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-brand-gray3">
        <motion.div
          className="absolute left-0 top-0 h-full"
          style={{ background: 'linear-gradient(90deg, #007acc, rgba(0,122,204,0.5))' }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ ease: 'easeInOut' }}
        />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center gap-2">
            <span className={`h-2 w-full rounded-full ${i <= currentStep ? 'bg-brand-blue' : 'bg-brand-gray2'}`} />
            <span className={`text-[11px] text-center ${i <= currentStep ? 'text-white' : 'text-zinc-400'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="h-[220px] rounded-xl border border-brand-gray2/80 bg-brand-gray4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: -20, right: 0, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#007acc" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#007acc" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="#007acc" fill="url(#g)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="text-xs text-zinc-400">
        Live status updates simulated for demo. Replace with Cloud Run events stream.
      </div>
    </div>
  );
}


