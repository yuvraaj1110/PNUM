-- ════════════════════════════════════════════════════════════════════════
--  Lapras — Seed 0003: Skills catalog + technician_skills mapping
--  Run AFTER 0002_agentic_upgrade.sql. Idempotent.
-- ════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1) Skill catalog (matches the specialties seeded in setup-supabase.sql + extras)
INSERT INTO public.skills (name) VALUES
  ('Water Heaters'),
  ('Emergency Repair'),
  ('Drain Cleaning'),
  ('Pipe Fitting'),
  ('Residential'),
  ('Leak Detection'),
  ('Sewer')
ON CONFLICT (name) DO NOTHING;

-- 2) Map each technician's primary specialty → a skill row (proficiency 5 = expert).
--    Derives directly from profiles.specialty so no hand-maintained IDs are needed.
INSERT INTO public.technician_skills (technician_id, skill_id, proficiency)
SELECT p.id, s.id, 5
FROM public.profiles p
JOIN public.skills s ON s.name = p.specialty
WHERE p.specialty IS NOT NULL
ON CONFLICT (technician_id, skill_id) DO NOTHING;

-- 3) Give every active technician a baseline 'Emergency Repair' competency
--    (proficiency 2) so an emergency can always be covered.
INSERT INTO public.technician_skills (technician_id, skill_id, proficiency)
SELECT p.id, s.id, 2
FROM public.profiles p
CROSS JOIN public.skills s
WHERE s.name = 'Emergency Repair'
  AND p.role IN ('plumber','technician')
ON CONFLICT (technician_id, skill_id) DO NOTHING;

COMMIT;
