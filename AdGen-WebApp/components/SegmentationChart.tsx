"use client";

import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// Suppress YAxis defaultProps warning by providing all required props
const CustomYAxis = (props: any) => (
  <YAxis 
    {...props}
    type={props.type || "number"}
    domain={props.domain || ['dataMin', 'dataMax']}
    allowDecimals={props.allowDecimals !== undefined ? props.allowDecimals : false}
    width={props.width || 40}
  />
);

type ChartRow = { run: string; users: number };

export default function SegmentationChart() {
  const [rows, setRows] = useState<ChartRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/segmentations?limit=12', { cache: 'no-store' });
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        const formatted: ChartRow[] = items.map((it: any, idx: number) => ({
          run: it.label || `#${idx + 1}`,
          users: Number(it.total_users || 0),
        }));
        if (!cancelled) setRows(formatted);
      } catch {
        // Fallback demo data if API not available
        if (!cancelled) {
          const demo = Array.from({ length: 12 }).map((_, i) => ({
            run: `#${i + 1}`,
            users: Math.round(50 + Math.random() * 450),
          }));
          setRows(demo);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis 
            dataKey="run" 
            stroke="#9ca3af" 
            tickLine={false} 
            axisLine={false} 
          />
          <CustomYAxis 
            stroke="#9ca3af" 
            tickLine={false} 
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ 
              background: '#252526', 
              border: '1px solid #2d2d30', 
              borderRadius: 12, 
              color: 'white' 
            }}
          />
          <Bar dataKey="users" fill="#007acc" radius={[10, 10, 4, 4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


