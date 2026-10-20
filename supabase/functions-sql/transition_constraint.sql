-- fn: public.transition_constraint(uuid,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.transition_constraint(p_constraint_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_c project_constraints%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text; v_open integer;
BEGIN
  SELECT * INTO v_c FROM project_constraints WHERE id = p_constraint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restricción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_c.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := public.mgmt_text(p_comment, 2000);

  IF p_to = 'cancelled' THEN
    IF v_c.status IN ('closed', 'cancelled') THEN RAISE EXCEPTION 'La restricción % ya está cerrada', v_c.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar restricciones', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment, updated_at = now()
     WHERE id = p_constraint_id;

  ELSIF v_c.status = 'open' AND p_to = 'resolved' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Describe cómo se resolvió la restricción' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'resolved', resolution_note = v_comment, resolved_by = v_uid, resolved_at = now(), updated_at = now()
     WHERE id = p_constraint_id;

  ELSIF v_c.status = 'resolved' AND p_to = 'open' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se reabre' USING ERRCODE = '22023'; END IF;
    UPDATE project_constraints SET status = 'open', resolved_by = NULL, resolved_at = NULL, updated_at = now() WHERE id = p_constraint_id;

  ELSIF v_c.status = 'resolved' AND p_to = 'closed' THEN
    SELECT COUNT(*) INTO v_open FROM actions
     WHERE source_kind = 'constraint' AND source_id = p_constraint_id AND status IN ('open', 'in_progress', 'done');
    IF v_open > 0 THEN
      RAISE EXCEPTION 'La restricción % tiene % acción(es) sin verificar', v_c.number, v_open USING ERRCODE = 'P0001';
    END IF;
    -- S11 (D-14): cierra otra persona distinta de quien la resolvió.
    IF v_c.resolved_by = v_uid THEN RAISE EXCEPTION 'Cierra la restricción otra persona distinta de quien la resolvió' USING ERRCODE = '42501'; END IF;
    UPDATE project_constraints SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now() WHERE id = p_constraint_id;

  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', v_c.status, p_to USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.mgmt_log(v_c.org_id, v_c.project_id, 'constraint', p_constraint_id, 'transition', v_c.status, p_to, v_comment);
  RETURN p_to;
END;
$function$;
