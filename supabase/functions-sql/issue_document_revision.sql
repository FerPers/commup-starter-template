-- fn: public.issue_document_revision(uuid,text,date)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.issue_document_revision(p_revision_id uuid, p_status text, p_issued_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r document_revisions%ROWTYPE; v_role text;
BEGIN
  SELECT * INTO r FROM document_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(r.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'Solo se emite o descarta un borrador' USING ERRCODE = 'P0001'; END IF;
  IF p_status IS NULL THEN
    DELETE FROM document_revisions WHERE id = r.id;
  ELSIF p_status IN ('ifr', 'ifa', 'ifc', 'as_built', 'final') THEN
    UPDATE document_revisions SET status = p_status, issued_on = COALESCE(p_issued_on, public.project_today(r.project_id)) WHERE id = r.id;
  ELSE
    RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023';
  END IF;
  PERFORM public.document_refresh_current(r.document_id);
END;
$function$;
