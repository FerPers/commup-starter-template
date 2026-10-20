-- fn: public.update_action(uuid,text,text,uuid,uuid,date,text,text,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.update_action(p_action_id uuid, p_title text, p_description text, p_owner_id uuid, p_system_id uuid, p_due_date date, p_priority text, p_verification_method text, p_source_ref text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_a actions%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO v_a FROM actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_a.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_a.status IN ('verified', 'cancelled') THEN
    RAISE EXCEPTION 'La acción % está cerrada y no se puede editar', v_a.number USING ERRCODE = 'P0001';
  END IF;
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'La acción necesita un responsable' USING ERRCODE = '22023'; END IF;
  IF public.mgmt_text(p_title, 200) IS NULL THEN RAISE EXCEPTION 'El título es obligatorio' USING ERRCODE = '22023'; END IF;
  PERFORM public.mgmt_check_refs(v_a.project_id, v_a.org_id, p_system_id, p_owner_id);
  -- S11 (D-15): replanificar exige motivo (el KPI «a tiempo» mide contra original_due_date) y el método de
  -- verificación no cambia una vez empezada la acción, salvo un líder o superior.
  IF v_a.due_date IS NOT NULL AND p_due_date IS DISTINCT FROM v_a.due_date AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'Indica el motivo del cambio de fecha' USING ERRCODE = '22023';
  END IF;
  IF p_verification_method IS DISTINCT FROM v_a.verification_method AND v_a.status <> 'open'
     AND v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un líder o superior cambia el método de verificación de una acción empezada' USING ERRCODE = '42501';
  END IF;

  UPDATE actions SET title = public.mgmt_text(p_title, 200), description = public.mgmt_text(p_description),
         owner_id = p_owner_id, system_id = p_system_id, due_date = p_due_date,
         priority = p_priority, verification_method = p_verification_method,
         source_ref = public.mgmt_text(p_source_ref, 200), updated_at = now()
   WHERE id = p_action_id;
  IF p_owner_id IS DISTINCT FROM v_a.owner_id THEN
    PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'reassigned', v_a.owner_id::text, p_owner_id::text);
  END IF;
  IF p_due_date IS DISTINCT FROM v_a.due_date THEN
    PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'replanned', v_a.due_date::text, p_due_date::text, v_reason);
  END IF;
  PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id, 'updated');
END;
$function$;
