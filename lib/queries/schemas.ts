import { z } from "zod";

export const metricEnum = z.enum([
  "count", "sum_order_value", "avg_delivery_time", "on_time_rate", "delay_rate",
]);
export const groupByEnum = z.enum([
  "carrier", "region", "destination_city", "product_category", "sku", "week", "month",
]);
export const statusEnum = z.enum([
  "delivered", "delayed", "in_transit", "exception", "canceled",
]);

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD"),
});

export const filtersSchema = z
  .object({
    carrier: z.string().optional(),
    region: z.string().optional(),
    status: statusEnum.optional(),
    productCategory: z.string().optional(),
    // sku/destinationCity: both are already valid groupBy dimensions but were missing
    // here as filters — the only way to narrow down to one SKU or one destination city
    // (as opposed to breaking a metric down across all of them).
    sku: z.string().optional(),
    destinationCity: z.string().optional(),
    dateRange: dateRangeSchema.optional(),
  })
  .optional();

export const queryAnalyticsArgsSchema = z.object({
  metric: metricEnum,
  groupBy: groupByEnum.optional(),
  filters: filtersSchema,
  // Only meaningful together with groupBy — "top 3 carriers", "best 5 SKUs". Capped at
  // 20 since the dataset never has more than 9 distinct values for any groupable dimension.
  limit: z.number().int().min(1).max(20).optional(),
  // Set when the user named 2+ specific values of the same dimension to compare (e.g. two
  // SKUs) but this call can only filter to one of them — the other named value(s), so the
  // templated answer can disclose the gap instead of silently answering as if only one
  // value was ever asked about. Answers are templated (never phrased by the model), so
  // this is the only way that disclosure can reach the user.
  alsoAskedAbout: z.array(z.string()).max(5).optional(),
});

export const forecastDemandArgsSchema = z
  .object({
    sku: z.string().optional(),
    productCategory: z.string().optional(),
    horizonMonths: z.number().int().min(1).max(6),
  })
  .refine((d) => !!(d.sku || d.productCategory), {
    message: "sku or productCategory is required",
  });

// Narrower than metricEnum on purpose: "overall average"/"previous period" baselines are
// only a meaningful comparison for ratio/normalized metrics. count/sum_order_value would
// compare a scoped total against an overall TOTAL mislabeled as an "average" — see
// README Limitations for why that's excluded here rather than just relabeled.
export const compareMetricEnum = z.enum(["on_time_rate", "delay_rate", "avg_delivery_time"]);

export const compareMetricArgsSchema = z.object({
  metric: compareMetricEnum,
  filters: filtersSchema,
  compareTo: z.enum(["overall_average", "previous_period"]),
});

export type Metric = z.infer<typeof metricEnum>;
export type GroupBy = z.infer<typeof groupByEnum>;
export type Filters = z.infer<typeof filtersSchema>;
export type QueryAnalyticsArgs = z.infer<typeof queryAnalyticsArgsSchema>;
export type ForecastDemandArgs = z.infer<typeof forecastDemandArgsSchema>;
export type CompareMetricArgs = z.infer<typeof compareMetricArgsSchema>;
