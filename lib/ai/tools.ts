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
    sku: { type: "string" as const, description: "Exact SKU code, e.g. PAPER-0197. Use this to scope to one specific SKU — do not approximate a SKU with productCategory, they are different dimensions." },
    destinationCity: { type: "string" as const, description: "Exact destination city name, e.g. Boston, Zurich." },
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
// compare_metric only supports ratio/normalized metrics — "overall average" baseline is
// meaningless for count/sum_order_value (it's actually a total, not an average).
const COMPARE_METRIC_ENUM = ["on_time_rate", "delay_rate", "avg_delivery_time"];

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
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description:
              "Optional: return only the top N results by value, e.g. the user asks for 'top 3', 'best 5', 'only 3 results'. Only meaningful together with groupBy — ignored otherwise.",
          },
          alsoAskedAbout: {
            type: "array",
            items: { type: "string" },
            maxItems: 5,
            description:
              "Optional: if the user named 2+ specific values of the same dimension to compare (e.g. 'what's different between SKU A and SKU B') but you can only filter to one per call, put the other named value(s) here so the answer discloses that you could only check one — never omit this and answer as if only one value was ever asked about.",
          },
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
        "Use when the user asks why a metric looks unusually high or low, or wants to compare a value against a baseline (previous period or overall average). Only supports on_time_rate, delay_rate, and avg_delivery_time — never count or sum_order_value; do not call this as a silent substitute when asked why order count/volume/value looks high, tell the user directly that count can't be checked this way first. Do not use for simple aggregation or breakdown questions — use query_analytics for those.",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", enum: COMPARE_METRIC_ENUM },
          filters: FILTERS_PROPERTY,
          compareTo: { type: "string", enum: ["overall_average", "previous_period"] },
        },
        required: ["metric", "compareTo"],
      },
    },
  },
];
