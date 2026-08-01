import type OpenAI from "openai";

const FILTERS_PROPERTY = {
  type: "object" as const,
  properties: {
    carrier: { type: "string" as const, description: "Exact carrier name, e.g. DHL, UPS, FedEx." },
    region: { type: "string" as const, description: "Region code, e.g. UK, EU, US-E, US-C, US-W." },
    status: {
      type: "string" as const,
      enum: ["delivered", "delayed", "in_transit", "exception", "canceled"],
    },
    productCategory: { type: "string" as const, description: "e.g. PAPER, PENCIL, PAINT, BRUSH, BOOK, MARKER, CRAYON, STICKER." },
    dateRange: {
      type: "object" as const,
      properties: {
        from: { type: "string" as const, description: "ISO date YYYY-MM-DD" },
        to: { type: "string" as const, description: "ISO date YYYY-MM-DD" },
      },
      required: ["from", "to"],
    },
  },
};

const METRIC_ENUM = ["count", "sum_order_value", "avg_delivery_time", "on_time_rate", "delay_rate"];

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_analytics",
      description:
        "Use for aggregation, breakdown, and KPI questions about historical logistics data — counts, sums, averages, rates, optionally grouped by carrier/region/category/sku/time. Do not use for demand forecasting or for 'why is this different from usual' comparison questions.",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", enum: METRIC_ENUM, description: "What to compute." },
          groupBy: {
            type: "string",
            enum: ["carrier", "region", "destination_city", "product_category", "sku", "week", "month"],
            description: "Optional dimension to group results by.",
          },
          filters: FILTERS_PROPERTY,
        },
        required: ["metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forecast_demand",
      description:
        "Use to predict future demand or recommend inventory for a specific SKU or product category. Requires a SKU or category — if the user doesn't name one, ask which before calling this tool. Do not use for historical/current-state questions.",
      parameters: {
        type: "object",
        properties: {
          sku: { type: "string", description: "Exact SKU code, e.g. PAPER-0197." },
          productCategory: { type: "string", description: "Product category, e.g. PAPER." },
          horizonMonths: { type: "integer", minimum: 1, maximum: 6, description: "How many months to forecast forward." },
        },
        required: ["horizonMonths"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_metric",
      description:
        "Use when the user asks why a metric looks unusually high or low, or wants to compare a value against a baseline (previous period or overall average). Do not use for simple aggregation or breakdown questions — use query_analytics for those.",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", enum: METRIC_ENUM },
          filters: FILTERS_PROPERTY,
          compareTo: { type: "string", enum: ["overall_average", "previous_period"] },
        },
        required: ["metric", "compareTo"],
      },
    },
  },
];
