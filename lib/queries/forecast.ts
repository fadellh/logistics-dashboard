import { sql, eq, or } from "drizzle-orm";
import { db } from "../db/client";
import { orders } from "../db/schema";
import type { ForecastDemandArgs } from "./schemas";

export type ForecastPoint = { month: string; value: number; kind: "historical" | "forecast" };
export type ForecastResult = {
  sku: string | null;
  productCategory: string | null;
  points: ForecastPoint[];
  inventoryRecommendation: number;
  methodology: string;
};

export function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

export function projectForecast(historicalValues: number[], horizonMonths: number): number[] {
  const x = historicalValues.map((_, i) => i + 1);
  const { slope, intercept } = linearRegression(x, historicalValues);
  const forecast: number[] = [];
  for (let i = 1; i <= horizonMonths; i++) {
    const monthIndex = historicalValues.length + i;
    forecast.push(Math.max(0, slope * monthIndex + intercept));
  }
  return forecast;
}

export class InsufficientDataError extends Error {
  constructor() {
    super("INSUFFICIENT_DATA");
  }
}

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
