-- fn: public.tag_type_groups(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_type_groups(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE v_org uuid; v_groups jsonb; v_learned jsonb; v_untyped int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;

  WITH u AS (
    SELECT t.id, t.tag_number, t.description, t.discipline_id,
           public.tag_number_prefix(t.tag_number) AS prefix, public.tag_desc_norm(t.description) AS desc_norm
    FROM tags t WHERE t.project_id = p_project_id AND t.equipment_type_id IS NULL
  ),
  g AS (
    SELECT u.prefix, u.discipline_id, u.desc_norm, count(*)::int AS n,
           (array_agg(u.tag_number ORDER BY u.tag_number))[1:8] AS samples,
           mode() WITHIN GROUP (ORDER BY u.description) AS description
    FROM u GROUP BY u.prefix, u.discipline_id, u.desc_norm
  )
  SELECT COALESCE(sum(n), 0)::int,
         COALESCE(jsonb_agg(jsonb_build_object(
           'prefix', g.prefix, 'discipline_id', g.discipline_id, 'discipline_code', d.code, 'discipline_name', d.name,
           'desc_norm', g.desc_norm, 'description', g.description, 'n', g.n, 'samples', to_jsonb(g.samples))
           ORDER BY g.n DESC, g.prefix, g.desc_norm) FILTER (WHERE g.rk <= 500), '[]')
  INTO v_untyped, v_groups
  FROM (SELECT g.*, row_number() OVER (ORDER BY g.n DESC, g.prefix, g.desc_norm) AS rk FROM g) g
  LEFT JOIN disciplines d ON d.id = g.discipline_id;

  -- Prefijo aprendido: tipos usados por los tags tipados de la org con ese prefijo (el TS decide si hay mayoría).
  WITH typed AS (
    SELECT public.tag_number_prefix(t.tag_number) AS prefix, t.equipment_type_id
    FROM tags t JOIN projects p ON p.id = t.project_id
    WHERE p.org_id = v_org AND t.equipment_type_id IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('prefix', prefix, 'equipment_type_id', equipment_type_id, 'n', n) ORDER BY prefix, n DESC), '[]')
  INTO v_learned
  FROM (SELECT prefix, equipment_type_id, count(*)::int AS n FROM typed WHERE prefix <> '' GROUP BY 1, 2) x;

  RETURN jsonb_build_object('untyped', v_untyped, 'groups', v_groups, 'learned', v_learned);
END;
$function$;
