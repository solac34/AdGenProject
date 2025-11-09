"use client";

import { useEffect, useMemo, useState } from 'react';

type JobInfo = {
  name: string;
  lastRun: Date;
  frequencyMinutes: number;
};

function formatDuration(ms: number): string {
  if (ms < 0) return 'now';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = s % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m ${ss}s`;
}

export default function JobTable() {
  const [now, setNow] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setMounted(true);
  }, []);

  const jobs: JobInfo[] = useMemo(
    () => [
      {
        name: 'ADK: Segment Users',
        lastRun: new Date(Date.now() - 12 * 60 * 1000),
        frequencyMinutes: 60
      },
      {
        name: 'ADK: Aggregate Analytics',
        lastRun: new Date(Date.now() - 48 * 60 * 1000),
        frequencyMinutes: 120
      }
    ],
    []
  );

  return (
    <div className="overflow-hidden rounded-xl border border-brand-gray2">
      <table className="w-full text-sm">
        <thead className="bg-brand-gray3/60">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-zinc-300">Job</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-300">Last run</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-300">Next run</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => {
            const nextRun = new Date(job.lastRun.getTime() + job.frequencyMinutes * 60 * 1000);
            const remaining = nextRun.getTime() - now.getTime();
            return (
              <tr key={i} className="odd:bg-brand-gray4 even:bg-brand-gray3/30">
                <td className="px-4 py-3">{job.name}</td>
                <td className="px-4 py-3 text-zinc-300" suppressHydrationWarning>
                  {mounted ? job.lastRun.toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3" suppressHydrationWarning>
                  {mounted ? (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-brand-gray3/50 px-3 py-1 text-xs">
                      <span className="h-2 w-2 rounded-full bg-brand-blue animate-pulse" />
                      in {formatDuration(remaining)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


