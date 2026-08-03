import type { Metric } from "@/lib/queries/schemas";
import { formatMetricValue } from "@/lib/format/metricLabels";
import { isSmallSample } from "@/lib/format/evidence";

export function DataTable({
  rows,
  metric,
}: {
  rows: { label: string; value: number; n?: number }[];
  metric?: Metric;
}) {
  const hasN = rows.some((r) => typeof r.n === "number");
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase text-[var(--color-text-muted)]">
          <th className="pb-2 font-medium">Label</th>
          <th className="pb-2 font-medium">Value</th>
          {hasN && <th className="pb-2 font-medium">Based on</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-black/5">
            <td className="py-1.5 pr-4">{r.label}</td>
            <td className="py-1.5">{metric ? formatMetricValue(metric, r.value) : r.value}</td>
            {hasN && (
              <td className="py-1.5 pl-4 text-[var(--color-text-muted)]">
                {typeof r.n === "number" ? (
                  <>
                    {r.n} order{r.n === 1 ? "" : "s"}
                    {isSmallSample(r.n) && (
                      <span className="text-[var(--status-warning)]"> ⚠ small sample</span>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
