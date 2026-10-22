-- fn: public.compute_project_pid_coverage(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.compute_project_pid_coverage(p_project_id uuid)
 RETURNS TABLE(system_id uuid, tags_total integer, tags_pinned integer, tags_cited integer)
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
    SELECT d.number, d.current_revision_id AS rev FROM documents d
    WHERE d.project_id = p_project_id AND d.doc_type = 'pid' AND d.current_revision_id IS NOT NULL
  ),
  pinned AS (SELECT DISTINCT h.tag_id FROM pid_hotspots h JOIN cur ON cur.rev = h.revision_id),
  t AS (
    SELECT t.id, ss.system_id, upper(btrim(regexp_replace(t.pid_drawing, '\s+', ' ', 'g'))) AS ref
    FROM tags t JOIN subsystems ss ON ss.id = t.subsystem_id
    WHERE t.project_id = p_project_id
  )
  SELECT s.id,
         COUNT(t.id)::int,
         COUNT(t.id) FILTER (WHERE pinned.tag_id IS NOT NULL)::int,
         COUNT(t.id) FILTER (WHERE EXISTS (SELECT 1 FROM cur WHERE cur.number = t.ref))::int
  FROM systems s
  LEFT JOIN t ON t.system_id = s.id
  LEFT JOIN pinned ON pinned.tag_id = t.id
  WHERE s.project_id = p_project_id
  GROUP BY s.id;
END;
$function$;
