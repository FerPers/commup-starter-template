-- A17: borra el proyecto de referencia REF-5K de la BD LOCAL (seed-reference.sql). Sin triggers (las guardas de
-- borrado de ITR firmados y certificados no aplican a un banco desechable); con `replica` tampoco corren las
-- cascadas de las llaves foráneas, así que se borra explícitamente todo lo que cuelga del proyecto y de la org.
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL session_replication_role = replica;
DO $$
DECLARE o uuid := '5e0f5000-0000-4000-8000-000000000001'; p uuid := '5e0f5000-0000-4000-8000-000000000002'; r record;
BEGIN
  FOR r IN SELECT c.table_schema s, c.table_name t, c.column_name col FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
           WHERE c.table_schema = 'public' AND c.column_name IN ('itr_id', 'tag_id', 'template_id', 'subsystem_id', 'system_id', 'punch_id', 'certificate_id')
             AND c.table_name NOT IN ('itrs', 'tags', 'itr_templates', 'subsystems', 'systems', 'punches', 'certificates') LOOP
    EXECUTE format('DELETE FROM %I.%I WHERE %I IN (%s)', r.s, r.t, r.col, CASE r.col
      WHEN 'itr_id' THEN format('SELECT id FROM itrs WHERE project_id = %L', p)
      WHEN 'tag_id' THEN format('SELECT id FROM tags WHERE project_id = %L', p)
      WHEN 'template_id' THEN format('SELECT id FROM itr_templates WHERE org_id = %L', o)
      WHEN 'subsystem_id' THEN format('SELECT id FROM subsystems WHERE project_id = %L', p)
      WHEN 'system_id' THEN format('SELECT id FROM systems WHERE project_id = %L', p)
      WHEN 'punch_id' THEN format('SELECT id FROM punches WHERE project_id = %L', p)
      ELSE format('SELECT id FROM certificates WHERE project_id = %L', p) END);
  END LOOP;
  FOR r IN SELECT c.table_name t, c.column_name col FROM information_schema.columns c
           JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
           WHERE c.table_schema = 'public' AND c.column_name IN ('project_id', 'org_id') AND c.table_name NOT IN ('projects', 'organizations') LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I = %L', r.t, r.col, CASE r.col WHEN 'project_id' THEN p ELSE o END);
  END LOOP;
  DELETE FROM projects WHERE id = p;
  DELETE FROM organizations WHERE id = o;
END $$;
COMMIT;
