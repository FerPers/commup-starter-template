-- fn: public.add_mgmt_attachment(text, uuid, text, text, text, bigint)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.add_mgmt_attachment(p_entity_kind text, p_entity_id uuid, p_file_path text, p_file_name text, p_mime_type text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_org uuid; v_status text; v_role text; v_id uuid;
BEGIN
  IF p_entity_kind = 'action' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM actions WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'constraint' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM project_constraints WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'tq' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM technical_queries WHERE id = p_entity_id;
  ELSIF p_entity_kind = 'decision' THEN
    SELECT project_id, org_id, status INTO v_project, v_org, v_status FROM decisions WHERE id = p_entity_id;
  -- Fase 8: evidencia del vendor (reportes inmutables y FAT/SAT); el paquete no debe estar cancelado.
  ELSIF p_entity_kind = 'vendor_report' THEN
    SELECT r.project_id, p.org_id, CASE WHEN p.status = 'cancelled' THEN 'cancelled' END INTO v_project, v_org, v_status
    FROM vendor_reports r JOIN vendor_packages p ON p.id = r.package_id WHERE r.id = p_entity_id;
  ELSIF p_entity_kind = 'vendor_activity' THEN
    SELECT a.project_id, p.org_id, CASE WHEN p.status = 'cancelled' THEN 'cancelled' END INTO v_project, v_org, v_status
    FROM vendor_activities a JOIN vendor_packages p ON p.id = a.package_id WHERE a.id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'Tipo no válido' USING ERRCODE = '22023';
  END IF;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Registro no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_role := public.register_caller_role(v_project);
  -- client solo adjunta en TQ (soporte de su respuesta).
  IF auth.uid() IS NULL OR v_role IS NULL OR (v_role = 'client' AND p_entity_kind <> 'tq') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_status IN ('verified', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'El registro está cerrado: no admite más evidencia' USING ERRCODE = 'P0001';
  END IF;
  IF p_file_path IS NULL
     OR p_file_path NOT LIKE v_project::text || '/' || p_entity_kind || '/' || p_entity_id::text || '/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'mgmt-evidence' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Adjunto de evidencia no válido' USING ERRCODE = '22023';
  END IF;
  IF public.mgmt_text(p_file_name, 255) IS NULL THEN RAISE EXCEPTION 'Nombre de archivo obligatorio' USING ERRCODE = '22023'; END IF;

  INSERT INTO mgmt_attachments (org_id, project_id, entity_kind, entity_id, file_path, file_name, mime_type, size_bytes, uploaded_by)
  VALUES (v_org, v_project, p_entity_kind, p_entity_id, p_file_path, public.mgmt_text(p_file_name, 255),
          left(p_mime_type, 100), p_size_bytes, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.mgmt_log(v_org, v_project, p_entity_kind, p_entity_id, 'attachment', NULL, NULL, public.mgmt_text(p_file_name, 255));
  RETURN v_id;
END;
$function$;
