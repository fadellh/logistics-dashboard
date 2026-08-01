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
    dateRange: dateRangeSchema.optional(),
  })
  .optional();

export const queryAnalyticsArgsSchema = z.object({
  metric: metricEnum,
  groupBy: groupByEnum.optional(),
  filters: filtersSchema,
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

export const compareMetricArgsSchema = z.object({
  metric: metricEnum,
  filters: filtersSchema,
  compareTo: z.enum(["overall_average", "previous_period"]),
});

export type Metric = z.infer<typeof metricEnum>;
export type GroupBy = z.infer<typeof groupByEnum>;
export type Filters = z.infer<typeof filtersSchema>;
export type QueryAnalyticsArgs = z.infer<typeof queryAnalyticsArgsSchema>;
export type ForecastDemandArgs = z.infer<typeof forecastDemandArgsSchema>;
export type CompareMetricArgs = z.infer<typeof compareMetricArgsSchema>;
