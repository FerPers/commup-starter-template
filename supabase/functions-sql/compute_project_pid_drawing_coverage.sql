-- fn: public.compute_project_pid_drawing_coverage(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_project_pid_drawing_coverage(p_project_id uuid)
 RETURNS TABLE(document_id uuid, pins integer, tags_cited integer, tags_cited_pinned integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project_id) THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_project_member(p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH cur AS (
    SELECT d.id, d.number, d.current_revision_id AS rev FROM documents d
    WHERE d.project_id = p_project_id AND d.doc_type = 'pid' AND d.current_revision_id IS NOT NULL
  ),
  t AS (
    SELECT t.id, upper(btrim(regexp_replace(t.pid_drawing, '\s+', ' ', 'g'))) AS ref
    FROM tags t WHERE t.project_id = p_project_id AND t.pid_drawing IS NOT NULL
  )
  SELECT cur.id,
         (SELECT COUNT(*) FROM pid_hotspots h WHERE h.revision_id = cur.rev)::int,
         COUNT(t.id)::int,
         COUNT(t.id) FILTER (WHERE EXISTS (SELECT 1 FROM pid_hotspots h WHERE h.revision_id = cur.rev AND h.tag_id = t.id))::int
  FROM cur LEFT JOIN t ON t.ref = cur.number
  GROUP BY cur.id, cur.rev;
END;
$function$;
