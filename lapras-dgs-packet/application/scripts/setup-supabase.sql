BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0) Safety: ensure needed extensions exist (for gen_random_uuid)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1) Drop all existing RLS policies on profiles & jobs
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','jobs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2) Convert profiles.current_location geography -> jsonb
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='profiles'
      AND column_name='current_location'
      AND udt_name='geography'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN current_location TYPE jsonb
      USING (
        CASE
          WHEN public.ST_AsText(current_location) IS NOT NULL THEN
            jsonb_build_object(
              'lat', (split_part(replace(replace(public.ST_AsText(current_location),'POINT(','') ,')',''), ' ', 1))::float8,
              'lng', (split_part(replace(replace(public.ST_AsText(current_location),'POINT(','') ,')',''), ' ', 2))::float8
            )
          ELSE
            '{"lat":45.5052,"lng":-122.6784}'::jsonb
        END
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3) Add missing columns to profiles
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS specialty TEXT;

-- ─────────────────────────────────────────────────────────────
-- 4) Add missing columns to jobs
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS lat float8;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS lng float8;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS date TEXT;

-- ─────────────────────────────────────────────────────────────
-- 5) Enable RLS + recreate simple demo policies
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demo_profiles_select" ON public.profiles FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "demo_profiles_update" ON public.profiles FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY "demo_profiles_insert" ON public.profiles FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY "demo_jobs_select" ON public.jobs FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "demo_jobs_update" ON public.jobs FOR UPDATE TO PUBLIC USING (true);
CREATE POLICY "demo_jobs_insert" ON public.jobs FOR INSERT TO PUBLIC WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 6) Enable Realtime
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 7) Insert plumber profiles
--    role CHECK: ('admin','plumber')
--    status CHECK: ('active','busy','offline')
-- ─────────────────────────────────────────────────────────────
-- Uses seed_demo_plumber (defined in 0000_base_schema.sql) so each profile
-- gets a backing auth.users row first — profiles.id → auth.users(id) FK.
SELECT public.seed_demo_plumber('Tony Russo',  '{"lat":45.4210,"lng":-122.6710}'::jsonb, '(503) 555-0103', 'Drain Cleaning');
SELECT public.seed_demo_plumber('Alex Rivera', '{"lat":45.4875,"lng":-122.8040}'::jsonb, '(503) 555-0104', 'Pipe Fitting');
SELECT public.seed_demo_plumber('Jake Morris', '{"lat":45.5320,"lng":-122.7100}'::jsonb, '(503) 555-0105', 'Residential');

-- Update existing plumbers with map data
UPDATE public.profiles SET
  status = 'active',
  current_location = '{"lat":45.5230,"lng":-122.6820}'::jsonb,
  phone = '(503) 555-0101',
  specialty = 'Water Heaters'
WHERE full_name = 'Master Mario';

UPDATE public.profiles SET
  status = 'active',
  current_location = '{"lat":45.4950,"lng":-122.6350}'::jsonb,
  phone = '(503) 555-0102',
  specialty = 'Emergency Repair'
WHERE full_name = 'Junior Luigi';

-- ─────────────────────────────────────────────────────────────
-- 8) Update existing job
--    status CHECK: ('pending','assigned','in_progress','completed')
--    priority CHECK: ('low','medium','high','emergency')
-- ─────────────────────────────────────────────────────────────
UPDATE public.jobs SET
  lat = 45.5180, lng = -122.6750,
  customer_name = 'Sarah Mitchell',
  address = '142 Oak Street, Suite 8',
  date = 'Mar 27, 2026',
  priority = 'emergency',
  status = 'pending'
WHERE title = 'Basement Flooding';

-- ─────────────────────────────────────────────────────────────
-- 9) Insert 5 new demo jobs (customer_id NOT NULL → use existing customer)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_customer_id uuid;
BEGIN
  SELECT id INTO v_customer_id
  FROM public.customers
  ORDER BY created_at DESC NULLS LAST, id
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'No customers exist. Insert into public.customers first.';
  END IF;

  INSERT INTO public.jobs
    (id, customer_id, title, customer_name, address, lat, lng, status, priority, date, description)
  VALUES
    (gen_random_uuid(), v_customer_id, 'Water Heater Replacement', 'James Rodriguez', '890 Pine Avenue, Apt 3',       45.5100, -122.6900, 'in_progress', 'high',      'Mar 27, 2026', 'Replace 40-gal tank water heater'),
    (gen_random_uuid(), v_customer_id, 'Kitchen Faucet Install',    'Emily Chen',      '2450 Willow Creek Dr',         45.5050, -122.7200, 'pending',     'medium',    'Mar 28, 2026', 'Install new kitchen faucet'),
    (gen_random_uuid(), v_customer_id, 'Pipe Burst - Emergency',    'David Thompson',  '78 Riverdale Rd, Beaverton',   45.4900, -122.7900, 'in_progress', 'emergency', 'Mar 27, 2026', 'Burst pipe in main line'),
    (gen_random_uuid(), v_customer_id, 'Toilet Repair',             'Lisa Park',       '3320 Maple Lane, Lake Oswego', 45.4250, -122.6750, 'completed',   'low',       'Mar 26, 2026', 'Running toilet repair'),
    (gen_random_uuid(), v_customer_id, 'Drain Cleaning - Main Line','Robert Kim',      '567 Cedar Blvd, Tigard',       45.4350, -122.7700, 'pending',     'high',      'Mar 28, 2026', 'Slow drain main sewer line');
END $$;

COMMIT;
