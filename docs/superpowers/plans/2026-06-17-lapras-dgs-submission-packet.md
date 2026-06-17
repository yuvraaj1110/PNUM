# Lapras DGS Submission Packet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a regeneration-grade Markdown submission packet for the LA City DGS "Agentic Software Engineering" internship, documenting the Lapras fleet-dispatch app (core + agentic + analytics layers) so an LLM can rebuild it from the text alone.

**Architecture:** Five Markdown files in a clean `submission/` folder — README cover note, three numbered regeneration docs, and a SETUP guide — each grounded in the actual repo source, followed by a self-run Gemini regeneration test that patches any doc ambiguities.

**Tech Stack (the app being documented):** Next.js 15.1.4 (App Router), React 19, TypeScript 5, Supabase (Postgres + Realtime + Auth), `@supabase/supabase-js` ^2.45 / `@supabase/ssr` ^0.10, `openai` ^6.43 (OpenAI-compatible copilot), `@modelcontextprotocol/sdk` ^1.21 (MCP server), `recharts` ^3.8, `leaflet`/`react-leaflet` ^5, `tailwindcss` ^3.4, `pg` ^8.21, `vitest` ^4.

**Design spec:** `docs/superpowers/specs/2026-06-17-lapras-dgs-submission-packet-design.md`

---

## Source-of-Truth Reference (embed these facts; verify before writing)

**Stack/versions:** `package.json`.
**Env vars:** `.env.example` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (anon; client + middleware + simulator), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (server client + auth callback — naming quirk: two anon vars), `SUPABASE_SERVICE_ROLE_KEY` (server, RLS-bypass), `POSTGRES_URL`, `LLM_PROVIDER` (groq|ollama|openai), `GROQ_API_KEY`, `COPILOT_MODEL`, `OPENAI_API_KEY`/`OPENAI_BASE_URL`.

**Tables** (source: `scripts/setup-supabase.sql`, `scripts/0002_agentic_upgrade.sql`, `scripts/0003_seed_skills.sql`, `scripts/0004_grant_views.sql`; verified live):
- `profiles`: `id uuid PK → auth.users(id)`, `full_name text`, `role text` (values seen: `plumber`, `Dispatcher`, `admin`), `status text` (`active|busy|offline`), `current_location jsonb {lat,lng}`, `phone text`, `specialty text`, `avg_rating`, `is_emergency_specialist bool`, `skills_tags`, `created_at`, `updated_at`. Trigger `handle_new_user` creates a profile on `auth.users` insert.
- `customers`: `id uuid PK default gen_random_uuid()`, `name text NOT NULL`, `address text`, `location geography`, `created_at timestamptz default now()`, `"Phone number" bigint`. RPC `create_customer(p_name, p_address) → uuid`.
- `jobs`: `id uuid PK`, `customer_id uuid NOT NULL → customers`, `title text`, `description text`, `category text`, `status text` (`pending|assigned|in_progress|completed`), `priority text` (`low|medium|high|emergency`), `assigned_plumber_id uuid → profiles`, `lat float8`, `lng float8`, `date text`, `customer_name text`, `created_at timestamptz`.
- `skills`: `id uuid PK`, `name text UNIQUE`, `created_at`.
- `technician_skills`: `technician_id uuid → profiles ON DELETE CASCADE`, `skill_id uuid → skills ON DELETE CASCADE`, `proficiency int CHECK 1..5 default 3`, `PRIMARY KEY (technician_id, skill_id)`.
- `assignments`: `id uuid PK`, `job_id uuid → jobs ON DELETE CASCADE`, `technician_id uuid → profiles ON DELETE CASCADE`, `status text CHECK (proposed|accepted|active|completed|cancelled) default active`, `score numeric`, `distance_km numeric`, `assigned_by text`, `assigned_at timestamptz default now()`, `released_at timestamptz`.
- `job_events`: `id uuid PK`, `job_id uuid → jobs ON DELETE CASCADE`, `actor text`, `event_type text` (`created|assigned|status_changed|completed|cancelled`), `payload jsonb default '{}'`, `created_at timestamptz default now()`.
- Views (defining SQL in `0002`): `v_technician_utilization`, `v_job_response_times`, `v_sla_breaches`. RLS: permissive demo policies on all tables; grants on views in `0004`.

**API routes:** `app/api/jobs/route.ts` (POST), `app/api/jobs/[id]/route.ts` (PATCH), `app/api/copilot/route.ts` (POST), `app/auth/callback/route.ts` (GET).
**Realtime channels:** `fleet-map` (`useFleetSubscription.ts`: profiles UPDATE + jobs *), `dashboard-jobs` (`app/page.tsx`: jobs INSERT), `activity-feed` (`ActivityFeed.tsx`: job_events INSERT), `analytics` (`app/analytics/page.tsx`: jobs/assignments/job_events *).
**MCP tools** (`lib/fleet-tools.ts`): `get_fleet_status`, `list_jobs`, `find_nearest_available_tech`, `assign_job`, `get_job_history`. Server: `mcp-server/index.ts` (stdio).
**Assignment algorithm** (`lib/scoring.ts`): sub-scores `distance=clamp(1 - distanceKm/25, 0, 1)`, `load=1/(1+activeLoad)`, `skill=match?1:0.4`, `availability=active?1:busy?0.3:0`. Priority weights (sum to 1): emergency `{distance .55, load .15, skill .15, avail .15}`, high `{.45,.15,.25,.15}`, medium/low `{.30,.15,.40,.15}`. `score = Σ weightᵢ·subscoreᵢ`.

---

## File Structure

- Create: `submission/README.md` — cover note + agentic-tooling paragraph + candidate block.
- Create: `submission/01-business-statement.md` — problem, value, KPI definitions, status.
- Create: `submission/02-logical-structure.md` — layered model + 3 Mermaid diagrams + component inventory.
- Create: `submission/03-technical-implementation-guide.md` — stack, data model, API/MCP, algorithm, frontend, data flow.
- Create: `submission/SETUP.md` — env, migration order, run commands.
- Create: `submission/regeneration-test-notes.md` — record of the self-run Gemini test + patches.

---

### Task 1: SETUP.md (foundational facts first)

**Files:**
- Create: `submission/SETUP.md`

- [ ] **Step 1: Verify the facts against source**

Run: `cat .env.example && grep -n "scripts/" package.json && ls scripts/*.sql`
Expected: confirm env var names and the SQL files `setup-supabase.sql`, `0002_agentic_upgrade.sql`, `0003_seed_skills.sql`, `0004_grant_views.sql` exist.

- [ ] **Step 2: Write SETUP.md**

Contents (deterministic):
1. **Prereqs:** Node ≥ 20, a Supabase project, and either a free Groq API key OR local Ollama (`llama3.1:8b`).
2. **Env file:** reproduce `.env.example` verbatim with one-line explanations per var (note the two anon-key vars and the `LLM_PROVIDER` switch from the reference above).
3. **Database migration order** (apply via Supabase SQL editor or `scripts/apply-migrations.ts` over the session-pooler `POSTGRES_URL`):
   `setup-supabase.sql` → `0002_agentic_upgrade.sql` → `0003_seed_skills.sql` → `0004_grant_views.sql` → `npx tsx scripts/seedDemoData.ts`.
4. **Run commands:** `npm install`; `npm run dev` (app); `npm run mcp` (MCP server); copilot needs `LLM_PROVIDER`+`GROQ_API_KEY`; `npm test` (vitest).

- [ ] **Step 3: Verify**

Run: `npx markdownlint submission/SETUP.md 2>/dev/null || echo "no linter; visually confirm headings + code fences render"`
Expected: file exists, fenced code blocks balanced.

- [ ] **Step 4: Commit**

```bash
git add submission/SETUP.md
git commit -m "docs(packet): add SETUP guide"
```

---

### Task 2: 01-business-statement.md

**Files:**
- Create: `submission/01-business-statement.md`

- [ ] **Step 1: Write the business statement** (~1 page) with these sections:
  1. **Candidate header** (name/email/links).
  2. **Problem** — dispatcher juggles live tech locations + intake + fast closest-skilled assignment; emergency dispatch latency = water damage.
  3. **What Lapras does** — bullet each feature with its source file (live map `FleetMapClient.tsx`, realtime board `app/page.tsx`, intake `CreateJobModal.tsx`+`api/jobs`, proximity dispatch `app/fleet/page.tsx`, copilot `CopilotPanel.tsx`+`api/copilot`, analytics `app/analytics`, audit `ActivityFeed.tsx`).
  4. **Business value** — qualitative bullets + **KPI definitions** table: avg response time (job.created→first assignment), SLA-breach rate (emergency>15min / high>60min / unassigned), technician utilization. State these are *definitions the system computes*; any numbers shown are **illustrative from seeded demo data**.
  5. **Status** — "in commercial use per the project owner"; repo ships seed data + movement simulator for demonstration.
  6. **Role-fit table** — web framework / relational DB / API+MCP / business sense / agentic tooling, each mapped to concrete artifacts.
  7. **Class-year caveat** — Purdue CS undergrad, graduating May 2028.

- [ ] **Step 2: Verify no fabricated metrics**

Run: `grep -nE "[0-9]+ ?(min|%|jobs/day|users)" submission/01-business-statement.md`
Expected: every numeric figure is adjacent to the words "illustrative", "demo", or "definition" — no bare real-world metric claims. Fix any that aren't.

- [ ] **Step 3: Commit**

```bash
git add submission/01-business-statement.md
git commit -m "docs(packet): add business statement"
```

---

### Task 3: 02-logical-structure.md (with Mermaid)

**Files:**
- Create: `submission/02-logical-structure.md`

- [ ] **Step 1: Write the architecture diagram** (Mermaid `graph`): browser (Next client components: dashboard, fleet, analytics, copilot panel) → Next route handlers (`/api/jobs`, `/api/jobs/[id]`, `/api/copilot`, `/auth/callback`) → Supabase (Postgres, Realtime, Auth); separate **MCP server** node (stdio) → `lib/fleet-ops` core (shared with copilot route) → Supabase; **LLM provider** (Groq/Ollama) ← copilot route; **movement simulator** (`scripts/simulateMovement.ts`) → Supabase as an external writer.

- [ ] **Step 2: Write the 3 sequence diagrams** (Mermaid `sequenceDiagram`):
  1. Simulator → `profiles.current_location` UPDATE → Supabase Realtime `postgres_changes` → `useFleetSubscription` → `AnimatedMarker` rAF lerp.
  2. `CreateJobModal` → `POST /api/jobs` → `create_customer` RPC + insert `jobs` + `logJobEvent('created')` → Realtime INSERT on `jobs` → `dashboard-jobs` channel prepends card.
  3. Copilot: user question → `/api/copilot` loop → `find_nearest_available_tech` (read) → ranked reply → dispatcher Approve → `assign_job` (insert `assignments` + update `jobs` + set tech `busy` + `job_events`).

- [ ] **Step 3: Write the component inventory** — table of each unit (file, responsibility, interface, dependencies): `lib/scoring`, `lib/fleet-ops`, `lib/fleet-tools`, `lib/audit`, `lib/analytics`, `lib/supabase-key`, `mcp-server`, the four route handlers, `useFleetSubscription`, key components.

- [ ] **Step 4: Write trust boundaries** — anon vs service-role key, `pickSupabaseKey` guard, permissive demo RLS, human-in-the-loop gate on `assign_job`, server-only secrets.

- [ ] **Step 5: Verify Mermaid blocks are well-formed**

Run: `grep -c '```mermaid' submission/02-logical-structure.md`
Expected: ≥ 4 (architecture + 3 sequences). Eyeball each fence opens/closes.

- [ ] **Step 6: Commit**

```bash
git add submission/02-logical-structure.md
git commit -m "docs(packet): add logical structure + mermaid diagrams"
```

---

### Task 4: 03 — Technical Implementation Guide, Part A (stack, structure, data model)

**Files:**
- Create: `submission/03-technical-implementation-guide.md`

- [ ] **Step 1: Verify the live schema before writing**

Run: `npx tsx scripts/debug-tools.ts 2>/dev/null | head -40` (or read the SQL files) to confirm columns match the Source-of-Truth Reference.
Expected: `profiles`, `jobs` columns as listed; `assignments`/`job_events`/views exist.

- [ ] **Step 2: Write Part A sections:**
  1. **Stack + exact versions** (from `package.json`).
  2. **Annotated folder tree** (`app/`, `components/`, `lib/`, `mcp-server/`, `scripts/`, `supabase/`).
  3. **Environment variables** table (from the reference).
  4. **Relational data model** — one subsection per table with a column/type/key/constraint table, copied from the Source-of-Truth Reference. Include the `handle_new_user` trigger, `create_customer` RPC, the RLS policy pattern, and the **defining SQL** of the 3 views (paste from `0002_agentic_upgrade.sql`).

- [ ] **Step 3: Verify schema completeness**

Run: `for t in profiles customers jobs skills technician_skills assignments job_events; do grep -q "$t" submission/03-technical-implementation-guide.md && echo "$t ok" || echo "$t MISSING"; done`
Expected: all 7 tables `ok`.

- [ ] **Step 4: Commit**

```bash
git add submission/03-technical-implementation-guide.md
git commit -m "docs(packet): tech guide part A — stack + data model"
```

---

### Task 5: 03 — Part B (API + MCP layer)

**Files:**
- Modify: `submission/03-technical-implementation-guide.md` (append API/MCP section)

- [ ] **Step 1: Write each endpoint as a contract** (read each route file first to ground payload/response):
  - `POST /api/jobs` — body `{customerName,address,jobTitle,description,priority,assignMode,selectedPlumberId}`; steps (create_customer RPC → insert job → optional assign+busy → `job_events`); responses 201/207/400/500.
  - `PATCH /api/jobs/[id]` — body `{status}`; updates job, frees tech on completed/cancelled, writes `job_events`; 200/400/404.
  - `POST /api/copilot` — wire protocol `{messages, confirm?}` → `{messages, reply, pendingConfirmation?, done}`; the tool-calling loop; the `assign_job` confirm-gate; the Groq `tool_use_failed` retry; the `LLM_PROVIDER` switch.
  - `GET /auth/callback` — PKCE `exchangeCodeForSession`.
  - **Realtime channels** table (name, table, event, handler).

- [ ] **Step 2: Write the MCP tool catalog** — for each of the 5 tools: name, description, JSON-schema input (from `lib/fleet-tools.ts`), output shape, side effects. Plus how the server runs (`npm run mcp`, stdio) and a sample Claude Desktop `mcpServers` config (from `mcp-server/index.ts` header).

- [ ] **Step 3: Verify all tools + routes documented**

Run: `for x in get_fleet_status list_jobs find_nearest_available_tech assign_job get_job_history "/api/jobs" "/api/copilot" "/auth/callback"; do grep -q "$x" submission/03-technical-implementation-guide.md && echo "$x ok" || echo "$x MISSING"; done`
Expected: all `ok`.

- [ ] **Step 4: Commit**

```bash
git add submission/03-technical-implementation-guide.md
git commit -m "docs(packet): tech guide part B — API + MCP contracts"
```

---

### Task 6: 03 — Part C (algorithm, frontend, data flow, appendix)

**Files:**
- Modify: `submission/03-technical-implementation-guide.md` (append)

- [ ] **Step 1: Write the assignment algorithm section** — the sub-score formulas and priority weight table from the reference, then **pseudocode** mirroring `lib/scoring.ts` (`scoreCandidate`, `rankCandidates`) and `findNearestAvailableTech` (fetch active techs → required skill from job text → distance via Haversine → score → rank top N), then a **worked numeric example** (e.g. emergency job, 2 candidates, show each sub-score and final score — match the live example: Alex Rivera ~0.85 vs a farther tech).

- [ ] **Step 2: Write the frontend section** — page/component map (`app/page.tsx`, `app/fleet`, `app/jobs/[id]`, `app/analytics`, `app/login`; components), how each fetches + subscribes, and the `dynamic(..., {ssr:false})` + `mounted` pattern for Leaflet maps and Recharts.

- [ ] **Step 3: Write the end-to-end data-flow narrative** (user action → frontend → API/RPC → DB → realtime push → UI) and the **MCP appendix** (how `lib/fleet-ops` + `lib/fleet-tools` are exposed both as MCP tools and to the copilot — single source of truth).

- [ ] **Step 4: Verify algorithm fidelity**

Run: `grep -nE "0\.55|0\.45|0\.30|1/\(1 ?\+|25" submission/03-technical-implementation-guide.md`
Expected: the weights (.55/.45/.30), the load formula, and the 25km normalizer all appear — i.e. the documented algorithm matches `lib/scoring.ts`.

- [ ] **Step 5: Commit**

```bash
git add submission/03-technical-implementation-guide.md
git commit -m "docs(packet): tech guide part C — algorithm + frontend + data flow"
```

---

### Task 7: README cover note

**Files:**
- Create: `submission/README.md`

- [ ] **Step 1: Write the cover note:**
  1. One-paragraph Lapras intro + the four components (with links to the three docs + a pointer to the repo for Application Code).
  2. **Class-year caveat** stated plainly.
  3. **Reviewer quick-start** (read order: README → 01 → 02 → 03 → SETUP; how to run).
  4. Short honest **"built with agentic tooling (Claude Code)"** paragraph — what was scaffolded/refactored with the agent (e.g. the MCP server, fleet-ops core, TDD'd scoring algorithm, the analytics layer), answering the role's agentic-tooling requirement.
  5. Candidate contact block.

- [ ] **Step 2: Verify the four components are all referenced**

Run: `for d in 01-business-statement 02-logical-structure 03-technical-implementation-guide; do grep -q "$d" submission/README.md && echo "$d ok" || echo "$d MISSING"; done`
Expected: all `ok`.

- [ ] **Step 3: Commit**

```bash
git add submission/README.md
git commit -m "docs(packet): add README cover note"
```

---

### Task 8: Self-run Gemini regeneration test + patch

**Files:**
- Create: `submission/regeneration-test-notes.md`
- Modify: whichever doc the test exposes as ambiguous.

- [ ] **Step 1: Run the test** — concatenate `02` + `03` (+ schema from SETUP) and feed to an available LLM (the local Ollama, or paste into Gemini/Claude). Prompt it to rebuild ONE bounded module: **`lib/scoring.ts`** (the assignment algorithm) — chosen because it is pure and fully specified.

- [ ] **Step 2: Diff** the regenerated module against the real `lib/scoring.ts`. Identify divergences caused by **doc ambiguity** (not model error).

- [ ] **Step 3: Patch** each ambiguity in the relevant doc. Record in `submission/regeneration-test-notes.md`: what was fed, what the LLM produced, which gaps were doc-caused, and the patches made.

- [ ] **Step 4: Re-verify** the scoring tests still describe the documented behavior: `npx vitest run lib/scoring.test.ts` → Expected: PASS (confirms the real module the doc targets is correct).

- [ ] **Step 5: Commit**

```bash
git add submission/
git commit -m "docs(packet): self-run regeneration test + ambiguity patches"
```

---

### Task 9: Final assembly check

- [ ] **Step 1: Confirm the packet is complete**

Run: `ls -1 submission/ && echo "---" && wc -l submission/*.md`
Expected: `README.md`, `01-business-statement.md`, `02-logical-structure.md`, `03-technical-implementation-guide.md`, `SETUP.md`, `regeneration-test-notes.md` all present and non-trivial.

- [ ] **Step 2: Honesty pass** — re-read 01 and README; confirm no seeded number is presented as a real production metric and the class-year caveat is present.

Run: `grep -niE "illustrative|demo data|May 2028|per the project owner" submission/*.md`
Expected: matches in 01 + README.

- [ ] **Step 3: Final commit**

```bash
git add submission/
git commit -m "docs(packet): finalize DGS submission packet"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** README ✓(T7), 01 ✓(T2), 02 ✓(T3), 03 ✓(T4–T6), SETUP ✓(T1), self-test ✓(T8), honesty constraints ✓(T2 step2, T9 step2), layered model ✓(T3/T4–T6). All spec sections mapped.
- **Placeholders:** none — every task lists concrete sections + the embedded Source-of-Truth facts; verification steps use real commands.
- **Consistency:** table/column/tool/route/weight names are taken from one Source-of-Truth Reference and reused across tasks.
- **Note:** the existing draft at `lapras-dgs-packet/01-business-statement.md` (from an earlier session) may be reused as raw material for Task 2 but must be reconciled to the locked positioning decisions.
