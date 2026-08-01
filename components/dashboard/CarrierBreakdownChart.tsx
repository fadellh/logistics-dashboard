"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { TooltipValueType } from "recharts";
import { ExplainCaption } from "@/components/shared/ExplainCaption";
import type { QueryResultRow } from "@/lib/queries/analytics";
import { formatMetricValue } from "@/lib/format/metricLabels";

export function CarrierBreakdownChart({ data, filterLabel }: { data: QueryResultRow[]; filterLabel: string }) {
  return (
    <div className="card">
      <div className="text-sm font-medium">Carrier Breakdown (delay rate)</div>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.map((r) => ({ x: r.label, y: r.value }))} layout="vertical">
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              stroke="var(--color-text-muted)"
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <YAxis type="category" dataKey="x" tick={{ fontSize: 11 }} width={80} stroke="var(--color-text-muted)" />
            <Tooltip formatter={(v: TooltipValueType | undefined) => formatMetricValue("delay_rate", Number(v))} />
            <Bar dataKey="y" fill="var(--status-info)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ExplainCaption filterLabel={filterLabel} metricLabel="delay rate grouped by carrier" rows={data} metric="delay_rate" />
    </div>
  );
}
