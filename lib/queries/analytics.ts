import { sql, and, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { orders } from "../db/schema";
import type { QueryAnalyticsArgs, Metric, GroupBy } from "./schemas";

export type QueryResultRow = { label: string; value: number };
export type QueryAnalyticsResult = {
  metric: Metric;
  groupBy: GroupBy | null;
  rows: QueryResultRow[];
};

const GROUP_BY_EXPR: Record<GroupBy, SQL> = {
  carrier: sql`${orders.carrier}`,
  region: sql`${orders.region}`,
  destination_city: sql`${orders.destinationCity}`,
  product_category: sql`${orders.productCategory}`,
  sku: sql`${orders.sku}`,
  week: sql`to_char(date_trunc('week', ${orders.orderDate}::date), 'YYYY-MM-DD')`,
  month: sql`to_char(date_trunc('month', ${orders.orderDate}::date), 'YYYY-MM')`,
};

// ponytail: week/month labels are ISO strings, so ascending label order == chronological
// order — needed for time-series line charts (Dashboard's OrderVolumeChart, AI chat's
// groupBy=week/month line chart). Every other groupBy (carrier, region, ...) keeps
// ranking by metric value desc, which is what "top N" style breakdowns want.
const TIME_GROUP_BYS = new Set<GroupBy>(["week", "month"]);

const METRIC_EXPR: Record<Metric, SQL<number>> = {
  count: sql<number>`count(*)`,
  sum_order_value: sql<number>`coalesce(sum(${orders.orderValueUsd}), 0)`,
  avg_delivery_time: sql<number>`coalesce(avg(${orders.deliveryDate}::date - ${orders.orderDate}::date), 0)`,
  on_time_rate: sql<number>`coalesce(
    count(*) filter (where ${orders.status} = 'delivered')::float
    / nullif(count(*) filter (where ${orders.status} in ('delivered','delayed')), 0), 0)`,
  delay_rate: sql<number>`coalesce(
    count(*) filter (where ${orders.status} = 'delayed')::float
    / nullif(count(*) filter (where ${orders.status} in ('delivered','delayed')), 0), 0)`,
};

function buildFilters(args: QueryAnalyticsArgs): SQL | undefined {
  const conds: SQL[] = [];
  const f = args.filters;
  if (f?.carrier) conds.push(eq(orders.carrier, f.carrier));
  if (f?.region) conds.push(eq(orders.region, f.region));
  if (f?.status) conds.push(eq(orders.status, f.status));
  if (f?.productCategory) conds.push(eq(orders.productCategory, f.productCategory));
  if (f?.dateRange) {
    conds.push(gte(orders.orderDate, f.dateRange.from));
    conds.push(lte(orders.orderDate, f.dateRange.to));
  }
  return conds.length ? and(...conds) : undefined;
}

export async function runQueryAnalytics(args: QueryAnalyticsArgs): Promise<QueryAnalyticsResult> {
  const metricExpr = METRIC_EXPR[args.metric];
  const where = buildFilters(args);

  if (!args.groupBy) {
    const rows = await db.select({ value: metricExpr }).from(orders).where(where);
    return {
      metric: args.metric,
      groupBy: null,
      rows: [{ label: "total", value: Number(rows[0]?.value ?? 0) }],
    };
  }

  const groupExpr = GROUP_BY_EXPR[args.groupBy];
  const orderExpr = TIME_GROUP_BYS.has(args.groupBy) ? sql`${groupExpr} asc` : sql`${metricExpr} desc`;
  // 1000 as the no-limit default (not omitting .limit()) sidesteps Drizzle's conditional-
  // chaining typing — harmless since no groupBy dimension in this dataset exceeds ~9 rows.
  const rows = await db
    .select({ label: sql<string>`${groupExpr}`, value: metricExpr })
    .from(orders)
    .where(where)
    .groupBy(groupExpr)
    .orderBy(orderExpr)
    .limit(args.limit ?? 1000);

  return {
    metric: args.metric,
    groupBy: args.groupBy,
    rows: rows.map((r) => ({ label: r.label, value: Number(r.value) })),
  };
}
