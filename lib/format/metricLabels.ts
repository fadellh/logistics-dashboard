import type { Metric } from "../queries/schemas";

export const METRIC_LABELS: Record<Metric, string> = {
  delay_rate: "Delay rate (delayed ÷ (delivered + delayed))",
  on_time_rate: "On-time rate (delivered ÷ (delivered + delayed))",
  count: "Number of orders",
  avg_delivery_time: "Average delivery time",
  sum_order_value: "Total order value",
};

export function formatMetricValue(metric: Metric, value: number): string {
  if (metric === "on_time_rate" || metric === "delay_rate") return `${(value * 100).toFixed(1)}%`;
  if (metric === "sum_order_value") return `$${value.toFixed(2)}`;
  if (metric === "avg_delivery_time") return `${value.toFixed(1)} days`;
  return `${Math.round(value)}`;
}
