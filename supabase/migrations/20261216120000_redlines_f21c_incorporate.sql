-- F-21c (red-line de campo): incorporar al As-Built. Al cargar la revisión nueva de un P&ID, control documental
-- (Líder en adelante) marca qué red-lines abiertos o aceptados de revisiones ANTERIORES incorpora esa revisión
-- (status = incorporated, incorporated_revision_id); los que no marca pasan a la revisión nueva «por revisar»
-- (revision_id = la nueva, carried_from_revision_id = de dónde vienen; la primera de origen se conserva), como los pines
-- y los límites. Solo sobre la revisión VIGENTE del documento. Sin efecto en las liberaciones.

ALTER TABLE public.pid_redlines
  ADD COLUMN carried_from_revision_id uuid REFERENCES public.document_revisions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.incorporate_pid_redlines(p_revision_id uuid, p_incorporate uuid[] DEFAULT '{}')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_doc uuid; v_project uuid; v_type text; v_status text; v_seq integer; v_current uuid; v_inc integer; v_carried integer;
BEGIN
  SELECT r.document_id, d.project_id, d.doc_type, r.status, r.seq, d.current_revision_id
    INTO v_doc, v_project, v_type, v_status, v_seq, v_current
  FROM document_revisions r JOIN documents d ON d.id = r.document_id
  WHERE r.id = p_revision_id;
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Revisión no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_project_editor(v_project) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  IF v_type <> 'pid' THEN RAISE EXCEPTION 'Solo los P&ID llevan red-line' USING ERRCODE = '22023'; END IF;
  IF v_current IS DISTINCT FROM p_revision_id THEN
    RAISE EXCEPTION 'Se incorporan en la revisión vigente del plano' USING ERRCODE = 'P0001';
  END IF;

  -- Pendientes = abiertos o aceptados de revisiones anteriores de este plano.
  WITH pending AS (
    SELECT rl.id FROM pid_redlines rl JOIN document_revisions r ON r.id = rl.revision_id
    WHERE rl.document_id = v_doc AND rl.status IN ('open', 'accepted') AND r.seq < v_seq
    FOR UPDATE OF rl
  ), inc AS (
    UPDATE pid_redlines rl
    SET status = 'incorporated', incorporated_revision_id = p_revision_id, incorporated_by = auth.uid(), incorporated_at = now(), updated_at = now()
    FROM pending p WHERE rl.id = p.id AND rl.id = ANY (coalesce(p_incorporate, '{}'))
    RETURNING rl.id
  ), carried AS (
    UPDATE pid_redlines rl
    SET carried_from_revision_id = coalesce(rl.carried_from_revision_id, rl.revision_id), revision_id = p_revision_id, updated_at = now()
    FROM pending p WHERE rl.id = p.id AND NOT (rl.id = ANY (coalesce(p_incorporate, '{}')))
    RETURNING rl.id
  )
  SELECT (SELECT count(*) FROM inc), (SELECT count(*) FROM carried) INTO v_inc, v_carried;

  RETURN jsonb_build_object('incorporated', v_inc, 'carried', v_carried);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.incorporate_pid_redlines(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incorporate_pid_redlines(uuid, uuid[]) TO authenticated;
