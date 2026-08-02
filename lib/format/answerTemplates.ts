import type { QueryAnalyticsArgs, ForecastDemandArgs, CompareMetricArgs, Filters } from "../queries/schemas";
import type { QueryAnalyticsResult } from "../queries/analytics";
import type { ForecastResult } from "../queries/forecast";
import type { CompareMetricResult } from "../queries/compare";
import { METRIC_LABELS, formatMetricValue } from "./metricLabels";

// Restates the applied filters in the answer text itself (e.g. "(DHL, 2025-01-01 to
// 2025-01-31)") so the scope of an answer is never only implicit in the user's own
// question. This matters for multi-turn conversations: the assistant's past answers are
// resent as plain-text history on every later turn, so a filter-less answer gives the
// model nothing to inherit scope from on a vague follow-up ("what's logistic name?").
export function describeFilters(filters?: Filters): string {
  if (!filters) return "";
  const parts: string[] = [];
  if (filters.carrier) parts.push(filters.carrier);
  if (filters.region) parts.push(filters.region);
  if (filters.productCategory) parts.push(filters.productCategory);
  if (filters.status) parts.push(filters.status);
  if (filters.dateRange) parts.push(`${filters.dateRange.from} to ${filters.dateRange.to}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export function composeQueryAnswer(args: QueryAnalyticsArgs, result: QueryAnalyticsResult): string {
  const label = METRIC_LABELS[args.metric];
  const scope = describeFilters(args.filters);
  if (!args.groupBy) {
    return `${label}${scope}: ${formatMetricValue(args.metric, result.rows[0].value)}.`;
  }
  const sorted = [...result.rows].sort((a, b) => b.value - a.value);
  if (sorted.length === 0) return `No data found for ${label.toLowerCase()}${scope} with the given filters.`;
  // limit=1 reads as "Top 1 by X: 1. Y (Z%)" — clunkier than the natural single-result
  // sentence below, and means the same thing, so fall through to it instead.
  if (args.limit && args.limit > 1) {
    const list = sorted
      .slice(0, args.limit)
      .map((r, i) => `${i + 1}. ${r.label} (${formatMetricValue(args.metric, r.value)})`)
      .join(", ");
    return `Top ${Math.min(args.limit, sorted.length)} by ${label.toLowerCase()}${scope}: ${list}.`;
  }
  const top = sorted[0];
  return `${top.label} has the highest ${label.toLowerCase()}${scope} at ${formatMetricValue(args.metric, top.value)}.`;
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
  const scope = describeFilters(args.filters);
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

  return `To check whether this is unusual, I compared ${label.toLowerCase()}${scope} — ${rationale} — against the baseline. It's ${primaryText}, ${comparison}.`;
}
