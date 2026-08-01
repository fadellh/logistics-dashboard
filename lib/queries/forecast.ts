import { sql, eq } from "drizzle-orm";
import { db } from "../db/client";
import { orders } from "../db/schema";
import type { ForecastDemandArgs } from "./schemas";
import { linearRegression, projectForecast, InsufficientDataError } from "./regression";

export type ForecastPoint = { month: string; value: number; kind: "historical" | "forecast" };
export type ForecastResult = {
  sku: string | null;
  productCategory: string | null;
  points: ForecastPoint[];
  inventoryRecommendation: number;
  methodology: string;
};

// Re-exported for existing callers (lib/ai/orchestrate.ts, scripts/smoke-forecast.ts) —
// the pure math itself now lives in ./regression so it can be unit-tested without a DB.
export { linearRegression, projectForecast, InsufficientDataError };

export async function runForecastDemand(args: ForecastDemandArgs): Promise<ForecastResult> {
  const cond = args.sku
    ? eq(orders.sku, args.sku)
    : eq(orders.productCategory, args.productCategory!);

  const monthly = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${orders.orderDate}::date), 'YYYY-MM')`,
      qty: sql<number>`sum(${orders.quantity})`,
    })
    .from(orders)
    .where(cond)
    .groupBy(sql`date_trunc('month', ${orders.orderDate}::date)`)
    .orderBy(sql`date_trunc('month', ${orders.orderDate}::date)`);

  if (monthly.length < 2) {
    throw new InsufficientDataError();
  }

  const historicalValues = monthly.map((m) => Number(m.qty));
  const forecastValues = projectForecast(historicalValues, args.horizonMonths);

  const points: ForecastPoint[] = [
    ...monthly.map((m) => ({ month: m.month, value: Number(m.qty), kind: "historical" as const })),
    ...forecastValues.map((v, i) => ({
      month: `+${i + 1}mo`,
      value: Math.round(v),
      kind: "forecast" as const,
    })),
  ];

  const nextMonthForecast = forecastValues[0] ?? 0;
  const inventoryRecommendation = Math.round(nextMonthForecast * 1.15);

  return {
    sku: args.sku ?? null,
    productCategory: args.productCategory ?? null,
    points,
    inventoryRecommendation,
    methodology: `Linear trend (ordinary least-squares) fit over ${monthly.length} months of historical order quantity, projected ${args.horizonMonths} month(s) forward. Inventory recommendation = next-month forecast × 1.15 safety margin.`,
  };
}
