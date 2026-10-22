-- fn: public.update_procedure(uuid,text,text,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.update_procedure(p_procedure_id uuid, p_title text, p_kind text, p_system_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE p procedures%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  PERFORM public.mgmt_check_refs(p.project_id, p.org_id, p_system_id, NULL);
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  -- S25 (E-36): sin tipo se conserva el actual; uno desconocido es un error claro, no una violación de restricción.
  IF p_kind IS NOT NULL AND p_kind NOT IN ('precommissioning', 'commissioning', 'startup', 'shutdown', 'emergency', 'normal_operation') THEN
    RAISE EXCEPTION 'Tipo de procedimiento no válido' USING ERRCODE = '22023';
  END IF;
  UPDATE procedures SET title = public.mgmt_text(p_title, 200), kind = COALESCE(p_kind, p.kind), system_id = p_system_id, updated_at = now() WHERE id = p_procedure_id;
END;
$function$;
