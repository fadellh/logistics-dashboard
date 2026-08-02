import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChart } from "./chartSelect";

// Regression test: a follow-up like "explain the chart" needs this text baked into the
// answer, since only answer text (not chart JSON) is resent as conversation history.
test("describeChart returns empty string for a bare stat (no visual)", () => {
  assert.equal(describeChart({ kind: "stat" }), "");
});

test("describeChart names the chart kind for each non-stat kind", () => {
  assert.match(describeChart({ kind: "bar", points: [], sorted: true }), /bar chart/);
  assert.match(describeChart({ kind: "line", points: [] }), /line chart/);
  assert.match(describeChart({ kind: "forecast-line", historical: [], forecast: [] }), /line chart/);
  assert.match(
    describeChart({ kind: "compare-bar", primary: { label: "current", value: 1 }, baseline: { label: "baseline", value: 1 } }),
    /bar chart/
  );
});
