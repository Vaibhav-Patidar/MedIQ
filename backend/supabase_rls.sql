-- Supabase hardening: enable Row Level Security (deny-all) on every MedIQ table.
--
-- WHY: the FastAPI backend connects as the table owner, which bypasses RLS —
-- so this changes nothing for the app. It exists to lock down Supabase's
-- auto-generated Data API (/rest/v1), which would otherwise expose all patient
-- tables to anyone holding the anon key.
--
-- Run once in Supabase → SQL Editor, and again after adding new tables.
-- Authorization itself stays in FastAPI (docs/08-security-spec.md §4).
--
-- Verify afterwards:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Belt & braces: strip Data-API roles' grants as well
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
