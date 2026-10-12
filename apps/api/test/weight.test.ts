import assert from "node:assert/strict";
import { test } from "node:test";
import { weightSummary } from "../src/nutrition/weight/summary";

test("no weigh-ins give an empty summary", () => {
  assert.deepEqual(weightSummary([]), { current: null, change7: null, change30: null });
});

test("changes are counted from the last weigh-in at least a week and a month earlier", () => {
  const summary = weightSummary([
    { date: "2026-09-01", weightKg: 86 },
    { date: "2026-09-10", weightKg: 84.5 },
    { date: "2026-10-03", weightKg: 83 },
    { date: "2026-10-08", weightKg: 82.8 },
    { date: "2026-10-12", weightKg: 82.4 },
  ]);

  assert.deepEqual(summary, { current: 82.4, change7: -0.6, change30: -2.1 });
});

test("without a weigh-in old enough the change is unknown", () => {
  const summary = weightSummary([
    { date: "2026-10-10", weightKg: 80 },
    { date: "2026-10-12", weightKg: 80.3 },
  ]);

  assert.deepEqual(summary, { current: 80.3, change7: null, change30: null });
});
