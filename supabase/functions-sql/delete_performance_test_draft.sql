-- fn: public.delete_performance_test_draft(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.delete_performance_test_draft(p_test_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE t performance_tests%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO t FROM performance_tests WHERE id = p_test_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prueba no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(t.project_id);
  IF v_role IS NULL OR NOT (t.created_by = auth.uid() OR v_role IN ('owner', 'admin')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM performance_test_revisions WHERE test_id = t.id AND approved_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM performance_runs WHERE test_id = t.id) THEN
    RAISE EXCEPTION 'Solo se borran pruebas nunca aprobadas ni ejecutadas' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM performance_tests WHERE id = t.id;
END;
$function$;
