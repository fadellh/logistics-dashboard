import { test } from "node:test";
import assert from "node:assert/strict";
import { composeQueryAnswer, composeForecastAnswer, composeCompareAnswer, describeFilters } from "./answerTemplates";

test("describeFilters returns empty string with no filters", () => {
  assert.equal(describeFilters(undefined), "");
  assert.equal(describeFilters({}), "");
});

test("describeFilters joins present filters, dateRange included", () => {
  assert.equal(
    describeFilters({ carrier: "DHL", dateRange: { from: "2025-01-01", to: "2025-01-31" } }),
    " (DHL, 2025-01-01 to 2025-01-31)"
  );
});

// Regression test: sku/destinationCity were valid groupBy dimensions but missing as
// filters, so a question scoped to one SKU (e.g. "MARKER-0138") had no way to narrow
// down to it and silently dropped the scope or approximated with productCategory.
test("describeFilters includes sku and destinationCity", () => {
  assert.equal(describeFilters({ sku: "MARKER-0138" }), " (MARKER-0138)");
  assert.equal(describeFilters({ destinationCity: "Boston" }), " (Boston)");
});

test("composeQueryAnswer restates filter scope for a flat (no groupBy) result", () => {
  const answer = composeQueryAnswer(
    { metric: "delay_rate", filters: { dateRange: { from: "2025-01-01", to: "2025-01-31" } } },
    { metric: "delay_rate", groupBy: null, rows: [{ label: "current", value: 0.174 }] }
  );
  assert.match(answer, /2025-01-01 to 2025-01-31/);
  assert.match(answer, /17\.4%/);
});

test("composeQueryAnswer picks the highest row when grouped", () => {
  const answer = composeQueryAnswer(
    { metric: "delay_rate", groupBy: "carrier" },
    { metric: "delay_rate", groupBy: "carrier", rows: [{ label: "UPS", value: 0.1 }, { label: "DHL", value: 0.3 }] }
  );
  assert.match(answer, /^DHL has the highest/);
});

test("composeQueryAnswer reports no data instead of throwing on an empty result", () => {
  const answer = composeQueryAnswer(
    { metric: "delay_rate", groupBy: "carrier" },
    { metric: "delay_rate", groupBy: "carrier", rows: [] }
  );
  assert.match(answer, /No data found/);
});

// Regression test for a real production gap: "give me the top 3" / "just give best 3"
// always returned only the single highest row and rendered the full chart regardless.
test("composeQueryAnswer lists all N rows when limit is set, not just the highest", () => {
  const answer = composeQueryAnswer(
    { metric: "on_time_rate", groupBy: "carrier", limit: 3 },
    {
      metric: "on_time_rate",
      groupBy: "carrier",
      rows: [
        { label: "DPD", value: 1.0 },
        { label: "DHL", value: 1.0 },
        { label: "FedEx", value: 0.98 },
      ],
    }
  );
  assert.match(answer, /^Top 3 by/);
  assert.match(answer, /DPD/);
  assert.match(answer, /DHL/);
  assert.match(answer, /FedEx/);
});

test("composeQueryAnswer without limit still reports only the single highest", () => {
  const answer = composeQueryAnswer(
    { metric: "on_time_rate", groupBy: "carrier" },
    {
      metric: "on_time_rate",
      groupBy: "carrier",
      rows: [{ label: "DPD", value: 1.0 }, { label: "DHL", value: 1.0 }],
    }
  );
  assert.match(answer, /^DPD has the highest/);
  assert.doesNotMatch(answer, /Top/);
});

test("composeQueryAnswer with limit=1 also uses the natural single-result phrasing", () => {
  const answer = composeQueryAnswer(
    { metric: "on_time_rate", groupBy: "carrier", limit: 1 },
    {
      metric: "on_time_rate",
      groupBy: "carrier",
      rows: [{ label: "DPD", value: 1.0 }],
    }
  );
  assert.match(answer, /^DPD has the highest/);
  assert.doesNotMatch(answer, /Top 1/);
});

test("composeForecastAnswer includes target, projection, and methodology", () => {
  const answer = composeForecastAnswer(
    { sku: "PAPER-0197", horizonMonths: 3 },
    {
      sku: "PAPER-0197",
      productCategory: null,
      points: [{ month: "2025-13", value: 42, kind: "forecast" }],
      inventoryRecommendation: 48,
      methodology: "Linear regression.",
    }
  );
  assert.match(answer, /PAPER-0197/);
  assert.match(answer, /~42 units/);
  assert.match(answer, /~48 units/);
  assert.match(answer, /Linear regression\./);
});

// Regression test for a real production bug: composeCompareAnswer said "up from X%"
// even when primary and baseline were exactly equal (e.g. "17.4%, up from 17.4%") —
// a factual misstatement. Must say "in line with" whenever the displayed values match.
test("composeCompareAnswer says 'in line with' when primary and baseline display equal", () => {
  const answer = composeCompareAnswer(
    { metric: "delay_rate", compareTo: "overall_average" },
    { metric: "delay_rate", primary: 0.174, baseline: 0.174, delta: 0, primaryLabel: "current", baselineLabel: "overall average" }
  );
  assert.match(answer, /in line with 17\.4%/);
  assert.doesNotMatch(answer, /up from 17\.4%/);
  assert.doesNotMatch(answer, /down from 17\.4%/);
});

test("composeCompareAnswer says 'up from' when primary is higher", () => {
  const answer = composeCompareAnswer(
    { metric: "delay_rate", compareTo: "overall_average" },
    { metric: "delay_rate", primary: 0.174, baseline: 0.153, delta: 0.021, primaryLabel: "current", baselineLabel: "overall average" }
  );
  assert.match(answer, /up from 15\.3%/);
});

test("composeCompareAnswer says 'down from' when primary is lower", () => {
  const answer = composeCompareAnswer(
    { metric: "delay_rate", compareTo: "overall_average" },
    { metric: "delay_rate", primary: 0.1, baseline: 0.153, delta: -0.053, primaryLabel: "current", baselineLabel: "overall average" }
  );
  assert.match(answer, /down from 15\.3%/);
});

test("composeCompareAnswer includes a rationale clause and restates filter scope", () => {
  const answer = composeCompareAnswer(
    { metric: "delay_rate", compareTo: "overall_average", filters: { carrier: "DHL" } },
    { metric: "delay_rate", primary: 0.2, baseline: 0.153, delta: 0.047, primaryLabel: "current", baselineLabel: "overall average" }
  );
  assert.match(answer, /DHL/);
  assert.match(answer, /I compared/);
});
