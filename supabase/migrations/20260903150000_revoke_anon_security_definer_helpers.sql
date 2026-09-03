-- Sprint S (2026-09-03): los helpers SECURITY DEFINER no deben ser invocables
-- por usuarios anónimos vía /rest/v1/rpc. Solo los usa RLS (rol authenticated)
-- y el service role. Hallazgo del linter de Supabase (0028).
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_catalog_org(uuid) FROM anon, public;
