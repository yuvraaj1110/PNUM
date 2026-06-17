-- ════════════════════════════════════════════════════════════════════════
--  Lapras — Migration 0002: Agentic Fleet-Ops Upgrade (ADDITIVE / NON-DESTRUCTIVE)
-- ════════════════════════════════════════════════════════════════════════
--
--  This migration ONLY ADDS objects. It never drops or alters the existing
--  `profiles`, `jobs`, or `customers` tables, so it is safe to run against a
--  live database. It introduces:
--
--    • skills                — catalog of plumbing skills
--    • technician_skills     — many-to-many: which tech has which skill (+ proficiency)
--    • assignments           — first-class job↔technician assignment records (+ score)
--    • job_events            — append-only audit trail of everything that happens
--    • 3 analytical views    — utilization, response time, SLA breaches
--    • indexes               — for the query patterns the app + MCP tools use
--
--  Run:  psql "$POSTGRES_URL" -f scripts/0002_agentic_upgrade.sql
--        (or paste into the Supabase SQL editor)
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────
-- 1) skills — catalog (one row per distinct skill)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2) technician_skills — M:N between profiles (technicians) and skills
--    proficiency 1..5 lets the scorer prefer experts for hard jobs.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.technician_skills (
  technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id      uuid NOT NULL REFERENCES public.skills(id)    ON DELETE CASCADE,
  proficiency   int  NOT NULL DEFAULT 3 CHECK (proficiency BETWEEN 1 AND 5),
  PRIMARY KEY (technician_id, skill_id)
);

-- ─────────────────────────────────────────────────────────────
-- 3) assignments — first-class assignment record with the scorer's output
--    A job can have multiple historical assignments; the live one has
--    status in ('proposed','accepted','active').
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES public.jobs(id)     ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('proposed','accepted','active','completed','cancelled')),
  score         numeric,            -- 0..1 score from the assignment algorithm
  distance_km   numeric,            -- great-circle km at time of assignment
  assigned_by   text,               -- 'dispatcher' | 'copilot' | 'mcp' | <user>
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- 4) job_events — append-only audit log (powers analytics + trust)
--    event_type examples: 'created','assigned','reassigned','status_changed',
--    'completed','cancelled'. payload holds the diff / context as JSON.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  actor       text,                       -- who/what caused it
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 5) Indexes for the app + MCP query patterns
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_status            ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority          ON public.jobs(priority);
CREATE INDEX IF NOT EXISTS idx_assignments_job        ON public.assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tech       ON public.assignments(technician_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status     ON public.assignments(status);
CREATE INDEX IF NOT EXISTS idx_job_events_job_time    ON public.job_events(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tech_skills_skill      ON public.technician_skills(skill_id);

-- ─────────────────────────────────────────────────────────────
-- 6) RLS — enable + permissive demo policies (matches existing project style).
--    Tighten per-role for production (see RBAC appendix in the tech guide).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.skills            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['skills','technician_skills','assignments','job_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS demo_all_%1$s ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY demo_all_%1$s ON public.%1$s FOR ALL TO PUBLIC USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 7) Realtime — broadcast the new tables too
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.job_events;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 8) Analytical views — the "ask the right questions" deliverable.
--    These are the metrics a City operations manager cares about.
-- ─────────────────────────────────────────────────────────────

-- 8a) Technician utilization: how loaded is each tech right now + lifetime work.
CREATE OR REPLACE VIEW public.v_technician_utilization AS
SELECT
  p.id                                            AS technician_id,
  p.full_name,
  p.status,
  COUNT(a.id) FILTER (WHERE a.status = 'active')    AS active_jobs,
  COUNT(a.id) FILTER (WHERE a.status = 'completed') AS completed_jobs,
  -- simple utilization proxy: is the tech currently engaged?
  (COUNT(a.id) FILTER (WHERE a.status = 'active') > 0) AS is_busy
FROM public.profiles p
LEFT JOIN public.assignments a ON a.technician_id = p.id
WHERE p.role IN ('plumber','technician')
GROUP BY p.id, p.full_name, p.status;

-- 8b) Response time: minutes from job creation to its FIRST assignment.
CREATE OR REPLACE VIEW public.v_job_response_times AS
SELECT
  j.id                                                          AS job_id,
  j.title,
  j.priority,
  j.created_at,
  MIN(a.assigned_at)                                            AS first_assigned_at,
  EXTRACT(EPOCH FROM (MIN(a.assigned_at) - j.created_at)) / 60.0 AS response_minutes
FROM public.jobs j
LEFT JOIN public.assignments a ON a.job_id = j.id
GROUP BY j.id, j.title, j.priority, j.created_at;

-- 8c) SLA breaches: emergencies that took >15 min to assign, or are still
--     unassigned. SLA target is configurable; 15 min shown as the example.
CREATE OR REPLACE VIEW public.v_sla_breaches AS
SELECT
  r.job_id,
  r.title,
  r.priority,
  r.response_minutes,
  CASE
    WHEN r.first_assigned_at IS NULL THEN true                       -- never assigned
    WHEN r.priority = 'emergency' AND r.response_minutes > 15 THEN true
    WHEN r.priority = 'high'      AND r.response_minutes > 60 THEN true
    ELSE false
  END AS is_breach
FROM public.v_job_response_times r;

COMMIT;
