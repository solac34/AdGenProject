"use client";

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function SegmentationChart() {
  const data = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        run: `#${i + 1}`,
        users: Math.round(50 + Math.random() * 450)
      })),
    []
  );

  return (
    <div className="h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="run" stroke="#9ca3af" tickLine={false} axisLine={false} />
          <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ background: '#252526', border: '1px solid #2d2d30', borderRadius: 12, color: 'white' }}
          />
          <Bar dataKey="users" fill="#007acc" radius={[10, 10, 4, 4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


