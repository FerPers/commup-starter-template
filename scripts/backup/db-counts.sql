-- A14: huella de la BD para verificar una restauración: filas por tabla (public, auth, storage), jobs de pg_cron
-- (no viajan en el volcado y se vuelven a programar al restaurar), funciones de public y última migración.
SELECT jsonb_build_object(
  'taken_at', now(),
  'tables', (SELECT jsonb_object_agg(format('%I.%I', table_schema, table_name),
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint)
    FROM information_schema.tables WHERE table_schema IN ('public', 'auth', 'storage') AND table_type = 'BASE TABLE'),
  'cron_jobs', (SELECT COALESCE(jsonb_agg(jsonb_build_object('jobname', jobname, 'schedule', schedule, 'command', command) ORDER BY jobname), '[]'::jsonb) FROM cron.job),
  'public_functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'),
  'last_migration', (SELECT max(version) FROM supabase_migrations.schema_migrations)
) AS counts;
