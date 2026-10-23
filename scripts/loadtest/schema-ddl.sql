-- Esquema `public` de prod como DDL ordenado (una fila por sentencia: tipos, tablas, funciones, vistas, defaults,
-- restricciones, índices, triggers, RLS y políticas), leído SOLO del catálogo. Para clonar el esquema en un proyecto
-- aparte donde sembrar el banco: las migraciones del repo no reproducen prod (2026-10-22: funciones y columnas
-- creadas fuera de migraciones), y `supabase db dump` necesita Docker.
-- Uso: supabase db query --linked -o json -f scripts/loadtest/schema-ddl.sql > /tmp/ddl.json   (lectura en prod)
--      node scripts/loadtest/apply-ddl.mjs /tmp/ddl.json <dir-enlazado-al-proyecto-de-bench>
WITH rel AS (
  SELECT c.oid, c.relname, c.relkind, c.relispartition, c.relrowsecurity, c.relforcerowsecurity, c.reloptions
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
)
SELECT ord, stmt FROM (
  SELECT 10 AS ord, 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public' AS stmt
  UNION ALL
  SELECT 20, format('CREATE TYPE public.%I AS ENUM (%s)', t.typname,
         (SELECT string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid))
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype = 'e' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
  UNION ALL
  SELECT 30, format('CREATE SEQUENCE public.%I START %s INCREMENT %s', r.relname, s.seqstart, s.seqincrement)
  FROM rel r JOIN pg_sequence s ON s.seqrelid = r.oid
  WHERE r.relkind = 'S' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = r.oid AND d.deptype = 'i')
  UNION ALL
  SELECT 40, format('CREATE TABLE public.%I (%s)%s', r.relname,
         COALESCE((SELECT string_agg(format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                        CASE WHEN a.attidentity IN ('a','d') THEN ' GENERATED ' || CASE a.attidentity WHEN 'a' THEN 'ALWAYS' ELSE 'BY DEFAULT' END || ' AS IDENTITY' ELSE '' END,
                        CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END), ', ' ORDER BY a.attnum)
                   FROM pg_attribute a WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''), ''),
         CASE WHEN r.relkind = 'p' THEN ' PARTITION BY ' || pg_get_partkeydef(r.oid) ELSE '' END)
  FROM rel r WHERE r.relkind IN ('r', 'p') AND NOT r.relispartition
  UNION ALL
  SELECT 41, format('ALTER TABLE public.%I ADD COLUMN %I %s GENERATED ALWAYS AS (%s) STORED', r.relname, a.attname,
         format_type(a.atttypid, a.atttypmod), pg_get_expr(ad.adbin, ad.adrelid))
  FROM rel r JOIN pg_attribute a ON a.attrelid = r.oid JOIN pg_attrdef ad ON ad.adrelid = r.oid AND ad.adnum = a.attnum
  WHERE r.relkind IN ('r', 'p') AND NOT r.relispartition AND a.attgenerated = 's'
  UNION ALL
  SELECT 45, format('CREATE TABLE public.%I PARTITION OF public.%I %s', r.relname, pc.relname, pg_get_expr(c.relpartbound, c.oid))
  FROM rel r JOIN pg_class c ON c.oid = r.oid JOIN pg_inherits i ON i.inhrelid = r.oid JOIN pg_class pc ON pc.oid = i.inhparent
  WHERE r.relispartition AND r.relkind = 'r'
  UNION ALL
  SELECT 50, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  UNION ALL
  SELECT 60, format('CREATE VIEW public.%I%s AS %s', r.relname,
         CASE WHEN r.reloptions IS NOT NULL THEN ' WITH (' || array_to_string(r.reloptions, ', ') || ')' ELSE '' END,
         rtrim(pg_get_viewdef(r.oid), ';'))
  FROM rel r WHERE r.relkind = 'v'
  UNION ALL
  SELECT 70, format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s', r.relname, a.attname, pg_get_expr(ad.adbin, ad.adrelid))
  FROM rel r JOIN pg_attribute a ON a.attrelid = r.oid JOIN pg_attrdef ad ON ad.adrelid = r.oid AND ad.adnum = a.attnum
  WHERE r.relkind IN ('r', 'p') AND NOT r.relispartition AND a.attgenerated = '' AND a.attidentity = ''
  UNION ALL
  SELECT CASE con.contype WHEN 'p' THEN 80 WHEN 'u' THEN 81 WHEN 'x' THEN 81 WHEN 'c' THEN 82 ELSE 85 END,
         format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', r.relname, con.conname, pg_get_constraintdef(con.oid))
  FROM rel r JOIN pg_constraint con ON con.conrelid = r.oid
  WHERE r.relkind IN ('r', 'p') AND NOT r.relispartition AND con.contype IN ('p', 'u', 'c', 'f', 'x') AND con.conislocal
  UNION ALL
  SELECT 90, pg_get_indexdef(ix.indexrelid)
  FROM pg_index ix JOIN rel r ON r.oid = ix.indrelid
  WHERE NOT r.relispartition AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = ix.indexrelid AND con.contype IN ('p', 'u', 'x'))
    AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = ix.indexrelid)
  UNION ALL
  SELECT 100, pg_get_triggerdef(t.oid)
  FROM pg_trigger t JOIN rel r ON r.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND t.tgparentid = 0
  UNION ALL
  SELECT 101, format('ALTER TABLE public.%I DISABLE TRIGGER %I', r.relname, t.tgname)
  FROM pg_trigger t JOIN rel r ON r.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND t.tgparentid = 0 AND t.tgenabled = 'D'
  UNION ALL
  SELECT 110, format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname) FROM rel r WHERE r.relrowsecurity AND r.relkind IN ('r', 'p')
  UNION ALL
  SELECT 120, format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s', p.policyname, p.tablename, p.permissive, p.cmd,
         array_to_string(p.roles, ', '),
         CASE WHEN p.qual IS NOT NULL THEN ' USING (' || p.qual || ')' ELSE '' END,
         CASE WHEN p.with_check IS NOT NULL THEN ' WITH CHECK (' || p.with_check || ')' ELSE '' END)
  FROM pg_policies p WHERE p.schemaname = 'public'
) x ORDER BY ord;
