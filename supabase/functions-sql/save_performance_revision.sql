-- fn: public.save_performance_revision(uuid,jsonb,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.save_performance_revision(p_revision_id uuid, p_content jsonb, p_change_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_test_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM performance_test_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se edita una revisión en borrador' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.performance_write_content(r, p_content);
  -- S14 (E-30): quien edita el borrador queda registrado y no podrá aprobarlo.
  UPDATE performance_test_revisions SET change_reason = COALESCE(public.mgmt_text(p_change_reason, 2000), change_reason), updated_at = now(),
         editors = CASE WHEN auth.uid() = ANY (editors) THEN editors ELSE editors || auth.uid() END
   WHERE id = p_revision_id;
END;
$function$;
