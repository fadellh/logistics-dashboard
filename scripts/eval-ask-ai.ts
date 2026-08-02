// Golden eval suite for the "Ask AI" orchestration layer (lib/ai/orchestrate.ts).
//
// Unlike lib/**/*.test.ts (pure functions, no DB/API, run in `npm test`), this calls
// the live DeepSeek model against the real database — it costs a little money and isn't
// fully deterministic, so it's a manual pre-submission check, not a CI gate.
//
// ~14 hand-picked cases: one happy path per tool (mirroring the spec's own example
// questions), plus one case per real production bug found and fixed during this
// project (see my-learn-as-ai-engineer.md sections 10-12 for the reasoning and the
// citation to phases/14-agent-engineering/30-eval-driven-agent-development/docs/en.md
// Exercise 1: "take one of your production failures, write an eval case that
// reproduces it"). Deliberately NOT the 50-200+ case golden set that lesson-scale
// production guidance calls for — that's out of proportion for a 3-tool take-home;
// see the same notes file for why.
//
// Run: npm run eval:ai

import { orchestrate, type AskResult, type ConversationTurn } from "../lib/ai/orchestrate";

type EvalCase = {
  name: string;
  // All turns but the last are setup context; only the final turn's result is checked.
  turns: string[];
  check: (result: AskResult) => string | null; // null = pass, string = failure reason
};

function queryPlanField(result: AskResult, key: string): unknown {
  return (result.queryPlan as Record<string, unknown> | null)?.[key];
}

function usesTool(result: AskResult, tool: string): string | null {
  const actual = queryPlanField(result, "tool");
  return actual === tool ? null : `expected tool "${tool}", got ${actual ?? "no tool call (plain text)"}`;
}

function declines(result: AskResult): string | null {
  return result.queryPlan === null
    ? null
    : `expected a plain-text decline/clarification, got a tool call (${queryPlanField(result, "tool")})`;
}

function answerContains(result: AskResult, ...substrings: string[]): string | null {
  const lower = result.answer.toLowerCase();
  const missing = substrings.filter((s) => !lower.includes(s.toLowerCase()));
  return missing.length === 0 ? null : `answer missing expected substring(s): ${missing.join(", ")}`;
}

const CASES: EvalCase[] = [
  {
    name: "query_analytics: groupBy=week (spec example question)",
    turns: ["Show delayed orders by week for the last 3 months"],
    check: (r) => usesTool(r, "query_analytics"),
  },
  {
    name: "query_analytics: highest delay rate by carrier (spec example question)",
    turns: ["Which carrier has the highest delay rate?"],
    check: (r) => usesTool(r, "query_analytics") ?? (queryPlanField(r, "groupBy") === "carrier" ? null : "expected groupBy=carrier"),
  },
  {
    name: "query_analytics: count last month (spec example question)",
    turns: ["How many orders were delivered late last month?"],
    check: (r) => usesTool(r, "query_analytics"),
  },
  {
    name: "forecast_demand: with product category (spec example question)",
    // A category, not a specific SKU: individual SKUs in this dataset can have too few
    // months of history (correctly triggers InsufficientDataError) — every category has
    // 10-12 months, so this exercises the happy path reliably. See runForecastDemand.
    turns: ["Predict demand for the CRAYON product category for the next 4 months"],
    check: (r) => usesTool(r, "forecast_demand"),
  },
  {
    name: "forecast_demand: missing SKU should ask, never guess",
    turns: ["How much inventory should I plan?"],
    check: (r) => declines(r),
  },
  {
    name: "compare_metric: happy path deviation-from-baseline question",
    turns: ["Is DHL's delay rate unusual compared to the overall average?"],
    check: (r) => usesTool(r, "compare_metric") ?? answerContains(r, "I compared"),
  },
  {
    name: "regression: count/volume 'why' must not silently substitute a rate metric",
    turns: ["Why did order count look unusually high in January?"],
    // compare_metric can't take metric=count at all (Zod-restricted); the bug this
    // guards is the model quietly answering with delay_rate as if it addressed the
    // original count question, with no disclosure. Declining or answering the count
    // directly via query_analytics is fine; compare_metric is only fine if the answer
    // says so explicitly.
    check: (r) => (usesTool(r, "compare_metric") === null ? answerContains(r, "count") : null),
  },
  {
    name: "regression: vague follow-up must not misfire a tool call",
    turns: ["Any delayed orders in January?", "So what do you mean?"],
    check: (r) => declines(r),
  },
  {
    name: "regression: ambiguous follow-up should carry forward established scope",
    turns: ["Any delayed orders in January?", "What's logistic name?"],
    // "logistic name" ~= carrier; a good answer either groups by carrier directly or,
    // if it asks a clarifying question, mentions carrier rather than a generic list.
    check: (r) => (queryPlanField(r, "groupBy") === "carrier" ? null : answerContains(r, "carrier")),
  },
  {
    name: "out-of-scope: entirely unrelated question declines",
    turns: ["What's the weather like in London?"],
    check: (r) => declines(r),
  },
  {
    name: "out-of-scope: data we don't have (profit margin) declines",
    turns: ["What's the profit margin per carrier?"],
    check: (r) => declines(r),
  },
  {
    name: "regression: 'top 3' must pass limit, not just report the single highest",
    turns: ["Who has the highest on-time rate?", "Just give me the top 3"],
    check: (r) => (queryPlanField(r, "limit") === 3 ? null : answerContains(r, "Top 3", "top 3")),
  },
  {
    name: "regression: 'explain the chart' must not deny having shown one",
    turns: ["Which carrier has the highest delay rate?", "Explain more about the chart"],
    check: (r) => {
      const denies = /no (visual|chart)|don't have a (visual|chart)|not sure what (chart|graphic)/i.test(r.answer);
      return denies ? `answer denies having a chart: "${r.answer}"` : null;
    },
  },
  {
    name: "regression: 'explain more' must not hallucinate a full breakdown it was never given",
    // Real bug: the previous answer only ever states the single top row, but the model
    // once fabricated plausible-sounding numbers for "the rest" of a 9-carrier ranking —
    // inventing carrier names that don't even exist in this dataset. Correct behavior is
    // either (a) call query_analytics again to actually get the other rows, or (b) admit
    // it only has the one result and offer to fetch more — never invent the gap silently.
    turns: ["Which carrier has the highest delay rate?", "Explain more about the chart"],
    check: (r) => {
      const calledToolAgain = queryPlanField(r, "tool") === "query_analytics";
      const admitsGap = /pull|full breakdown|don't have|only (returned|gave|have)|would need/i.test(r.answer);
      return calledToolAgain || admitsGap
        ? null
        : `answer may have fabricated data beyond the single known result: "${r.answer}"`;
    },
  },
];

async function runCase(c: EvalCase): Promise<{ name: string; pass: boolean; reason?: string; answer: string }> {
  const history: ConversationTurn[] = [];
  let result: AskResult | null = null;
  for (const question of c.turns) {
    result = await orchestrate(question, history);
    history.push({ role: "user", content: question });
    history.push({ role: "assistant", content: result.answer });
  }
  const reason = c.check(result!);
  return { name: c.name, pass: reason === null, reason: reason ?? undefined, answer: result!.answer };
}

async function main() {
  console.log(`Running ${CASES.length} golden eval cases against the live model...\n`);
  const results: Awaited<ReturnType<typeof runCase>>[] = [];

  for (const c of CASES) {
    process.stdout.write(`- ${c.name} ... `);
    try {
      const r = await runCase(c);
      results.push(r);
      console.log(r.pass ? "PASS" : `FAIL (${r.reason})`);
    } catch (err) {
      const reason = `threw: ${err instanceof Error ? err.message : String(err)}`;
      results.push({ name: c.name, pass: false, reason, answer: "" });
      console.log(`ERROR (${reason})`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed.`);

  if (passed < results.length) {
    console.log(
      "\nNote: this eval calls a live, non-deterministic model — a failure can mean the\n" +
        "model chose a different valid path, not necessarily a real regression. Read the\n" +
        "actual answer for each FAIL before concluding something broke:\n"
    );
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  [${r.name}]\n    reason: ${r.reason}\n    answer: ${r.answer || "(no answer captured)"}\n`);
    }
  }

  process.exit(passed === results.length ? 0 : 1);
}

main();
