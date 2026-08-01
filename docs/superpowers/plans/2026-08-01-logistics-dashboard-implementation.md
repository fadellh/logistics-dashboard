# AI-Powered Logistics Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the AI-powered logistics analytics dashboard (Spaceship take-home) — a Dashboard tab with KPIs/charts and an Ask AI tab with a 3-tool routing LLM (`query_analytics`, `forecast_demand`, `compare_metric`) over a seeded Postgres dataset.

**Architecture:** Next.js (App Router, TS) monolith. Dashboard is a Server Component calling `lib/queries/` directly (no REST round-trip); `/api/ask` is the only real API route, running a single-LLM-call routing loop (`lib/ai/orchestrate.ts`) that dispatches to allowlisted Drizzle queries and composes answers via deterministic templates — never a second model call. Plain 3-folder separation (`lib/ai/` interpretation, `lib/queries/` computation, `lib/ai/orchestrate.ts` business logic) — no DDD, no Hexagonal.

**Tech Stack:** Next.js 14+ (App Router, TypeScript), Tailwind CSS, Drizzle ORM + `@neondatabase/serverless` (Neon Postgres), `openai` SDK pointed at DeepSeek, Zod, Recharts, `@base-ui-components/react`, `@number-flow/react`, Sonner, `class-variance-authority`, `csv-parse`, `tsx` (dev), Node's built-in `node:test`.

## Global Constraints

- Full design reasoning: `docs/superpowers/specs/2026-08-01-logistics-dashboard-design.md`. Non-negotiable rules: `CLAUDE.md`. Read both before deviating from any decision below.
- No raw AI-generated SQL ever reaches the database — only parameterized Drizzle queries built from a fixed allowlist.
- Every tool argument from the model is Zod-validated before execution.
- Exactly 3 tools (`query_analytics`, `forecast_demand`, `compare_metric`) — never add a 4th by bolting a mode-switch parameter onto an existing one; new capability = new atomic tool.
- One LLM call per question for tool selection; the answer sentence is always composed by a deterministic template, never a second model call.
- Max 4 tool-call round-trips per question (rate-limit guard).
- Data is read-only — no mutation endpoints, anywhere.
- No DDD, no Hexagonal/ports-and-adapters, no auth, no zustand, no shadcn/ui.
- Node 20+. Package manager: npm.
- Deadline Wed Aug 5 2026 3pm WIB — keep scope to exactly what's in the spec doc, no extras.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder)
- Modify: none (fresh repo aside from existing `docs/`, `README.md`, `CLAUDE.md`, `.gitignore`, `.env.example`)

**Interfaces:**
- Produces: a running `npm run dev` on `http://localhost:3000`, Tailwind working, TypeScript strict mode on.

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint --use-npm --skip-install
```

When prompted about the existing directory not being empty, confirm to proceed (existing `docs/`, `README.md`, `CLAUDE.md`, `.gitignore`, `.env.example`, `my-learn-as-ai-engineer.md` must be preserved — do not let the scaffolder overwrite `README.md`, `.gitignore`, or delete `docs/`).

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless zod openai recharts \
  @base-ui-components/react @number-flow/react sonner class-variance-authority \
  csv-parse
npm install -D drizzle-kit tsx @types/node
```

- [ ] **Step 3: Verify dev server runs**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`, default Next.js page loads with no console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with Tailwind, TypeScript, and core dependencies"
```

---

### Task 2: Database schema, client, and migration config

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`
- Test: manual (`drizzle-kit push` against a real Neon database — requires `DATABASE_URL` set)

**Interfaces:**
- Produces: `orders` table (Drizzle table object exported as `orders` from `lib/db/schema.ts`), `db` (Drizzle client exported from `lib/db/client.ts`).
- Consumes: `process.env.DATABASE_URL`.

- [ ] **Step 1: Write the schema**

`lib/db/schema.ts`:
```ts
import { pgTable, text, date, integer, numeric, boolean } from "drizzle-orm/pg-core";

export const orders = pgTable("orders", {
  orderId: text("order_id").primaryKey(),
  clientId: text("client_id").notNull(),
  orderDate: date("order_date", { mode: "string" }).notNull(),
  deliveryDate: date("delivery_date", { mode: "string" }),
  carrier: text("carrier").notNull(),
  originCity: text("origin_city").notNull(),
  destinationCity: text("destination_city").notNull(),
  status: text("status").notNull(),
  sku: text("sku").notNull(),
  productCategory: text("product_category").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceUsd: numeric("unit_price_usd", { precision: 10, scale: 2 }).notNull(),
  orderValueUsd: numeric("order_value_usd", { precision: 10, scale: 2 }).notNull(),
  isPromo: boolean("is_promo").notNull(),
  promoDiscountPct: numeric("promo_discount_pct", { precision: 5, scale: 2 }).notNull(),
  region: text("region").notNull(),
  warehouse: text("warehouse").notNull(),
});
```

- [ ] **Step 2: Write the DB client**

`lib/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 3: Write drizzle-kit config**

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
```

- [ ] **Step 4: Push schema to Neon**

Requires a real Neon project — create one at neon.tech, copy the connection string into `.env` as `DATABASE_URL` (see `.env.example`).

Run: `npx drizzle-kit push`
Expected: prompts to confirm creating the `orders` table, then reports success. Verify with `npx drizzle-kit studio` or a direct `psql`/Neon SQL editor query — `orders` table exists with 17 columns.

- [ ] **Step 5: Commit**

```bash
git add lib/db drizzle.config.ts
git commit -m "Add orders table schema, Drizzle client, and migration config"
```

---

### Task 3: Seed script

**Files:**
- Create: `data/mock_logistics_data.csv` (copied from the provided dataset), `lib/db/seed.ts`
- Modify: `package.json` (add `"seed"` script)

**Interfaces:**
- Consumes: `orders` (Task 2), `db` (Task 2).
- Produces: 400 rows in the `orders` table.

- [ ] **Step 1: Copy the dataset into the repo**

```bash
mkdir -p data
cp /Users/fadellukmanhakim/Downloads/mock_logistics_data.csv data/mock_logistics_data.csv
```

- [ ] **Step 2: Write the seed script**

`lib/db/seed.ts`:
```ts
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { db } from "./client";
import { orders } from "./schema";

type CsvRow = {
  client_id: string; order_id: string; order_date: string; delivery_date: string;
  carrier: string; origin_city: string; destination_city: string; status: string;
  sku: string; product_category: string; quantity: string; unit_price_usd: string;
  order_value_usd: string; is_promo: string; promo_discount_pct: string;
  region: string; warehouse: string;
};

async function seed() {
  const csv = readFileSync("data/mock_logistics_data.csv", "utf-8");
  const records: CsvRow[] = parse(csv, { columns: true, skip_empty_lines: true });

  const rows = records.map((r) => ({
    orderId: r.order_id,
    clientId: r.client_id,
    orderDate: r.order_date,
    deliveryDate: r.delivery_date || null,
    carrier: r.carrier,
    originCity: r.origin_city,
    destinationCity: r.destination_city,
    status: r.status,
    sku: r.sku,
    productCategory: r.product_category,
    quantity: Number(r.quantity),
    unitPriceUsd: r.unit_price_usd,
    orderValueUsd: r.order_value_usd,
    isPromo: r.is_promo === "1",
    promoDiscountPct: r.promo_discount_pct,
    region: r.region,
    warehouse: r.warehouse,
  }));

  await db.delete(orders); // safe to re-run
  await db.insert(orders).values(rows);
  console.log(`Seeded ${rows.length} orders`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 3: Add the npm script**

In `package.json` `"scripts"`:
```json
"seed": "tsx lib/db/seed.ts"
```

- [ ] **Step 4: Run it and verify**

Run: `npm run seed`
Expected: prints `Seeded 400 orders`. Verify: `npx drizzle-kit studio` → `orders` table has 400 rows.

- [ ] **Step 5: Commit**

```bash
git add data lib/db/seed.ts package.json
git commit -m "Add seed script and mock dataset"
```

---

### Task 4: Tool argument schemas (Zod) + allowlist validation check

**Files:**
- Create: `lib/queries/schemas.ts`, `lib/queries/schemas.test.ts`

**Interfaces:**
- Produces: `metricEnum`, `groupByEnum`, `statusEnum`, `filtersSchema`, `queryAnalyticsArgsSchema`, `forecastDemandArgsSchema`, `compareMetricArgsSchema`, and inferred types `QueryAnalyticsArgs`, `ForecastDemandArgs`, `CompareMetricArgs` — every later task that touches tool arguments imports from here, never redefines these shapes.

- [ ] **Step 1: Write the failing test**

`lib/queries/schemas.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryAnalyticsArgsSchema, forecastDemandArgsSchema, compareMetricArgsSchema } from "./schemas";

test("rejects an unknown metric value", () => {
  const result = queryAnalyticsArgsSchema.safeParse({ metric: "profit_margin" });
  assert.equal(result.success, false);
});

test("rejects a groupBy value outside the allowlist", () => {
  const result = queryAnalyticsArgsSchema.safeParse({ metric: "count", groupBy: "warehouse" });
  assert.equal(result.success, false);
});

test("accepts a valid query with filters", () => {
  const result = queryAnalyticsArgsSchema.safeParse({
    metric: "delay_rate",
    groupBy: "carrier",
    filters: { dateRange: { from: "2025-01-01", to: "2025-12-31" } },
  });
  assert.equal(result.success, true);
});

test("forecast requires sku or productCategory", () => {
  const result = forecastDemandArgsSchema.safeParse({ horizonMonths: 3 });
  assert.equal(result.success, false);
});

test("forecast accepts sku alone", () => {
  const result = forecastDemandArgsSchema.safeParse({ sku: "PAPER-0197", horizonMonths: 4 });
  assert.equal(result.success, true);
});

test("forecast rejects horizonMonths outside 1-6", () => {
  const result = forecastDemandArgsSchema.safeParse({ sku: "PAPER-0197", horizonMonths: 12 });
  assert.equal(result.success, false);
});

test("compare_metric requires compareTo", () => {
  const result = compareMetricArgsSchema.safeParse({ metric: "delay_rate" });
  assert.equal(result.success, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test lib/queries/schemas.test.ts`
Expected: FAIL — `schemas.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the schemas**

`lib/queries/schemas.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test lib/queries/schemas.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/schemas.ts lib/queries/schemas.test.ts
git commit -m "Add Zod schemas for the 3 tool arg shapes with allowlist validation test"
```

---

### Task 5: Query analytics computation

**Files:**
- Create: `lib/queries/analytics.ts`

**Interfaces:**
- Consumes: `orders`, `db` (Task 2); `QueryAnalyticsArgs` (Task 4).
- Produces: `QueryResultRow = { label: string; value: number }`, `QueryAnalyticsResult = { metric: Metric; groupBy: GroupBy | null; rows: QueryResultRow[] }`, `runQueryAnalytics(args: QueryAnalyticsArgs): Promise<QueryAnalyticsResult>` — imported by Task 7 (`compare.ts`), Task 10 (`orchestrate.ts`), and Task 12 (Dashboard page).

- [ ] **Step 1: Write the computation function**

`lib/queries/analytics.ts`:
```ts
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

const METRIC_EXPR: Record<Metric, SQL<number>> = {
  count: sql<number>`count(*)`,
  sum_order_value: sql<number>`coalesce(sum(${orders.orderValueUsd}), 0)`,
  avg_delivery_time: sql<number>`coalesce(avg(extract(day from (${orders.deliveryDate}::date - ${orders.orderDate}::date))), 0)`,
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
  const rows = await db
    .select({ label: sql<string>`${groupExpr}`, value: metricExpr })
    .from(orders)
    .where(where)
    .groupBy(groupExpr)
    .orderBy(sql`${metricExpr} desc`);

  return {
    metric: args.metric,
    groupBy: args.groupBy,
    rows: rows.map((r) => ({ label: r.label, value: Number(r.value) })),
  };
}
```

- [ ] **Step 2: Verify against a real question**

Write a one-off script `scripts/smoke-analytics.ts` (delete after use, or leave under `scripts/` — not part of the app bundle):
```ts
import { runQueryAnalytics } from "../lib/queries/analytics";

async function main() {
  console.log(await runQueryAnalytics({ metric: "count" }));
  console.log(await runQueryAnalytics({ metric: "delay_rate", groupBy: "carrier" }));
  console.log(await runQueryAnalytics({ metric: "on_time_rate", filters: { dateRange: { from: "2025-01-01", to: "2025-03-31" } } }));
}
main().then(() => process.exit(0));
```

Run: `npx tsx scripts/smoke-analytics.ts`
Expected: first call returns `{ rows: [{ label: "total", value: 400 }] }`; second returns one row per carrier with `value` between 0 and 1, sorted descending; third returns a single on-time-rate value for Q1 2025. Fix any Drizzle query-builder syntax errors surfaced here before moving on (verify `.groupBy`/`.orderBy` accept raw `SQL` objects against the installed `drizzle-orm` version — check its docs if the types don't line up).

- [ ] **Step 3: Commit**

```bash
git add lib/queries/analytics.ts scripts/smoke-analytics.ts
git commit -m "Add query_analytics computation layer over allowlisted Drizzle queries"
```

---

### Task 6: Forecast computation + regression math check

**Files:**
- Create: `lib/queries/forecast.ts`, `lib/queries/forecast.test.ts`

**Interfaces:**
- Consumes: `orders`, `db` (Task 2); `ForecastDemandArgs` (Task 4).
- Produces: `linearRegression(x, y)`, `projectForecast(historicalValues, horizonMonths)` (pure, exported, tested), `ForecastPoint`, `ForecastResult`, `runForecastDemand(args)` — consumed by Task 10.

- [ ] **Step 1: Write the failing test**

`lib/queries/forecast.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { linearRegression, projectForecast } from "./forecast";

test("linearRegression fits a perfect line exactly", () => {
  const x = [1, 2, 3, 4, 5];
  const y = [3, 5, 7, 9, 11]; // y = 2x + 1
  const { slope, intercept } = linearRegression(x, y);
  assert.ok(Math.abs(slope - 2) < 1e-9, `slope was ${slope}`);
  assert.ok(Math.abs(intercept - 1) < 1e-9, `intercept was ${intercept}`);
});

test("linearRegression handles a flat line (zero slope)", () => {
  const { slope, intercept } = linearRegression([1, 2, 3], [10, 10, 10]);
  assert.ok(Math.abs(slope) < 1e-9);
  assert.ok(Math.abs(intercept - 10) < 1e-9);
});

test("projectForecast returns exactly horizonMonths points", () => {
  const points = projectForecast([10, 20, 30], 3);
  assert.equal(points.length, 3);
});

test("projectForecast extends an upward trend correctly", () => {
  const points = projectForecast([10, 20, 30], 2); // perfectly linear, slope=10, intercept=0
  assert.ok(Math.abs(points[0] - 40) < 1e-6, `expected ~40, got ${points[0]}`);
  assert.ok(Math.abs(points[1] - 50) < 1e-6, `expected ~50, got ${points[1]}`);
});

test("projectForecast never goes negative", () => {
  const points = projectForecast([10, 5, 0], 3); // sharply declining trend
  for (const p of points) assert.ok(p >= 0, `forecast point ${p} was negative`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test lib/queries/forecast.test.ts`
Expected: FAIL — `forecast.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`lib/queries/forecast.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test lib/queries/forecast.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/forecast.ts lib/queries/forecast.test.ts
git commit -m "Add forecast_demand computation with tested closed-form linear regression"
```

---

### Task 7: Compare-metric computation

**Files:**
- Create: `lib/queries/compare.ts`

**Interfaces:**
- Consumes: `runQueryAnalytics` (Task 5); `CompareMetricArgs` (Task 4).
- Produces: `CompareMetricResult`, `runCompareMetric(args)`, `CompareRequiresDateRangeError` — consumed by Task 10.

- [ ] **Step 1: Write the implementation**

`lib/queries/compare.ts`:
```ts
import { runQueryAnalytics } from "./analytics";
import type { CompareMetricArgs, Metric } from "./schemas";

export type CompareMetricResult = {
  metric: Metric;
  primary: number;
  baseline: number;
  delta: number;
  primaryLabel: string;
  baselineLabel: string;
};

export class CompareRequiresDateRangeError extends Error {
  constructor() {
    super("COMPARE_REQUIRES_DATE_RANGE_FOR_PREVIOUS_PERIOD");
  }
}

function shiftDateRangeBack(range: { from: string; to: string }): { from: string; to: string } {
  const from = new Date(range.from + "T00:00:00Z");
  const to = new Date(range.to + "T00:00:00Z");
  const spanMs = to.getTime() - from.getTime();
  const newTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  const newFrom = new Date(newTo.getTime() - spanMs);
  return {
    from: newFrom.toISOString().slice(0, 10),
    to: newTo.toISOString().slice(0, 10),
  };
}

export async function runCompareMetric(args: CompareMetricArgs): Promise<CompareMetricResult> {
  const primaryResult = await runQueryAnalytics({ metric: args.metric, filters: args.filters });
  const primary = primaryResult.rows[0]?.value ?? 0;

  let baselineFilters = args.filters;
  let baselineLabel: string;

  if (args.compareTo === "overall_average") {
    baselineFilters = args.filters?.dateRange ? { dateRange: args.filters.dateRange } : undefined;
    baselineLabel = "overall average";
  } else {
    if (!args.filters?.dateRange) {
      throw new CompareRequiresDateRangeError();
    }
    baselineFilters = { ...args.filters, dateRange: shiftDateRangeBack(args.filters.dateRange) };
    baselineLabel = "previous period";
  }

  const baselineResult = await runQueryAnalytics({ metric: args.metric, filters: baselineFilters });
  const baseline = baselineResult.rows[0]?.value ?? 0;

  return {
    metric: args.metric,
    primary,
    baseline,
    delta: primary - baseline,
    primaryLabel: "current",
    baselineLabel,
  };
}
```

- [ ] **Step 2: Smoke-test it**

Add to `scripts/smoke-analytics.ts` (or a new `scripts/smoke-compare.ts`):
```ts
import { runCompareMetric } from "../lib/queries/compare";

async function main() {
  console.log(await runCompareMetric({
    metric: "delay_rate",
    filters: { carrier: "DHL", dateRange: { from: "2025-11-01", to: "2025-11-30" } },
    compareTo: "previous_period",
  }));
  console.log(await runCompareMetric({
    metric: "delay_rate",
    filters: { carrier: "DHL" },
    compareTo: "overall_average",
  }));
}
main().then(() => process.exit(0));
```

Run: `npx tsx scripts/smoke-compare.ts`
Expected: both calls return `{ primary, baseline, delta, ... }` with real numeric values, no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/compare.ts
git commit -m "Add compare_metric computation, reusing runQueryAnalytics for both scopes"
```

---

### Task 8: Format layer — metric labels, chart-type selection, answer templates

**Files:**
- Create: `lib/format/metricLabels.ts`, `lib/format/chartSelect.ts`, `lib/format/answerTemplates.ts`

**Interfaces:**
- Consumes: `Metric`, `QueryAnalyticsArgs`, `ForecastDemandArgs`, `CompareMetricArgs` (Task 4); `QueryAnalyticsResult` (Task 5); `ForecastResult` (Task 6); `CompareMetricResult` (Task 7).
- Produces: `METRIC_LABELS`, `ChartSpec` union type + `selectChartForQuery`, `selectChartForForecast`, `selectChartForCompare`, `composeQueryAnswer`, `composeForecastAnswer`, `composeCompareAnswer` — all consumed by Task 10 (`orchestrate.ts`) and Task 12/15 (chart-rendering components).

- [ ] **Step 1: Write metric labels**

`lib/format/metricLabels.ts`:
```ts
import type { Metric } from "../queries/schemas";

export const METRIC_LABELS: Record<Metric, string> = {
  delay_rate: "Delay rate (delayed ÷ total orders)",
  on_time_rate: "On-time rate (on-time ÷ total orders)",
  count: "Number of orders",
  avg_delivery_time: "Average delivery time",
  sum_order_value: "Total order value",
};

export function formatMetricValue(metric: Metric, value: number): string {
  if (metric === "on_time_rate" || metric === "delay_rate") return `${(value * 100).toFixed(1)}%`;
  if (metric === "sum_order_value") return `$${value.toFixed(2)}`;
  if (metric === "avg_delivery_time") return `${value.toFixed(1)} days`;
  return `${Math.round(value)}`;
}
```

- [ ] **Step 2: Write chart-type selection**

`lib/format/chartSelect.ts`:
```ts
import type { GroupBy } from "../queries/schemas";
import type { QueryResultRow } from "../queries/analytics";
import type { ForecastPoint } from "../queries/forecast";

export type ChartSpec =
  | { kind: "stat" }
  | { kind: "line"; points: { x: string; y: number }[] }
  | { kind: "bar"; points: { x: string; y: number }[]; sorted: boolean }
  | { kind: "forecast-line"; historical: { x: string; y: number }[]; forecast: { x: string; y: number }[] }
  | { kind: "compare-bar"; primary: { label: string; value: number }; baseline: { label: string; value: number } };

const TIME_GROUP_BYS = new Set<GroupBy>(["week", "month"]);

export function selectChartForQuery(groupBy: GroupBy | null, rows: QueryResultRow[]): ChartSpec {
  if (!groupBy) return { kind: "stat" };
  if (TIME_GROUP_BYS.has(groupBy)) {
    return { kind: "line", points: rows.map((r) => ({ x: r.label, y: r.value })) };
  }
  return { kind: "bar", points: rows.map((r) => ({ x: r.label, y: r.value })), sorted: true };
}

export function selectChartForForecast(points: ForecastPoint[]): ChartSpec {
  return {
    kind: "forecast-line",
    historical: points.filter((p) => p.kind === "historical").map((p) => ({ x: p.month, y: p.value })),
    forecast: points.filter((p) => p.kind === "forecast").map((p) => ({ x: p.month, y: p.value })),
  };
}

export function selectChartForCompare(
  primaryLabel: string,
  primary: number,
  baselineLabel: string,
  baseline: number
): ChartSpec {
  return {
    kind: "compare-bar",
    primary: { label: primaryLabel, value: primary },
    baseline: { label: baselineLabel, value: baseline },
  };
}
```

- [ ] **Step 3: Write answer templates**

`lib/format/answerTemplates.ts`:
```ts
import type { QueryAnalyticsArgs, ForecastDemandArgs, CompareMetricArgs } from "../queries/schemas";
import type { QueryAnalyticsResult } from "../queries/analytics";
import type { ForecastResult } from "../queries/forecast";
import type { CompareMetricResult } from "../queries/compare";
import { METRIC_LABELS, formatMetricValue } from "./metricLabels";

export function composeQueryAnswer(args: QueryAnalyticsArgs, result: QueryAnalyticsResult): string {
  const label = METRIC_LABELS[args.metric];
  if (!args.groupBy) {
    return `${label}: ${formatMetricValue(args.metric, result.rows[0].value)}.`;
  }
  const sorted = [...result.rows].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  if (!top) return `No data found for ${label.toLowerCase()} with the given filters.`;
  return `${top.label} has the highest ${label.toLowerCase()} at ${formatMetricValue(args.metric, top.value)}.`;
}

export function composeForecastAnswer(args: ForecastDemandArgs, result: ForecastResult): string {
  const target = args.sku ?? args.productCategory;
  const nextValue = result.points.find((p) => p.kind === "forecast")?.value ?? 0;
  return `Demand for ${target} is projected at ~${nextValue} units next month. Recommended inventory: ~${result.inventoryRecommendation} units. ${result.methodology}`;
}

export function composeCompareAnswer(args: CompareMetricArgs, result: CompareMetricResult): string {
  const label = METRIC_LABELS[args.metric];
  const direction = result.delta >= 0 ? "up" : "down";
  return `${label} is ${formatMetricValue(args.metric, result.primary)}, ${direction} from ${formatMetricValue(args.metric, result.baseline)} (${result.baselineLabel}).`;
}
```

- [ ] **Step 4: Verify it compiles and behaves sensibly**

Run: `npx tsc --noEmit`
Expected: no type errors across `lib/format/`.

Manually check `composeQueryAnswer` against a fixture in a scratch REPL (`npx tsx`) if any doubt remains about formatting — e.g. confirm `formatMetricValue("delay_rate", 0.18)` returns `"18.0%"`.

- [ ] **Step 5: Commit**

```bash
git add lib/format
git commit -m "Add deterministic chart-type selection and answer-template composition"
```

---

### Task 9: AI client, tool schemas, system prompt

**Files:**
- Create: `lib/ai/client.ts`, `lib/ai/tools.ts`, `lib/ai/systemPrompt.ts`

**Interfaces:**
- Produces: `aiClient` (OpenAI SDK instance), `AI_MODEL`, `TOOLS` (OpenAI function-calling schema array), `SYSTEM_PROMPT` — consumed by Task 10.

- [ ] **Step 1: Write the AI client config**

`lib/ai/client.ts`:
```ts
import OpenAI from "openai";

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error("DEEPSEEK_API_KEY is not set");
}

export const aiClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

export const AI_MODEL = "deepseek-chat";
```

- [ ] **Step 2: Write the tool schemas**

`lib/ai/tools.ts` — mirrors `lib/queries/schemas.ts` exactly, one property per allowlisted value (no `$ref`, every provider must see the literal schema):
```ts
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
```

- [ ] **Step 3: Write the system prompt**

`lib/ai/systemPrompt.ts`:
```ts
export const SYSTEM_PROMPT = `You are a logistics analytics assistant for a dashboard covering 400 orders from 2025 across 9 carriers, 5 regions, and 8 product categories.

You can only answer using the three tools available to you: query_analytics, forecast_demand, compare_metric. You must never state a number that didn't come from a tool result.

Supported metrics: count, sum_order_value, avg_delivery_time, on_time_rate, delay_rate.
Supported groupings: carrier, region, destination_city, product_category, sku, week, month.
Supported filters: carrier, region, status, productCategory, dateRange.

If a question needs data this dataset doesn't have (e.g. cost or profit margin — only sale price exists, not cost), say so directly and name what you can answer instead. Do not guess.

If a question asks for the specific cause of an event ("why did this shipment get delayed", "what caused this") rather than whether something is unusual, say plainly that you don't have incident or root-cause data. You can only show whether a number deviates from a baseline using compare_metric — that answers "is this unusual and by how much", not "what caused it".

If a forecast question doesn't name a SKU or product category, ask the user which one before calling forecast_demand. Never guess a SKU/category or default to "all products".

If a question is entirely outside logistics or this dataset, decline directly and briefly — do not attempt to answer from general knowledge.`;
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/ai/`.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/client.ts lib/ai/tools.ts lib/ai/systemPrompt.ts
git commit -m "Add DeepSeek client config, 3 atomic tool schemas, and system prompt"
```

---

### Task 10: Orchestration loop

**Files:**
- Create: `lib/ai/orchestrate.ts`

**Interfaces:**
- Consumes: everything from Tasks 4-9 (`aiClient`, `AI_MODEL`, `TOOLS`, `SYSTEM_PROMPT`, all 3 Zod schemas, all 3 `run*` computation functions, all 3 `selectChartFor*` and `compose*Answer` functions, `InsufficientDataError`, `CompareRequiresDateRangeError`).
- Produces: `ConversationTurn = { role: "user" | "assistant"; content: string }`, `AskResult`, `orchestrate(question: string, history: ConversationTurn[]): Promise<AskResult>` — consumed by Task 11 (`/api/ask` route).

- [ ] **Step 1: Write the orchestration loop**

`lib/ai/orchestrate.ts`:
```ts
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
    let rawArgs: unknown;
    try {
      rawArgs = JSON.parse(call.function.arguments);
    } catch {
      rawArgs = {};
    }

    try {
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
          table: result.points,
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
```

- [ ] **Step 2: Smoke-test end to end**

`scripts/smoke-orchestrate.ts`:
```ts
import { orchestrate } from "../lib/ai/orchestrate";

async function main() {
  console.log(await orchestrate("Which carrier has the highest delay rate?", []));
  console.log(await orchestrate("How much inventory should I plan?", [])); // should ask for a SKU/category, not guess
  console.log(await orchestrate("What's the weather like in London?", [])); // should decline
}
main().then(() => process.exit(0));
```

Run: `npx tsx scripts/smoke-orchestrate.ts` (requires `DEEPSEEK_API_KEY` set)
Expected: first call returns a real `answer`/`chart`/`queryPlan` about DHL/carriers. Second call returns a clarifying question in `answer` with `queryPlan: null` (no tool was called). Third call returns a polite decline with `queryPlan: null`. If the model doesn't ask a clarifying question for the second case, strengthen the `forecast_demand` description or the system prompt line about it and re-test.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/orchestrate.ts scripts/smoke-orchestrate.ts
git commit -m "Add the single-LLM-call routing/orchestration loop with structured self-correction"
```

---

### Task 11: `/api/ask` route

**Files:**
- Create: `app/api/ask/route.ts`

**Interfaces:**
- Consumes: `orchestrate`, `ConversationTurn` (Task 10).
- Produces: `POST /api/ask` — consumed by the Ask AI client page (Task 14).

- [ ] **Step 1: Write the route handler**

`app/api/ask/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { orchestrate, type ConversationTurn } from "@/lib/ai/orchestrate";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.question !== "string" || body.question.trim().length === 0) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const history: ConversationTurn[] = Array.isArray(body.history)
    ? (body.history as ConversationTurn[]).filter(
        (h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string"
      )
    : [];

  try {
    const result = await orchestrate(body.question, history);
    return NextResponse.json(result);
  } catch (err) {
    console.error("orchestrate() failed:", err);
    return NextResponse.json(
      { error: "Something went wrong answering that question. Please try again." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify with a curl request**

Run: `npm run dev` (separate terminal), then:
```bash
curl -s -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Which carrier has the highest delay rate?","history":[]}' | head -c 2000
```
Expected: JSON response with `answer`, `chart`, `queryPlan`, `filters`, `metric`, `groupBy`, `table` fields populated.

- [ ] **Step 3: Commit**

```bash
git add app/api/ask/route.ts
git commit -m "Add /api/ask route — the app's only real HTTP API"
```

---

### Task 12: Dashboard page and charts

**Files:**
- Create: `app/page.tsx`, `components/dashboard/KpiCard.tsx`, `components/dashboard/OrderVolumeChart.tsx`, `components/dashboard/DeliveryStatusChart.tsx`, `components/dashboard/CarrierBreakdownChart.tsx`, `components/dashboard/DateRangeFilter.tsx`, `components/shared/ExplainCaption.tsx`

**Interfaces:**
- Consumes: `runQueryAnalytics` (Task 5).
- Produces: the `/` route; `KpiCard`, chart components, and `ExplainCaption` reused by nothing else (leaf UI), but their prop shapes matter for Task 16 styling pass.

- [ ] **Step 1: Write the design-token CSS variables** (needed by every component below)

`app/globals.css` — replace the Tailwind boilerplate with:
```css
@import "tailwindcss";

:root {
  --color-bg: #f8f8f8;
  --color-surface: #ffffff;
  --color-sidebar: #0a0a0a;
  --color-accent: #17f082;
  --color-text: #171717;
  --color-text-muted: #737373;
  --status-good: #0ca30c;
  --status-warning: #fab219;
  --status-critical: #d03b3b;
  --status-info: #2a78d6;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
}

.card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 8px rgba(0, 0, 0, 0.04);
  padding: 1.5rem;
}
```

- [ ] **Step 2: Write `ExplainCaption`** (the Dashboard-chart explainability requirement — filters/metric caption + view-data affordance)

`components/shared/ExplainCaption.tsx`:
```tsx
"use client";
import { useState } from "react";

export function ExplainCaption({
  filterLabel,
  metricLabel,
  rows,
}: {
  filterLabel: string;
  metricLabel: string;
  rows: { label: string; value: number }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 text-xs text-[var(--color-text-muted)]">
      <div className="flex items-center gap-2">
        <span>{filterLabel} · {metricLabel}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="underline underline-offset-2"
        >
          {open ? "hide data" : "view data"}
        </button>
      </div>
      {open && (
        <table className="mt-2 w-full text-left">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-black/5">
                <td className="py-1 pr-4">{r.label}</td>
                <td className="py-1">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `KpiCard`**

`components/dashboard/KpiCard.tsx`:
```tsx
import NumberFlow from "@number-flow/react";

export function KpiCard({
  label,
  value,
  format = "number",
}: {
  label: string;
  value: number;
  format?: "number" | "percent" | "days";
}) {
  const displayValue = format === "percent" ? value * 100 : value;
  const suffix = format === "percent" ? "%" : format === "days" ? "d" : "";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight">
        <NumberFlow value={Math.round(displayValue * 10) / 10} />
        {suffix}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the three chart components**

`components/dashboard/OrderVolumeChart.tsx`:
```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ExplainCaption } from "@/components/shared/ExplainCaption";
import type { QueryResultRow } from "@/lib/queries/analytics";

export function OrderVolumeChart({ data, filterLabel }: { data: QueryResultRow[]; filterLabel: string }) {
  return (
    <div className="card">
      <div className="text-sm font-medium">Order Volume Over Time</div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.map((r) => ({ x: r.label, y: r.value }))}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <Tooltip />
            <Line type="monotone" dataKey="y" stroke="var(--status-info)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ExplainCaption filterLabel={filterLabel} metricLabel="count grouped by week" rows={data} />
    </div>
  );
}
```

`components/dashboard/DeliveryStatusChart.tsx`:
```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ExplainCaption } from "@/components/shared/ExplainCaption";

export function DeliveryStatusChart({
  delivered,
  delayed,
  filterLabel,
}: {
  delivered: number;
  delayed: number;
  filterLabel: string;
}) {
  const data = [
    { x: "Delivered", y: delivered, fill: "var(--status-good)" },
    { x: "Delayed", y: delayed, fill: "var(--status-warning)" },
  ];
  return (
    <div className="card">
      <div className="text-sm font-medium">Delivered vs Delayed</div>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <Tooltip />
            <Bar dataKey="y" radius={[6, 6, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.x} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ExplainCaption
        filterLabel={filterLabel}
        metricLabel="count by status"
        rows={[{ label: "Delivered", value: delivered }, { label: "Delayed", value: delayed }]}
      />
    </div>
  );
}
```

`components/dashboard/CarrierBreakdownChart.tsx`:
```tsx
"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ExplainCaption } from "@/components/shared/ExplainCaption";
import type { QueryResultRow } from "@/lib/queries/analytics";

export function CarrierBreakdownChart({ data, filterLabel }: { data: QueryResultRow[]; filterLabel: string }) {
  return (
    <div className="card">
      <div className="text-sm font-medium">Carrier Breakdown (delay rate)</div>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.map((r) => ({ x: r.label, y: r.value }))} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis type="category" dataKey="x" tick={{ fontSize: 11 }} width={80} stroke="var(--color-text-muted)" />
            <Tooltip />
            <Bar dataKey="y" fill="var(--status-info)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ExplainCaption filterLabel={filterLabel} metricLabel="delay rate grouped by carrier" rows={data} />
    </div>
  );
}
```

- [ ] **Step 5: Write `DateRangeFilter`**

`components/dashboard/DateRangeFilter.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";

export function DateRangeFilter({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();

  function apply(newFrom: string, newTo: string) {
    const params = new URLSearchParams();
    if (newFrom) params.set("from", newFrom);
    if (newTo) params.set("to", newTo);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="date"
        defaultValue={from}
        onChange={(e) => apply(e.target.value, to ?? "2025-12-31")}
        className="rounded-[var(--radius-md)] border border-black/10 px-2 py-1"
      />
      <span className="text-[var(--color-text-muted)]">to</span>
      <input
        type="date"
        defaultValue={to}
        onChange={(e) => apply(from ?? "2025-01-01", e.target.value)}
        className="rounded-[var(--radius-md)] border border-black/10 px-2 py-1"
      />
    </div>
  );
}
```

- [ ] **Step 6: Write the Dashboard Server Component**

`app/page.tsx`:
```tsx
import { runQueryAnalytics } from "@/lib/queries/analytics";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { OrderVolumeChart } from "@/components/dashboard/OrderVolumeChart";
import { DeliveryStatusChart } from "@/components/dashboard/DeliveryStatusChart";
import { CarrierBreakdownChart } from "@/components/dashboard/CarrierBreakdownChart";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const dateRange = from && to ? { from, to } : undefined;
  const baseFilters = dateRange ? { dateRange } : undefined;
  const filterLabel = dateRange ? `${dateRange.from} – ${dateRange.to}` : "All 2025";

  const [total, delivered, delayed, onTimeRate, avgDeliveryTime, volumeOverTime, carrierDelayBreakdown] =
    await Promise.all([
      runQueryAnalytics({ metric: "count", filters: baseFilters }),
      runQueryAnalytics({ metric: "count", filters: { ...baseFilters, status: "delivered" } }),
      runQueryAnalytics({ metric: "count", filters: { ...baseFilters, status: "delayed" } }),
      runQueryAnalytics({ metric: "on_time_rate", filters: baseFilters }),
      runQueryAnalytics({ metric: "avg_delivery_time", filters: baseFilters }),
      runQueryAnalytics({ metric: "count", groupBy: "week", filters: baseFilters }),
      runQueryAnalytics({ metric: "delay_rate", groupBy: "carrier", filters: baseFilters }),
    ]);

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <DateRangeFilter from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="Total Orders" value={total.rows[0].value} />
        <KpiCard label="Delivered" value={delivered.rows[0].value} />
        <KpiCard label="Delayed" value={delayed.rows[0].value} />
        <KpiCard label="On-Time Rate" value={onTimeRate.rows[0].value} format="percent" />
        <KpiCard label="Avg Delivery Time" value={avgDeliveryTime.rows[0].value} format="days" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <OrderVolumeChart data={volumeOverTime.rows} filterLabel={filterLabel} />
        <DeliveryStatusChart
          delivered={delivered.rows[0].value}
          delayed={delayed.rows[0].value}
          filterLabel={filterLabel}
        />
      </div>

      <CarrierBreakdownChart data={carrierDelayBreakdown.rows} filterLabel={filterLabel} />
    </div>
  );
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: 5 KPI cards with real numbers, 3 charts rendering with real data, date inputs update the URL and re-render server-side data when changed. No console errors.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx app/globals.css components/dashboard components/shared/ExplainCaption.tsx
git commit -m "Add Dashboard page: KPIs, 3 charts, date-range filter, per-chart explainability"
```

---

### Task 13: Shared components — StatusBadge, DataTable

**Files:**
- Create: `components/shared/StatusBadge.tsx`, `components/shared/DataTable.tsx`

**Interfaces:**
- Produces: `StatusBadge`, `DataTable` — consumed by Task 15 (Ask AI result cards) and available for any future Dashboard table view.

- [ ] **Step 1: Write `StatusBadge`**

`components/shared/StatusBadge.tsx`:
```tsx
import { cva, type VariantProps } from "class-variance-authority";

const statusBadge = cva("inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 text-xs font-medium", {
  variants: {
    status: {
      delivered: "bg-[var(--status-good)]/10 text-[var(--status-good)]",
      delayed: "bg-[var(--status-warning)]/10 text-[var(--status-warning)]",
      exception: "bg-[var(--status-critical)]/10 text-[var(--status-critical)]",
      in_transit: "bg-[var(--status-info)]/10 text-[var(--status-info)]",
      canceled: "bg-black/5 text-[var(--color-text-muted)]",
    },
  },
});

const STATUS_ICON: Record<string, string> = {
  delivered: "✓",
  delayed: "⚠",
  exception: "✕",
  in_transit: "→",
  canceled: "–",
};

const STATUS_LABEL: Record<string, string> = {
  delivered: "Delivered",
  delayed: "Delayed",
  exception: "Exception",
  in_transit: "In Transit",
  canceled: "Canceled",
};

export function StatusBadge({ status }: VariantProps<typeof statusBadge> & { status: keyof typeof STATUS_LABEL }) {
  return (
    <span className={statusBadge({ status })}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
```

(Status color is never shown without the icon + text label alongside it — required per the dataviz-validated palette's contrast mitigation.)

- [ ] **Step 2: Write `DataTable`**

`components/shared/DataTable.tsx`:
```tsx
export function DataTable({ rows }: { rows: { label: string; value: number }[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase text-[var(--color-text-muted)]">
          <th className="pb-2 font-medium">Label</th>
          <th className="pb-2 font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-black/5">
            <td className="py-1.5 pr-4">{r.label}</td>
            <td className="py-1.5">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/shared/StatusBadge.tsx components/shared/DataTable.tsx
git commit -m "Add StatusBadge (icon+label, never color alone) and DataTable shared components"
```

---

### Task 14: Ask AI page — question input, examples, conversation state

**Files:**
- Create: `app/ask/page.tsx`, `components/ask/QuestionInput.tsx`, `components/ask/ExampleChips.tsx`

**Interfaces:**
- Consumes: `POST /api/ask` (Task 11), `ResultCard` (Task 15 — created after this task; `app/ask/page.tsx` is finished in Task 15's Step 1, not before).
- Produces: `/ask` route, conversation state shape `{ question: string; result: AskResult }[]` held in the page's `useState`.

- [ ] **Step 1: Write `ExampleChips`**

`components/ask/ExampleChips.tsx`:
```tsx
"use client";

const EXAMPLES = [
  "Show delayed orders by week for the last 3 months",
  "Which carrier has the highest delay rate?",
  "How many orders were delivered late last month?",
  "Predict demand for SKU PAPER-0197 for the next 4 months",
  "Why does DHL's delay rate look high this month?",
];

export function ExampleChips({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          onClick={() => onPick(ex)}
          className="rounded-[var(--radius-md)] border border-black/10 px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition hover:border-black/20"
        >
          {ex}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `QuestionInput`**

`components/ask/QuestionInput.tsx`:
```tsx
"use client";
import { useState } from "react";

export function QuestionInput({
  onSubmit,
  disabled,
  value,
}: {
  onSubmit: (question: string) => void;
  disabled: boolean;
  value?: string;
}) {
  const [text, setText] = useState(value ?? "");

  function submit() {
    if (!text.trim() || disabled) return;
    onSubmit(text.trim());
    setText("");
  }

  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Ask about your logistics data..."
        className="card flex-1 !py-2 outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black transition active:scale-[0.97] disabled:opacity-50"
      >
        Ask
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write the Ask AI page (client component, conversation state)**

`app/ask/page.tsx` — this is the file Task 15 will extend with `<ResultCard />`; for now, render a plain JSON dump of each result so the page is testable before Task 15's rich card exists:
```tsx
"use client";
import { useState } from "react";
import { QuestionInput } from "@/components/ask/QuestionInput";
import { ExampleChips } from "@/components/ask/ExampleChips";
import type { AskResult, ConversationTurn } from "@/lib/ai/orchestrate";

type Turn = { question: string; result: AskResult };

export default function AskPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>();

  async function ask(question: string) {
    setLoading(true);
    const history: ConversationTurn[] = turns.flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.result.answer },
    ]);

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
    });
    const result: AskResult = await res.json();
    setTurns((prev) => [...prev, { question, result }]);
    setLoading(false);
  }

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-xl font-semibold">Ask AI</h1>
      <QuestionInput onSubmit={ask} disabled={loading} value={pendingQuestion} />
      <ExampleChips onPick={(q) => { setPendingQuestion(q); ask(q); }} />
      <div className="space-y-4">
        {turns.map((t, i) => (
          <div key={i} className="card">
            <div className="text-sm text-[var(--color-text-muted)]">&quot;{t.question}&quot;</div>
            <div className="mt-2">{t.result.answer}</div>
          </div>
        ))}
        {loading && <div className="text-sm text-[var(--color-text-muted)]">Thinking…</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`, open `http://localhost:3000/ask`. Click an example chip, confirm a result card appears with a real answer within a few seconds.

- [ ] **Step 5: Commit**

```bash
git add app/ask/page.tsx components/ask/QuestionInput.tsx components/ask/ExampleChips.tsx
git commit -m "Add Ask AI page with conversation state, example chips, and question input"
```

---

### Task 15: Result card + 3-tier explainability panel

**Files:**
- Modify: `app/ask/page.tsx` (swap the plain JSON dump for `<ResultCard />`)
- Create: `components/ask/ResultCard.tsx`, `components/ask/ExplainabilityPanel.tsx`

**Interfaces:**
- Consumes: `AskResult` (Task 10), `ChartSpec` (Task 8), `METRIC_LABELS` (Task 8), `StatusBadge`/`DataTable` (Task 13).
- Produces: `ResultCard`, `ExplainabilityPanel`.

- [ ] **Step 1: Write a chart-spec renderer** (shared by Dashboard-style ad hoc rendering and Ask AI results)

`components/ask/ChartRenderer.tsx`:
```tsx
"use client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ChartSpec } from "@/lib/format/chartSelect";

export function ChartRenderer({ chart }: { chart: ChartSpec | null }) {
  if (!chart || chart.kind === "stat") return null;

  if (chart.kind === "line") {
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.points.map((p) => ({ x: p.x, y: p.y }))}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="y" stroke="var(--status-info)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "bar") {
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart.points.map((p) => ({ x: p.x, y: p.y }))}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="y" fill="var(--status-info)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "forecast-line") {
    const merged = [
      ...chart.historical.map((p) => ({ x: p.x, historical: p.y, forecast: undefined as number | undefined })),
      ...chart.forecast.map((p) => ({ x: p.x, historical: undefined as number | undefined, forecast: p.y })),
    ];
    return (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="historical" stroke="var(--status-info)" strokeWidth={2} dot={false} name="Historical" />
            <Line type="monotone" dataKey="forecast" stroke="var(--status-info)" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Forecast" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chart.kind === "compare-bar") {
    const data = [
      { x: chart.primary.label, y: chart.primary.value },
      { x: chart.baseline.label, y: chart.baseline.value },
    ];
    return (
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="x" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="y" fill="var(--status-info)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Write `ExplainabilityPanel`** (the 3-tier disclosure)

`components/ask/ExplainabilityPanel.tsx`:
```tsx
"use client";
import { useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { METRIC_LABELS } from "@/lib/format/metricLabels";
import type { AskResult } from "@/lib/ai/orchestrate";

export function ExplainabilityPanel({ result }: { result: AskResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (!result.queryPlan) return null; // decline/clarification responses have nothing to explain

  const metricLabel = result.metric ? METRIC_LABELS[result.metric as keyof typeof METRIC_LABELS] : null;

  return (
    <div className="mt-4 border-t border-black/5 pt-3 text-sm">
      <button
        type="button"
        onClick={() => setShowDetails((s) => !s)}
        className="text-[var(--color-text-muted)] underline underline-offset-2"
      >
        {showDetails ? "▾ Hide how I found this" : "▸ How I found this"}
      </button>

      {showDetails && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[100px_1fr] gap-1 text-xs">
            {metricLabel && (
              <>
                <span className="text-[var(--color-text-muted)]">Measured</span>
                <span>{metricLabel}</span>
              </>
            )}
            {result.groupBy && (
              <>
                <span className="text-[var(--color-text-muted)]">Grouped by</span>
                <span>{result.groupBy}</span>
              </>
            )}
            <span className="text-[var(--color-text-muted)]">Filters</span>
            <span>{result.filters ? JSON.stringify(result.filters) : "none"}</span>
          </div>

          {Array.isArray(result.table) && result.table.length > 0 && (
            <DataTable rows={result.table as { label: string; value: number }[]} />
          )}

          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            className="text-xs text-[var(--color-text-muted)] underline underline-offset-2"
          >
            {showRaw ? "hide technical query" : "show technical query"}
          </button>
          {showRaw && (
            <pre className="overflow-x-auto rounded-[var(--radius-sm)] bg-black/5 p-2 text-xs">
              {JSON.stringify(result.queryPlan, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `ResultCard`**

`components/ask/ResultCard.tsx`:
```tsx
import { ChartRenderer } from "./ChartRenderer";
import { ExplainabilityPanel } from "./ExplainabilityPanel";
import type { AskResult } from "@/lib/ai/orchestrate";

export function ResultCard({ question, result }: { question: string; result: AskResult }) {
  return (
    <div className="card">
      <div className="text-sm text-[var(--color-text-muted)]">&quot;{question}&quot;</div>
      <div className="mt-2 text-base">{result.answer}</div>
      <div className="mt-3">
        <ChartRenderer chart={result.chart} />
      </div>
      <ExplainabilityPanel result={result} />
    </div>
  );
}
```

- [ ] **Step 4: Wire `ResultCard` into the Ask AI page**

In `app/ask/page.tsx`, replace the inline `<div className="card">...</div>` turn rendering:
```tsx
import { ResultCard } from "@/components/ask/ResultCard";
// ...
{turns.map((t, i) => (
  <ResultCard key={i} question={t.question} result={t.result} />
))}
```

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`, open `/ask`, click each example chip in turn. Confirm: answer text renders, chart renders for query/forecast/compare questions (no chart for a plain scalar answer), "How I found this" expands to show plain-language filters/metric + data table, "show technical query" reveals raw JSON only when clicked.

- [ ] **Step 6: Commit**

```bash
git add app/ask/page.tsx components/ask/ResultCard.tsx components/ask/ExplainabilityPanel.tsx components/ask/ChartRenderer.tsx
git commit -m "Add ResultCard with 3-tier explainability panel and chart rendering"
```

---

### Task 16: Layout, sidebar nav, dark theme shell

**Files:**
- Create: `components/layout/Sidebar.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: the app shell wrapping every page — no new data interfaces, purely presentational.

- [ ] **Step 1: Write the sidebar**

`components/layout/Sidebar.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/ask", label: "Ask AI" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex w-48 flex-col gap-1 bg-[var(--color-sidebar)] p-4">
      <div className="mb-4 text-sm font-semibold text-white">Spaceship Analytics</div>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-[var(--radius-md)] px-3 py-2 text-sm transition ${
              active
                ? "bg-[var(--color-accent)] font-medium text-black"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Update the root layout**

`app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spaceship Logistics Analytics",
  description: "AI-powered logistics analytics dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-x-auto">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`. Confirm: dark sidebar with 2 nav items, active item highlighted in accent green, both `/` and `/ask` render inside the shell correctly, no layout shift or horizontal scroll on the body.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx app/layout.tsx
git commit -m "Add dark sidebar shell and root layout"
```

---

### Task 17: Motion polish pass

**Files:**
- Modify: `app/globals.css` (button/card transition utilities), `components/dashboard/KpiCard.tsx`, `components/ask/QuestionInput.tsx` (verify `active:scale-[0.97]` already present from Task 14 — confirm, don't duplicate)

**Interfaces:** none — pure CSS/motion refinement over existing components.

- [ ] **Step 1: Add shared button-press and stagger utilities**

Append to `app/globals.css`:
```css
button {
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
button:active {
  transform: scale(0.97);
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.card {
  animation: card-enter 250ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
.card:nth-of-type(2) { animation-delay: 40ms; }
.card:nth-of-type(3) { animation-delay: 80ms; }
.card:nth-of-type(4) { animation-delay: 120ms; }
.card:nth-of-type(5) { animation-delay: 160ms; }

@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
  button { transition: none; }
}
```

Note: the stagger only fires on initial mount of each `.card` (Dashboard's KPI cards/charts on first load) — it does **not** re-trigger on the Dashboard's date-filter navigation, because Next.js Server Component re-renders replace DOM nodes whose CSS animation already completed; if this replays uncomfortably during manual testing, drop the `nth-of-type` delays and keep only the base `card-enter` fade.

- [ ] **Step 2: Verify visually**

Run: `npm run dev`. Reload `/`, watch the KPI cards/charts fade+rise in with a subtle stagger on first paint. Click a button (Ask AI's "Ask") and confirm it visibly compresses on press. Toggle `prefers-reduced-motion` in browser dev tools and confirm animations stop.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "Add button press feedback and first-load stagger animation, respecting reduced-motion"
```

---

### Task 18: Deploy to Vercel

**Files:** none (infra step) — may create `vercel.json` only if a default setting needs overriding (not expected).

- [ ] **Step 1: Push to GitHub**

```bash
git push -u origin master
```

(Assumes `origin` already points at `github.com/fadellh/logistics-dashboard` per earlier setup — verify with `git remote -v` first.)

- [ ] **Step 2: Import the project in Vercel**

In the Vercel dashboard: Add New → Project → Import `fadellh/logistics-dashboard`. Framework preset auto-detects Next.js — accept defaults.

- [ ] **Step 3: Set environment variables**

In the new project's Settings → Environment Variables, add for all environments (Production/Preview/Development):
- `DATABASE_URL` — the Neon connection string used locally
- `DEEPSEEK_API_KEY` — the DeepSeek key used locally

- [ ] **Step 4: Deploy**

Trigger the deploy (either via the dashboard's Deploy button or `git push` if already imported). Wait for the build to complete.

- [ ] **Step 5: Smoke-test the live URL**

Visit the deployed `*.vercel.app` URL:
- `/` loads with real KPI data (confirms `DATABASE_URL` wired correctly and Neon is reachable from Vercel's network).
- `/ask` → click an example chip → confirm a real answer comes back within the 30s `maxDuration` window (confirms `DEEPSEEK_API_KEY` wired correctly).
- Try one out-of-scope question ("what's the weather") → confirm a graceful decline, not a 500 error.

If either env var is missing/wrong, fix it in Vercel settings and redeploy (Vercel redeploys automatically don't pick up env var changes — trigger a manual redeploy from the dashboard after editing).

- [ ] **Step 6: No commit needed** (infra-only task) — record the live URL for Task 19.

---

### Task 19: Finalize README with real links

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the placeholder links**

In `README.md`, replace:
```markdown
- **Live app**: _\<deployed Vercel URL\>_
- **Repository**: _\<repo URL\>_
```
with the real deployed URL and `https://github.com/fadellh/logistics-dashboard`.

- [ ] **Step 2: Double-check the Setup section against what actually happened**

Re-read `README.md`'s "Local Setup Instructions" against the real commands used in Tasks 1-3 (`npm install`, `npx drizzle-kit push`, `npm run seed`, `npm run dev`) — fix any command that drifted during implementation (e.g. if a package name or script name changed).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Finalize README with live deployment and repository links"
git push
```

---

## Self-Review Notes (completed during plan authoring)

**Spec coverage check:** every requirement in the design spec's numbered sections maps to a task — DB/schema (Task 2), seed (Task 3), 3 tool arg schemas + validation test (Task 4), `query_analytics` (Task 5), `forecast_demand` + regression test (Task 6), `compare_metric` (Task 7), chart-type + answer templates (Task 8), AI client/tools/prompt (Task 9), orchestration loop + rate limit + self-correction (Task 10), API route + `maxDuration` (Task 11), Dashboard + per-chart explainability (Task 12), shared status/table components (Task 13), Ask AI conversation state (Task 14), 3-tier explainability panel (Task 15), sidebar/theme (Task 16), motion polish (Task 17), deploy (Task 18), README finalization (Task 19).

**Type consistency check:** `QueryAnalyticsArgs`/`ForecastDemandArgs`/`CompareMetricArgs` (Task 4) are the single source of type truth, imported unchanged through Tasks 5-11; `QueryAnalyticsResult`/`ForecastResult`/`CompareMetricResult` (Tasks 5-7) are consumed unchanged by Task 8's formatters and Task 10's orchestration; `ChartSpec` (Task 8) is consumed unchanged by Task 15's `ChartRenderer`; `AskResult` (Task 10) is the exact shape both Task 11's route response and Task 14/15's client-side rendering expect — no renamed fields anywhere in the chain.

**No-placeholder check:** every step above contains real, complete code — no "TODO"/"add error handling"/"similar to Task N" shortcuts. Drizzle query-builder syntax in Tasks 5-6 is flagged for verification against the installed package version during Task 5 Step 2's smoke test, since it can't be executed before implementation begins.
