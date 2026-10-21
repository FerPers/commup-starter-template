-- S20 — mide en la BD lo que piden las pantallas sobre el banco LOADTEST (seed.sql), como el usuario del banco y con
-- RLS (SET ROLE authenticated + claims). 5 corridas por consulta; informa mín / mediana / máx en ms (con 5 muestras el
-- máx es la cota del p95). No escribe nada (ROLLBACK al final). Las funciones que devuelven un solo valor van
-- dentro de length(): con count(*) Postgres no las evalúa (S20 sesión 2: my_work_counts salía en 0 ms).
-- Uso: supabase db query --linked -o table -f scripts/loadtest/bench.sql
BEGIN;
SET LOCAL statement_timeout = 0;
CREATE TEMP TABLE _bench (label text, run int, ms numeric);
GRANT ALL ON _bench TO authenticated;
DO $b$
DECLARE
  v_user uuid := '41d8f81c-28f9-458c-af3f-b754795b2c52';
  v_org uuid := '10ad7e57-0000-4000-8000-000000000001';
  v_proj uuid := '10ad7e57-0000-4000-8000-000000000002';
  t0 timestamptz; i int; q record; v_dummy bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR q IN SELECT * FROM (VALUES
    ('control_tower.compute_project_readiness', format('SELECT count(*) FROM (SELECT public.compute_project_readiness(%L)) x', v_proj)),
    ('control_tower.compute_project_gates', format('SELECT count(*) FROM (SELECT public.compute_project_gates(%L)) x', v_proj)),
    ('control_tower.compute_project_progress', format('SELECT count(*) FROM (SELECT public.compute_project_progress(%L)) x', v_proj)),
    ('layout.my_work_counts', format('SELECT length(public.my_work_counts(%L)::text)', v_org)),
    ('layout.punch_cat_a_count', format('SELECT count(*) FROM punches WHERE project_id = %L AND category = ''A'' AND status IN (''open'', ''in_progress'')', v_proj)),
    ('itr_list.page', format('SELECT count(*) FROM (SELECT id FROM itr_list_v WHERE org_id = %L AND project_id = %L ORDER BY created_at DESC, id LIMIT 50) x', v_org, v_proj)),
    ('itr_list.count', format('SELECT count(*) FROM itr_list_v WHERE org_id = %L AND project_id = %L', v_org, v_proj)),
    ('itr_list.mine', format('SELECT count(*) FROM itr_list_v WHERE org_id = %L AND project_id = %L AND assignee_ids @> ARRAY[%L]::uuid[]', v_org, v_proj, v_user)),
    ('itr_list.status_counts', format('SELECT count(*) FROM public.itr_status_counts(%L, NULL)', v_proj)),
    ('certificates.subsystem_rollup', format('SELECT count(*) FROM public.subsystem_rollup(%L)', v_proj)),
    -- S20 sesión 2 (B-06): políticas set-based en tablas hijas
    ('rls.punch_attachments', 'SELECT count(*) FROM punch_attachments'),
    ('rls.work_plan_items', 'SELECT count(*) FROM work_plan_items'),
    ('itr_generation_summary', format('SELECT length(public.itr_generation_summary(%L, (SELECT array_agg(id) FROM project_phases WHERE org_id = %L))::text)', v_proj, v_org))
  ) v(label, sql) LOOP
    FOR i IN 1..5 LOOP
      t0 := clock_timestamp();
      EXECUTE q.sql INTO v_dummy;
      INSERT INTO _bench VALUES (q.label, i, round(extract(epoch FROM clock_timestamp() - t0)::numeric * 1000, 1));
    END LOOP;
  END LOOP;
  EXECUTE 'RESET ROLE';
END $b$;
SELECT label, min(ms) AS min_ms, percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS median_ms, max(ms) AS max_ms
FROM _bench GROUP BY label ORDER BY max(ms) DESC;
ROLLBACK;
