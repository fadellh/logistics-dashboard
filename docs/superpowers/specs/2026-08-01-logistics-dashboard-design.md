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

**Pattern: Anthropic's "Routing" workflow** (Schluntz & Zhang, Anthropic, Dec 2024 —
"Building Effective Agents"), not an open-ended agent loop. A classifier LLM step picks
one of a fixed set of downstream tools; engineers own the graph, not the model. Chosen
over a free-running agent because our tool set is small and fixed and the paths are
fully enumerable — exactly the case where the source material says workflows beat
agents: *"predictable tasks — if you can enumerate the steps, you should"* and
*"compliance-bound tasks — auditors want to read the graph, not infer it from
trajectories."* That second point maps directly onto this project's Explainability
requirement. (Reference: `ai-engineering-from-scratch`,
`phases/14-agent-engineering/12-anthropic-workflow-patterns/docs/en.md`.)

```
User question → DeepSeek (system prompt + tool schemas)
  → tool call: query_analytics(...) | forecast_demand(...)
  → Zod-validate args → run allowlisted Drizzle query → structured result
  → result fed back to model → model phrases the final NL explanation
  → API returns { answer, chart?, queryPlan, filters, table }
```

The model **never** sees or writes SQL, and never states a number that didn't come
from the computation step — the second model turn only phrases prose around numbers
already computed. `queryPlan` in the response is literally the tool call's `input`
object, not a separately-generated explanation — the "reasoning shown" is the
structure that actually ran, not prose that could drift from it. This satisfies "AI
must never generate answers without computation" literally, not just as an intent.

### Scope boundary: what happens when no recipe fits

The tool schema isn't "one recipe per question" — `metric × groupBy × filters` is a
combinatorial space (thousands of valid questions from a handful of enums), so most of
the model's real work is translating messy natural language ("kurir" → `carrier`,
"telat" → `status: delayed`, "last month" → a concrete date range) into that
structure, not picking between two buttons. That translation step is genuine NLU work;
the execution step is deliberately kept boring and deterministic on purpose — this
project rewards Data Correctness (20%) over flexibility, and the spec explicitly frames
AI as "a routing and orchestration system — not the source of truth."

Three cases when a question doesn't map to a valid tool call:

1. **Out of domain** (weather, general chat) → the model declines directly, no tool
   call. Allowed to answer in its own words here because a *decline* isn't a data
   claim — "AI must never generate answers without computation" bars ungrounded
   numbers, not a refusal.
2. **In-domain but unsupported metric/dimension** (e.g. profit margin — no cost data
   exists in the dataset) → same decline path, but the system prompt requires it to
   name what *is* supported instead of just failing silently.
3. **Ambiguous phrasing of a supported question** → resolved by the model itself via
   entity/date normalization; if truly ambiguous, it asks a clarifying question instead
   of guessing (same self-correction path as the structured-error case above).

The system prompt carries an explicit allowlist (supported metrics, dimensions,
filters) so the model knows its own boundary rather than guessing it. This boundary —
and the fact that it's a deliberate design choice, not a gap — is documented in the
README's required "unsupported queries" section.

### Applied tool-calling safety rules

From `phases/11-llm-engineering/09-function-calling/docs/en.md` ("Security: The
Non-Negotiable Rules" + "Error Handling"):

1. Never pass model-generated SQL to the DB → Drizzle allowlisted queries only.
2. Allowlist functions, no generic "execute anything" tool → exactly 2 tools exist.
3. Validate every argument → Zod schemas on both tool inputs.
4. Sanitize tool results before returning to the model → N/A here (results are
   aggregate business numbers, not secrets/PII).
5. **Rate-limit tool calls** — cap the orchestration loop at a small max number of
   tool-call round-trips (e.g. 4) per question, to prevent a runaway loop.
6. **Invalid/out-of-range args return a structured error result** (`{error: true,
   message, code}`), not an exception — the model reads it and asks the user a
   clarifying question on its next turn. This is how ambiguous-query handling is
   implemented: no separate "ambiguity detector" needed, just correct error handling
   on the existing tool-call loop.

### Conversational memory (session-level only)

Two different things get conflated as "memory" — worth being precise since the spec
lists "Query history" as an optional bonus, which could wrongly be read as "memory is
optional too":

- **Basic conversational context** (what we're building): the running array of prior
  turns (`{question, tool call, result}`) in this browser session gets sent back on
  every request, so follow-ups ("bandingkan dengan carrier lain") resolve correctly.
  Per `phases/14-agent-engineering/01-the-agent-loop/docs/en.md`, this is not an add-on
  — it's the default shape of any multi-turn chat loop; deliberately dropping it would
  take *more* code (truncating history), not less. Scope: **in-memory, this session
  only** — a page reload starts fresh. No server-side session store.
- **Advanced external memory** (MemGPT/Letta/Mem0 — `phases/14-agent-engineering/
  07-09`): paging conversation/documents in and out of an external store for
  cross-session persistence ("remember what I asked yesterday") or >100k-token
  overflow. Not needed at our scale — this is what stays out of scope, not
  conversational context itself.
- The spec's **"Query history" bonus item is a separate, still-skipped feature**: a
  persistent, revisitable list of past queries across sessions/reloads. Session-level
  conversational context doesn't provide that on its own.

UI stays a card feed (each turn renders as its own explainable card) — memory is a
backend/prompt concern, not a chat-bubble UI requirement.

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

## Product & UX

### Component stack (from the emil-design-eng `pick-ui-library` skill — a curated,
opinionated list; not substituted without reason)

- **Recharts** — all charts.
- **base-ui** — unstyled accessible primitives (date-range popover, selects,
  disclosure/accordion for the explainability panel).
- **NumberFlow** — animated KPI numbers (stat cards tick up instead of snapping).
- **Sonner** — error toasts.
- **cva** — variant-driven status-badge styling (delivered/delayed/in_transit/
  exception/canceled share one component, 5 variants).
- **Not used**: shadcn/ui (outside the curated list — base-ui + Tailwind directly
  instead), zustand (no cross-page shared state complex enough to need a store —
  `useState` / URL search params are enough for a 2-page app).

Visual tokens (sampled from the live spaceshipapp.com site + the Track & Trace
product screenshot, not guessed): accent green `#17F082`, dark surface `#0A0A0A`,
content background `#F8F8F8`, Inter as a free substitute for their licensed "ABC
Favorit Extended". Dark slim sidebar + light content area, white KPI cards with
colored icon badges, status dot/badge colors reused identically across the data
table and the charts (one visual language, not two).

### Design tokens

Grounded in the `emil-design-eng` and `apple-design` skills, not vibes:

- **Color**: accent `#17F082` used sparingly (primary CTA on Ask AI, active-nav
  indicator, "delivered" status) — neutrals (`#0A0A0A`/`#F8F8F8`/`#FFFFFF`) cover
  ~90% of the surface. Status ramp reused identically across table badges and chart
  series: canceled `#A3A3A3`, in_transit `#3B82F6`, delivered `#17F082`, delayed
  `#F59E0B`, exception `#EF4444`.
- **Elevation**: soft shadow, not a hard border, for card edges —
  `0 1px 2px rgba(0,0,0,.04), 0 1px 8px rgba(0,0,0,.04)`. Emil's skill names "solid
  border instead of semi-transparent shadow" explicitly as a bad-taste tell.
- **Radius scale**: 6px (badges/chips), 10px (buttons/inputs), 16px (cards) — three
  tiers, applied consistently, not ad hoc.
- **Spacing**: Tailwind's default 4px grid; card padding ≥24px; 32–48px between page
  sections.
- **Typography**: Inter. KPI numbers 36px/700, tracking **-0.02em** (negative — large
  display text per apple-design's optical-sizing rule); card labels 12px uppercase,
  tracking **+0.05em** (positive — small text needs the opposite direction, not one
  fixed letter-spacing value for everything).
- **Motion**: buttons `scale(0.97)` on `:active`, 160ms custom ease-out
  (`cubic-bezier(0.23,1,0.32,1)`). KPI/chart stagger fade-in (30-80ms apart) only on
  first page load — NOT on every filter change, since filtering is a frequent action
  and Emil's frequency table says reduce/remove animation on anything done "tens of
  times a day." Popovers (date-range picker) scale from their trigger origin, not
  center.

Once built, verify these visually (screenshot the running app) before calling the UI
done — token choices get the framework right, but "premium" is ~50% execution
consistency that's only checkable once real.

### Information architecture — 2 pages

**1. Dashboard (`/`)** — descriptive analytics, no LLM call at all:
- One date-range filter at the top (base-ui popover), driving every KPI and chart
  below it via the same `query_analytics` functions the AI tool calls — this is the
  one interactive control on this page, deliberately not filter-everything (carrier/
  region/category filters are delegated to the Ask AI page instead of duplicating
  query surface area on both pages).
- KPI row: 5 stat cards (total orders, delivered, delayed, on-time rate, avg delivery
  time), NumberFlow-animated values, colored icon badges matching the status palette.
- 3 charts: order volume over time (line), delivered vs delayed (bar/donut), carrier
  breakdown (horizontal bar) — matches all three examples the spec itself lists,
  cheap to add since it's the same query function with a different `groupBy`.

**2. Ask AI (`/ask`)** — diagnostic + forecasting, single page for both (same tool-
calling loop routes to either tool):
- Input box + a handful of clickable example questions (the spec's own 3 examples +
  one forecast example) — doubles as a guaranteed happy-path for reviewers.
- Each question renders as one result card: answer text → chart (if any) →
  collapsible explainability panel (filters, metric/dimension, query plan, data
  table) → for forecast results, additionally the inventory recommendation and
  methodology note.
- Conversational context carries across cards in the session (see "Conversational
  memory" above) — the feed *looks* like independent cards but the model sees prior
  turns, so follow-ups work.

## Explicitly out of scope

Query history, response caching, Docker, tests beyond one smoke check, vector
DB/RAG (400 structured rows don't need semantic search), fine-tuning, auth. All are
either spec bonus items or genuinely unnecessary at this data scale — noted in the
README's "simplifications/limitations" section per the spec's README requirements.

## Env vars

`DATABASE_URL` (Neon connection string), `DEEPSEEK_API_KEY`.
