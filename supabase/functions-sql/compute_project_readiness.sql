-- fn: public.compute_project_readiness(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_project_readiness(p_project_id uuid)
 RETURNS TABLE(system_id uuid, system_code text, system_name text, area_code text, area_name text, itr_total integer, itr_approved integer, itr_pct numeric, open_punches_a integer, open_punches_b integer, open_punches_c integer, cat_b_limit integer, gates jsonb, blockers jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE v_org uuid; v_limit integer;
BEGIN
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = p_project_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  v_limit := public.org_cat_b_limit(v_org);

  RETURN QUERY
  WITH sys AS (
    SELECT s.id, s.code, s.name, a.code AS acode, a.name AS aname
    FROM systems s JOIN areas a ON a.id = s.area_id
    WHERE s.project_id = p_project_id
  ),
  ss AS (SELECT x.id, x.system_id FROM subsystems x JOIN sys ON sys.id = x.system_id),
  ph AS (SELECT f.id, f.code, f.name, f.certificate_name, f.order_index FROM project_phases f WHERE f.org_id = v_org),
  pun AS (  -- punch abiertos por subsistema (= system_phase_level: no dependen de la fase)
    SELECT p.subsystem_id,
           COUNT(*) FILTER (WHERE p.category = 'A') AS a,
           COUNT(*) FILTER (WHERE p.category = 'B') AS b,
           COUNT(*) FILTER (WHERE p.category = 'C') AS c
    FROM punches p JOIN ss ON ss.id = p.subsystem_id
    WHERE p.status IN ('open', 'in_progress')
    GROUP BY p.subsystem_id
  ),
  it AS (   -- ITR por subsistema × fase
    SELECT i.subsystem_id, i.phase_id, COUNT(*) AS t, COUNT(*) FILTER (WHERE i.status = 'approved') AS ap
    FROM itrs i JOIN ss ON ss.id = i.subsystem_id
    GROUP BY i.subsystem_id, i.phase_id
  ),
  lvl AS (  -- nivel de cada subsistema en cada fase (= system_phase_level)
    SELECT ss.system_id, ph.id AS phase_id, COALESCE(it.t, 0) AS t, COALESCE(it.ap, 0) AS ap,
           CASE WHEN COALESCE(pun.a, 0) > 0 OR COALESCE(it.t, 0) = 0 OR COALESCE(it.ap, 0) < COALESCE(it.t, 0)
                  OR (v_limit IS NOT NULL AND COALESCE(pun.b, 0) > v_limit) THEN 'red'
                WHEN COALESCE(pun.b, 0) > 0 THEN 'yellow'
                ELSE 'green' END AS level
    FROM ss CROSS JOIN ph
    LEFT JOIN it ON it.subsystem_id = ss.id AND it.phase_id = ph.id
    LEFT JOIN pun ON pun.subsystem_id = ss.id
  ),
  sp AS (
    SELECT lvl.system_id, lvl.phase_id, COUNT(*) AS n,
           COUNT(*) FILTER (WHERE lvl.level = 'red') AS red, COUNT(*) FILTER (WHERE lvl.level = 'yellow') AS yel,
           SUM(lvl.t) AS t, SUM(lvl.ap) AS ap
    FROM lvl GROUP BY lvl.system_id, lvl.phase_id
  ),
  gj AS (
    SELECT sys.id AS system_id,
           COALESCE(jsonb_agg(jsonb_build_object(
             'phase_id', ph.id, 'code', ph.code, 'name', ph.name,
             'certificate', COALESCE(ph.certificate_name, ph.code), 'order', ph.order_index,
             'itr_total', COALESCE(sp.t, 0)::int, 'itr_approved', COALESCE(sp.ap, 0)::int,
             'subsystems_total', COALESCE(sp.n, 0)::int, 'subsystems_red', COALESCE(sp.red, 0)::int,
             'subsystems_yellow', COALESCE(sp.yel, 0)::int,
             'level', CASE WHEN COALESCE(sp.n, 0) = 0 OR sp.red > 0 THEN 'red' WHEN sp.yel > 0 THEN 'yellow' ELSE 'green' END,
             'ready', NOT (COALESCE(sp.n, 0) = 0 OR sp.red > 0)
           ) ORDER BY ph.order_index) FILTER (WHERE ph.id IS NOT NULL), '[]'::jsonb) AS g
    FROM sys CROSS JOIN ph LEFT JOIN sp ON sp.system_id = sys.id AND sp.phase_id = ph.id
    GROUP BY sys.id
  ),
  ss_tot AS (SELECT ss.system_id, COUNT(*) AS n_ss FROM ss GROUP BY ss.system_id),
  it_tot AS (SELECT ss.system_id, SUM(it.t) AS t, SUM(it.ap) AS ap FROM it JOIN ss ON ss.id = it.subsystem_id GROUP BY ss.system_id),
  pun_tot AS (
    SELECT ss.system_id, SUM(pun.a) AS a, SUM(pun.b) AS b, SUM(pun.c) AS c,
           COUNT(*) FILTER (WHERE v_limit IS NOT NULL AND pun.b > v_limit) AS b_over
    FROM pun JOIN ss ON ss.id = pun.subsystem_id GROUP BY ss.system_id
  ),
  tot AS (
    SELECT sys.id AS system_id, COALESCE(ss_tot.n_ss, 0)::int AS n_ss,
           COALESCE(it_tot.t, 0)::int AS t, COALESCE(it_tot.ap, 0)::int AS ap,
           COALESCE(pun_tot.a, 0)::int AS a, COALESCE(pun_tot.b, 0)::int AS b, COALESCE(pun_tot.c, 0)::int AS c,
           COALESCE(pun_tot.b_over, 0)::int AS b_over
    FROM sys
    LEFT JOIN ss_tot ON ss_tot.system_id = sys.id
    LEFT JOIN it_tot ON it_tot.system_id = sys.id
    LEFT JOIN pun_tot ON pun_tot.system_id = sys.id
  ),
  r AS (
    SELECT tot.*, CASE WHEN tot.t > 0 THEN ROUND((tot.ap::numeric / tot.t) * 100, 2) ELSE 0 END AS pct FROM tot
  )
  SELECT sys.id, sys.code, sys.name, sys.acode, sys.aname, r.t, r.ap, r.pct, r.a, r.b, r.c, v_limit, gj.g,
         (  -- = compute_system_readiness: mismos códigos, severidad y orden
           CASE WHEN r.n_ss = 0 THEN jsonb_build_array(jsonb_build_object('code', 'no_subsystems', 'severity', 'high',
                  'message', 'No subsystems defined for this system')) ELSE '[]'::jsonb END
        || CASE WHEN r.t = 0 THEN jsonb_build_array(jsonb_build_object('code', 'no_itrs', 'severity', 'high',
                  'message', 'No ITRs defined for this system'))
                WHEN r.ap < r.t THEN jsonb_build_array(jsonb_build_object('code', 'itrs_incomplete', 'severity', 'high',
                  'message', format('%s of %s ITRs approved (%s%%)', r.ap, r.t, r.pct), 'pending', r.t - r.ap))
                ELSE '[]'::jsonb END
        || CASE WHEN r.a > 0 THEN jsonb_build_array(jsonb_build_object('code', 'punches_a_open', 'severity', 'high',
                  'message', format('%s Category A punch(es) open — block every gate', r.a), 'count', r.a)) ELSE '[]'::jsonb END
        || CASE WHEN r.b_over > 0 THEN jsonb_build_array(jsonb_build_object('code', 'punches_b_over_limit', 'severity', 'high',
                  'message', format('%s subsystem(s) exceed the limit of %s open Category B punches', r.b_over, v_limit),
                  'count', r.b_over, 'limit', v_limit)) ELSE '[]'::jsonb END
        || CASE WHEN r.b > 0 THEN jsonb_build_array(jsonb_build_object('code', 'punches_b_open', 'severity', 'medium',
                  'message', format('%s Category B punch(es) open — require justification at issuance', r.b), 'count', r.b)) ELSE '[]'::jsonb END
         )
  FROM sys JOIN r ON r.system_id = sys.id JOIN gj ON gj.system_id = sys.id
  ORDER BY sys.acode, sys.code;
END;
$function$;
