-- ════════════════════════════════════════════════════════════════════════
--  Lapras — Migration 0000: Base schema (profiles, customers, jobs)
-- ════════════════════════════════════════════════════════════════════════
--
--  Run FIRST on a fresh Supabase project, before setup-supabase.sql.
--  Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE OR REPLACE.
--
--  Run:  psql "$POSTGRES_URL" -f scripts/0000_base_schema.sql
--        (or paste into the Supabase SQL editor)
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1) profiles — technicians and dispatchers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name         text,
  role              text NOT NULL DEFAULT 'Dispatcher',
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'busy', 'offline')),
  current_location  jsonb,
  phone             text,
  specialty         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2) customers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  address       text,
  location      geography,
  "Phone number" bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 3) jobs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES public.customers(id),
  title                 text,
  description           text,
  category              text,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed')),
  priority              text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
  assigned_plumber_id   uuid REFERENCES public.profiles(id),
  lat                   float8,
  lng                   float8,
  date                  text,
  customer_name         text,
  address               text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_plumber_id ON public.jobs(assigned_plumber_id);

-- ─────────────────────────────────────────────────────────────
-- 4) create_customer RPC — used by POST /api/jobs
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_customer(p_name text, p_address text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.customers (name, address)
  VALUES (p_name, p_address)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer(text, text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) handle_new_user — auto-create profile on auth signup
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, created_at, updated_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New Dispatcher'),
    'Dispatcher',
    now(),
    now()
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 6) Seed a demo customer (required by setup-supabase.sql job inserts)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.customers (id, name, address)
VALUES ('c0000000-0000-4000-8000-000000000001', 'Lapras Demo Customer', 'Portland, OR')
ON CONFLICT (id) DO NOTHING;

-- Seed legacy plumber names referenced by setup-supabase.sql UPDATEs
INSERT INTO public.profiles (id, full_name, role, status, current_location, phone, specialty)
SELECT gen_random_uuid(), v.full_name, 'plumber', 'active', v.loc::jsonb, v.phone, v.specialty
FROM (VALUES
  ('Master Mario',  '{"lat":45.5230,"lng":-122.6820}', '(503) 555-0101', 'Water Heaters'),
  ('Junior Luigi',  '{"lat":45.4950,"lng":-122.6350}', '(503) 555-0102', 'Emergency Repair')
) AS v(full_name, loc, phone, specialty)
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.full_name = v.full_name
);

-- Seed the job referenced by setup-supabase.sql UPDATE
INSERT INTO public.jobs (customer_id, title, status, priority)
SELECT 'c0000000-0000-4000-8000-000000000001', 'Basement Flooding', 'pending', 'emergency'
WHERE NOT EXISTS (SELECT 1 FROM public.jobs WHERE title = 'Basement Flooding');

COMMIT;
