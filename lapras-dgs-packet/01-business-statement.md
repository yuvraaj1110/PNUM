# Lapras — Business Statement

**Yuvraaj Suri** · suriy@purdue.edu · linkedin.com/in/yuvraajsuri · github.com/yuvraaj1110

> Note on class year: I am a Purdue CS undergraduate on track to graduate **May 2028** — not yet a senior. The posting asks for a senior undergraduate or graduate student; I flag this plainly so reviewers can decide.

---

## Problem

A plumbing dispatch center runs on urgency. When a pipe bursts, every minute of
unassigned time is water damage. The dispatcher must simultaneously:

- Track live technician locations across a metro service area.
- Receive and triage inbound job requests by priority (low, medium, high, emergency).
- Identify the closest, available, skill-matched technician for each job — often
  under three concurrent emergencies.
- Communicate assignments, update job status, and maintain an audit record.

Today these tasks are typically split across a map tool, a spreadsheet or paper
log, phone/radio, and tribal knowledge. The gap produces assignment delays and
missed SLAs — on emergency jobs, that gap is measured in water damage.

---

## What Lapras Does

Lapras is a real-time fleet-dispatch platform that consolidates the dispatcher's
entire workflow into one screen. Each feature below is grounded in the actual
source file that implements it.

| Feature | Source |
|---|---|
| **Live fleet map** — animated technician markers update in real time as the movement simulator writes GPS coordinates to the database; job pins show priority by color | `components/FleetMapClient.tsx`, `components/MiniMapWidget.tsx`, `hooks/useFleetSubscription.ts` |
| **Real-time job board** — a Supabase Realtime subscription prepends new jobs to the dashboard the moment they are inserted; status changes propagate without a page refresh | `app/page.tsx` (channel `dashboard-jobs`) |
| **One-click job intake** — modal form captures customer name, address, description, and priority; creates the customer record via a Postgres RPC and inserts the job in a single API call | `components/CreateJobModal.tsx`, `app/api/jobs/route.ts` |
| **Proximity dispatch view** — dedicated fleet page shows all active technicians, ranked by distance to a selected job; dispatcher can dispatch directly | `app/fleet/page.tsx` |
| **Agentic dispatch copilot** — dispatcher types a natural-language question ("who should take the emergency on 5th St?"); the copilot calls `find_nearest_available_tech`, explains the ranking, and proposes an assignment; the dispatcher must explicitly approve before `assign_job` writes anything | `components/CopilotPanel.tsx`, `app/api/copilot/route.ts` |
| **Analytics dashboard** — KPI cards and Recharts visualizations over three SQL views; updates live via a Realtime subscription | `app/analytics/page.tsx`, `lib/analytics.ts` |
| **Per-job detail and audit timeline** — every status change, assignment, and creation is logged to `job_events`; the detail page renders a chronological audit trail | `app/jobs/[id]/`, `components/ActivityFeed.tsx`, `lib/audit.ts` |
| **MCP server** — the same five fleet-ops tools available to the copilot are exposed as a standalone MCP server so any MCP client (Claude Desktop, Claude Code) can query and dispatch against the live fleet | `mcp-server/index.ts`, `lib/fleet-tools.ts` |

---

## Business Value

**Qualitative benefits:**

- Faster dispatch decisions: the copilot surfaces the best-fit technician in
  seconds, with a ranked explanation, instead of requiring the dispatcher to
  mentally query a map and a roster simultaneously.
- Single source of truth: one Postgres database backs the map, the job board,
  the copilot, the MCP server, and the analytics dashboard simultaneously —
  no stale copies.
- Prioritization enforcement: emergency jobs are scored with a heavy distance
  weight (0.55) so the system naturally surfaces the closest available
  technician regardless of other factors.
- Low operational overhead: the agentic layer (copilot + MCP) requires no
  additional infrastructure — it runs as a Next.js API route and a stdio
  process, both reading the same Supabase project.

**KPI definitions** — the system computes these from the `assignments` and `jobs`
tables; they are defined below as *what the system measures*. Any figures
displayed in the analytics dashboard are **illustrative, from seeded demo data**,
not real production metrics.

| KPI | Definition |
|---|---|
| **Average response time** | `EXTRACT(EPOCH FROM (MIN(assignment.assigned_at) - job.created_at)) / 60` — minutes from job creation to the first assignment record. Sourced from `v_job_response_times`. |
| **SLA-breach rate** | Percentage of jobs where `first_assigned_at IS NULL`, OR `priority = 'emergency'` AND response time > 15 min, OR `priority = 'high'` AND response time > 60 min. Sourced from `v_sla_breaches`. |
| **Technician utilization** | Per technician: count of `assignments` with `status = 'active'` (active jobs) and `status = 'completed'` (finished jobs). Sourced from `v_technician_utilization`. |

---

## Status

Lapras is reported to be **in commercial use per the project owner**. This claim
is attributed to the owner; the docs do not independently verify it. The public
repository ships with seeded demo data and a GPS movement simulator
(`scripts/simulateMovement.ts`, `npm run simulate`) so reviewers can exercise the
full feature set — including live map animation, the copilot, and the analytics
views — without requiring a production deployment.

---

## Role-Fit Table

| Requirement | Concrete artifact |
|---|---|
| **Web framework (Next.js / React)** | Next.js 15.1.4 App Router; React 19 client components; dynamic imports (`ssr:false`) for Leaflet and Recharts; `@supabase/ssr` middleware for server-side auth. |
| **Relational database (Postgres / SQL)** | Seven tables, four SQL migrations, three analytical views, two triggers/RPCs, indexed foreign keys, `job_events` append-only audit log — all in Supabase Postgres. |
| **API and MCP contracts** | Four Next.js route handlers (`POST /api/jobs`, `PATCH /api/jobs/[id]`, `POST /api/copilot`, `GET /auth/callback`); a five-tool MCP server (`mcp-server/index.ts`) over stdio. |
| **Business and domain sense** | SLA definitions built into SQL views; priority weights tuned to dispatch semantics (emergency: distance 0.55, skill 0.15); human-in-the-loop gate on the one write tool. |
| **Agentic tooling (hands-on)** | The MCP server, `lib/fleet-ops` core, TDD'd scoring algorithm, copilot route, and analytics layer were all built and refactored using Claude Code as the agentic coding environment. |
