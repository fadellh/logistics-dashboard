import { test } from "node:test";
import assert from "node:assert/strict";
import { linearRegression, projectForecast } from "./regression";

test("linearRegression fits a perfect line exactly", () => {
  const x = [1, 2, 3, 4, 5];
  const y = [3, 5, 7, 9, 11]; // y = 2x + 1
  const { slope, intercept } = linearRegression(x, y);
  assert.ok(Math.abs(slope - 2) < 1e-9, `slope was ${slope}`);
  assert.ok(Math.abs(intercept - 1) < 1e-9, `intercept was ${intercept}`);
});

test("linearRegression handles a flat line (zero slope)", () => {
  const { slope, intercept } = linearRegression([1, 2, 3], [10, 10, 10]);
  assert.ok(Math.abs(slope) < 1e-9);
  assert.ok(Math.abs(intercept - 10) < 1e-9);
});

test("projectForecast returns exactly horizonMonths points", () => {
  const points = projectForecast([10, 20, 30], 3);
  assert.equal(points.length, 3);
});

test("projectForecast extends an upward trend correctly", () => {
  const points = projectForecast([10, 20, 30], 2); // perfectly linear, slope=10, intercept=0
  assert.ok(Math.abs(points[0] - 40) < 1e-6, `expected ~40, got ${points[0]}`);
  assert.ok(Math.abs(points[1] - 50) < 1e-6, `expected ~50, got ${points[1]}`);
});

test("projectForecast never goes negative", () => {
  const points = projectForecast([10, 5, 0], 3); // sharply declining trend
  for (const p of points) assert.ok(p >= 0, `forecast point ${p} was negative`);
});
