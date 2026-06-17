# Design Spec — Lapras DGS Internship Submission Packet

**Date:** 2026-06-17
**Author:** Yuvraaj Suri (with Claude Code)
**Status:** Approved design → ready for implementation plan

---

## 1. Goal & Context

Produce a submission packet for the **City of Los Angeles, Department of General
Services — "Agentic Software Engineering" paid remote internship** (contact:
Charles Huang, charles.x.huang@lacity.org).

The packet documents **Lapras**, a real-time plumbing fleet dispatch platform
(Next.js + Supabase), to a standard where an LLM (the reviewers use **Gemini**)
can **regenerate the application from the Markdown text alone**. The reviewers
feed the `.md` documents into Gemini and test whether it can rebuild the
intended app.

Since the original brief, the app has grown to include an MCP server, an agentic
dispatch copilot, a weighted assignment algorithm, and an analytics + audit
layer. The docs target the **full app, organized in layers** so regeneration is
tractable.

### Candidate (use real info on the packet)
- **Name:** Yuvraaj Suri · **Email:** suriy@purdue.edu
- **Links:** linkedin.com/in/yuvraajsuri · github.com/yuvraaj1110
- **Status caveat (state honestly):** CS undergraduate at Purdue, graduating
  **May 2028** — not yet a senior. The posting accepts "senior undergraduate or
  graduate"; surface this up front in the README, do not obscure it.

---

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| **Doc scope** | Full app, layered: Core → Agentic → Analytics/Audit. |
| **Package contents** | 3 regeneration docs + README cover note + SETUP guide + a self-run Gemini test. (No standalone "agentic-build" doc — fold a short paragraph into the README.) |
| **Status/metrics positioning** | "In commercial use per the project owner" framing. **Integrity guardrail:** seeded analytics numbers are NOT presented as real production metrics. Attribute the status claim to the owner; document KPI *definitions*; label any displayed figures as *illustrative / from demo data*. No invented quantitative production metrics. |
| **Output location** | A clean `submission/` folder at the repo root (so reviewers can drop the `.md` files straight into Gemini), plus a pointer to the repo for the Application Code component. |

---

## 3. The Layered Model (spine of docs 02 & 03)

Gemini should be guided to rebuild in this order:

1. **Core business app** — Next.js App Router dashboard + Supabase relational
   schema (`profiles`, `jobs`, `customers`) + realtime subscriptions + Supabase
   Auth.
2. **Agentic layer** — shared `lib/fleet-ops` core → exposed twice as (a) a
   standalone **MCP server** and (b) the **copilot** route (LLM tool-calling);
   plus the pure, tested **assignment scoring algorithm** (`lib/scoring`).
3. **Analytics / Audit** — additive schema (`skills`, `technician_skills`,
   `assignments`, `job_events`) + 3 SQL views + the `/analytics` dashboard +
   live `job_events` activity feed.

---

## 4. Deliverables

### `submission/README.md` (cover note)
- One-paragraph what-is-Lapras + the four components and how they map to the
  brief's requirements.
- **Honest class-year caveat** (grad May 2028).
- Reviewer quick-start (where the code is, how to run, where the docs are).
- Short honest paragraph: "Built and refactored with agentic coding tools
  (Claude Code)" — answers the role's hands-on-agentic-tooling requirement.
- Candidate contact block.

### `submission/01-business-statement.md` (~1 page)
- **Problem:** dispatcher juggles live tech locations, job intake, and fast
  closest-skilled assignment; dispatch latency on emergencies = water damage.
- **What Lapras does:** features grounded in actual code (live map, realtime job
  board, one-click intake, proximity dispatch assist, agentic copilot, per-job
  detail + audit).
- **Business value:** qualitative (faster/better-informed dispatch, single
  source of truth, prioritization, low ops overhead) + **KPI definitions**
  (avg response time, SLA-breach rate, technician utilization) — defined as what
  the system measures, with any numbers labeled illustrative/seed.
- **Status:** in commercial use per the project owner; repo ships with seed data
  + a movement simulator for demonstration.
- **Role-fit table** (web framework / relational DB / API+MCP / business sense /
  agentic tooling).

### `submission/02-logical-structure.md`
- The 3-layer model narrative.
- **Mermaid architecture diagram:** browser (Next client components) ↔ Next
  route handlers ↔ Supabase (Postgres + Realtime + Auth) ↔ standalone MCP server
  ↔ LLM provider (Groq/Ollama/OpenAI-compatible); the movement simulator as an
  external writer.
- **Mermaid sequence diagrams** for the 3 signature flows:
  1. Simulator updates `profiles.current_location` → Supabase Realtime
     `postgres_changes` → `useFleetSubscription` → animated marker (rAF lerp).
  2. Create job (modal → `POST /api/jobs` → `create_customer` RPC + insert +
     `job_events`) → Realtime INSERT → dashboard feed prepends.
  3. Copilot: "who's nearest to the emergency?" → LLM →
     `find_nearest_available_tech` → ranked answer → dispatcher confirms →
     `assign_job` (assignment + job update + tech busy + `job_events`).
- Component inventory (responsibility + interface + dependencies per unit).
- Auth/trust boundaries (anon vs service-role key, RLS, the `pickSupabaseKey`
  guard, human-in-the-loop gate on `assign_job`).

### `submission/03-technical-implementation-guide.md` (regeneration spec — largest)
- **Stack + exact versions** (Next 15.1.4, React 19, TS 5, @supabase/* , openai,
  @modelcontextprotocol/sdk, recharts, leaflet/react-leaflet, tailwind 3.4,
  vitest).
- **Folder structure** (annotated tree).
- **Environment variables** (table: name, where used, server/public; note the
  dual anon-key naming quirk and `LLM_PROVIDER` switch).
- **Relational data model** — the centerpiece. For each table give columns,
  types, PK/FK, checks, defaults:
  - `profiles` (id→auth.users, full_name, role, status, current_location jsonb,
    phone, specialty, …)
  - `customers` (id, name, address, …)
  - `jobs` (id, customer_id FK, title, description, category, status, priority,
    assigned_plumber_id FK, lat, lng, date, customer_name, created_at)
  - `skills`, `technician_skills` (M:N + proficiency)
  - `assignments` (job_id FK, technician_id FK, status, score, distance_km,
    assigned_by, assigned_at, released_at)
  - `job_events` (job_id FK, actor, event_type, payload jsonb, created_at)
  - RLS policies (permissive demo) + the `handle_new_user` trigger + the 3 views
    (`v_technician_utilization`, `v_job_response_times`, `v_sla_breaches`) with
    their defining SQL.
- **API layer** — every endpoint as a contract:
  - `POST /api/jobs` — body, steps (create_customer RPC, insert job, optional
    assign, job_events), response, status codes.
  - `PATCH /api/jobs/[id]` — status update + frees tech + job_events.
  - `POST /api/copilot` — request/response wire protocol, the tool-calling loop,
    the confirm-gate for `assign_job`, the Groq retry, provider switch.
  - `GET /auth/callback` — PKCE exchange.
  - **Realtime channels** — table, events, payload handling.
  - **MCP tool catalog** — the 5 tools (`get_fleet_status`, `list_jobs`,
    `find_nearest_available_tech`, `assign_job`, `get_job_history`) with
    JSON-schema input, output shape, and side effects; how the server is wired
    (stdio) and configured in an MCP client.
- **Assignment algorithm** — sub-score formulas, the priority weight table,
  pseudocode, and a worked numeric example (matching `lib/scoring.ts`).
- **Frontend** — page/component map; how each fetches + subscribes; the
  dynamic-import/`mounted` pattern for map + charts.
- **End-to-end data-flow** narrative.
- **Setup/build/run** quick reference (defer details to SETUP.md).
- **MCP appendix** — how `lib/fleet-ops` is exposed both as MCP and copilot.

### `submission/SETUP.md`
- Prereqs (Node, a Supabase project, an LLM key or local Ollama).
- Env file template.
- **Migration order:** `scripts/setup-supabase.sql` (base) → `0002_agentic_upgrade`
  → `0003_seed_skills` → `0004_grant_views` → `seedDemoData.ts`; how to apply via
  the session pooler / SQL editor.
- Commands: `npm run dev`, `npm run mcp`, copilot env, `npm test`.

---

## 5. Self-Run Gemini Regeneration Test (final step)
1. Concatenate `03` (+ `02`, + the relevant schema from SETUP) and feed to an LLM.
2. Ask it to rebuild ONE bounded module — recommended: the **assignment
   algorithm** (`lib/scoring.ts`) or the **fleet-ops tool catalog**.
3. Diff the regenerated output against the real source.
4. For every divergence caused by doc ambiguity (not model error), patch the
   doc. Record what was patched in a short note.

---

## 6. Honesty Constraints (apply to every doc)
- No invented metrics, customers, or features. Everything verifiable in the repo.
- Seeded analytics = illustrative, never "real production" numbers.
- "In commercial use" is attributed to the project owner, not asserted by the docs as independently verified.
- MCP **is** actually implemented — document the real server; the MCP appendix
  describes real wiring, not aspiration.
- Class-year caveat stated plainly.

---

## 7. Success Criteria
- All three numbered docs are valid Markdown, self-contained, and deterministic.
- A competent LLM, given `02`+`03`+`SETUP`, could scaffold the schema, the API/MCP
  contracts, and the assignment algorithm without guessing.
- The self-run test passes (or its gaps are patched).
- The packet reads honestly and maps cleanly to the role's five requirements.

---

## 8. Out of Scope
- Rewriting/refactoring app code (docs describe what exists).
- The ongoing yellow/black theme work (cosmetic; not part of the packet).
- A recorded demo video (text + diagrams only, per the brief's Markdown rule).
