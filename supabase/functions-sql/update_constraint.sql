-- fn: public.update_constraint(uuid,text,text,uuid,uuid,uuid,date,text,text,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.update_constraint(p_constraint_id uuid, p_title text, p_description text, p_system_id uuid, p_gate_id uuid, p_owner_id uuid, p_need_date date, p_impact_kind text, p_impact text, p_recovery_plan text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_c project_constraints%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF v_c.status IN ('closed', 'cancelled') THEN
    RAISE EXCEPTION 'La restricción % está cerrada y no se puede editar', v_c.number USING ERRCODE = 'P0001';
  END IF;
  IF p_system_id IS NULL OR p_owner_id IS NULL OR p_need_date IS NULL THEN
    RAISE EXCEPTION 'Sistema, responsable y fecha requerida son obligatorios' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_title, 200) IS NULL OR public.mgmt_text(p_description) IS NULL THEN
    RAISE EXCEPTION 'Título y descripción son obligatorios' USING ERRCODE = '22023';
  END IF;
  PERFORM public.mgmt_check_refs(v_c.project_id, v_c.org_id, p_system_id, p_owner_id, p_gate_id);
  -- S11 (D-14): mover una restricción abierta a otro gate o sistema la saca del gate que bloquea: líder o
  -- superior y con motivo. Cambiar la fecha requerida exige motivo.
  IF v_c.status = 'open' AND (p_gate_id IS DISTINCT FROM v_c.gate_id OR p_system_id IS DISTINCT FROM v_c.system_id) THEN
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
      RAISE EXCEPTION 'Solo un líder o superior cambia el gate o el sistema de una restricción abierta' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo del cambio de gate o sistema' USING ERRCODE = '22023'; END IF;
  END IF;
  IF p_need_date IS DISTINCT FROM v_c.need_date AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'Indica el motivo del cambio de fecha requerida' USING ERRCODE = '22023';
  END IF;

  UPDATE project_constraints SET title = public.mgmt_text(p_title, 200), description = public.mgmt_text(p_description),
         system_id = p_system_id, gate_id = p_gate_id, owner_id = p_owner_id, need_date = p_need_date,
         impact_kind = p_impact_kind, impact = public.mgmt_text(p_impact), recovery_plan = public.mgmt_text(p_recovery_plan),
         -- Una nueva fecha requerida reinicia el aviso de vencimiento.
         last_overdue_notif_at = CASE WHEN p_need_date IS DISTINCT FROM v_c.need_date THEN NULL ELSE last_overdue_notif_at END,
         updated_at = now()
   WHERE id = p_constraint_id;
  IF p_need_date IS DISTINCT FROM v_c.need_date THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'need_date', v_c.need_date::text, p_need_date::text, v_reason);
  END IF;
  IF p_owner_id IS DISTINCT FROM v_c.owner_id THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'reassigned', v_c.owner_id::text, p_owner_id::text);
  END IF;
  IF p_gate_id IS DISTINCT FROM v_c.gate_id OR p_system_id IS DISTINCT FROM v_c.system_id THEN
    PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'gate_changed',
                            concat_ws('/', v_c.system_id, v_c.gate_id), concat_ws('/', p_system_id, p_gate_id), v_reason);
  END IF;
  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'updated');
END;
$function$;
