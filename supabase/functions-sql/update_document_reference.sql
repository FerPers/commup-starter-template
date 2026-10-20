-- fn: public.update_document_reference(uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.update_document_reference(p_reference_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r document_references%ROWTYPE; t record; d documents%ROWTYPE; v_role text; v_reason text := public.mgmt_text(p_reason, 2000); v_status text;
BEGIN
  SELECT * INTO r FROM document_references WHERE id = p_reference_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referencia no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO d FROM documents WHERE id = r.document_id;
  IF d.current_revision_id IS NULL OR d.current_revision_id = r.revision_id THEN RAISE EXCEPTION 'La referencia ya está en la revisión vigente' USING ERRCODE = 'P0001'; END IF;
  -- S13 (F-20): con la política «block» no se lleva una referencia a una revisión IFR/IFA.
  SELECT status INTO v_status FROM document_revisions WHERE id = d.current_revision_id;
  IF NOT public.document_status_controlled(v_status) AND public.org_document_policy(d.org_id) = 'block' THEN
    RAISE EXCEPTION 'La revisión vigente de % no está emitida para construcción (IFC o superior)', d.number USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO t FROM public.document_reference_target(r.target_kind, COALESCE(r.itr_id, r.procedure_revision_id));
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR v_role IS NULL OR v_role = 'client' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF t.locked THEN
    IF NOT public.document_is_controller(v_role) THEN RAISE EXCEPTION 'Solo líderes o superiores revalidan un registro firmado' USING ERRCODE = '42501'; END IF;
    IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Indica por qué el registro sigue siendo válido con la revisión vigente (mín. 10 caracteres)' USING ERRCODE = '22023'; END IF;
    UPDATE document_references SET revalidated_from = r.revision_id, revision_id = d.current_revision_id,
           revalidated_by = auth.uid(), revalidated_at = now(), revalidation_reason = v_reason
     WHERE id = r.id;
  ELSE
    UPDATE document_references SET revision_id = d.current_revision_id WHERE id = r.id;
  END IF;
END;
$function$;
