# Lapras — Technical Implementation Guide

A regeneration-grade specification of **Lapras**, a real-time plumbing
fleet-dispatch platform. This document is intended to be precise enough that a
competent LLM, given this file plus `SETUP.md`, can rebuild the schema, the
API/MCP contracts, and the assignment algorithm without guessing.

The app is organized in three layers, and the guide follows that spine:

1. **Core business app** — Next.js App Router dashboard + Supabase relational
   schema (`profiles`, `jobs`, `customers`) + realtime subscriptions + Auth.
2. **Agentic layer** — a shared `lib/fleet-ops` core exposed twice: as a
   standalone **MCP server** and as the **copilot** route (LLM tool-calling),
   plus the pure, unit-tested **assignment scoring algorithm** (`lib/scoring`).
3. **Analytics / audit** — additive schema (`skills`, `technician_skills`,
   `assignments`, `job_events`) + 3 SQL views + the `/analytics` dashboard +
   the live `job_events` activity feed.

---

# Part A — Stack, Structure, and Data Model

## A.1 Stack and exact versions

Source of truth: `package.json`.

| Area | Package | Version |
|---|---|---|
| Framework | `next` (App Router) | `15.1.4` |
| UI runtime | `react` / `react-dom` | `^19.0.0` |
| Language | `typescript` | `^5` |
| DB / Realtime / Auth client | `@supabase/supabase-js` | `^2.45.4` |
| SSR auth helpers | `@supabase/ssr` | `^0.10.0` |
| LLM client (copilot) | `openai` | `^6.43.0` |
| MCP server SDK | `@modelcontextprotocol/sdk` | `^1.21.0` |
| Charts | `recharts` | `^3.8.1` |
| Maps | `leaflet` / `react-leaflet` / `react-leaflet-cluster` | `^1.9.4` / `^5.0.0` / `^4.1.3` |
| Map (alt) | `maplibre-gl` | `^5.22.0` |
| Styling | `tailwindcss` | `^3.4.1` |
| Postgres driver (migrations) | `pg` | `^8.21.0` |
| Class utilities | `clsx` / `tailwind-merge` | `^2.1.1` / `^3.0.0` |
| Icons | `lucide-react` | `^1.7.0` |
| Env loader | `dotenv` | `^17.4.0` |
| Script runner | `tsx` (dev) | `^4.22.4` |
| Tests | `vitest` (dev) | `^4.1.9` |
| Lint | `eslint` + `eslint-config-next` (dev) | `^9` / `15.1.4` |

**Scripts** (`package.json`): `dev` (`next dev`), `build`, `start`, `lint`,
`simulate` (`npx tsx scripts/simulateMovement.ts`), `mcp`
(`npx tsx mcp-server/index.ts`), `test` (`vitest run`), `test:watch`.

## A.2 Annotated folder tree

```
app/                         # Next.js App Router
  layout.tsx                 # root layout
  page.tsx                   # dashboard: job board + map + activity feed + copilot
  globals.css
  login/                     # Supabase auth login page
  fleet/page.tsx             # live fleet map + proximity dispatch view
  jobs/[id]/                 # per-job detail + audit timeline
  analytics/page.tsx         # KPI dashboard (recharts) over the SQL views
  auth/callback/route.ts     # GET — PKCE code → session exchange
  api/
    jobs/route.ts            # POST — create a job (+ optional assign)
    jobs/[id]/route.ts       # PATCH — update job status (+ free tech)
    copilot/route.ts         # POST — agentic dispatch copilot (tool-calling loop)
components/
  FleetMap.tsx               # map wrapper
  FleetMapClient.tsx         # client-only Leaflet map (dynamic import, ssr:false)
  MiniMapWidget.tsx          # dashboard mini-map (dynamic, ssr:false)
  CreateJobModal.tsx         # job intake form → POST /api/jobs
  CopilotPanel.tsx           # chat UI → POST /api/copilot, confirm gate
  ActivityFeed.tsx           # live job_events audit feed
lib/
  scoring.ts                 # PURE assignment scoring algorithm (+ scoring.test.ts)
  fleet-ops.ts               # fleet-ops core (I/O); feeds rows to scoring
  fleet-tools.ts             # tool catalog + executeTool dispatcher (MCP + copilot)
  audit.ts                   # logJobEvent writer + describeEvent formatter (+ test)
  analytics.ts               # pure KPI aggregation over view rows (+ test)
  supabase.ts                # browser client (anon key, safe stub fallback)
  supabase-server.ts         # SSR client
  supabase-key.ts            # pickSupabaseKey guard (+ test)
  audit.test.ts, analytics.test.ts, scoring.test.ts, supabase-key.test.ts
  types.ts, mockData.ts      # shared types + mock/seed data for offline dev
mcp-server/
  index.ts                   # MCP server (stdio) wrapping lib/fleet-tools
scripts/
  setup-supabase.sql         # base schema (migration 1)
  0002_agentic_upgrade.sql   # agentic + analytics schema (migration 2)
  0003_seed_skills.sql       # skills seed (migration 3)
  0004_grant_views.sql       # grant SELECT on views (migration 4)
  handle_new_user.sql        # auth.users → profiles trigger function
  apply-migrations.ts        # runs .sql files over POSTGRES_URL
  seedDemoData.ts, seedPlumbers.ts   # demo data
  simulateMovement.ts        # technician GPS movement simulator
  debug-*.ts, mcp-smoke.ts, test-db.ts  # diagnostics
hooks/
  useFleetSubscription.ts    # fleet-map realtime subscription hook
```

## A.3 Environment variables

See `SETUP.md` §2 for the full template and notes. Summary:

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | public | Anon key (browser client, middleware, simulator, server-route fallback). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon key under conventional name (SSR client + auth callback). *Two anon vars — set both to the same key.* |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | RLS-bypass key for `/api/jobs`, `/api/copilot`, MCP server. |
| `POSTGRES_URL` | server-only | Direct Postgres connection for SQL migrations. |
| `LLM_PROVIDER` | server | `groq` (default) \| `ollama` \| `openai`. |
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `COPILOT_MODEL` | server | Copilot LLM credentials / model override. |

## A.4 Relational data model

Postgres (Supabase). Sources: `scripts/setup-supabase.sql`,
`scripts/0002_agentic_upgrade.sql`, `scripts/0003_seed_skills.sql`,
`scripts/0004_grant_views.sql`, `scripts/handle_new_user.sql`.

### `profiles` — technicians and dispatchers

`id` references `auth.users(id)`. The `handle_new_user` trigger inserts one row
per new auth user.

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK → `auth.users(id)` | |
| `full_name` | `text` | | seeded plumber names |
| `role` | `text` | | observed values: `plumber`, `Dispatcher`, `admin`; fleet-ops queries match `role IN ('plumber','technician')` |
| `status` | `text` | | `active` \| `busy` \| `offline` |
| `current_location` | `jsonb` | | `{ "lat": <float>, "lng": <float> }` (migration converts an earlier `geography` column to jsonb) |
| `phone` | `text` | added in 0002-era setup | |
| `specialty` | `text` | | e.g. `Water Heaters`, `Emergency Repair` (maps to a skill) |
| `created_at` / `updated_at` | `timestamptz` | | set by trigger |

> The Source-of-Truth Reference also lists `avg_rating`,
> `is_emergency_specialist`, and `skills_tags` on `profiles`. These are not
> created by the committed SQL migrations (they may exist on a live DB from an
> earlier schema); the migration-defined columns are the ones above. Skill
> matching in the current code uses the `skills` / `technician_skills` tables,
> not `skills_tags`.

### `customers`

RPC: `create_customer(p_name text, p_address text) → uuid` inserts a customer
and returns its id. `/api/jobs` calls this RPC.

> **Discrepancy to flag:** the `create_customer` RPC is **referenced by
> `app/api/jobs/route.ts` but is not defined in any committed `scripts/*.sql`
> file.** It must be created in the database manually (Supabase SQL editor) for
> job creation to work. A faithful regeneration should define it, e.g.:
> ```sql
> CREATE OR REPLACE FUNCTION public.create_customer(p_name text, p_address text)
> RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
> DECLARE v_id uuid;
> BEGIN
>   INSERT INTO public.customers (name, address)
>   VALUES (p_name, p_address) RETURNING id INTO v_id;
>   RETURN v_id;
> END $$;
> ```

| Column | Type | Key / constraint |
|---|---|---|
| `id` | `uuid` | PK `DEFAULT gen_random_uuid()` |
| `name` | `text` | `NOT NULL` |
| `address` | `text` | |
| `location` | `geography` | |
| `"Phone number"` | `bigint` | (quoted, space in name) |
| `created_at` | `timestamptz` | `DEFAULT now()` |

### `jobs`

`setup-supabase.sql` adds `customer_name`, `address`, `lat`, `lng`, `date`.

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `customer_id` | `uuid` | `NOT NULL` → `customers` | |
| `title` | `text` | | |
| `description` | `text` | | |
| `category` | `text` | | used in skill matching |
| `status` | `text` | CHECK | `pending` \| `assigned` \| `in_progress` \| `completed` (API also accepts `cancelled` on PATCH) |
| `priority` | `text` | CHECK | `low` \| `medium` \| `high` \| `emergency` |
| `assigned_plumber_id` | `uuid` | → `profiles` | |
| `lat` / `lng` | `float8` | | job coordinates |
| `date` | `text` | | display date string |
| `customer_name` | `text` | | denormalized for display |
| `created_at` | `timestamptz` | | |

### `skills` (migration 0002)

| Column | Type | Key / constraint |
|---|---|---|
| `id` | `uuid` | PK `DEFAULT gen_random_uuid()` |
| `name` | `text` | `UNIQUE NOT NULL` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

Seeded names (0003): `Water Heaters`, `Emergency Repair`, `Drain Cleaning`,
`Pipe Fitting`, `Residential`, `Leak Detection`, `Sewer`.

### `technician_skills` (migration 0002) — M:N + proficiency

| Column | Type | Key / constraint |
|---|---|---|
| `technician_id` | `uuid` | `NOT NULL` → `profiles(id)` `ON DELETE CASCADE` |
| `skill_id` | `uuid` | `NOT NULL` → `skills(id)` `ON DELETE CASCADE` |
| `proficiency` | `int` | `NOT NULL DEFAULT 3 CHECK (proficiency BETWEEN 1 AND 5)` |
| — | — | `PRIMARY KEY (technician_id, skill_id)` |

Seeding (0003): each tech's `specialty` → matching skill at proficiency 5; every
plumber/technician also gets `Emergency Repair` at proficiency 2.

### `assignments` (migration 0002) — first-class assignment record

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK `DEFAULT gen_random_uuid()` | |
| `job_id` | `uuid` | `NOT NULL` → `jobs(id)` `ON DELETE CASCADE` | |
| `technician_id` | `uuid` | `NOT NULL` → `profiles(id)` `ON DELETE CASCADE` | |
| `status` | `text` | `NOT NULL DEFAULT 'active' CHECK (status IN ('proposed','accepted','active','completed','cancelled'))` | |
| `score` | `numeric` | | 0..1 score from the algorithm |
| `distance_km` | `numeric` | | great-circle km at assignment time |
| `assigned_by` | `text` | | `dispatcher` \| `copilot` \| `mcp` \| `<user>` |
| `assigned_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |
| `released_at` | `timestamptz` | | |

### `job_events` (migration 0002) — append-only audit log

| Column | Type | Key / constraint | Notes |
|---|---|---|---|
| `id` | `uuid` | PK `DEFAULT gen_random_uuid()` | |
| `job_id` | `uuid` | `NOT NULL` → `jobs(id)` `ON DELETE CASCADE` | |
| `actor` | `text` | | who/what caused it |
| `event_type` | `text` | `NOT NULL` | `created` \| `assigned` \| `status_changed` \| `completed` \| `cancelled` (also `reassigned` in vocabulary) |
| `payload` | `jsonb` | `NOT NULL DEFAULT '{}'::jsonb` | event diff/context |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` | |

### Indexes (0002)

`idx_jobs_status`, `idx_jobs_priority`, `idx_assignments_job`,
`idx_assignments_tech`, `idx_assignments_status`,
`idx_job_events_job_time (job_id, created_at)`, `idx_tech_skills_skill`.

### `handle_new_user` trigger

`scripts/handle_new_user.sql` — `SECURITY DEFINER` function that fires
`AFTER INSERT ON auth.users FOR EACH ROW`. It inserts a `profiles` row with
`id = new.id`, `full_name = COALESCE(raw_user_meta_data->>'full_name','New
Dispatcher')`, `role = 'Dispatcher'`, and `created_at`/`updated_at = now()`.

### RLS policy pattern (permissive demo)

Every table enables RLS and gets a permissive demo policy so the prototype runs
without per-role tuning. Pattern from `setup-supabase.sql` (per-action) and
`0002` (single `FOR ALL`):

```sql
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
-- base tables: per-action policies
CREATE POLICY "demo_<t>_select" ON public.<t> FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "demo_<t>_update" ON public.<t> FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY "demo_<t>_insert" ON public.<t> FOR INSERT TO PUBLIC WITH CHECK (true);
-- agentic tables (0002): one FOR ALL policy
CREATE POLICY demo_all_<t> ON public.<t> FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
```

These are **demonstration** policies (open). Server routes use the service-role
key to bypass RLS; production would tighten per-role. Realtime is enabled by
adding each table to the `supabase_realtime` publication.

### The 3 analytical views — defining SQL (`0002_agentic_upgrade.sql`)

```sql
-- Technician utilization
CREATE OR REPLACE VIEW public.v_technician_utilization AS
SELECT
  p.id                                              AS technician_id,
  p.full_name,
  p.status,
  COUNT(a.id) FILTER (WHERE a.status = 'active')    AS active_jobs,
  COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed_jobs,
  (COUNT(a.id) FILTER (WHERE a.status = 'active') > 0) AS is_busy
FROM public.profiles p
LEFT JOIN public.assignments a ON a.technician_id = p.id
WHERE p.role IN ('plumber','technician')
GROUP BY p.id, p.full_name, p.status;

-- Response time: minutes from job creation to FIRST assignment
CREATE OR REPLACE VIEW public.v_job_response_times AS
SELECT
  j.id        AS job_id,
  j.title,
  j.priority,
  j.created_at,
  MIN(a.assigned_at)                                            AS first_assigned_at,
  EXTRACT(EPOCH FROM (MIN(a.assigned_at) - j.created_at)) / 60.0 AS response_minutes
FROM public.jobs j
LEFT JOIN public.assignments a ON a.job_id = j.id
GROUP BY j.id, j.title, j.priority, j.created_at;

-- SLA breaches: emergency >15 min, high >60 min, or never assigned
CREATE OR REPLACE VIEW public.v_sla_breaches AS
SELECT
  r.job_id, r.title, r.priority, r.response_minutes,
  CASE
    WHEN r.first_assigned_at IS NULL THEN true
    WHEN r.priority = 'emergency' AND r.response_minutes > 15 THEN true
    WHEN r.priority = 'high'      AND r.response_minutes > 60 THEN true
    ELSE false
  END AS is_breach
FROM public.v_job_response_times r;
```

Migration `0004` grants `SELECT` on all three views to `anon` and
`authenticated` so the analytics page can read them under RLS.

---

# Part B — API and MCP Layer

All server routes build a Supabase client with `pickSupabaseKey(serviceKey,
anonKey)` (`lib/supabase-key.ts`): prefer the service-role key **only if it is a
real key** (length ≥ 40 — guards against the `.env.example` placeholder), else
fall back to the anon key. Clients are created with
`{ auth: { autoRefreshToken: false, persistSession: false } }`.

## B.1 `POST /api/jobs` — create a job

Source: `app/api/jobs/route.ts`.

**Request body:**

```jsonc
{
  "customerName": "string (required)",
  "address": "string (required)",
  "jobTitle": "string (required)",
  "description": "string?",
  "priority": "low|medium|high|emergency (default 'medium')",
  "assignMode": "'now' | other",      // 'now' assigns immediately
  "selectedPlumberId": "uuid?"         // used when assignMode === 'now'
}
```

**Steps:**
1. Validate `customerName`, `address`, `jobTitle` are non-empty → else **400**.
2. `supabase.rpc('create_customer', { p_name, p_address })` → returns
   `customerId`. On error → **500** `Customer creation failed`.
3. Generate Portland-area coordinates:
   `lat = 45.5052 + (rand-0.5)*0.06`, `lng = -122.6784 + (rand-0.5)*0.1`.
4. Insert into `jobs`: `customer_id`, `customer_name`, `title`, `description`,
   `address`, `priority`, `status` = `assignMode==='now' ? 'assigned' :
   'pending'`, `assigned_plumber_id` = `assignMode==='now' ? selectedPlumberId :
   null`, `lat`, `lng`, `date` (localized `en-US` short date). On error → **500**.
5. `logJobEvent(actor='dispatcher', eventType='created', payload={title,
   priority, customer_name})`.
6. If `assignMode==='now' && selectedPlumberId`: set that plumber's `status` to
   `busy`. If that update fails → **207** `{ error, jobId }`. On success, log a
   second event `eventType='assigned', payload={technician_id}`.

**Responses:** **201** `{ success: true, jobId }` · **207** (job created but
plumber update failed) · **400** (missing fields) · **500** (RPC/insert error).

## B.2 `PATCH /api/jobs/[id]` — update job status

Source: `app/api/jobs/[id]/route.ts`. `params` is a `Promise` (Next 15) — awaited.

**Request body:** `{ "status": "pending|assigned|in_progress|completed|cancelled" }`
(validated against that set).

**Steps:**
1. Invalid JSON → **400** `Invalid JSON body`. Missing/invalid `status` → **400**.
2. Read current `jobs` row (`status`, `assigned_plumber_id`). Not found → **404**
   `Job not found`.
3. `UPDATE jobs SET status=… WHERE id`. On error → **500**.
4. If new status is `completed` or `cancelled` **and** a tech is assigned: free
   the tech (`profiles.status → 'active'`).
5. `logJobEvent` with `eventType` = `completed` / `cancelled` /
   `status_changed` (by status), `payload = { from: current.status, to: status }`.

**Responses:** **200** `{ success: true, id, status }` · **400** · **404** · **500**.

## B.3 `POST /api/copilot` — agentic dispatch copilot

Source: `app/api/copilot/route.ts`. Uses the **OpenAI-compatible Chat
Completions API** (`openai` SDK), provider-switched by `LLM_PROVIDER`.

> Note: a code comment in the route/tool files says "Anthropic tool-calling," but
> the actual implementation is the OpenAI-compatible Chat Completions interface
> (Groq / Ollama / OpenAI). This guide documents the real implementation.

**Provider resolution** (`resolveLLM`):
- `ollama` → `baseURL http://localhost:11434/v1`, key `'ollama'`, default model
  `llama3.1:8b`.
- `openai` → `OPENAI_API_KEY` + `OPENAI_BASE_URL`, default model `gpt-4o-mini`.
- default `groq` → `baseURL https://api.groq.com/openai/v1`, `GROQ_API_KEY`,
  default model `llama-3.3-70b-versatile`.
- `COPILOT_MODEL` overrides the default for any provider.

If provider is `groq` and `GROQ_API_KEY` is unset → **500** with a helpful
message.

**Wire protocol** (stateless; the client holds the full transcript):

```jsonc
// Request
{ "messages": ChatMessage[], "confirm"?: { "approve": boolean } }
// Response
{ "messages": ChatMessage[], "reply": string,
  "pendingConfirmation"?: { "tool": string, "input": object },
  "done": boolean }
```

**Tool-calling loop:**
- A fixed `SYSTEM_PROMPT` frames the assistant as the Portland fleet dispatch
  copilot. The shared `FLEET_TOOLS` catalog is mapped to OpenAI function-tool
  format (`type:'function'`, `function:{name,description,parameters:inputSchema}`).
- Loop up to `MAX_TURNS = 8` with `temperature 0.2`, `tool_choice:'auto'`,
  `messages: [system, ...transcript]`.
- If the model returns **no tool calls** → respond `{ messages, reply:
  content, done: true }`.
- **Confirm gate:** `WRITE_TOOLS = { 'assign_job' }`. If the model wants to call
  `assign_job`, the route stops and returns `pendingConfirmation:
  { tool:'assign_job', input }` with `done:false` — it does **not** execute the
  write. The dispatcher must approve.
- Read-only tools auto-execute (`runTool` → `executeTool`) and the loop
  continues; each tool result is pushed as a `role:'tool'` message.

**Resume path (`confirm`):** when the request carries `confirm`, the last
assistant message's `assign_job` tool call is either executed (`approve:true`) or
answered with a "dispatcher declined" tool message (`approve:false`), then the
loop resumes. If `confirm` is sent without a trailing assistant tool-call
message → **400**.

**Groq `tool_use_failed` retry:** Groq occasionally rejects the model's
tool-call generation (HTTP 400, `code:'tool_use_failed'` /
`failed_generation`). `createCompletion` retries up to **twice**, bumping
`temperature` by `+0.25` (capped at `0.7`) to resample. If it still fails, the
route returns a friendly `done:true` message instead of a raw 400.

## B.4 `GET /auth/callback` — PKCE session exchange

Source: `app/auth/callback/route.ts`. Reads `code` and `next` (default `/`) from
the URL. With `@supabase/ssr` `createServerClient` (using
`NEXT_PUBLIC_SUPABASE_ANON_KEY` + cookie store), calls
`supabase.auth.exchangeCodeForSession(code)`. On success → redirect to `next`;
on failure → redirect to `/login?error=auth-callback-failed`.

## B.5 Realtime channels

Supabase Realtime `postgres_changes` subscriptions:

| Channel | Source | Table(s) / event | Handler behavior |
|---|---|---|---|
| `fleet-map` | `hooks/useFleetSubscription.ts` | `profiles` UPDATE; `jobs` `*` | Patch tech marker location/status on UPDATE; INSERT/UPDATE/DELETE jobs into local state. |
| `dashboard-jobs` | `app/page.tsx` | `jobs` INSERT | Prepend the new job card to the board. |
| `activity-feed` | `components/ActivityFeed.tsx` | `job_events` INSERT | Re-fetch the latest 12 events (with joined job title). |
| `analytics` | `app/analytics/page.tsx` | `jobs` `*`, `assignments` `*`, `job_events` `*` | Re-run the KPI/view loader on any change. |

## B.6 MCP tool catalog

Source: `lib/fleet-tools.ts` (catalog + `executeTool` dispatcher), backed by
`lib/fleet-ops.ts`. The **same catalog** drives both the MCP server and the
copilot route, so the two surfaces never drift.

Each tool's `inputSchema` is JSON Schema with `type:'object'`,
`additionalProperties:false`.

### `get_fleet_status`
- **Input:** `{}` (no properties).
- **Output:** array of `{ id, name, status, specialty, phone, location:{lat,lng},
  activeLoad }` for all `role IN ('plumber','technician')`. `activeLoad` = count
  of that tech's `assignments` with `status='active'`.
- **Side effects:** none (read).

### `list_jobs`
- **Input:** `{ status?: 'pending'|'assigned'|'in_progress'|'completed',
  priority?: 'emergency'|'high'|'medium'|'low' }`.
- **Output:** jobs (`id,title,status,priority,customer_name,address,lat,lng,
  created_at`), newest first, filtered by the given fields.
- **Side effects:** none (read).

### `find_nearest_available_tech`
- **Input:** `{ job_id: string (required), top_n?: integer 1..10 (default 3) }`.
- **Output:** `{ job, requiredSkill, candidates: RankedCandidate[] }` — ranked
  active technicians with `score` and `breakdown`. **Does NOT assign.**
- **Side effects:** none (read). This is the assignment algorithm (see Part C).

### `assign_job`
- **Input:** `{ job_id: string (required), technician_id: string (required),
  assigned_by?: string }`.
- **Output:** `{ assignmentId, jobId, technicianId, technicianName, score,
  distanceKm }`.
- **Side effects (WRITE):** recomputes the score for an auditable record, inserts
  an `assignments` row (`status='active'`, `score`, `distance_km`,
  `assigned_by`), sets the job to `assigned` with `assigned_plumber_id`, marks
  the technician `busy`, and appends a `job_events` `assigned` row. **Gated by
  the copilot confirm step.** (`assigned_by` defaults to `copilot` when called
  via the copilot dispatcher.)

### `get_job_history`
- **Input:** `{ technician_id?: string, customer_id?: string, limit?: integer
  1..100 }`.
- **Output:** past jobs for a technician (joined via `assignments`) or a customer
  (`customer_id` filter), newest first, default limit 20.
- **Side effects:** none (read).

### Running and wiring the MCP server

Source: `mcp-server/index.ts`. Loads `.env.local` via `dotenv`, builds a
Supabase client (service-role key preferred, anon fallback), and registers a
`@modelcontextprotocol/sdk` `Server` (`name:'lapras-fleet'`, `version:'1.0.0'`,
`capabilities:{ tools:{} }`) over **stdio** (`StdioServerTransport`). It handles
`ListToolsRequestSchema` (returns the `FLEET_TOOLS` catalog) and
`CallToolRequestSchema` (runs `executeTool`, returns the result as
`content:[{type:'text', text: JSON}]`; errors return `isError:true`).

Run: `npm run mcp`. Sample Claude Desktop config (`mcpServers`):

```jsonc
{
  "mcpServers": {
    "lapras-fleet": {
      "command": "npx",
      "args": ["tsx", "mcp-server/index.ts"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ..."
      }
    }
  }
}
```
