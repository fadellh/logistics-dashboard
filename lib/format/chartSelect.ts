import type { GroupBy } from "../queries/schemas";
import type { QueryResultRow } from "../queries/analytics";
import type { ForecastPoint } from "../queries/forecast";

export type ChartSpec =
  | { kind: "stat" }
  | { kind: "line"; points: { x: string; y: number }[] }
  | { kind: "bar"; points: { x: string; y: number }[]; sorted: boolean }
  | { kind: "forecast-line"; historical: { x: string; y: number }[]; forecast: { x: string; y: number }[] }
  | { kind: "compare-bar"; primary: { label: string; value: number }; baseline: { label: string; value: number } };

const TIME_GROUP_BYS = new Set<GroupBy>(["week", "month"]);

export function selectChartForQuery(groupBy: GroupBy | null, rows: QueryResultRow[]): ChartSpec {
  if (!groupBy) return { kind: "stat" };
  if (TIME_GROUP_BYS.has(groupBy)) {
    return { kind: "line", points: rows.map((r) => ({ x: r.label, y: r.value })) };
  }
  return { kind: "bar", points: rows.map((r) => ({ x: r.label, y: r.value })), sorted: true };
}

export function selectChartForForecast(points: ForecastPoint[]): ChartSpec {
  return {
    kind: "forecast-line",
    historical: points.filter((p) => p.kind === "historical").map((p) => ({ x: p.month, y: p.value })),
    forecast: points.filter((p) => p.kind === "forecast").map((p) => ({ x: p.month, y: p.value })),
  };
}

export function selectChartForCompare(
  primaryLabel: string,
  primary: number,
  baselineLabel: string,
  baseline: number
): ChartSpec {
  return {
    kind: "compare-bar",
    primary: { label: primaryLabel, value: primary },
    baseline: { label: baselineLabel, value: baseline },
  };
}

// Appended to the answer text so a chart's existence survives into conversation history
// (only answer text is resent as history, never the chart JSON) — without this, a
// follow-up like "explain the chart" has nothing to ground itself in and the model
// denies having shown one at all.
export function describeChart(chart: ChartSpec): string {
  switch (chart.kind) {
    case "stat":
      return "";
    case "line":
      return " (shown as a line chart over time)";
    case "bar":
      return " (shown as a bar chart)";
    case "forecast-line":
      return " (shown as a line chart with historical and forecasted values)";
    case "compare-bar":
      return " (shown as a bar chart comparing the current value against the baseline)";
  }
}
