# Gemini Regeneration Test Protocol

Use this document to validate whether an LLM (Gemini, as the reviewers will) can
rebuild Lapras from the Markdown submission packet alone.

---

## What to Feed Gemini

Paste or upload these files **in this order**:

1. [`README.md`](README.md)
2. [`01-business-statement.md`](01-business-statement.md)
3. [`02-logical-structure.md`](02-logical-structure.md)
4. [`03-technical-implementation-guide.md`](03-technical-implementation-guide.md)
5. [`SETUP.md`](SETUP.md)

**Where to run:** [Google AI Studio](https://aistudio.google.com/) (Gemini 2.5 Pro
or latest model with long context).

---

## Phase 1 — Regeneration Prompt

Copy this prompt after pasting all five documents:

```
You are rebuilding a standalone application from these Markdown specifications.
Do not ask clarifying questions. Produce:

1. Complete file tree
2. All source files (app/, components/, lib/, hooks/, mcp-server/, scripts/)
3. package.json with exact versions from the spec
4. All SQL migration files in the documented order
5. .env.example

Follow the three-layer build order: Core → Agentic → Analytics.
Match every API route, MCP tool, Realtime channel, and scoring formula exactly.

Critical requirements:
- 5 MCP tools: get_fleet_status, list_jobs, find_nearest_available_tech, assign_job, get_job_history
- Copilot confirm gate: assign_job requires dispatcher approval (WRITE_TOOLS)
- Scoring weights: emergency distance=0.55; high distance=0.45; medium/low distance=0.30
- 4 Realtime channels: fleet-map, dashboard-jobs, activity-feed, analytics
- SQL migration 0000 must include profiles, customers, jobs DDL + create_customer RPC + handle_new_user trigger
- 3 analytical views: v_technician_utilization, v_job_response_times, v_sla_breaches
```

---

## Phase 2 — Comparison Checklist

Compare Gemini's output against the ground-truth application in
[`application/`](application/) (or [`../PNUM/`](../PNUM/)).

### Stack and config

| # | Artifact | Ground truth | Gemini got it? |
|---|---|---|---|
| 1 | `package.json` versions (next 15.1.4, react ^19, etc.) | `application/package.json` | ☐ |
| 2 | `.env.example` with all vars | `application/.env.example` | ☐ |
| 3 | Scripts: dev, mcp, simulate, test | `application/package.json` | ☐ |

### Database (run in order)

| # | Artifact | Ground truth | Gemini got it? |
|---|---|---|---|
| 4 | `scripts/0000_base_schema.sql` — profiles, customers, jobs | `application/scripts/0000_base_schema.sql` | ☐ |
| 5 | `create_customer` RPC | inside 0000 | ☐ |
| 6 | `handle_new_user` trigger | inside 0000 | ☐ |
| 7 | `scripts/0002_agentic_upgrade.sql` — 4 tables + 3 views | `application/scripts/0002_agentic_upgrade.sql` | ☐ |
| 8 | Migration order 0000 → setup → 0002 → 0003 → 0004 | `SETUP.md` §3 | ☐ |

### Core logic

| # | Artifact | Ground truth | Gemini got it? |
|---|---|---|---|
| 9 | Scoring algorithm (haversine, weights, clamp01) | `application/lib/scoring.ts` | ☐ |
| 10 | Fleet-ops I/O layer | `application/lib/fleet-ops.ts` | ☐ |
| 11 | 5-tool catalog + executeTool | `application/lib/fleet-tools.ts` | ☐ |
| 12 | Audit log writer | `application/lib/audit.ts` | ☐ |
| 13 | Analytics KPI helpers | `application/lib/analytics.ts` | ☐ |
| 14 | pickSupabaseKey guard | `application/lib/supabase-key.ts` | ☐ |

### API routes

| # | Artifact | Ground truth | Gemini got it? |
|---|---|---|---|
| 15 | `POST /api/jobs` — create_customer RPC + job insert | `application/app/api/jobs/route.ts` | ☐ |
| 16 | `PATCH /api/jobs/[id]` — status update + free tech | `application/app/api/jobs/[id]/route.ts` | ☐ |
| 17 | `POST /api/copilot` — tool loop + confirm gate | `application/app/api/copilot/route.ts` | ☐ |
| 18 | `GET /auth/callback` — PKCE exchange | `application/app/auth/callback/route.ts` | ☐ |

### Agentic layer

| # | Artifact | Ground truth | Gemini got it? |
|---|---|---|---|
| 19 | MCP server stdio transport | `application/mcp-server/index.ts` | ☐ |
| 20 | Human-in-the-loop on assign_job in copilot | `application/app/api/copilot/route.ts` | ☐ |
| 21 | Groq tool_use_failed retry | `application/app/api/copilot/route.ts` | ☐ |

### Frontend

| # | Artifact | Ground truth | Gemini got it? |
|---|---|---|---|
| 22 | Dashboard + dashboard-jobs Realtime channel | `application/app/page.tsx` | ☐ |
| 23 | Fleet map with ssr:false dynamic import | `application/components/FleetMapClient.tsx` | ☐ |
| 24 | CopilotPanel confirm gate UI | `application/components/CopilotPanel.tsx` | ☐ |
| 25 | Analytics page with mounted gate for Recharts | `application/app/analytics/page.tsx` | ☐ |
| 26 | useFleetSubscription fleet-map channel | `application/hooks/useFleetSubscription.ts` | ☐ |

### Unit tests

| # | Artifact | Ground truth | Gemini got it? |
|---|---|---|---|
| 27 | scoring.test.ts | `application/lib/scoring.test.ts` | ☐ |
| 28 | analytics.test.ts | `application/lib/analytics.test.ts` | ☐ |
| 29 | audit.test.ts | `application/lib/audit.test.ts` | ☐ |
| 30 | supabase-key.test.ts | `application/lib/supabase-key.test.ts` | ☐ |

**Pass threshold:** ≥ 25 of 30 checklist items match the ground truth without
hallucinated extra dependencies or missing write-tool gating.

---

## Phase 3 — Smoke Test (if Gemini produced runnable code)

Save Gemini's output to a new directory, then:

```bash
cd <gemini-output-dir>
cp .env.example .env.local    # fill in real Supabase + Groq keys
npm install

npx tsx scripts/apply-migrations.ts \
  scripts/0000_base_schema.sql \
  scripts/setup-supabase.sql \
  scripts/0002_agentic_upgrade.sql \
  scripts/0003_seed_skills.sql \
  scripts/0004_grant_views.sql

npx tsx scripts/seedDemoData.ts   # optional: richer analytics demo data

npm test          # expect: scoring, analytics, audit, supabase-key pass
npm run build     # expect: Next.js build succeeds
npm run dev       # expect: dashboard at http://localhost:3000
```

**MCP smoke test** (separate terminal):

```bash
npm run mcp
# In another terminal:
npx tsx scripts/mcp-smoke.ts   # if Gemini included it; otherwise test via Claude Desktop config from 03-guide §B.6
```

---

## Phase 4 — Record Results

Log your findings in [`regeneration-test-notes.md`](regeneration-test-notes.md):

- Gemini model and date used
- Which checklist items passed / failed
- Doc ambiguities that caused failures
- Patches you applied to the submission docs

---

## Quick Structural Pre-Check (before Gemini)

Run this against the ground-truth app to confirm the packet is internally consistent:

```bash
cd application   # or ../PNUM
npm test
npm run build
```

Verify all files referenced in `03-technical-implementation-guide.md` §A.2 exist:

```bash
ls scripts/0000_base_schema.sql scripts/setup-supabase.sql scripts/0002_agentic_upgrade.sql
ls lib/scoring.ts lib/fleet-tools.ts lib/fleet-ops.ts mcp-server/index.ts
ls app/api/copilot/route.ts app/api/jobs/route.ts
```

If this pre-check passes, the docs describe a buildable app. The Gemini test
measures whether the docs alone are sufficient for an LLM to reproduce it.
