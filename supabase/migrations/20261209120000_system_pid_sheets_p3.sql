-- P3 (plan referente, maqueta «Planos» aprobada 2026-10-22): pestaña «Planos» de la ficha del sistema.
--
-- system_pid_sheets(p_system_id) = las hojas P&ID que tocan al sistema en su revisión vigente (documentos doc_type
-- 'pid' citados por sus tags, con pines de sus tags o con marcas LOSH del sistema a un lado u otro), con cuántos tags
-- del sistema hay en la hoja, cuántos tienen pin y cuántas marcas tiene (y cuántas «por revisar»); los planos citados
-- por sus tags sin documento cargado; y los tags del sistema sin pin en ninguna revisión vigente (tope 100, con el
-- plano citado). El número de plano se normaliza igual que compute_project_pid_coverage.
-- Corre como quien la llama (RLS); pide ser miembro del proyecto del sistema.

CREATE FUNCTION public.system_pid_sheets(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_project uuid; v_res jsonb;
BEGIN
  SELECT project_id INTO v_project FROM systems WHERE id = p_system_id;
  IF v_project IS NULL OR auth.uid() IS NULL OR NOT public.is_project_member(v_project) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  WITH st AS (
    SELECT t.id, t.tag_number, NULLIF(upper(btrim(regexp_replace(COALESCE(t.pid_drawing, ''), '\s+', ' ', 'g'))), '') AS ref
    FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
    WHERE ss.system_id = p_system_id AND t.project_id = v_project
  ),
  cur AS (
    SELECT d.id, d.number, d.title, d.current_revision_id AS rev, r.rev AS rev_label, r.status AS rev_status
    FROM documents d JOIN document_revisions r ON r.id = d.current_revision_id
    WHERE d.project_id = v_project AND d.doc_type = 'pid'
  ),
  pins AS (
    SELECT DISTINCT cur.id AS document_id, h.tag_id
    FROM pid_hotspots h JOIN cur ON cur.rev = h.revision_id JOIN st ON st.id = h.tag_id
  ),
  marks AS (
    SELECT cur.id AS document_id, count(*)::int AS n, count(*) FILTER (WHERE m.needs_review)::int AS review,
           count(DISTINCT m.page_num)::int AS pages
    FROM pid_markups m JOIN cur ON cur.rev = m.revision_id
    WHERE m.layer = 'losh' AND (m.system_id = p_system_id OR m.other_system_id = p_system_id)
    GROUP BY cur.id
  ),
  sheet AS (
    SELECT cur.*,
           (SELECT count(*) FROM st WHERE st.ref = cur.number)::int AS cited,
           (SELECT count(*) FROM pins WHERE pins.document_id = cur.id)::int AS pinned,
           (SELECT count(*) FROM st WHERE st.ref = cur.number OR st.id IN (SELECT tag_id FROM pins WHERE pins.document_id = cur.id))::int AS tags,
           COALESCE(marks.n, 0) AS markups, COALESCE(marks.review, 0) AS markups_review, COALESCE(marks.pages, 0) AS markup_pages
    FROM cur LEFT JOIN marks ON marks.document_id = cur.id
  ),
  pinned_any AS (SELECT DISTINCT tag_id FROM pins),
  unpinned AS (
    SELECT st.id, st.tag_number, st.ref, cur.id AS document_id
    FROM st LEFT JOIN cur ON cur.number = st.ref
    WHERE st.id NOT IN (SELECT tag_id FROM pinned_any)
  )
  SELECT jsonb_build_object(
    'tags_total', (SELECT count(*) FROM st),
    'tags_pinned', (SELECT count(*) FROM pinned_any),
    'sheets', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'document_id', id, 'number', number, 'title', title, 'revision_id', rev, 'rev', rev_label, 'rev_status', rev_status,
                 'tags', tags, 'cited', cited, 'pinned', pinned, 'markups', markups, 'markups_review', markups_review, 'markup_pages', markup_pages)
                 ORDER BY number), '[]')
               FROM sheet WHERE cited > 0 OR pinned > 0 OR markups > 0),
    'missing', (SELECT COALESCE(jsonb_agg(jsonb_build_object('number', ref, 'tags', n) ORDER BY ref), '[]')
                FROM (SELECT st.ref, count(*)::int AS n FROM st WHERE st.ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cur WHERE cur.number = st.ref) GROUP BY st.ref) x),
    'unpinned_total', (SELECT count(*) FROM unpinned),
    'unpinned', (SELECT COALESCE(jsonb_agg(jsonb_build_object('tag_id', id, 'tag_number', tag_number, 'drawing', ref, 'document_id', document_id) ORDER BY tag_number), '[]')
                 FROM (SELECT * FROM unpinned ORDER BY tag_number LIMIT 100) u)
  ) INTO v_res;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.system_pid_sheets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_pid_sheets(uuid) TO authenticated, service_role;
