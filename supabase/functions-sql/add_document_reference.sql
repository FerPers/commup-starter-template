-- fn: public.add_document_reference(text,uuid,uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.add_document_reference(p_kind text, p_target_id uuid, p_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE t record; d documents%ROWTYPE; v_role text; v_id uuid; v_status text;
BEGIN
  SELECT * INTO t FROM public.document_reference_target(p_kind, p_target_id);
  v_role := public.register_caller_role(t.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF t.locked THEN RAISE EXCEPTION 'El registro ya está firmado o fuera de borrador: no se cambian sus referencias' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO d FROM documents WHERE id = p_document_id AND project_id = t.project_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento de otro proyecto' USING ERRCODE = '22023'; END IF;
  IF d.current_revision_id IS NULL THEN RAISE EXCEPTION 'El documento % no tiene una revisión emitida', d.number USING ERRCODE = 'P0001'; END IF;
  -- S13 (F-20): con la política «block» de la org, solo se referencia una revisión IFC o superior.
  SELECT status INTO v_status FROM document_revisions WHERE id = d.current_revision_id;
  IF NOT public.document_status_controlled(v_status) AND public.org_document_policy(d.org_id) = 'block' THEN
    RAISE EXCEPTION 'La revisión vigente de % no está emitida para construcción (IFC o superior)', d.number USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO document_references (project_id, document_id, revision_id, target_kind, itr_id, procedure_revision_id, created_by)
  VALUES (t.project_id, d.id, d.current_revision_id, p_kind,
          CASE WHEN p_kind = 'itr' THEN p_target_id END, CASE WHEN p_kind = 'procedure_revision' THEN p_target_id END, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'El documento % ya está referenciado', d.number USING ERRCODE = '23505'; END IF;
  RETURN v_id;
END;
$function$;
