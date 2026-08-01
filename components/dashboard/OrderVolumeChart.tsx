"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ExplainCaption } from "@/components/shared/ExplainCaption";
import type { QueryResultRow } from "@/lib/queries/analytics";

export function OrderVolumeChart({ data, filterLabel }: { data: QueryResultRow[]; filterLabel: string }) {
  return (
    <div className="card">
      <div className="text-sm font-medium">Order Volume Over Time</div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.map((r) => ({ x: r.label, y: r.value }))}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <Tooltip />
            <Line type="monotone" dataKey="y" stroke="var(--status-info)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ExplainCaption filterLabel={filterLabel} metricLabel="count grouped by week" rows={data} />
    </div>
  );
}
