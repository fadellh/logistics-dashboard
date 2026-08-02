"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ExplainCaption } from "@/components/shared/ExplainCaption";

export function DeliveryStatusChart({
  delivered,
  delayed,
  inTransit,
  exception,
  canceled,
  filterLabel,
}: {
  delivered: number;
  delayed: number;
  inTransit: number;
  exception: number;
  canceled: number;
  filterLabel: string;
}) {
  // Same status -> color mapping as components/shared/StatusBadge.tsx, so an order's
  // status reads the same way whether it's a badge or a bar. All 5 statuses, not just
  // delivered/delayed — the KPI cards above only cover 2 of 5, so this is the only place
  // the other ~10% of orders (in_transit/exception/canceled) are ever visible.
  const data = [
    { x: "Delivered", y: delivered, fill: "var(--status-good)" },
    { x: "Delayed", y: delayed, fill: "var(--status-warning)" },
    { x: "In Transit", y: inTransit, fill: "var(--status-info)" },
    { x: "Exception", y: exception, fill: "var(--status-critical)" },
    { x: "Canceled", y: canceled, fill: "var(--color-text-muted)" },
  ];
  return (
    <div className="card">
      <div className="text-sm font-medium">Orders by Status</div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <Tooltip />
            <Bar dataKey="y" radius={[6, 6, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.x} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ExplainCaption
        filterLabel={filterLabel}
        metricLabel="count by status"
        rows={data.map((d) => ({ label: d.x, value: d.y }))}
      />
    </div>
  );
}
