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
npm run eval:ai              # optional: 19-case live-model eval, costs a little (real API calls)
```

A `Makefile` wraps these same commands (`make install`, `make dev`, `make test`, etc.) —
convenience only, `npm` directly works identically.

### Docker

Runs in Docker using a multi-stage `Dockerfile` (Next.js `output: "standalone"`, so
the runtime image ships only the traced production dependencies, not the full
`node_modules`).

**Recommended — fully local, no cloud account needed** (Postgres + the app, both in
Docker):
```bash
make compose-up      # starts Postgres and the app (docker-compose.yml)
make compose-seed    # schema + 400 mock orders, one time
```
`DATABASE_URL` in `.env` is ignored for this path — `docker-compose.yml` points the app
at its own Postgres container automatically. Just fill in `DEEPSEEK_API_KEY` (still
needed — no local substitute for the model) and the auth vars.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string — standard `postgresql://` wire protocol via `pg`/`drizzle-orm/node-postgres`, so the same code works against Neon, a local Postgres, or any other Postgres host. On Vercel, use Neon's pooled ("`-pooler`") connection string, not the direct one — see `lib/db/client.ts`. |
| `DEEPSEEK_API_KEY` | DeepSeek API key — used via the OpenAI SDK with a custom `baseURL`, so swapping providers (OpenAI/Grok/etc.) is a one-line change in `lib/ai/client.ts` |
| `ADMIN_PASSWORD` | Owner login password |
| `GUEST_PASSWORD` | Reviewer login password (see the credential in the Live App link above) |
| `SESSION_SECRET` | Random string gating the session cookie — not a per-user secret, both roles get identical app access |

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
- **Three atomic tools, not one tool with a mode-switch parameter.** An earlier
  draft added an optional `compareTo` parameter to the query tool instead of a
  separate comparison tool. Reversed after checking tool-design guidance:
  monolithic tools whose behavior branches on an `action`-style parameter
  measurably hurt tool-selection accuracy versus atomic tools with
  disambiguating descriptions — the same literature reports a 62%→89% accuracy
  swing purely from rewriting ambiguous descriptions on a 50-tool registry
  ([Databricks](https://docs.databricks.com/aws/en/generative-ai/guide/agent-system-design-patterns)),
  and a 10-20 point swing from naming/description changes alone
  ([Composio](https://composio.dev/blog/how-to-build-tools-for-ai-agents-a-field-guide)).
  See `compare_metric` below.
- **Answers are templated, not phrased by a second model call.** The model's only
  job is choosing a tool and filling its arguments; the sentence shown to the user
  is assembled by deterministic string templates from the computed result. This
  removes an entire failure mode — a second LLM call misstating a number while
  "explaining" it — at the cost of slightly more rigid phrasing, an acceptable
  trade given Data Correctness is one of the two highest-weighted evaluation
  categories.
- **Conversation memory: resend the text, not a database.** A follow-up question
  needs to remember earlier context, like which carrier or which date range. Instead
  of building a separate memory system, the app just resends the full conversation
  text with each new question, and the model reads it like a person would. This is
  simple and it works, but it means the model must correctly tell apart three cases:
  a normal follow-up, a vague follow-up ("so what does that mean?"), and a
  correction ("no, I meant X"). Getting this right took several rounds of testing —
  see How Questions Are Interpreted below.

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

**Pattern**: this follows the "Routing" workflow from Anthropic's
[Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
(Schluntz & Zhang, Dec 2024) — one LLM call picks which of a small, fixed set of tools
to use, and the code (not the model) decides what happens after that. This is simpler
than letting the model run its own open-ended agent loop, and it fits well here because
every kind of question this app supports is already known ahead of time — and because
the evaluation rewards answers that are easy to check and predict over answers that are
just flexible.

Each question triggers exactly one call to DeepSeek, with three tools for it to pick
from (`tool_choice: auto`). The model either calls one tool with the right arguments,
or just replies in plain text — plain text is how it says "I can't answer that" or
asks a follow-up question, since a decline isn't a factual claim and doesn't need any
computation behind it.

**Follow-up questions**: the app does not store a separate memory. It just resends
the full conversation text before each new question, and the model reads it like a
person would. Filters from an earlier answer (carrier, date range, product, etc.)
stay active until the user changes them, so the model does not ask the user to
repeat information it already has. If the user's message is vague ("why?", "so what
does that mean?"), the model answers using only the previous answer, without calling
a tool again. If the user corrects the model ("I meant delivered, not delayed"), the
model must change only the one thing that was wrong, and keep everything else the
same. The model must never repeat the exact same wrong answer after a correction —
that would mean the correction was ignored.

**Never invent a number**: the model must never say a number that did not come from
a real tool call. This rule exists because of a real bug found during testing: the
model was once asked to explain a chart, but its last answer only had one data point
(the top carrier). Instead of saying "I only have one value," the model invented
four fake carrier names with fake numbers, just to make the explanation sound
complete. The fix made this rule explicit and absolute: if the model needs more data
than it already has, it must call a tool again — it must never guess or fill the gap
itself.

**Explainability**: every answer comes with the filters that were used, which
metric/dimension it measured, the exact tool call that produced it (the "query plan"),
and the underlying data table. None of this is written separately or rephrased by the
model — it's the same data that actually produced the answer, so the explanation can
never drift from what really happened. The UI reveals this in layers: the answer
first, then (one click away) a plain-language "how I found this" summary, then
(another click) the raw tool-call JSON for technical reviewers — a business user never
sees something like `metric: delay_rate` before they've seen the actual answer.

That same "how I found this" section also shows a **reasoning-path** strip — a row of
steps like question → tool selected → filters → what was measured → answer — and,
whenever the result is a group or a comparison, a **sample-size column** next to each
number, with a small warning if it's based on fewer than 5 orders. Neither of these is
required by the spec's baseline explainability rule — they go further. The idea comes
from a pattern in this project's own AI-engineering reference notes: a troubleshooting-
agent example that grades "explainability" as "every claim needs a visible path back to
the evidence that supports it," not just a plausible-sounding number.

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
- **"Today" is fixed to 2025-12-31, not the real date.** The dataset only has orders
  from 2025. If the AI used the real current date, a phrase like "last month" would
  point to a period with no data at all. So the AI always treats 2025-12-31 as
  "today" — for example, "last month" always means November 2025, not whatever
  month it really is when you ask.
- **Conversational memory is session-scoped**, not persisted across page reloads or
  browser sessions. Follow-up questions in the same session carry context; a fresh
  page load starts clean. The spec's optional "query history" bonus (a persistent,
  revisitable log across sessions) is not implemented.
- **Minimal auth, not a user system** — two hardcoded credentials (owner/reviewer) in
  a signed cookie session, gated by Next.js middleware; no user table, no OAuth, no
  session database. Added after launch once the deployed URL became a public,
  unauthenticated endpoint calling a paid LLM API — see `ADMIN_PASSWORD`/
  `GUEST_PASSWORD`/`SESSION_SECRET` in Environment Variables below.

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
- **Comparing two specific named values (e.g. two SKUs) takes two questions, not
  one.** `query_analytics` can only filter to one specific value at a time — one
  SKU, one carrier, and so on. If you ask "what's different between SKU A and SKU
  B" in a single question, the AI can only check one of them. It will say this
  clearly and name the value it could not check yet, instead of silently
  answering as if you only asked about one value.

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

- **Compare two named values in a single question** (e.g. two specific SKUs side by
  side) — right now this needs two separate questions (see Limitations). A full fix
  would let a filter accept a list of values, not just one. This was considered
  during the SKU-comparison bug fix and left for later on purpose, to keep that fix
  small and low-risk close to the deadline.
- Anomaly/outlier detection once enough historical data exists per segment for a
  z-score or IQR approach to be statistically meaningful.
- Confidence intervals on the forecast (residual-based prediction bands), currently
  omitted to keep the forecasting tool proportionate to its evaluation weight.
- Query history / caching (listed as optional bonus items in the spec).
- CI wiring for the existing test suite (`npm test`, 33 `node:test` cases) and the
  golden eval (`npm run eval:ai`) — both currently run manually, pre-submission only.
- Browser/e2e test automation (Playwright or similar) — current coverage is unit-level
  (`lib/`) plus a manual click-through, no automated UI regression check.

## AI Usage Disclosure

This project was built with **Claude Code** as a coding assistant — used throughout
design and implementation. This is disclosed explicitly per the assignment's own
instruction that undisclosed AI usage may be treated negatively.

This is separate from **DeepSeek**, which is the product's own AI orchestration
layer (the natural-language query interface described above) — that's not a
disclosure item, it's the assignment itself.
