-- fn: public.transition_performance_revision(uuid,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.transition_performance_revision(p_revision_id uuid, p_to text, p_comment text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r performance_test_revisions%ROWTYPE; v_role text; v_uid uuid := auth.uid(); v_comment text := public.mgmt_text(p_comment, 2000); v_prev uuid;
BEGIN
  SELECT * INTO r FROM performance_test_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF v_uid IS NULL OR NOT public.performance_is_lead(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;

  IF r.status = 'draft' AND p_to = 'in_review' THEN
    IF NOT EXISTS (SELECT 1 FROM performance_criteria WHERE revision_id = r.id) THEN
      RAISE EXCEPTION 'La prueba necesita al menos un criterio de aceptación' USING ERRCODE = 'P0001';
    END IF;
    IF r.rev > 0 AND public.mgmt_text(r.change_reason) IS NULL THEN RAISE EXCEPTION 'Indica el motivo del cambio de la revisión' USING ERRCODE = '22023'; END IF;
    UPDATE performance_test_revisions SET status = 'in_review', submitted_by = v_uid, submitted_at = now(), returned_reason = NULL, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'draft' THEN
    IF v_comment IS NULL OR length(v_comment) < 3 THEN RAISE EXCEPTION 'Indica por qué se devuelve' USING ERRCODE = '22023'; END IF;
    UPDATE performance_test_revisions SET status = 'draft', returned_reason = v_comment, updated_at = now() WHERE id = r.id;

  ELSIF r.status = 'in_review' AND p_to = 'approved' THEN
    IF v_uid = r.created_by OR v_uid = r.submitted_by THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien redactó la prueba' USING ERRCODE = '42501'; END IF;
    -- S14 (E-30): tampoco quien editó el borrador.
    IF v_uid = ANY (r.editors) THEN RAISE EXCEPTION 'Aprueba una persona distinta de quien editó el borrador' USING ERRCODE = '42501'; END IF;
    SELECT id INTO v_prev FROM performance_test_revisions WHERE test_id = r.test_id AND status = 'approved' AND id <> r.id;
    UPDATE performance_test_revisions SET status = 'superseded', updated_at = now() WHERE id = v_prev;
    UPDATE performance_test_revisions SET status = 'approved', approved_by = v_uid, approved_at = now(), updated_at = now() WHERE id = r.id;
    UPDATE performance_test_revisions SET content_hash = public.performance_revision_hash(r.id) WHERE id = r.id;
    UPDATE performance_tests SET current_revision_id = r.id, updated_at = now() WHERE id = r.test_id;
  ELSE
    RAISE EXCEPTION 'Transición no permitida: % → %', r.status, p_to USING ERRCODE = 'P0001';
  END IF;
  RETURN p_to;
END;
$function$;
