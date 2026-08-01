import type { Metric } from "../../lib/queries/schemas";
import { formatMetricValue } from "../../lib/format/metricLabels";

export function DataTable({
  rows,
  metric,
}: {
  rows: { label: string; value: number }[];
  metric?: Metric;
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase text-[var(--color-text-muted)]">
          <th className="pb-2 font-medium">Label</th>
          <th className="pb-2 font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-black/5">
            <td className="py-1.5 pr-4">{r.label}</td>
            <td className="py-1.5">{metric ? formatMetricValue(metric, r.value) : r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
