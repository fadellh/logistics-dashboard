"use client";
import { useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { METRIC_LABELS } from "@/lib/format/metricLabels";
import type { AskResult } from "@/lib/ai/orchestrate";
import type { Metric } from "@/lib/queries/schemas";

const RATE_METRICS = new Set<string>(["on_time_rate", "delay_rate"]);

export function ExplainabilityPanel({ result }: { result: AskResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (!result.queryPlan) return null; // decline/clarification responses have nothing to explain

  const metricLabel = result.metric ? METRIC_LABELS[result.metric as keyof typeof METRIC_LABELS] : null;
  const rateMetric =
    result.metric && RATE_METRICS.has(result.metric) ? (result.metric as Metric) : undefined;

  return (
    <div className="mt-4 border-t border-black/5 pt-3 text-sm">
      <button
        type="button"
        onClick={() => setShowDetails((s) => !s)}
        className="text-[var(--color-text-muted)] underline underline-offset-2"
      >
        {showDetails ? "▾ Hide how I found this" : "▸ How I found this"}
      </button>

      {showDetails && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[100px_1fr] gap-1 text-xs">
            {metricLabel && (
              <>
                <span className="text-[var(--color-text-muted)]">Measured</span>
                <span>{metricLabel}</span>
              </>
            )}
            {result.groupBy && (
              <>
                <span className="text-[var(--color-text-muted)]">Grouped by</span>
                <span>{result.groupBy}</span>
              </>
            )}
            <span className="text-[var(--color-text-muted)]">Filters</span>
            <span>{result.filters ? JSON.stringify(result.filters) : "none"}</span>
          </div>

          {Array.isArray(result.table) && result.table.length > 0 && (
            <DataTable rows={result.table as { label: string; value: number }[]} metric={rateMetric} />
          )}

          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            className="text-xs text-[var(--color-text-muted)] underline underline-offset-2"
          >
            {showRaw ? "hide technical query" : "show technical query"}
          </button>
          {showRaw && (
            <pre className="overflow-x-auto rounded-[var(--radius-sm)] bg-black/5 p-2 text-xs">
              {JSON.stringify(result.queryPlan, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
