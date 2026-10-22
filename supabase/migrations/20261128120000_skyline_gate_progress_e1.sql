-- E1 (plan referente, maquetas M aprobadas 2026-10-22): skyline de liberación.
-- Avance de cada sistema del proyecto en cada gate (liberación) en UNA consulta: ITR aprobados de la fase del
-- gate / ITR de esa fase. Es el mismo cálculo por gate que compute_system_progress y compute_project_progress
-- (cp), sin sumar por peso. Solo lectura; una sola verificación de pertenencia.

CREATE OR REPLACE FUNCTION public.compute_project_gate_progress(p_project_id uuid)
 RETURNS TABLE(system_id uuid, gate_id uuid, itr_total integer, itr_approved integer, pct numeric)
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
  WITH g AS (
    SELECT rg.id, rg.phase_id FROM readiness_gates rg
    WHERE rg.org_id = v_org AND rg.is_active AND rg.phase_id IS NOT NULL
  ),
  sys AS (SELECT s.id FROM systems s WHERE s.project_id = p_project_id),
  cnt AS (
    SELECT ss.system_id, i.phase_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE i.status = 'approved')::int AS ok
    FROM itrs i JOIN subsystems ss ON ss.id = i.subsystem_id JOIN sys ON sys.id = ss.system_id
    GROUP BY ss.system_id, i.phase_id
  )
  SELECT sys.id, g.id, COALESCE(cnt.total, 0), COALESCE(cnt.ok, 0),
         CASE WHEN COALESCE(cnt.total, 0) > 0 THEN round(cnt.ok::numeric / cnt.total, 6) ELSE 0 END
  FROM sys CROSS JOIN g
  LEFT JOIN cnt ON cnt.system_id = sys.id AND cnt.phase_id = g.phase_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_project_gate_progress(p_project_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_project_gate_progress(p_project_id uuid) TO authenticated, service_role;
