-- ════════════════════════════════════════════════════════════════════════
--  Lapras — Migration 0004: expose analytical views to the API roles
--  Views run with the owner's privileges (RLS-bypassing aggregates); the API
--  roles still need SELECT on the view objects themselves. Idempotent.
-- ════════════════════════════════════════════════════════════════════════
BEGIN;

GRANT SELECT ON public.v_technician_utilization TO anon, authenticated;
GRANT SELECT ON public.v_job_response_times     TO anon, authenticated;
GRANT SELECT ON public.v_sla_breaches           TO anon, authenticated;

COMMIT;
