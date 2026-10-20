-- fn: public.save_procedure_revision(uuid,jsonb,jsonb,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.save_procedure_revision(p_revision_id uuid, p_sections jsonb, p_steps jsonb, p_change_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r procedure_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM procedure_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se edita una revisión en borrador' USING ERRCODE = 'P0001'; END IF;
  PERFORM public.procedure_write_content(r, p_sections, p_steps);
  -- S14 (E-30): quien edita el borrador queda registrado y no podrá aprobarlo.
  UPDATE procedure_revisions SET change_reason = COALESCE(public.mgmt_text(p_change_reason, 2000), change_reason), updated_at = now(),
         editors = CASE WHEN auth.uid() = ANY (editors) THEN editors ELSE editors || auth.uid() END
   WHERE id = p_revision_id;
END;
$function$;
