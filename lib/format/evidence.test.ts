import { test } from "node:test";
import assert from "node:assert/strict";
import { isSmallSample } from "./evidence";

test("isSmallSample flags single-digit buckets below the threshold", () => {
  assert.equal(isSmallSample(0), true);
  assert.equal(isSmallSample(3), true);
  assert.equal(isSmallSample(4), true);
});

test("isSmallSample does not flag a healthy bucket", () => {
  assert.equal(isSmallSample(5), false);
  assert.equal(isSmallSample(100), false);
});
