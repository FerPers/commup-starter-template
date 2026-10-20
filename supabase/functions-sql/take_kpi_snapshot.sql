-- fn: public.take_kpi_snapshot(uuid,date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.take_kpi_snapshot(p_project_id uuid, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.kpi_snapshots%ROWTYPE;
  v_phases integer;
BEGIN
  p_date := COALESCE(p_date, public.project_today(p_project_id));  -- S10 (D-27/B-29): día local del proyecto
  IF p_project_id IS NULL OR p_date IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.kpi_snapshots AS k (
    project_id, snapshot_date, total_itrs, completed_itrs, total_punches_a, open_punches_a,
    total_punches_b, open_punches_b, total_tags, total_preservation, overdue_preservation, completion_pct, suspect)
  SELECT p_project_id, p_date, i.total, i.done, pu.ta, pu.oa, pu.tb, pu.ob,
         (SELECT count(*) FROM public.tags t WHERE t.project_id = p_project_id),
         pp.total, pp.overdue,
         CASE WHEN i.total > 0 THEN round(i.done * 100.0 / i.total, 2) ELSE 0 END,
         false
  FROM (SELECT count(*) AS total, count(*) FILTER (WHERE status = 'approved') AS done
          FROM public.itrs WHERE project_id = p_project_id) i,
       (SELECT count(*) FILTER (WHERE category = 'A') AS ta,
               count(*) FILTER (WHERE category = 'A' AND status IN ('open', 'in_progress')) AS oa,
               count(*) FILTER (WHERE category = 'B') AS tb,
               count(*) FILTER (WHERE category = 'B' AND status IN ('open', 'in_progress')) AS ob
          FROM public.punches WHERE project_id = p_project_id) pu,
       (SELECT count(*) AS total,
               count(*) FILTER (WHERE public.preservation_is_overdue(status, next_due_date, p_date)) AS overdue
          FROM public.preservation_plans WHERE project_id = p_project_id AND status = 'active') pp
  ON CONFLICT (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) DO UPDATE SET
    total_itrs = EXCLUDED.total_itrs, completed_itrs = EXCLUDED.completed_itrs,
    total_punches_a = EXCLUDED.total_punches_a, open_punches_a = EXCLUDED.open_punches_a,
    total_punches_b = EXCLUDED.total_punches_b, open_punches_b = EXCLUDED.open_punches_b,
    total_tags = EXCLUDED.total_tags, total_preservation = EXCLUDED.total_preservation,
    overdue_preservation = EXCLUDED.overdue_preservation, completion_pct = EXCLUDED.completion_pct,
    suspect = false
  RETURNING k.* INTO v_row;

  -- Por fase: solo métricas de ITR (punches, tags y preservación no tienen fase).
  INSERT INTO public.kpi_snapshots AS k (project_id, snapshot_date, phase_id, total_itrs, completed_itrs, completion_pct, suspect)
  SELECT p_project_id, p_date, phase_id, count(*), count(*) FILTER (WHERE status = 'approved'),
         round(count(*) FILTER (WHERE status = 'approved') * 100.0 / count(*), 2), false
  FROM public.itrs WHERE project_id = p_project_id AND phase_id IS NOT NULL
  GROUP BY phase_id
  ON CONFLICT (project_id, snapshot_date, phase_id, subsystem_id, area_id, system_id) DO UPDATE SET
    total_itrs = EXCLUDED.total_itrs, completed_itrs = EXCLUDED.completed_itrs,
    completion_pct = EXCLUDED.completion_pct, suspect = false;
  GET DIAGNOSTICS v_phases = ROW_COUNT;

  -- Re-snapshot del mismo día: fases que ya no tienen ITR.
  DELETE FROM public.kpi_snapshots k
  WHERE k.project_id = p_project_id AND k.snapshot_date = p_date AND k.phase_id IS NOT NULL
    AND k.subsystem_id IS NULL AND k.area_id IS NULL AND k.system_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.itrs i WHERE i.project_id = p_project_id AND i.phase_id = k.phase_id);

  RETURN jsonb_build_object('date', p_date, 'total_itrs', v_row.total_itrs, 'completed_itrs', v_row.completed_itrs,
    'completion_pct', v_row.completion_pct, 'open_punches_a', v_row.open_punches_a, 'open_punches_b', v_row.open_punches_b,
    'overdue_preservation', v_row.overdue_preservation, 'phases', v_phases);
END $function$;
