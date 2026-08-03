"use client";
import { useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { METRIC_LABELS } from "@/lib/format/metricLabels";
import { describeFilters } from "@/lib/format/answerTemplates";
import type { AskResult } from "@/lib/ai/orchestrate";
import type { Metric, Filters } from "@/lib/queries/schemas";

const RATE_METRICS = new Set<string>(["on_time_rate", "delay_rate"]);

// Friendly names for the reasoning-path chips — same three tools as TOOLS in lib/ai/tools.ts.
const TOOL_LABELS: Record<string, string> = {
  query_analytics: "Analytics query",
  forecast_demand: "Demand forecast",
  compare_metric: "Baseline comparison",
};

export function ExplainabilityPanel({ result }: { result: AskResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (!result.queryPlan) return null; // decline/clarification responses have nothing to explain

  const metricLabel = result.metric ? METRIC_LABELS[result.metric as keyof typeof METRIC_LABELS] : null;
  const rateMetric =
    result.metric && RATE_METRICS.has(result.metric) ? (result.metric as Metric) : undefined;

  // describeFilters wraps non-empty output as " (X, Y)" for embedding in a sentence — strip
  // the wrapping parens/space for a standalone chip.
  const filterText = describeFilters((result.filters ?? undefined) as Filters | undefined).trim();
  const filterSummary = filterText ? filterText.slice(1, -1) : null;
  const tool = (result.queryPlan as Record<string, unknown>).tool as string;
  const pathSteps = [
    "Your question",
    TOOL_LABELS[tool] ?? tool,
    filterSummary ? `Filtered: ${filterSummary}` : null,
    metricLabel ? `Measured: ${metricLabel}${result.groupBy ? ` by ${result.groupBy}` : ""}` : null,
    "Answer",
  ].filter((s): s is string => Boolean(s));

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
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[var(--color-text-muted)]">
            {pathSteps.map((step, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="rounded-[var(--radius-sm)] border border-black/10 px-2 py-1">{step}</span>
                {i < pathSteps.length - 1 && <span aria-hidden="true">→</span>}
              </span>
            ))}
          </div>

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
            <DataTable
              rows={result.table as { label: string; value: number; n?: number }[]}
              metric={rateMetric}
            />
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
