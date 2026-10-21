-- fn: public.compute_project_progress(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_project_progress(p_project_id uuid)
 RETURNS TABLE(system_id uuid, system_code text, itr_total integer, itr_approved integer, weighted_pct numeric, gates_approved integer, gates_total integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE v_org uuid;
BEGIN
  SELECT p.org_id INTO v_org FROM projects p WHERE p.id = p_project_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH g AS (  -- = compute_system_progress: gates activos con fase, peso relativo
    SELECT rg.id, rg.phase_id, COALESCE(rg.weight, 1) AS w
    FROM readiness_gates rg WHERE rg.org_id = v_org AND rg.is_active AND rg.phase_id IS NOT NULL
  ),
  tot AS (SELECT SUM(g.w) AS tw FROM g),
  sys AS (SELECT s.id, s.code FROM systems s WHERE s.project_id = p_project_id),
  cnt AS (
    SELECT ss.system_id, i.phase_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE i.status = 'approved')::int AS ok
    FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN sys ON sys.id = ss.system_id
    GROUP BY ss.system_id, i.phase_id
  ),
  cp AS (
    SELECT sys.id AS system_id, g.id AS gate_id,
           CASE WHEN tot.tw > 0 THEN round(g.w / tot.tw, 6) ELSE 0 END AS weight,
           COALESCE(cnt.total, 0) AS total, COALESCE(cnt.ok, 0) AS ok,
           CASE WHEN COALESCE(cnt.total, 0) > 0 THEN round(cnt.ok::numeric / cnt.total, 6) ELSE 0 END AS pct,
           EXISTS (SELECT 1 FROM system_gate_approvals a
                   WHERE a.system_id = sys.id AND a.gate_id = g.id AND a.revoked_at IS NULL
                     AND a.status IN ('approved', 'approved_with_conditions')) AS approved
    FROM sys CROSS JOIN g CROSS JOIN tot
    LEFT JOIN cnt ON cnt.system_id = sys.id AND cnt.phase_id = g.phase_id
  ),
  -- S23 (D-18): readiness = la misma definición que Control Tower (readinessSummary): todos los gates activos,
  -- aprobados solo los vigentes (sin regresión ni condición nueva), del estado guardado de S20.
  rd AS (
    SELECT st.system_id, jsonb_array_length(COALESCE(st.gates, '[]'::jsonb))::int AS total,
           (SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(st.gates, '[]'::jsonb)) x
            WHERE x ->> 'status' IN ('approved', 'approved_with_conditions'))::int AS done
    FROM system_gate_status st WHERE st.project_id = p_project_id
  )
  SELECT sys.id, sys.code,
         COALESCE(SUM(cp.total), 0)::int, COALESCE(SUM(cp.ok), 0)::int,
         round(COALESCE(SUM(cp.weight * cp.pct), 0), 6),
         COALESCE(rd.done, 0), COALESCE(rd.total, 0)
  FROM sys LEFT JOIN cp ON cp.system_id = sys.id LEFT JOIN rd ON rd.system_id = sys.id
  GROUP BY sys.id, sys.code, rd.done, rd.total
  ORDER BY sys.code;
END;
$function$;
