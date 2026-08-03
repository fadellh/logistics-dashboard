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

## Code structure

```
app/
  layout.tsx              # root layout + sidebar nav
  page.tsx                 # Dashboard (/) — Server Component, calls lib/queries directly
  ask/page.tsx               # Ask AI (/ask) — Client Component
  api/ask/route.ts            # the only real API route — AI orchestration entry point

components/
  ui/                       # base-ui wrapped primitives
  dashboard/                 # KpiCard, 3 charts, DateRangeFilter
  ask/                        # QuestionInput, ExampleChips, ResultCard, ExplainabilityPanel
  shared/                     # StatusBadge (cva), DataTable

lib/
  db/            # schema.ts, client.ts, seed.ts
  queries/        # DATA COMPUTATION — analytics.ts, forecast.ts, compare.ts, schemas.ts (Zod)
  ai/              # AI INTERPRETATION + BUSINESS LOGIC
    client.ts        # DeepSeek config (baseURL/model)
    tools.ts           # tool JSON schemas (mirror lib/queries/schemas.ts)
    systemPrompt.ts      # instructions + allowlist
    orchestrate.ts         # the routing loop (business logic — see below)
  format/
    metricLabels.ts    # human-readable metric names
    chartSelect.ts       # deterministic chart-type rule
    answerTemplates.ts     # deterministic answer-sentence templates
```

Dashboard reads data via direct server-side function calls (Server Component →
`lib/queries`), not a REST round-trip — the date-range filter is a URL search param,
changing it triggers a soft navigation and Next.js's `loading.tsx` gives a free
skeleton state. `/api/ask` is the only actual HTTP API in the app.

### `orchestrate.ts` sequence (the "business logic" layer)

1. Receive `{question, history}`.
2. Build messages: system prompt (with allowlist) + session history + new question.
3. Call DeepSeek once with both tool schemas, `tool_choice: auto`.
4. No tool call → model declined/is asking for clarification → return its text
   directly as `answer`, done (see "Scope boundary" below).
5. Tool call → Zod-validate args. Invalid → return a structured error as the tool
   result and re-prompt (capped at 4 round-trips total — the rate-limit rule).
6. Valid → dispatch to `runQueryAnalytics`, `runForecastDemand`, or `runCompareMetric`
   (`lib/queries/`) based on which of the 3 tools was called.
7. Computation runs against Postgres via Drizzle — deterministic, no AI involved.
8. Compose the answer sentence from `answerTemplates.ts` (see "Revision" below —
   **not** a second model call).
9. Pick chart type via `chartSelect.ts` from the result shape.
10. Assemble `{answer, chart, queryPlan (= the validated tool args), filters, table}`.

Migrations use `drizzle-kit push` directly (no generated migration files) — the
schema is fixed for this project; only move to `drizzle-kit generate` if the schema
needs to evolve after data already exists.

## Architecture pattern: plain 3-layer separation, not DDD or Hexagonal

The spec's only architectural requirement is literal: *"clearly separate AI
interpretation, data computation, and business logic."* That's three folders
(`lib/ai/`, `lib/queries/`, and the orchestration glue that calls both), not a named
enterprise pattern. Explicitly **not** adopting:

- **DDD** — needs a rich domain model (aggregates/entities with behavior, invariants
  to protect) to earn its cost. We have one flat, read-only table and no business
  rules beyond aggregation math. No aggregate roots to design.
- **Hexagonal / ports-and-adapters** — earns its cost when multiple interchangeable
  infrastructure implementations exist. We have exactly one DB (Neon) and the LLM
  provider swap is already a one-line config change (`baseURL`/`model`), not a reason
  to build an interface + DI container for a single implementation.

Folder boundaries + function signatures already deliver the separation the spec asks
for, at zero ceremony cost. Reaching for either pattern here would be the over-
engineering the spec explicitly warns against.

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
User question → DeepSeek (system prompt + tool schemas, ONE call)
  → tool call: query_analytics(...) | forecast_demand(...)
  → Zod-validate args → run allowlisted Drizzle query → structured result
  → answer text composed by a deterministic template (no second model call)
  → API returns { answer, chart?, queryPlan, filters, table }
```

The model **never** sees or writes SQL, and never states a number that didn't come
from the computation step. `queryPlan` in the response is literally the tool call's
`input` object, not a separately-generated explanation — the "reasoning shown" is the
structure that actually ran, not prose that could drift from it. This satisfies "AI
must never generate answers without computation" literally, not just as an intent.

### Revision: one LLM call, not two — templated answers over a second model turn

Original draft of this doc had the model make a second call to phrase the final
answer from the computed result. Ponytail review question: does that second call need
to exist? Our supported question set is a small closed grammar (metric × groupBy), so
the answer sentence can be built from a fixed set of string templates keyed off the
same `chartSelect.ts` shape used for chart-type selection — e.g. for a ranking result:
`` `${topRow.label} has the highest ${metricLabel} at ${formatValue(topRow.value)}.` ``

Why this is the better default here, not just the lazier one:

- **Correctness.** Every time a value gets re-expressed by a second LLM call, there's
  a small but nonzero chance it's transcribed wrong — a game of telephone with a
  number. Templating removes that failure mode entirely: the exact value that came
  out of the Drizzle query is the exact value rendered, with zero paraphrasing step in
  between. Given Data Correctness is tied for the highest evaluation weight (20%),
  removing a whole class of "the AI misstated a correct number" bug is worth more than
  the more natural phrasing a second call would buy.
- **Cost/latency.** One model call per question instead of two.
- **Stronger claim, not just a cheaper one.** "AI never generates answers without
  computation" now holds at the *wording* level too — not just the numbers, the
  sentence itself is deterministic code, not model output.

Tradeoff, stated plainly (this goes in the README): templated answers read slightly
more rigid than free-form LLM prose — acceptable here because the supported question
grammar is small and enumerable, so a handful of templates covers it without reading
as robotic. If the question set grows much larger or more open-ended later, this is
the first thing to revisit (README "Future Improvements").

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
2. Allowlist functions, no generic "execute anything" tool → exactly 3 named tools
   exist (`query_analytics`, `forecast_demand`, `compare_metric`), each atomic with a
   tight "Use when X. Do not use for Y." description — see the tool-schema-design
   note under `compare_metric` below for why atomic beats one tool with a mode switch.
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

**Gap caught in final requirements audit**: the spec's own second example — "How
much inventory should I plan?" — names no SKU or category at all, but `sku`/
`productCategory` is required (one of the two). This is not a case where the model
should guess or default to "all products" (multi-category forecasting is explicitly
out of scope — see Explicitly out of scope below). The system prompt must instruct
the model that a forecast question with no identifiable product/category is
*ambiguous, not unsupported* — it should ask the user which SKU or category before
calling the tool, the same self-correction path already used for invalid arguments,
just triggered by interpretation instead of validation.

### `compare_metric` tool — the bounded answer to "Diagnostic Analytics: explaining why"

The spec's Core Concept section names "Diagnostic Analytics — explaining why" as one
of three required levels of intelligence, but all three of the spec's own example
questions are descriptive lookups ("show X", "which Y", "how many Z"), not causal
"why" questions. Genuine causal explanation (e.g. "why was DHL delayed in November")
would need root-cause data — incident reasons, weather, route-specific events — that
doesn't exist in this dataset. Letting the model freely narrate a cause anyway would
be the exact failure mode the spec warns against ("AI must never generate answers
without computation") — pure hallucination dressed as an explanation.

The honest, computable middle ground: surface *deviation from a baseline*. Not a
cause, but the first real step of diagnosis — "is this actually unusual?" — answered
with two real numbers, not a narrative.

**Why a separate tool, not a `compareTo` param bolted onto `query_analytics`** (this
was the original plan — revised after checking `ai-engineering-from-scratch`,
`phases/13-tools-and-protocols/05-tool-schema-design/docs/en.md`, "Atomic vs
monolithic"): a tool whose behavior branches on a mode-switch argument is measurably
worse for tool-selection accuracy than two atomic tools with distinct, disambiguating
descriptions — *"benchmarks show 15 to 30 percent worse selection on monolithic
tools... if the `action` argument has more than three values, split the tool."*
`compareTo` would have made `query_analytics` carry two different behaviors under one
name. A dedicated tool with a "Use when X. Do not use for Y." description (the same
lesson's pattern, cited as taking one benchmark registry's selection accuracy from
62% to 89%) is the better-grounded choice, not just the more elegant one.

```ts
{
  name: "compare_metric",
  description: "Use when the user asks why a metric looks unusually high or low, or
                wants to compare a value against a baseline (previous period or
                overall average). Do not use for simple aggregation or breakdown
                questions — use query_analytics for those.",
  args: {
    metric,       // same enum as query_analytics — single source of truth, not duplicated
    filters,      // same shape as query_analytics — the "primary" scope
    compareTo: "overall_average" | "previous_period",  // required, not optional —
                                                          // this tool's whole purpose
  }
}
```

Implementation reuses the *same* aggregation function `query_analytics` already calls
— run it twice (once with `filters`, once with a derived baseline scope), diff the
two results. No new query logic, just new orchestration around the existing one.
`overall_average` drops the narrowing filter for the baseline call; `previous_period`
shifts `dateRange` back by an equal span. Answer template:
`` `${metricLabel} for ${scope} is ${primary}, ${up|down} from ${baseline} in
${baselineLabel} (${delta}).` ``

True causal "why" (a specific incident/root cause) stays explicitly out of scope and
is documented as such in the README — this tool answers "is this unusual and by how
much", not "what caused it".

## Explainability

Every AI response returns, verbatim from the tool call and computation — no extra
bookkeeping layer needed:
- `filters` — the filters object passed to the query
- `metric` / `groupBy` — what was computed
- `queryPlan` — the structured tool-call args themselves (this *is* the query plan)
- `table` — the raw aggregated rows backing the chart/answer

The spec says *"every answer **or chart**"* — this applies to the Dashboard's own
charts too, not just Ask AI results. Each dashboard chart gets a small muted caption
(active date-range filter + metric/groupBy, e.g. "Jan–Dec 2025 · count grouped by
week") and a "view data" icon that opens the same underlying-table view used on Ask
AI — same component, just collapsed by default instead of always-open, since these
charts are seen far more often (every dashboard load) than an Ask AI answer (see the
motion-frequency reasoning above — frequently-seen UI should default to quiet).

### Dynamic chart-type selection rule

Locked-in mapping from a computed result shape to a chart type — this is what makes
selection "automatic" rather than the model guessing a chart component:

| Result shape | Chart |
|---|---|
| Single scalar (no `groupBy`) | Stat/number display, no chart |
| `groupBy` is a time bucket (week/month) | Line chart |
| `groupBy` is a category (carrier/region/product_category/sku/destination_city) | Bar chart |
| Question is a superlative ("highest/lowest") | Bar chart, sorted, top item highlighted |
| `forecast_demand` result | Line chart, historical segment solid, forecast segment dashed |
| `compare_metric` result | Two-bar comparison (primary vs baseline), delta labeled |

This is plain code (a switch on `groupBy`/metric shape), not a second LLM call —
consistent with "AI never generates answers without computation": the chart-type
choice is deterministic given the query shape, not guessed.

## Product & UX

### Component stack

From the emil-design-eng `pick-ui-library` skill — a curated, opinionated list, not
substituted without reason:

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

- **Color**: accent `#17F082` used sparingly for **UI chrome only** (primary CTA on
  Ask AI, active-nav indicator, logo) — neutrals (`#0A0A0A`/`#F8F8F8`/`#FFFFFF`)
  cover ~90% of the surface. **Data/chart colors are a separate, validated set — not
  the brand green** (checked with the `dataviz` skill's `validate_palette.js`; the
  brand green failed the chart-mark lightness check, and a plain gray for "canceled"
  failed the categorical chroma floor). Status ramp, reused identically across table
  badges and chart series:
  - delivered → **good** `#0ca30c`
  - delayed → **warning** `#fab219`
  - exception → **critical** `#d03b3b`
  - in_transit → categorical slot 1 (blue) `#2a78d6` — neutral in-progress state, not
    a good/bad judgment, so it doesn't belong in the status ramp
  - canceled → **not a data color at all** — muted/secondary text token, since it's
    an inactive/excluded state, not a category competing for chart attention
  - Dark-mode steps for these are defined too (`#3987e5` for in_transit; the four
    status hexes are mode-invariant) even though a dark-mode *toggle* isn't being
    built — tokens are dark-ready at near-zero extra cost, the toggle UI itself is
    out of scope (see "Explicitly out of scope").
  - **Mandatory mitigation, not optional**: warning/critical fall under 3:1 contrast
    on the light surface *by design* in the validated palette — every status badge
    and legend entry must pair the color with an icon + text label, never color
    alone. This was already the plan (cva status badges) — now it's a hard
    requirement, not a nice-to-have.
  - Carrier-breakdown and other single-metric ranking charts use **one consistent
    hue** (categorical slot 1 blue) for all bars — color isn't carrying per-carrier
    identity there (the axis labels already do), so a different color per bar would
    be noise, not signal.
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

**2. Ask AI (`/ask`)** — diagnostic + forecasting, single page for all three tools
(same tool-calling loop routes to whichever fits):
- Input box + a handful of clickable example questions (the spec's own 3 examples +
  one forecast example + one comparison example, e.g. "Why does DHL's delay rate
  look high this month?") — doubles as a guaranteed happy-path for reviewers, and
  specifically proves the diagnostic tier works, not just query/forecast.
- Each question renders as one result card: answer text → chart (if any) →
  collapsible explainability panel → for forecast results, additionally the
  inventory recommendation and methodology note.
- Conversational context carries across cards in the session (see "Conversational
  memory" above) — the feed *looks* like independent cards but the model sees prior
  turns, so follow-ups work.

### Explainability panel: plain language first, raw query one level deeper

A business user doesn't know what "tool", "query_analytics", or `metric: delay_rate`
mean — showing raw tool-call JSON as the primary explainability view fails the
audience even though it technically satisfies the spec's checklist. Three tiers, per
apple-design's "show the common path first, advanced options one level deeper":

1. **Answer** (always visible) — plain-language sentence + chart.
2. **"How I found this"** (one click) — the same filters/metric/groupBy from the
   tool call, but rendered through a small display-name dictionary instead of raw
   enum values:
   ```ts
   const METRIC_LABELS = {
     delay_rate: "Delay rate (delayed ÷ (delivered + delayed))",
     on_time_rate: "On-time rate (delivered ÷ (delivered + delayed))",
     count: "Number of orders",
     avg_delivery_time: "Average delivery time",
     sum_order_value: "Total order value",
   };
   ```
   (Corrected during the final-review fix wave — the original illustrative snippet
   above stated "÷ total orders," which doesn't match `analytics.ts`'s actual
   denominator of delivered+delayed only; the wrong text had been copied verbatim
   into `lib/format/metricLabels.ts` and shipped in both the answer sentence and
   this tier.)
   Plus a "View data table" link. This alone already satisfies the spec's four
   explainability bullets — the raw tool call is not required to be user-facing,
   just available.
3. **"Show technical query"** (further click, muted/small, off by default) — the
   literal tool-call JSON. Not for the business-user persona; this is for the
   (technical) evaluator who wants to verify "AI never generates answers without
   computation" at the most concrete level. Same data as tier 2, just unrendered.

All three tiers come from the same API response (`queryPlan` + `METRIC_LABELS` is a
pure display-layer lookup) — no extra backend work, just two rendering passes over
one payload.

## Explicitly out of scope

Response caching, Docker, tests beyond the two mandated `node:test` checks, vector
DB/RAG (400 structured rows don't need semantic search), fine-tuning, DB-backed
conversation history. All are either spec bonus items or genuinely unnecessary at
this data scale — noted in the README's "simplifications/limitations" section per
the spec's README requirements. (Auth and lightweight client-side conversation
persistence were originally listed here too — see "Post-launch amendments" below
for why both were reversed.)

## Post-launch amendments

Made after the initial 19-task plan shipped and was final-reviewed, in response to
direct user feedback re-checking the original spec PDF's literal text. Each
reverses something the sections above stated as "out of scope" — documented here
rather than silently edited into the sections above, consistent with how every
other reversal in this project has been handled (see `compare_metric`'s
compareTo-param reversal and the single-LLM-call reversal, both earlier in this
doc).

- **Auth (password gate).** The spec's Deployment Requirements section states: "If
  authentication is used, provide test credentials" — and Submission: "Provide
  your repository link, the deployed app URL, and credentials if authentication is
  required." Auth was never actually prohibited; "no auth" was a scope-minimization
  choice made during initial brainstorming, not a requirement conflict. Reversed
  because the app is a public, unauthenticated endpoint that calls a paid LLM API
  — a real prompt-injection/cost-abuse surface once the deployed URL is shared
  with a hiring panel. Two hardcoded credentials (admin for the owner, guest for
  reviewers), env-var-sourced, no user table, no OAuth — see CLAUDE.md's
  non-negotiable rules for the exact mechanism. Both roles get identical access
  (no capability split) since the goal is independently-revocable credentials, not
  permission tiers.
- **Conversational memory: localStorage persistence.** The base session-scoped
  design (in-memory only, lost on refresh) was correct per
  `ai-engineering-from-scratch`'s framing (see CLAUDE.md's non-negotiable rules
  for the citation) — but user testing surfaced that losing the conversation on
  every refresh is a rough demo experience. localStorage closes that gap without
  opening a new server-side write surface (still zero DB mutation endpoints,
  CLAUDE.md's "data is read-only" rule is unaffected). A "New chat" control
  clears both the in-memory `turns` state and the localStorage key. Full DB-backed
  history (cross-device sync, admin-only visibility) was considered and rejected
  as unnecessary scope for a take-home with no such requirement in the spec.
- **Ask AI layout: input pinned to bottom.** Restructured from "input at top,
  answers append below" to the standard chat layout (messages scroll above, input
  sticky at the bottom, auto-scroll to newest turn) — pure UX preference, the spec
  doesn't dictate layout. User feedback after using the deployed app.
- **`compare_metric` answer template: added a deterministic rationale clause, fixed
  an equal-value wording bug.** User feedback: "why" answers felt too stiff —
  jumping straight to a number with no elaboration of why that metric/formula was
  used. Investigated whether the `ai-engineering-from-scratch` reference supports
  adding explanatory depth without reintroducing a second LLM call (this project's
  non-negotiable): `phases/14-agent-engineering/01-the-agent-loop/docs/en.md:90`
  describes the ReAct "Thought → Action" pattern — the model's own rationale
  emitted in the *same* turn as a tool call, not a follow-up call — which is
  consistent with the non-negotiable rather than a reason to violate it.
  `phases/18-ethics-safety-alignment/02-reward-hacking-goodhart/docs/en.md:42`
  names "verbosity bias" explicitly (longer ≠ better), arguing against padding
  answers with generic elaboration. Net: enriched `composeCompareAnswer` (still
  100% deterministic templates, zero LLM risk) with a fixed one-line rationale per
  metric explaining why it's a relevant signal for a deviation-from-baseline
  question. Separately found and fixed a real bug during this pass: the template
  said "up from X%" even when the current and baseline values were identical
  (e.g. "17.4%, up from 17.4%") — now compares formatted display values and says
  "in line with" when they match. Also tightened `systemPrompt.ts` and
  `compare_metric`'s tool description: the model was silently substituting
  `delay_rate` when asked why order *count* looked high (compare_metric can't
  check count/sum_order_value at all) instead of saying so — and was misfiring a
  tool call on vague conversational follow-ups ("so what do you mean?") instead
  of replying in plain text from context. Both are now explicit instructions.
- **`compare_metric` root-cause fix: `overall_average` baseline was sometimes
  identical to the primary query.** The wording fix above (masking equal values as
  "in line with") treated the symptom; the actual defect was in
  `lib/queries/compare.ts`'s `runCompareMetric`. For `compareTo: "overall_average"`,
  the baseline filters kept the primary's `dateRange` and only dropped other
  filters (carrier/region/etc.) — so a question scoped by date alone (no carrier)
  ran the exact same query twice, making every such comparison a tautological
  0-delta rather than an actual finding. Verified against the live DB: a January-only
  `delay_rate` compare returned primary=baseline=17.4% before the fix, and
  primary=17.4%/baseline=15.3% (the real whole-year average) after. Fix: baseline
  filters for `overall_average` are now always `undefined` (the true unfiltered
  average), never partially reused from the primary filters. The one remaining
  degenerate case — a compare question with zero filters at all (no date, no
  dimension) — still ties trivially (whole dataset vs. itself), but that's an
  inherently unscoped "why" question with no baseline concept to compare against;
  not handled specially, consistent with not over-engineering for a case the
  system prompt already discourages.
- **`query_analytics`/`compare_metric` filters gained `sku` and `destinationCity`.**
  User feedback: a multi-turn conversation asking about a specific SKU
  ("MARKER-0138") got increasingly incoherent answers. Reproduced directly against
  `orchestrate()` (not guessed from screenshots): the model's actual tool-call args
  showed `filters: {"productCategory": "MARKER"}` (approximating a single SKU with
  its entire category — wrong scope) and, on a later turn, `filters: {}` (silently
  dropping a SKU the user had just named explicitly in that same message). Root
  cause: `sku` and `destinationCity` were already valid `groupBy` values but were
  never added as `filters` — the only way to narrow to *one* SKU or destination
  city, as opposed to breaking a metric down across all of them. Checked against
  `phases/13-tools-and-protocols/05-tool-schema-design/docs/en.md:109` ("Add
  optional parameters freely. Safe.") — same category of change as the earlier
  `limit` addition, not the monolithic-tool anti-pattern that sank `compareTo`.
  Fixed by adding both to `filtersSchema`/`FILTERS_PROPERTY`.
  **Explicitly did not** add filters/metrics for the dataset's other raw columns
  (`order_id`, `delivery_date`, `origin_city`, `quantity`, `unit_price_usd`,
  `is_promo`, `promo_discount_pct`, `warehouse`) despite them being real columns —
  no question in this project (or the spec's own examples) has ever demonstrated a
  need for them, and the same tool-schema-design lesson notes registries with
  unclear/unnecessary options measurably hurt tool-selection accuracy (a 50-tool
  registry with ambiguous scoping dropped to 62% selection accuracy). Instead,
  `systemPrompt.ts` gained an explicit instruction: state plainly which columns
  exist but aren't queryable, and never approximate one with an unrelated
  dimension or guess a number — the SKU bug's failure mode, generalized as a
  standing guardrail rather than something only SKU is protected against.
- **Considered and declined**: a dedicated raw-data table page (the spec's
  Explainability requirement — "access to the underlying data as a table or
  summary" — is already satisfied by the existing per-answer/per-chart "How I
  found this" and "view data" tables; a separate all-400-rows page would be scope
  beyond the literal requirement with no corresponding evaluation-criteria credit).
  A dashboard granularity toggle (day/week/month) for the Order Volume chart was
  also declined — the spec requires only "at least two charts," not a granularity
  switch, and the Ask AI side already supports arbitrary granularity through
  natural language ("by week", "by month") via `query_analytics`'s `groupBy`.
- **Bonus items added: Docker setup, and "advanced explainability."** Both were
  explicitly listed above as "out of scope" (§"Explicitly out of scope") since the
  spec marks them optional bonus (§14); reversed after the core requirements were
  fully verified and time remained before the deadline.
  - **Docker**: `next.config.ts` gained `output: "standalone"`; a multi-stage
    `Dockerfile` (deps → build → runner, `node:20-alpine`) plus `.dockerignore`.
    Neither `/` nor `/ask` are statically prerendered (both read `searchParams`,
    a Next.js dynamic API), so `npm run build` needs no DB/API secrets — those are
    supplied at `docker run --env-file .env`, never baked into the image. A
    `Makefile` wraps the existing npm scripts plus `docker-build`/`docker-run` —
    convenience only, not a new capability.
  - **Advanced explainability**: checked `~/fadel/ai-engineering-from-scratch`
    first per CLAUDE.md's rule. First search landed on
    `phases/14-agent-engineering/24-agent-observability-platforms/docs/en.md`
    (Langfuse/Phoenix/Opik) — wrong audience (developer-facing tracing/eval
    tooling, not end-user-facing explainability) and explicitly corrected as such
    rather than stretched to fit. The actual match:
    `phases/19-capstone-projects/06-devops-troubleshooting-agent/docs/en.md`, a
    worked capstone with an explicit scored "Explainability" criterion (line 110:
    "Every hypothesis has graph paths and telemetry citations") and a concrete
    format (line 96: `citations: deploy.yaml (rev 42), prometheus errorRate, loki
    500 stack`). Translated to this project: "telemetry citation" ≈ the query
    plan + underlying data table (already shipped, satisfies the spec's literal
    §4.4 baseline); "graph-path visualization" ≈ new — a reasoning-path chip strip
    (question → tool selected → filters → what was measured → answer) rendered in
    `ExplainabilityPanel.tsx`, reusing data already on `AskResult` (no new backend
    call); the "citation count" component of the capstone's evidence score ≈ new —
    `analytics.ts` gained `METRIC_SAMPLE_EXPR`, the same per-metric denominator
    each `METRIC_EXPR` already divides by (e.g. `count(*) filter (where status in
    ('delivered','delayed'))` for the rate metrics), exposed as `n` per row and
    rendered as a "Based on N orders" column with a small-sample (`n < 5`) warning
    in `DataTable.tsx` — the same single-digit threshold CLAUDE.md's own
    small-sample guardrail already names, now surfaced visually instead of only
    guarded against in answer text. **Explicitly not adopted**: the capstone's
    "ranked top-3 hypotheses + human approval" pattern — this project's tool
    routing is deliberately one atomic tool call per question with a templated
    (non-LLM) answer; presenting multiple ranked candidate answers would mean a
    second model judgment call, directly reversing the "answers are templated,
    not a second LLM call" non-negotiable rule for a bonus item, not a
    requirement.
- **DB driver swapped from `@neondatabase/serverless` (`neon-http`) to
  `drizzle-orm/node-postgres` (`pg`).** Prompted by "can this run against a local
  Postgres" — the answer was no, not a config change: `neon()`'s HTTP-only driver
  sends queries via `fetch()` to a Neon-specific proxy endpoint (confirmed by
  reading `@neondatabase/serverless`'s type definitions, not assumed), which a
  plain local Postgres server doesn't expose. `node-postgres` speaks the standard
  Postgres wire protocol instead, so the same `DATABASE_URL` now works against
  Neon (still what's deployed in production), a local Postgres, or any other
  Postgres host — `drizzle.config.ts`'s `dialect: "postgresql"` already made
  `drizzle-kit push` driver-agnostic; only the runtime client in `lib/db/client.ts`
  was Neon-specific. Verified against the live production Neon DB before treating
  the swap as safe (`count` query returned the known 400 total), then re-ran the
  full 18-case live eval twice (2 unrelated flakes on the first run, both LLM
  non-determinism in `orchestrate.ts`/`systemPrompt.ts` — untouched by this
  change — confirmed by an immediate clean 18/18 re-run) before proceeding.
  Tradeoff noted in `lib/db/client.ts`: on Vercel, `DATABASE_URL` should be
  Neon's pooled (`-pooler`) connection string, not the direct one — a `Pool` of
  plain TCP connections opened per serverless cold start can exhaust Postgres's
  connection limit under concurrent load in a way the HTTP driver never could,
  a real (if low-probability at this project's traffic) regression the old
  driver didn't have.
- **`docker-compose.yml` added**: Postgres + the app, fully local, no Neon
  account required — the natural completion of the driver swap above (pointless
  without it). Compose's own `.env` variable interpolation (`${VAR}` in the
  compose file) was verified separately to strip quotes correctly, unlike
  `env_file:`/`docker run --env-file` (empirically tested with a throwaway
  compose file before relying on it, not assumed from the driver-swap fix
  above) — so the `app` service's secrets are read that way, not via `env_file:`.
  Schema push + seed against the Compose Postgres run from the host with an
  explicit `DATABASE_URL` on each command and no `--env-file` involved at all;
  this was verified safe (not assumed) by first running both commands against
  an unreachable fake local URL and confirming they failed with `ECONNREFUSED`
  rather than silently succeeding against the real Neon DB — `seed.ts` does a
  `DELETE` before re-inserting, so a misdirected run would have briefly emptied
  the live production table.

## Env vars

`DATABASE_URL` (Neon connection string), `DEEPSEEK_API_KEY`, `ADMIN_PASSWORD`,
`GUEST_PASSWORD`, `SESSION_SECRET` (random string, gates the auth cookie — not a
per-user secret, just a shared session-validity token since both roles have
identical access).
