-- fn: public.tag_requirements_mark_org()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_mark_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_orgs uuid[]; v_projects uuid[]; v_new jsonb; v_old jsonb; v_rows jsonb;
BEGIN
  -- Matriz, plantillas, ítems tabla y fases son de la org: todos sus proyectos se recalculan enteros.
  -- project_disciplines es del proyecto (alcance de disciplinas). Un trigger por evento (tablas de transición).
  IF TG_OP IN ('INSERT', 'UPDATE') THEN SELECT jsonb_agg(to_jsonb(n)) INTO v_new FROM new_rows n; END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN SELECT jsonb_agg(to_jsonb(o)) INTO v_old FROM old_rows o; END IF;
  v_rows := COALESCE(v_new, '[]'::jsonb) || COALESCE(v_old, '[]'::jsonb);
  IF TG_TABLE_NAME = 'project_disciplines' THEN
    SELECT array_agg(DISTINCT (x ->> 'project_id')::uuid) INTO v_projects FROM jsonb_array_elements(v_rows) x;
  ELSIF TG_TABLE_NAME = 'itr_template_items' THEN
    SELECT array_agg(DISTINCT tp.org_id) INTO v_orgs
    FROM jsonb_array_elements(v_rows) x JOIN itr_templates tp ON tp.id = (x ->> 'template_id')::uuid
    WHERE x ->> 'item_type' = 'table';
  ELSE
    SELECT array_agg(DISTINCT (x ->> 'org_id')::uuid) INTO v_orgs FROM jsonb_array_elements(v_rows) x;
  END IF;
  IF v_orgs IS NOT NULL THEN
    SELECT array_agg(p.id) INTO v_projects FROM projects p WHERE p.org_id = ANY (v_orgs);
  END IF;
  IF v_projects IS NOT NULL THEN PERFORM public.tag_requirements_mark_projects(v_projects); END IF;
  RETURN NULL;
END;
$function$;
