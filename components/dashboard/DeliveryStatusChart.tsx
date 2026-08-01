"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ExplainCaption } from "@/components/shared/ExplainCaption";

export function DeliveryStatusChart({
  delivered,
  delayed,
  filterLabel,
}: {
  delivered: number;
  delayed: number;
  filterLabel: string;
}) {
  const data = [
    { x: "Delivered", y: delivered, fill: "var(--status-good)" },
    { x: "Delayed", y: delayed, fill: "var(--status-warning)" },
  ];
  return (
    <div className="card">
      <div className="text-sm font-medium">Delivered vs Delayed</div>
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
        rows={[{ label: "Delivered", value: delivered }, { label: "Delayed", value: delayed }]}
      />
    </div>
  );
}
