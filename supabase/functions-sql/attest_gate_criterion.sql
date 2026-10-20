-- fn: public.attest_gate_criterion(uuid,uuid,text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.attest_gate_criterion(p_system_id uuid, p_criterion_id uuid, p_comment text, p_file_path text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org     uuid;
  v_project uuid;
  v_crit    gate_criteria%ROWTYPE;
  v_id      uuid;
BEGIN
  SELECT s.project_id, p.org_id INTO v_project, v_org
  FROM systems s JOIN projects p ON p.id = s.project_id
  WHERE s.id = p_system_id;
  IF v_org IS NULL OR NOT public.is_project_editor(v_project) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_crit FROM gate_criteria WHERE id = p_criterion_id AND org_id = v_org;
  IF NOT FOUND OR v_crit.kind <> 'manual_attestation' THEN
    RAISE EXCEPTION 'Criterio no válido' USING ERRCODE = 'P0002';
  END IF;

  IF btrim(COALESCE(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'El comentario es obligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_file_path IS NULL
     OR p_file_path NOT LIKE v_org::text || '/' || p_system_id::text || '/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'gate-evidence' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Adjunto de evidencia no válido' USING ERRCODE = '22023';
  END IF;

  UPDATE system_gate_attestations
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE system_id = p_system_id AND criterion_id = p_criterion_id AND revoked_at IS NULL;

  INSERT INTO system_gate_attestations (org_id, project_id, system_id, criterion_id, comment, file_path, attested_by)
  VALUES (v_org, v_project, p_system_id, p_criterion_id, left(btrim(p_comment), 2000), p_file_path, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
