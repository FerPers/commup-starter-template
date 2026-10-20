-- fn: public.escalate_constraint(uuid,integer,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.escalate_constraint(p_constraint_id uuid, p_level integer, p_reason text)
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
  IF v_c.status <> 'open' THEN RAISE EXCEPTION 'Solo se escalan restricciones abiertas' USING ERRCODE = 'P0001'; END IF;
  IF p_level IS NULL OR p_level NOT BETWEEN 1 AND 4 OR p_level = v_c.escalation_level THEN
    RAISE EXCEPTION 'Nivel de escalamiento no válido' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo del cambio de nivel' USING ERRCODE = '22023'; END IF;
  -- S11 (D-14): bajar una restricción de nivel 3 o 4 es de líder o superior (si no, cualquiera desbloquea el gate).
  IF p_level < v_c.escalation_level AND v_c.escalation_level >= 3 AND v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN
    RAISE EXCEPTION 'Solo un líder o superior baja una restricción de nivel %', v_c.escalation_level USING ERRCODE = '42501';
  END IF;
  UPDATE project_constraints SET escalation_level = p_level, updated_at = now() WHERE id = p_constraint_id;
  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id,
                          CASE WHEN p_level > v_c.escalation_level THEN 'escalated' ELSE 'deescalated' END,
                          v_c.escalation_level::text, p_level::text, v_reason);
END;
$function$;
