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

export function composeCompareAnswer(args: CompareMetricArgs, result: CompareMetricResult): string {
  const label = METRIC_LABELS[args.metric];
  const direction = result.delta >= 0 ? "up" : "down";
  return `${label} is ${formatMetricValue(args.metric, result.primary)}, ${direction} from ${formatMetricValue(args.metric, result.baseline)} (${result.baselineLabel}).`;
}
