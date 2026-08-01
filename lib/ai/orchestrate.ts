import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { aiClient, AI_MODEL } from "./client";
import { TOOLS } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";
import {
  queryAnalyticsArgsSchema,
  forecastDemandArgsSchema,
  compareMetricArgsSchema,
} from "../queries/schemas";
import { runQueryAnalytics } from "../queries/analytics";
import { runForecastDemand, InsufficientDataError } from "../queries/forecast";
import { runCompareMetric, CompareRequiresDateRangeError } from "../queries/compare";
import { selectChartForQuery, selectChartForForecast, selectChartForCompare, type ChartSpec } from "../format/chartSelect";
import { composeQueryAnswer, composeForecastAnswer, composeCompareAnswer } from "../format/answerTemplates";

export type ConversationTurn = { role: "user" | "assistant"; content: string };

export type AskResult = {
  answer: string;
  chart: ChartSpec | null;
  queryPlan: Record<string, unknown> | null;
  filters: unknown | null;
  metric: string | null;
  groupBy: string | null;
  table: unknown[] | null;
};

const MAX_ROUND_TRIPS = 4;

function describeError(err: unknown): { message: string; code: string } {
  if (err instanceof InsufficientDataError) {
    return { message: "Not enough historical data to forecast this SKU/category (need at least 2 months of orders).", code: err.message };
  }
  if (err instanceof CompareRequiresDateRangeError) {
    return { message: "A date range is required to compare against the previous period.", code: err.message };
  }
  if (err && typeof err === "object" && "issues" in err) {
    const zodErr = err as { issues: { message: string }[] };
    return { message: `Invalid arguments: ${zodErr.issues.map((i) => i.message).join("; ")}`, code: "INVALID_ARGS" };
  }
  return { message: "Invalid request.", code: "UNKNOWN_ERROR" };
}

export async function orchestrate(question: string, history: ConversationTurn[]): Promise<AskResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content }) as ChatCompletionMessageParam),
    { role: "user", content: question },
  ];

  for (let round = 0; round < MAX_ROUND_TRIPS; round++) {
    const response = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      // Only one tool_calls[0] is ever handled/answered below; without this, a
      // multi-call turn would leave later tool_call ids with no matching `tool`
      // response, which some OpenAI-compatible APIs reject on the next request.
      parallel_tool_calls: false,
    });

    const choice = response.choices[0].message;

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      return {
        answer: choice.content ?? "I couldn't process that question — could you rephrase it?",
        chart: null,
        queryPlan: null,
        filters: null,
        metric: null,
        groupBy: null,
        table: null,
      };
    }

    const call = choice.tool_calls[0];

    try {
      // ponytail: TOOLS (lib/ai/tools.ts) only registers type:"function" tools, so DeepSeek
      // will only ever return function-type calls here — this guard exists purely to satisfy
      // the openai SDK's function/custom tool_call union type, not because custom calls are expected.
      if (call.type !== "function") {
        throw new Error(`Unsupported tool call type: ${call.type}`);
      }

      let rawArgs: unknown;
      try {
        rawArgs = JSON.parse(call.function.arguments);
      } catch {
        rawArgs = {};
      }

      if (call.function.name === "query_analytics") {
        const args = queryAnalyticsArgsSchema.parse(rawArgs);
        const result = await runQueryAnalytics(args);
        return {
          answer: composeQueryAnswer(args, result),
          chart: selectChartForQuery(args.groupBy ?? null, result.rows),
          queryPlan: { tool: "query_analytics", ...args },
          filters: args.filters ?? null,
          metric: args.metric,
          groupBy: args.groupBy ?? null,
          table: result.rows,
        };
      }

      if (call.function.name === "forecast_demand") {
        const args = forecastDemandArgsSchema.parse(rawArgs);
        const result = await runForecastDemand(args);
        return {
          answer: composeForecastAnswer(args, result),
          chart: selectChartForForecast(result.points),
          queryPlan: { tool: "forecast_demand", ...args },
          filters: null,
          metric: null,
          groupBy: null,
          // ponytail: ForecastPoint is {month, value, kind}; normalize to the
          // same {label, value} shape the other two branches use so DataTable
          // (which reads r.label) doesn't render blank/duplicate-keyed rows.
          table: result.points.map((p) => ({ label: p.month, value: p.value })),
        };
      }

      if (call.function.name === "compare_metric") {
        const args = compareMetricArgsSchema.parse(rawArgs);
        const result = await runCompareMetric(args);
        return {
          answer: composeCompareAnswer(args, result),
          chart: selectChartForCompare(result.primaryLabel, result.primary, result.baselineLabel, result.baseline),
          queryPlan: { tool: "compare_metric", ...args },
          filters: args.filters ?? null,
          metric: args.metric,
          groupBy: null,
          table: [
            { label: result.primaryLabel, value: result.primary },
            { label: result.baselineLabel, value: result.baseline },
          ],
        };
      }

      throw new Error(`Unknown tool: ${call.function.name}`);
    } catch (err) {
      const { message, code } = describeError(err);
      messages.push({
        role: "assistant",
        content: choice.content,
        tool_calls: choice.tool_calls,
      } as ChatCompletionMessageParam);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: true, message, code }),
      } as ChatCompletionMessageParam);
    }
  }

  return {
    answer: "I wasn't able to interpret that question after a few attempts — could you rephrase it?",
    chart: null,
    queryPlan: null,
    filters: null,
    metric: null,
    groupBy: null,
    table: null,
  };
}
