import { test } from "node:test";
import assert from "node:assert/strict";
import { queryAnalyticsArgsSchema, forecastDemandArgsSchema, compareMetricArgsSchema } from "./schemas";

test("rejects an unknown metric value", () => {
  const result = queryAnalyticsArgsSchema.safeParse({ metric: "profit_margin" });
  assert.equal(result.success, false);
});

test("rejects a groupBy value outside the allowlist", () => {
  const result = queryAnalyticsArgsSchema.safeParse({ metric: "count", groupBy: "warehouse" });
  assert.equal(result.success, false);
});

test("accepts a valid query with filters", () => {
  const result = queryAnalyticsArgsSchema.safeParse({
    metric: "delay_rate",
    groupBy: "carrier",
    filters: { dateRange: { from: "2025-01-01", to: "2025-12-31" } },
  });
  assert.equal(result.success, true);
});

test("forecast requires sku or productCategory", () => {
  const result = forecastDemandArgsSchema.safeParse({ horizonMonths: 3 });
  assert.equal(result.success, false);
});

test("forecast accepts sku alone", () => {
  const result = forecastDemandArgsSchema.safeParse({ sku: "PAPER-0197", horizonMonths: 4 });
  assert.equal(result.success, true);
});

test("forecast rejects horizonMonths outside 1-6", () => {
  const result = forecastDemandArgsSchema.safeParse({ sku: "PAPER-0197", horizonMonths: 12 });
  assert.equal(result.success, false);
});

test("compare_metric requires compareTo", () => {
  const result = compareMetricArgsSchema.safeParse({ metric: "delay_rate" });
  assert.equal(result.success, false);
});
