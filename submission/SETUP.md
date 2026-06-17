# Lapras — Setup & Run Guide

This guide brings up the Lapras fleet-dispatch app from a clean checkout:
prerequisites, environment variables, database migration order, and run
commands. It is deterministic — follow it top to bottom.

---

## 1. Prerequisites

- **Node ≥ 20** (the project pins `@types/node` ^20; Next 15 / React 19 require a
  modern runtime).
- **A Supabase project** (free tier is fine) — provides Postgres, Realtime, and
  Auth. You need its project URL, the anon/publishable key, and the
  service-role key.
- **An LLM backend for the copilot**, one of:
  - a free **Groq** API key (`https://console.groq.com`, no card) — the default
    provider, or
  - local **Ollama** running a tool-capable model (`ollama serve` with
    `llama3.1:8b` pulled) for a zero-key local setup, or
  - any **OpenAI-compatible** endpoint (key + base URL).

---

## 2. Environment file

Copy `.env.example` to `.env.local` and fill in real values. The full template,
reproduced verbatim with per-variable notes:

```bash
# ── Supabase (existing) ──
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
# Anon/publishable key (client-side, RLS-enforced). Note: the codebase reads this
# odd variable name in the browser client, middleware, and simulator.
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJ...anon...
# Also referenced by lib/supabase-server.ts and app/auth/callback (kept in sync):
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
# Direct Postgres connection string (used for running scripts/*.sql migrations)
POSTGRES_URL=postgres://...

# ── Server-only secrets (NEVER prefix with NEXT_PUBLIC_) ──
# Service role key — bypasses RLS for /api/jobs, /api/copilot, and the MCP server.
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...

# ── Agentic Dispatch Copilot (provider-neutral, OpenAI-compatible) ──
# Choose the LLM backend for /api/copilot. Default: groq (free tier).
LLM_PROVIDER=groq

# groq  → free key from https://console.groq.com (no card). Default model: llama-3.3-70b-versatile
GROQ_API_KEY=gsk_...

# ollama → set LLM_PROVIDER=ollama for a local, zero-key model (default: llama3.1:8b at :11434)
#   (no key needed; requires `ollama serve` running with a tool-capable model pulled)

# openai → set LLM_PROVIDER=openai and provide both of these for any OpenAI-compatible endpoint
# OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com/v1

# Optional: override the model for whichever provider is selected
# COPILOT_MODEL=llama-3.3-70b-versatile
```

### Variable reference

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client, server routes, MCP server, scripts | Public project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | browser client (`lib/supabase.ts`), middleware, simulator, and server-route fallback | The **anon** key. **Naming quirk:** the project carries *two* anon-key variables — set both to the same anon key. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase-server.ts`, `app/auth/callback/route.ts` (SSR/PKCE) | The same anon key under the conventional name. |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/jobs`, `/api/jobs/[id]`, `/api/copilot`, MCP server | **Server-only.** Bypasses RLS so server actions are not blocked by demo policies. Never expose to the browser. The `pickSupabaseKey` guard ignores a too-short placeholder and falls back to the anon key. |
| `POSTGRES_URL` | `scripts/*.sql` migrations via `scripts/apply-migrations.ts` | Direct Postgres connection (use the Supabase session pooler string). |
| `LLM_PROVIDER` | `/api/copilot` | Switch: `groq` (default) \| `ollama` \| `openai`. |
| `GROQ_API_KEY` | `/api/copilot` when provider=groq | Free key; required if provider is `groq`. |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | `/api/copilot` when provider=openai | Any OpenAI-compatible endpoint. |
| `COPILOT_MODEL` | `/api/copilot` | Optional model override; defaults per provider (`llama-3.3-70b-versatile` for groq, `llama3.1:8b` for ollama, `gpt-4o-mini` for openai). |

---

## 3. Database migration order

Apply the SQL in this exact order — either by pasting each file into the
**Supabase SQL editor**, or by running `scripts/apply-migrations.ts` over the
session-pooler `POSTGRES_URL`. The migrations after the base file are purely
additive (they only `CREATE … IF NOT EXISTS`), so they are safe on a live DB.

| # | File | What it does |
|---|---|---|
| 1 | `scripts/setup-supabase.sql` | Base schema setup: `pgcrypto`, converts `profiles.current_location` to `jsonb`, adds `profiles`/`jobs` columns, enables RLS + permissive demo policies, enables Realtime on `profiles`/`jobs`, seeds plumber profiles + demo jobs. |
| 2 | `scripts/0002_agentic_upgrade.sql` | **Additive** agentic layer: `skills`, `technician_skills`, `assignments`, `job_events`, indexes, demo RLS on the new tables, Realtime on `assignments`/`job_events`, and the 3 analytical views (`v_technician_utilization`, `v_job_response_times`, `v_sla_breaches`). |
| 3 | `scripts/0003_seed_skills.sql` | Seeds the skills catalog and maps each technician's specialty → a `technician_skills` row (idempotent). |
| 4 | `scripts/0004_grant_views.sql` | Grants `SELECT` on the 3 views to the `anon` / `authenticated` roles so the analytics page can read them. |

Then seed demonstration data:

```bash
npx tsx scripts/seedDemoData.ts
```

**Apply via the migration runner** (one file per argument, in order):

```bash
npx tsx scripts/apply-migrations.ts \
  scripts/setup-supabase.sql \
  scripts/0002_agentic_upgrade.sql \
  scripts/0003_seed_skills.sql \
  scripts/0004_grant_views.sql
```

> **Note — `handle_new_user` trigger & `create_customer` RPC:** the
> `handle_new_user` trigger function (auto-creates a `profiles` row on
> `auth.users` insert) lives in `scripts/handle_new_user.sql` and must be
> installed once (run the function + the commented `CREATE TRIGGER` block). The
> `create_customer(p_name, p_address) → uuid` RPC that `/api/jobs` calls must
> also exist in the database; create it in the Supabase SQL editor if your
> project does not already have it (see the data-model section of
> `03-technical-implementation-guide.md`).

---

## 4. Run commands

```bash
npm install            # install dependencies

npm run dev            # start the Next.js app (http://localhost:3000)

npm run mcp            # start the Fleet-Ops MCP server (stdio transport)

npm run simulate       # (optional) movement simulator: nudges technician GPS
                       #   positions so the live map animates

npm test               # run the vitest unit suite (scoring, analytics, audit,
                       #   supabase-key)
```

- The **copilot** (`/api/copilot`, surfaced by the on-page Copilot panel) needs
  `LLM_PROVIDER` set plus the matching credentials — e.g. `LLM_PROVIDER=groq`
  and `GROQ_API_KEY`, or `LLM_PROVIDER=ollama` with a local Ollama running.
- The **MCP server** reads `NEXT_PUBLIC_SUPABASE_URL` and a Supabase key
  (service-role preferred) from `.env.local`; wire it into an MCP client
  (e.g. Claude Desktop) using the `mcpServers` config shown in
  `03-technical-implementation-guide.md`.
