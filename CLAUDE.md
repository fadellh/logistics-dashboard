# AI-Powered Logistics Analytics Dashboard

Spaceship take-home assignment (AI Engineer, LLM & Optimization Focus). Full design
reasoning lives in `docs/superpowers/specs/2026-08-01-logistics-dashboard-design.md`
— read it before making any architecture decision. This file is the short,
actionable reference; the spec doc is the long-form "why".

## Stack

Next.js (App Router, TS) monolith · Postgres via Neon + Drizzle ORM (`drizzle-kit
push`, no migration files) · DeepSeek via the `openai` SDK (OpenAI-compatible,
swap provider by changing `baseURL`/`model` in one place) · Recharts · base-ui ·
`@number-flow/react` · Sonner · `class-variance-authority`. No zustand, no shadcn/ui
— see spec doc for why.

## Non-negotiable rules

- **AI never sees or writes SQL.** Tool args are structured JSON, validated by Zod,
  mapped to allowlisted Drizzle queries in `lib/queries/`. No raw SQL string
  concatenation, ever.
- **Tools are atomic, never a mode-switch.** Adding a capability means a new tool
  with a "Use when X. Do not use for Y." description — not a new param that changes
  an existing tool's behavior. (Benchmarked 15-30% worse tool-selection accuracy for
  monolithic tools — see spec doc, `compare_metric` section.) Current set:
  `query_analytics`, `forecast_demand`, `compare_metric`. Keep it a short, closed
  list — this is deliberate, not a limitation to "fix" later.
- **Answers are templated, not a second LLM call.** The model calls a tool once;
  the answer sentence is composed by deterministic string templates
  (`lib/format/answerTemplates.ts`) from the computed result. No second model turn
  to "phrase" the answer — that reintroduces a chance of misstating a correct
  number.
- **Max 4 tool-call round-trips per question.** Rate-limit guard in
  `lib/ai/orchestrate.ts` — prevents a runaway loop.
- **No DDD, no Hexagonal/ports-and-adapters.** Plain 3-layer folder separation
  (`lib/ai/` interpretation, `lib/queries/` computation, `lib/ai/orchestrate.ts`
  business logic) satisfies the spec's literal requirement at zero ceremony cost.
  One DB, one LLM provider — no reason to build swappable-adapter abstractions.
- **Dashboard is a Server Component**, calling `lib/queries/` directly — no REST
  round-trip. `/api/ask` is the only real API route.
- **No statistical significance claims from small samples.** 400 rows total; don't
  add z-score/anomaly-detection style claims at a granularity where per-bucket
  sample size is single digits (e.g. per-carrier-per-month ≈ 3-4 orders) — the
  result would be noise dressed as a finding. `compare_metric` reports plain
  deltas, not "this is anomalous."
- **Data is read-only.** No mutation endpoints exist, anywhere, ever.

## Skill usage

- **Any AI-engineering decision** (prompting, tool schema design, forecasting
  method, agent/workflow pattern) — check `~/fadel/ai-engineering-from-scratch`
  first (`grep -rl <topic> phases/`) before deciding from memory. Cite the specific
  lesson file in the spec doc when it changes a decision.
- **Frontend/UI work** — use the installed emil skills: `pick-ui-library` (which
  library for a given UI task — don't substitute outside its curated list without
  reason), `emil-design-eng` (animation/motion/component polish), `apple-design`
  (typography, spacing, materials). These are `disable-model-invocation: true` —
  read `.claude/skills/<name>/SKILL.md` directly if the Skill tool call fails.
- **Ponytail governs all code**: simplest solution that's actually correct, no
  unrequested abstraction, reuse before you write. Mark deliberate simplifications
  with a `// ponytail:` comment naming the ceiling and upgrade path.
- **Non-trivial logic gets one runnable check** — forecast regression math and the
  query-arg allowlist/validation are the two spots that need it. Use Node's
  built-in `node:test`, not a new test framework/dependency.

## Env vars

`DATABASE_URL` (Neon), `DEEPSEEK_API_KEY`. `.env.example` must exist and stay in
sync; never commit real values.

## README requirement (don't forget this)

The spec explicitly states "undisclosed AI usage may be treated negatively" — the
README must disclose that Claude Code was used to build this, distinct from
DeepSeek being the product's own AI orchestration layer. See
`my-learn-as-ai-engineer.md` (gitignored, personal notes) for the reasoning behind
every non-obvious design decision — it's the source for the README's design-decision
explanations.
