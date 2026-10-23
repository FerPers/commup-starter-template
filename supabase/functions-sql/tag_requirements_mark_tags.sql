-- fn: public.tag_requirements_mark_tags()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_mark_tags()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rows jsonb; v_moved uuid[];
BEGIN
  -- Igual que gate_status_dirty_trg: filas de la sentencia; en UPDATE solo las que cambiaron alguna columna de TG_ARGV.
  IF TG_OP = 'INSERT' THEN
    SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM new_rows n;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT jsonb_agg(to_jsonb(o)) INTO v_rows FROM old_rows o;
  ELSIF TG_NARGS = 0 THEN
    SELECT jsonb_agg(z.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS x FROM old_rows o UNION ALL SELECT to_jsonb(n) FROM new_rows n) z;
  ELSE
    SELECT jsonb_agg(v.x) INTO v_rows
    FROM (SELECT to_jsonb(o) AS o, to_jsonb(n) AS n FROM old_rows o JOIN new_rows n ON n.id = o.id) c
    CROSS JOIN LATERAL (VALUES (c.o), (c.n)) v(x)
    WHERE EXISTS (SELECT 1 FROM unnest(TG_ARGV) k WHERE c.o -> k IS DISTINCT FROM c.n -> k);
  END IF;
  IF v_rows IS NULL THEN RETURN NULL; END IF;

  -- Un tag que cambia de proyecto deja filas viejas en el otro: los dos proyectos se recalculan enteros.
  IF TG_TABLE_NAME = 'tags' AND TG_OP = 'UPDATE' THEN
    SELECT array_agg(DISTINCT (o.project_id)) INTO v_moved
    FROM old_rows o JOIN new_rows n ON n.id = o.id WHERE n.project_id IS DISTINCT FROM o.project_id;
    IF v_moved IS NOT NULL THEN
      PERFORM public.tag_requirements_mark_projects(v_moved || ARRAY(SELECT DISTINCT n.project_id FROM new_rows n));
    END IF;
  END IF;

  -- Sin llave foránea: en un borrado en cascada el tag (o el proyecto) ya no está; esos se saltan.
  INSERT INTO tag_requirement_dirty (tag_id, project_id)
  SELECT DISTINCT ON (t.id) t.id, t.project_id
  FROM jsonb_array_elements(v_rows) x
  JOIN tags t ON t.id = (CASE WHEN TG_TABLE_NAME = 'tags' THEN x ->> 'id' ELSE x ->> 'tag_id' END)::uuid
  ORDER BY t.id
  ON CONFLICT (tag_id) DO UPDATE SET project_id = EXCLUDED.project_id;
  RETURN NULL;
END;
$function$;
