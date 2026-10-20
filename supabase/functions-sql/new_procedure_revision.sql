-- fn: public.new_procedure_revision(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.new_procedure_revision(p_procedure_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE p procedures%ROWTYPE; v_role text; v_cur procedure_revisions%ROWTYPE; v_id uuid; v_reason text := public.mgmt_text(p_reason, 2000);
BEGIN
  SELECT * INTO p FROM procedures WHERE id = p_procedure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Procedimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(p.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM procedure_revisions WHERE procedure_id = p.id AND status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'Ya hay una revisión abierta de %', p.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_cur FROM procedure_revisions WHERE id = p.current_revision_id;
  IF v_cur.id IS NULL THEN RAISE EXCEPTION 'El procedimiento aún no tiene revisión aprobada' USING ERRCODE = 'P0001'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Indica el motivo de la nueva revisión' USING ERRCODE = '22023'; END IF;
  INSERT INTO procedure_revisions (procedure_id, org_id, project_id, rev, sections, change_reason, created_by)
  VALUES (p.id, p.org_id, p.project_id, (SELECT MAX(rev) + 1 FROM procedure_revisions WHERE procedure_id = p.id), v_cur.sections, v_reason, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO procedure_steps (revision_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria)
  SELECT v_id, project_id, ord, action, responsible, expected_value, tag_id, is_hold_point, hold_capacity, stop_criteria
  FROM procedure_steps WHERE revision_id = v_cur.id;
  -- S13 (F-12): la nueva revisión hereda las referencias a documentos, llevadas a la revisión vigente de cada uno
  -- (si cambió, el panel lo muestra como actualizado y el envío/aprobación lo valida igual).
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, procedure_revision_id, created_by)
  SELECT dr.project_id, dr.document_id, COALESCE(d.current_revision_id, dr.revision_id), 'procedure_revision', v_id, auth.uid()
  FROM document_references dr JOIN documents d ON d.id = dr.document_id
  WHERE dr.procedure_revision_id = v_cur.id;
  RETURN v_id;
END;
$function$;
