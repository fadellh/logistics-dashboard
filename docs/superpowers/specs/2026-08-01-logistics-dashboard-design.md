# AI-Powered Logistics Analytics Dashboard — Design

Take-home assignment for Spaceship (AI Engineer, LLM & Optimization Focus). Source
spec: employer-provided `logistics-spec.pdf` / `Coding_assignment.docx`. Expected
effort 6–10h; explicit instruction to avoid over-engineering.

## Stack

- **Next.js (App Router, TypeScript)** — single monolith, one Vercel deploy target.
  No separate backend to host.
- **Database: Postgres via Neon**, accessed through **Drizzle ORM**. Chosen over
  in-memory arrays because it directly demonstrates the spec's "prefer structured
  query generation over raw AI-generated SQL" guideline: the AI never touches SQL —
  it emits structured JSON tool args, which the backend maps to a small allowlist of
  parameterized Drizzle queries. Neon over Supabase because Neon scale-to-zero
  auto-wakes on the next query, whereas Supabase free tier auto-pauses after ~7 days
  idle and needs a manual restore — a real risk for "stable for reviewers" when the
  review date is unknown.
- **LLM: DeepSeek** (OpenAI-SDK-compatible, tool/function calling), chosen for cost.
  Client wrapped behind one config point (`baseURL` + `model`) so swapping to
  Grok/OpenAI is a one-line change.
- **Charts: Recharts.**
- **No auth.** Spec allows omitting auth if unused; this removes a whole category of
  deploy/setup risk for a read-only public demo.

## Data

CSV (`mock_logistics_data.csv`, 400 rows) seeded once into a single `orders` table
matching the source columns 1:1 (order_id, order_date, delivery_date, carrier,
origin_city, destination_city, status, sku, product_category, quantity,
unit_price_usd, order_value_usd, is_promo, promo_discount_pct, region, warehouse,
client_id). No normalization into separate tables — one flat table matches the
source data and the query patterns needed; splitting it out would be speculative.

Data is read-only: no mutation endpoints exist at all (not just policy).

### Key derived-metric assumptions (documented in README too)

- **Delayed** = `status = 'delayed'` (the dataset has no separate SLA/promised-date
  field to diff against, so status is the ground truth for delay).
- **On-time delivery rate** = `delivered / (delivered + delayed)` — of orders that
  reached a terminal delivered-or-delayed outcome, the fraction that were on-time.
  `in_transit`/`exception`/`canceled` are excluded (no outcome yet, or no delivery
  occurred).
- **Average delivery time** = `avg(delivery_date - order_date)` over rows with a
  non-null `delivery_date`.

## AI Orchestration

Tool-calling, not a chat loop that free-generates SQL or answers:

```
User question → DeepSeek (system prompt + tool schemas)
  → tool call: query_analytics(...) | forecast_demand(...)
  → Zod-validate args → run allowlisted Drizzle query → structured result
  → result fed back to model → model phrases the final NL explanation
  → API returns { answer, chart?, queryPlan, filters, table }
```

The model **never** sees or writes SQL, and never states a number that didn't come
from the computation step — the second model turn only phrases prose around numbers
already computed. This satisfies "AI must never generate answers without computation"
literally, not just as an intent.

### `query_analytics` tool

Args: `metric` (count | sum_order_value | avg_delivery_time | on_time_rate),
`groupBy?` (carrier | region | destination_city | product_category | sku | week |
month), `filters?` (dateRange, carrier, region, status, product_category),
`dateRange?`. Covers all three example queries in the spec (delayed-by-week,
carrier delay rate, late-orders-last-month) plus the dashboard's own KPIs/charts —
the dashboard calls the same query functions directly (no LLM round-trip needed for
the static dashboard tab).

### `forecast_demand` tool

Args: `sku?` or `productCategory?` (one required), `horizonMonths` (1–6). Aggregates
historical order quantity per month, fits an ordinary-least-squares linear trend in
plain TypeScript (no ML library — a handful of lines), projects it forward, and
returns forecast points + a naive inventory recommendation (projected demand ×
1.15 safety margin) + a one-line methodology explanation. Linear regression chosen
over moving average because the spec's example question ("predict demand for the
next 4 months") implies a genuine trend projection, not a flat repeat of a recent
average.

## Explainability

Every AI response returns, verbatim from the tool call and computation — no extra
bookkeeping layer needed:
- `filters` — the filters object passed to the query
- `metric` / `groupBy` — what was computed
- `queryPlan` — the structured tool-call args themselves (this *is* the query plan)
- `table` — the raw aggregated rows backing the chart/answer

## Dashboard tab

Static (no LLM call): KPI cards (total/delivered/delayed orders, on-time rate, avg
delivery time) + 2 charts (order volume over time; delivered vs delayed) computed
by the same `query_analytics` functions the AI tool calls, called directly.

## Explicitly out of scope

Query history, response caching, Docker, tests beyond one smoke check, vector
DB/RAG (400 structured rows don't need semantic search), fine-tuning, auth. All are
either spec bonus items or genuinely unnecessary at this data scale — noted in the
README's "simplifications/limitations" section per the spec's README requirements.

## Env vars

`DATABASE_URL` (Neon connection string), `DEEPSEEK_API_KEY`.
