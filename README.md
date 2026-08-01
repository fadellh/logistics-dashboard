# AI-Powered Logistics Analytics Dashboard

A logistics analytics dashboard with a natural-language query interface, built for
Spaceship's take-home assessment. Supports descriptive analytics (KPIs/charts),
diagnostic analytics (natural-language questions, including deviation-from-baseline
"why" questions), and predictive analytics (demand forecasting with an inventory
recommendation).

- **Live app**: https://logistics-dashboard-roan.vercel.app/
- **Repository**: https://github.com/fadellh/logistics-dashboard

> Design reasoning for every non-obvious decision in this document lives in
> [`docs/superpowers/specs/2026-08-01-logistics-dashboard-design.md`](docs/superpowers/specs/2026-08-01-logistics-dashboard-design.md).
> This README summarizes it for reviewers; that file has the full "why".

## Setup

### Local Setup Instructions

**Requirements**: Node 20+, a Neon Postgres database, a DeepSeek API key.

```bash
git clone https://github.com/fadellh/logistics-dashboard
cd logistics-dashboard
npm install
cp .env.example .env       # fill in DATABASE_URL and DEEPSEEK_API_KEY
npx drizzle-kit push       # create the orders table from lib/db/schema.ts
npm run seed                # load mock_logistics_data.csv into the DB
npm run dev                 # http://localhost:3000
npm test                    # runs the node:test suites (no DB/.env required)
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (serverless driver, pooling built in) |
| `DEEPSEEK_API_KEY` | DeepSeek API key — used via the OpenAI SDK with a custom `baseURL`, so swapping providers (OpenAI/Grok/etc.) is a one-line change in `lib/ai/client.ts` |

No authentication — this is a read-only public demo; the spec allows omitting auth
when it isn't used, which removes an entire category of deployment/credential risk.
No secrets are committed; `.env` is gitignored.

## Architecture

### System Overview

**Stack**: Next.js (App Router, TypeScript) as a single monolith deployed to Vercel
— Postgres via Neon, accessed through Drizzle ORM — DeepSeek (OpenAI-SDK-compatible)
for the AI layer — Recharts for charts.

**Code structure** — three explicitly separate layers, matching the spec's literal
architecture requirement ("clearly separate AI interpretation, data computation, and
business logic"):

```
app/
  page.tsx            # Dashboard — Server Component, reads lib/queries/ directly
  ask/page.tsx          # Ask AI — Client Component
  api/ask/route.ts        # the only real API route — AI orchestration entry point
lib/
  queries/    # DATA COMPUTATION — allowlisted, parameterized Drizzle queries
  ai/          # AI INTERPRETATION + orchestration (business logic)
  format/       # chart-type selection, answer templates, metric display names
```

### Key Design Decisions

- **Postgres over an in-memory array**, despite only 400 rows: it's the most direct
  demonstration of the spec's "prefer structured query generation over raw
  AI-generated SQL" guideline. The AI never touches SQL — it emits structured JSON
  tool arguments, which the backend maps to a small allowlist of parameterized
  Drizzle queries. An in-memory array would have sidestepped that requirement rather
  than satisfied it.
- **DeepSeek** for the AI layer: OpenAI-SDK-compatible (drop-in), inexpensive enough
  that the public demo doesn't accumulate real API cost, reliable tool-calling.
- **No DDD, no Hexagonal/ports-and-adapters.** Those patterns earn their cost with a
  complex domain model or multiple swappable infrastructure implementations —
  neither applies here (one flat read-only table, one database, one LLM provider
  swap point that's already a one-line config change). Plain folder-level separation
  satisfies the spec's actual requirement at zero ceremony cost.
- **Three atomic tools, not one tool with a mode-switch parameter.** An earlier
  draft added an optional `compareTo` parameter to the query tool instead of a
  separate comparison tool. Reversed after checking tool-design benchmarks:
  monolithic tools whose behavior branches on a parameter measurably hurt
  tool-selection accuracy (15-30% worse in cited benchmarks) versus atomic tools
  with disambiguating descriptions. See `compare_metric` below.
- **Answers are templated, not phrased by a second model call.** The model's only
  job is choosing a tool and filling its arguments; the sentence shown to the user
  is assembled by deterministic string templates from the computed result. This
  removes an entire failure mode — a second LLM call misstating a number while
  "explaining" it — at the cost of slightly more rigid phrasing, an acceptable
  trade given Data Correctness is one of the two highest-weighted evaluation
  categories.

### Data Flow

```
User question → AI interpretation → tool selection → structured args
  → computation (Postgres) → result → templated explanation → visualization
```

This mirrors the spec's own expected system flow. The Dashboard follows the same
computation path minus the AI step — it calls the query functions directly, no LLM
round-trip for a page that's just rendering KPIs/charts against a date-range filter.

## AI Approach

### How Questions Are Interpreted

**Pattern**: Anthropic's "Routing" workflow (Schluntz & Zhang, Dec 2024) — a
classifier LLM call picks one of a fixed, small set of tools; the code, not the
model, owns the execution graph. Chosen over an open-ended agent loop because the
supported question grammar is fully enumerable and the evaluation explicitly rewards
auditable, predictable behavior over flexibility.

One DeepSeek call per question, with three tool schemas available (`tool_choice:
auto`). The model either calls a tool with structured arguments, or responds in
plain text directly — the latter is how it declines out-of-scope questions or asks
a clarifying one, since a decline isn't a data claim and doesn't need computation
behind it.

**Explainability**: every response returns the filters applied, the metric/dimension
used, the exact tool-call arguments (the query plan), and the underlying data table
— all sourced directly from the validated tool call and computation, not generated
separately, so there's no explanation that could drift from what actually ran. The
UI shows this in layers: the answer first, a plain-language "how I found this"
summary second, and the raw tool-call JSON third (collapsed, for technical
reviewers) — a business user is never shown `metric: delay_rate` as their first
encounter with the answer.

### How Tools Are Selected

Three atomic tools, each with a disambiguating description ("Use when X. Do not use
for Y.") so the model reliably picks the right one:

| Tool | Used for |
|---|---|
| `query_analytics` | Aggregations, breakdowns, KPI-style questions — "show delayed orders by week", "which carrier has the highest delay rate" |
| `forecast_demand` | Demand prediction — historical monthly aggregation, closed-form (least-squares) linear trend, forward projection, inventory recommendation |
| `compare_metric` | Deviation-from-baseline questions — "why does DHL's delay rate look high this month" — runs the *same* aggregation twice (current scope vs. a baseline) and reports the delta as a fact, not a claimed cause |

**Safety rules applied** (from function-calling best practice): no AI-generated SQL
ever reaches the database; every tool argument is Zod-validated before execution;
invalid arguments return a structured error the model can self-correct from, rather
than an exception; tool-call round-trips are capped per question to prevent a
runaway loop.

## Assumptions

### Simplifications Made

- **"Delayed" = `status = 'delayed'`.** The dataset has no separate SLA/promised-date
  field to diff against, so the status column is treated as ground truth for delay.
- **On-time delivery rate** = `delivered / (delivered + delayed)` — of orders that
  reached a terminal delivered-or-delayed outcome, the fraction that were on time.
  `in_transit`/`exception`/`canceled` orders are excluded (no outcome yet, or no
  delivery occurred).
- **Average delivery time** = mean of `delivery_date − order_date` over rows with a
  non-null delivery date.
- **Conversational memory is session-scoped**, not persisted across page reloads or
  browser sessions. Follow-up questions in the same session carry context; a fresh
  page load starts clean. The spec's optional "query history" bonus (a persistent,
  revisitable log across sessions) is not implemented.
- **No authentication** — acceptable per the spec ("if authentication is used,
  provide test credentials") — this is a read-only public demo with no user data to
  protect.

### Limitations

- **"Diagnostic — explaining why" is scoped to deviation-from-baseline, not causal
  explanation.** The dataset has no incident/reason field, no weather or
  route-condition data — nothing that would let a genuine root cause be computed
  rather than guessed. `compare_metric` answers "is this actually unusual, and by
  how much" with two real numbers; it does not attempt to explain *why* a number
  moved.
- **No statistical significance / anomaly-detection claims.** With 400 rows split
  across, e.g., 9 carriers × 12 months, the average bucket has ~3-4 orders — too few
  for a z-score or IQR-based "this is anomalous" claim to be reliable. Rather than
  produce noise dressed as a finding, `compare_metric` reports plain deltas without
  a significance judgment. In practice, a comparison scope with zero matching orders
  reports a 0 rate, which is indistinguishable from a genuinely low rate — treat a
  `compare_metric` result of exactly 0 with the same caution as any other small-sample
  statistic.

### Unsupported Features or Queries

- Questions requiring data not in the dataset — e.g. profit margin (no cost data
  exists, only sale price).
- Genuine causal "why" questions ("what caused this delay") — declined explicitly
  rather than answered with a plausible-sounding guess; see Limitations above.
- Multi-category "forecast everything" requests — forecasting is scoped to one SKU
  or one product category at a time, matching the spec's own example.

## Future Improvements

### What You Would Build Next

- Anomaly/outlier detection once enough historical data exists per segment for a
  z-score or IQR approach to be statistically meaningful.
- Confidence intervals on the forecast (residual-based prediction bands), currently
  omitted to keep the forecasting tool proportionate to its evaluation weight.
- Query history / caching (listed as optional bonus items in the spec).
- Dark-mode toggle — the color tokens are already dark-mode-ready (validated
  against a dark surface), the toggle UI itself just isn't built.
- Automated tests beyond the two `node:test` checks on the forecasting math and the
  query-argument allowlist.

## AI Usage Disclosure

This project was built with **Claude Code** as a coding assistant — used throughout
design and implementation. This is disclosed explicitly per the assignment's own
instruction that undisclosed AI usage may be treated negatively.

This is separate from **DeepSeek**, which is the product's own AI orchestration
layer (the natural-language query interface described above) — that's not a
disclosure item, it's the assignment itself.
