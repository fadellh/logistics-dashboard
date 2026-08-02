import { runQueryAnalytics } from "./analytics";
import type { CompareMetricArgs, Metric } from "./schemas";

export type CompareMetricResult = {
  metric: Metric;
  primary: number;
  baseline: number;
  delta: number;
  primaryLabel: string;
  baselineLabel: string;
};

export class CompareRequiresDateRangeError extends Error {
  constructor() {
    super("COMPARE_REQUIRES_DATE_RANGE_FOR_PREVIOUS_PERIOD");
  }
}

function shiftDateRangeBack(range: { from: string; to: string }): { from: string; to: string } {
  const from = new Date(range.from + "T00:00:00Z");
  const to = new Date(range.to + "T00:00:00Z");
  const spanMs = to.getTime() - from.getTime();
  const newTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const newFrom = new Date(newTo.getTime() - spanMs);
  return {
    from: newFrom.toISOString().slice(0, 10),
    to: newTo.toISOString().slice(0, 10),
  };
}

export async function runCompareMetric(args: CompareMetricArgs): Promise<CompareMetricResult> {
  const primaryResult = await runQueryAnalytics({ metric: args.metric, filters: args.filters });
  const primary = primaryResult.rows[0]?.value ?? 0;

  let baselineFilters = args.filters;
  let baselineLabel: string;

  if (args.compareTo === "overall_average") {
    // Always the true unfiltered average. Reusing part of args.filters here (e.g. keeping
    // the same dateRange) can make baselineFilters identical to args.filters whenever there's
    // no other filter to drop — primary and baseline then run the exact same query, so the
    // "comparison" is a tautological 0-delta rather than an actual finding.
    baselineFilters = undefined;
    baselineLabel = "overall average";
  } else {
    if (!args.filters?.dateRange) {
      throw new CompareRequiresDateRangeError();
    }
    baselineFilters = { ...args.filters, dateRange: shiftDateRangeBack(args.filters.dateRange) };
    baselineLabel = "previous period";
  }

  const baselineResult = await runQueryAnalytics({ metric: args.metric, filters: baselineFilters });
  const baseline = baselineResult.rows[0]?.value ?? 0;

  return {
    metric: args.metric,
    primary,
    baseline,
    delta: primary - baseline,
    primaryLabel: "current",
    baselineLabel,
  };
}
