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
