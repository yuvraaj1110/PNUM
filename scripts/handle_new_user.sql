-- Reviewing the handle_new_user trigger function for profiles table
-- Based on the requirement that full_name, role, created_at, and updated_at are required.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, created_at, updated_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New Dispatcher'), -- Default value if meta_data is missing
    'Dispatcher', -- Default role
    now(), -- created_at
    now()  -- updated_at
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- To ensure the trigger is correctly applied:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
