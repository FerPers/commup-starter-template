-- fn: public.transition_action(uuid,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.transition_action(p_action_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_a actions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text;
BEGIN
  SELECT * INTO v_a FROM actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acción no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_a.project_id);
  IF v_uid IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  v_comment := public.mgmt_text(p_comment, 2000);

  IF p_to = 'cancelled' THEN
    IF v_a.status IN ('verified', 'cancelled') THEN RAISE EXCEPTION 'La acción % ya está cerrada', v_a.number USING ERRCODE = 'P0001'; END IF;
    IF v_role NOT IN ('owner', 'admin', 'architect', 'leader') THEN RAISE EXCEPTION 'Tu rol (%) no puede cancelar acciones', v_role USING ERRCODE = '42501'; END IF;
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la cancelación' USING ERRCODE = '22023'; END IF;
    UPDATE actions SET status = 'cancelled', cancelled_by = v_uid, cancelled_at = now(), cancel_reason = v_comment, updated_at = now()
     WHERE id = p_action_id;

  ELSIF v_a.status = 'open' AND p_to = 'in_progress' THEN
    UPDATE actions SET status = 'in_progress', updated_at = now() WHERE id = p_action_id;

  ELSIF v_a.status IN ('open', 'in_progress') AND p_to = 'done' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Describe cómo se cerró la acción' USING ERRCODE = '22023'; END IF;
    IF v_a.verification_method <> 'review' AND NOT EXISTS (
         SELECT 1 FROM mgmt_attachments WHERE entity_kind = 'action' AND entity_id = p_action_id) THEN
      RAISE EXCEPTION 'Adjunta la evidencia de cierre de % antes de marcarla hecha', v_a.number USING ERRCODE = 'P0001';
    END IF;
    UPDATE actions SET status = 'done', closure_note = v_comment, done_by = v_uid, done_at = now(), updated_at = now()
     WHERE id = p_action_id;

  ELSIF v_a.status = 'done' AND p_to IN ('verified', 'in_progress') THEN
    IF v_uid = v_a.done_by THEN
      RAISE EXCEPTION 'La verificación debe hacerla una persona distinta de quien cerró la acción' USING ERRCODE = '42501';
    END IF;
    IF p_to = 'verified' THEN
      UPDATE actions SET status = 'verified', verified_by = v_uid, verified_at = now(), verify_comment = v_comment, updated_at = now()
       WHERE id = p_action_id;
    ELSE
      IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se rechaza el cierre' USING ERRCODE = '22023'; END IF;
      UPDATE actions SET status = 'in_progress', done_by = NULL, done_at = NULL, updated_at = now() WHERE id = p_action_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', v_a.status, p_to USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.mgmt_log(v_a.org_id, v_a.project_id, 'action', p_action_id,
                          CASE WHEN v_a.status = 'done' AND p_to = 'in_progress' THEN 'rejected' ELSE 'transition' END,
                          v_a.status, p_to, v_comment);
  RETURN p_to;
END;
$function$;
