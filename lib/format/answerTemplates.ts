import type { QueryAnalyticsArgs, ForecastDemandArgs, CompareMetricArgs } from "../queries/schemas";
import type { QueryAnalyticsResult } from "../queries/analytics";
import type { ForecastResult } from "../queries/forecast";
import type { CompareMetricResult } from "../queries/compare";
import { METRIC_LABELS, formatMetricValue } from "./metricLabels";

export function composeQueryAnswer(args: QueryAnalyticsArgs, result: QueryAnalyticsResult): string {
  const label = METRIC_LABELS[args.metric];
  if (!args.groupBy) {
    return `${label}: ${formatMetricValue(args.metric, result.rows[0].value)}.`;
  }
  const sorted = [...result.rows].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  if (!top) return `No data found for ${label.toLowerCase()} with the given filters.`;
  return `${top.label} has the highest ${label.toLowerCase()} at ${formatMetricValue(args.metric, top.value)}.`;
}

export function composeForecastAnswer(args: ForecastDemandArgs, result: ForecastResult): string {
  const target = args.sku ?? args.productCategory;
  const nextValue = result.points.find((p) => p.kind === "forecast")?.value ?? 0;
  return `Demand for ${target} is projected at ~${nextValue} units next month. Recommended inventory: ~${result.inventoryRecommendation} units. ${result.methodology}`;
}

// Deterministic — no LLM call. Explains why this metric is a reasonable signal for a
// "why" question, so compare_metric answers don't read as a bare number with no context.
const METRIC_RATIONALE: Record<CompareMetricArgs["metric"], string> = {
  delay_rate: "the clearest available signal for shipping problems in this dataset",
  on_time_rate: "the clearest available signal for shipping reliability in this dataset",
  avg_delivery_time: "how long deliveries are taking on average, a useful pace signal alongside the rate metrics",
};

export function composeCompareAnswer(args: CompareMetricArgs, result: CompareMetricResult): string {
  const label = METRIC_LABELS[args.metric];
  const rationale = METRIC_RATIONALE[args.metric];
  const primaryText = formatMetricValue(args.metric, result.primary);
  const baselineText = formatMetricValue(args.metric, result.baseline);

  // Compare formatted strings, not raw delta: two values that round to the same displayed
  // figure (e.g. 17.4% vs 17.4%) must read as "in line with", never "up from" — saying a
  // metric rose when the displayed numbers are identical is a factual misstatement.
  const comparison =
    primaryText === baselineText
      ? `in line with ${baselineText} (${result.baselineLabel}), so nothing stands out as unusual here`
      : `${result.delta >= 0 ? "up" : "down"} from ${baselineText} (${result.baselineLabel})`;

  return `To check whether this is unusual, I compared ${label.toLowerCase()} — ${rationale} — against the baseline. It's ${primaryText}, ${comparison}.`;
}
