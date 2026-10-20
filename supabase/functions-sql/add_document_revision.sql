-- fn: public.add_document_revision(uuid,text,text,date,text,text,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.add_document_revision(p_document_id uuid, p_rev text, p_status text, p_issued_on date, p_file_path text, p_file_name text, p_external_url text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d documents%ROWTYPE; v_role text; v_rev text := upper(public.mgmt_text(p_rev, 20)); v_id uuid; v_seq integer;
        v_url text := public.mgmt_text(p_external_url, 1000); v_path text := public.mgmt_text(p_file_path, 500); v_today date;
BEGIN
  SELECT * INTO d FROM documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(d.project_id);
  IF auth.uid() IS NULL OR NOT public.document_is_controller(v_role) THEN
    RAISE EXCEPTION 'Solo líderes o superiores registran revisiones' USING ERRCODE = '42501';
  END IF;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'Indica la revisión' USING ERRCODE = '22023'; END IF;
  IF p_status NOT IN ('draft', 'ifr', 'ifa', 'ifc', 'as_built', 'final') THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  -- S13 (F-24): la fecha de emisión no puede ser futura (día del proyecto).
  v_today := public.project_today(d.project_id);
  IF p_status <> 'draft' AND p_issued_on > v_today THEN RAISE EXCEPTION 'La fecha de emisión no puede ser futura' USING ERRCODE = '22023'; END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https://' THEN RAISE EXCEPTION 'El enlace debe ser https' USING ERRCODE = '22023'; END IF;
  IF v_path IS NOT NULL AND (split_part(v_path, '/', 1) <> d.project_id::text OR split_part(v_path, '/', 2) <> d.id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'project-documents' AND o.name = v_path)) THEN
    RAISE EXCEPTION 'Archivo no válido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND upper(btrim(rev)) = v_rev AND status <> 'void') THEN
    RAISE EXCEPTION 'La revisión % ya existe', v_rev USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM document_revisions WHERE document_id = d.id AND status = 'draft') THEN
    RAISE EXCEPTION 'Hay una revisión en borrador: emítela o descártala primero' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq FROM document_revisions WHERE document_id = d.id;
  INSERT INTO document_revisions (document_id, project_id, seq, rev, status, issued_on, file_path, file_name, external_url, notes, created_by)
  VALUES (d.id, d.project_id, v_seq, v_rev, p_status, CASE WHEN p_status <> 'draft' THEN COALESCE(p_issued_on, v_today) END,
          v_path, CASE WHEN v_path IS NOT NULL THEN public.mgmt_text(p_file_name, 255) END, v_url, public.mgmt_text(p_notes, 2000), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.document_refresh_current(d.id);
  RETURN v_id;
END;
$function$;
