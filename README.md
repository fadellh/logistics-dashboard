# AI-Powered Logistics Analytics Dashboard

A logistics analytics dashboard with a natural-language query interface, built for
Spaceship's take-home assessment. Supports descriptive analytics (KPIs/charts),
diagnostic analytics (natural-language questions, including deviation-from-baseline
"why" questions), and predictive analytics (demand forecasting with an inventory
recommendation).

- **Live app**: https://logistics-dashboard-roan.vercel.app/
- **Repository**: https://github.com/fadellh/logistics-dashboard
- **Login (guest)**: password `spaceship-guest-2026`

> Design reasoning for every non-obvious decision in this document lives in
> [`docs/superpowers/specs/2026-08-01-logistics-dashboard-design.md`](docs/superpowers/specs/2026-08-01-logistics-dashboard-design.md).
> This README summarizes it for reviewers; that file has the full "why".

## Setup

### Local Setup Instructions

**Requirements**: Node 20+, a Postgres database (Neon or local — see below), a DeepSeek
API key.

```bash
git clone https://github.com/fadellh/logistics-dashboard
cd logistics-dashboard
npm install
cp .env.example .env       # fill in DATABASE_URL, DEEPSEEK_API_KEY, and the auth vars below
npx drizzle-kit push       # create the orders table from lib/db/schema.ts
npm run seed                # load mock_logistics_data.csv into the DB
npm run dev                 # http://localhost:3000 — redirects to /login
npm test                    # runs the node:test suites (no DB/.env required)
```

A `Makefile` wraps these same commands (`make install`, `make dev`, `make test`, etc.) —
convenience only, `npm` directly works identically.

### Docker

Two ways to run it in Docker — both use the same multi-stage `Dockerfile` (Next.js
`output: "standalone"`, so the runtime image ships only the traced production
dependencies, not the full `node_modules`).

**Single container, `DATABASE_URL` points at an external host** (e.g. Neon):
```bash
make docker-build
make docker-run
```
Requires a real `DATABASE_URL`/`DEEPSEEK_API_KEY` in `.env`. `DATABASE_URL` must be
reachable **from inside the container** — a `localhost` value in `.env` will NOT reach
a Postgres running on your own machine (a container's `localhost` is itself, not your
host — see "Fully local" below for that case instead). Use `make docker-run`, not a raw
`docker run --env-file .env` (see the Makefile comment — Docker's `--env-file` doesn't
strip quotes the way Node's does, so `.env`'s quoted values would break auth/DB
connection).

**Fully local, no cloud account needed** (Postgres + the app, both in Docker):
```bash
make compose-up      # starts Postgres and the app (docker-compose.yml)
make compose-seed    # schema + 400 mock orders, one time
```
Use this option — not the single-container one above — whenever `DATABASE_URL` points at
a local Postgres: Compose puts both containers on the same network, so the app reaches
the database by service name (`db:5432`), which is how `docker-compose.yml` sets
`DATABASE_URL` for the `app` service already — you don't edit `.env` for this path.
`.env` is only used here for `DEEPSEEK_API_KEY` (still needed — no local substitute for
the model) and the auth vars; Compose reads `.env` directly (its own `${VAR}`
interpolation, not `env_file:`).

Implementation details (why the image build sets placeholder env values, the env-file
quoting gotcha, why Compose's own `.env` interpolation is safe where the others aren't)
live as comments in `Dockerfile`/`Makefile`/`docker-compose.yml`, next to the code they
explain, rather than duplicated here.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string — standard `postgresql://` wire protocol via `pg`/`drizzle-orm/node-postgres`, so this works against Neon, a local Postgres, or any other Postgres host unchanged. On Vercel, use Neon's pooled ("`-pooler`") connection string, not the direct one — see `lib/db/client.ts`. |
| `DEEPSEEK_API_KEY` | DeepSeek API key — used via the OpenAI SDK with a custom `baseURL`, so swapping providers (OpenAI/Grok/etc.) is a one-line change in `lib/ai/client.ts` |
| `ADMIN_PASSWORD` | Owner login password |
| `GUEST_PASSWORD` | Reviewer login password (see the credential in the Live App link above) |
| `SESSION_SECRET` | Random string gating the session cookie — not a per-user secret, both roles get identical app access |

**Authentication (added post-launch):** originally the app shipped with no auth
(a spec-permitted simplification — "if authentication is used, provide test
credentials" implies it's optional). Reversed after the deployed URL became a
public, unauthenticated endpoint calling a paid LLM API — a real prompt-injection
and cost-abuse surface. Two hardcoded credentials (no user table, no OAuth) behind
a Next.js middleware gate; both roles get identical access — the split exists only
so the reviewer's credential can be rotated/revoked independently of the owner's.
See the design spec's "Post-launch amendments" section for the full reasoning and
the reversal of the original "no auth" decision. No secrets are committed; `.env`
is gitignored.

## Architecture

### System Overview

**Stack**: Next.js (App Router, TypeScript) as a single monolith deployed to Vercel
— Postgres via Neon in production (portable to any Postgres, including fully local —
see Setup → Docker), accessed through Drizzle ORM — DeepSeek (OpenAI-SDK-compatible)
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

The "how I found this" layer also renders a **reasoning-path** strip (question → tool
selected → filters → what was measured → answer) and, on any grouped/compared result, a
**sample-size column** next to each value with a small-sample warning below 5 orders. Both
are additions beyond the spec's baseline explainability requirement, modeled on how a
citations-based agent (e.g. a root-cause troubleshooting agent scoring "explainability" as
"every hypothesis has graph paths and telemetry citations") ties every claim to a visible
evidence trail rather than a bare number.

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
- **Individual-SKU forecasts need that SKU to have ≥2 months of order history** —
  with 400 orders spread across many SKUs, most individual SKUs only have 1-3
  months, so a forecast for an arbitrary/random SKU will often correctly decline
  with "not enough historical data" rather than produce a number. Product
  category forecasts don't have this problem (every category has 10-12 months of
  history) — prefer a category when trying the forecasting tool, or check a
  SKU's order count first if you want a specific one to work.

### Unsupported Features or Queries

- Questions requiring data not in the dataset — e.g. profit margin (no cost data
  exists, only sale price).
- Genuine causal "why" questions ("what caused this delay") — declined explicitly
  rather than answered with a plausible-sounding guess; see Limitations above.
- Multi-category "forecast everything" requests — forecasting is scoped to one SKU
  or one product category at a time, matching the spec's own example.
- Some raw dataset columns exist but aren't queryable through any tool: `order_id`
  (single-record lookup, not an analytics dimension), `delivery_date`, `origin_city`,
  `quantity`, `unit_price_usd`, `is_promo`, `promo_discount_pct`, and `warehouse` —
  none of these is a supported metric, groupBy, or filter. Deliberately out of scope
  rather than an oversight: `carrier`/`region`/`status`/`productCategory`/`sku`/
  `destinationCity`/date range cover every question the spec's own examples ask for;
  the rest were added, or left out, only once a real question demonstrated the need
  (see the design spec's Post-launch amendments for the SKU-filter case that prompted
  this). Asked about any of the unsupported columns, the AI declines by name and
  states what it can check instead — it does not approximate with an unrelated
  dimension or guess a number.

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
