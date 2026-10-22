-- fn: public.tag_requirements_page(uuid,text,uuid,uuid,uuid,text,integer,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_requirements_page(p_project_id uuid, p_filter text DEFAULT 'all'::text, p_area_id uuid DEFAULT NULL::uuid, p_system_id uuid DEFAULT NULL::uuid, p_subsystem_id uuid DEFAULT NULL::uuid, p_q text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_systems uuid[]; v_q text := NULLIF(upper(btrim(COALESCE(p_q, ''))), '');
BEGIN
  IF NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  IF p_area_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(s.id), '{}') INTO v_systems FROM systems s WHERE s.project_id = p_project_id AND s.area_id = p_area_id;
  ELSIF p_system_id IS NOT NULL THEN
    v_systems := ARRAY[p_system_id];
  END IF;

  WITH t AS (
    SELECT t.id, t.tag_number, t.description, t.equipment_type_id, et.code AS type_code
    FROM tags t LEFT JOIN subsystems s ON s.id = t.subsystem_id LEFT JOIN equipment_types et ON et.id = t.equipment_type_id
    WHERE t.project_id = p_project_id
      AND (v_systems IS NULL OR s.system_id = ANY (v_systems))
      AND (p_subsystem_id IS NULL OR t.subsystem_id = p_subsystem_id)
      AND (v_q IS NULL OR upper(t.tag_number) LIKE '%' || v_q || '%' OR upper(COALESCE(t.description, '')) LIKE '%' || v_q || '%')
  ),
  r AS (
    SELECT * FROM public.tag_itr_requirements(p_project_id, NULL, v_systems,
      CASE WHEN p_subsystem_id IS NULL THEN NULL ELSE ARRAY[p_subsystem_id] END) r
    WHERE r.tag_id IN (SELECT id FROM t)
  ),
  agg AS (
    SELECT t.id, t.tag_number, t.description, t.type_code, t.equipment_type_id,
           COUNT(r.template_code) AS n,
           COUNT(*) FILTER (WHERE r.state = 'missing') AS missing,
           COUNT(*) FILTER (WHERE r.state = 'excluded') AS excluded,
           COUNT(*) FILTER (WHERE r.state = 'outside') AS outside
    FROM t LEFT JOIN r ON r.tag_id = t.id
    GROUP BY t.id, t.tag_number, t.description, t.type_code, t.equipment_type_id
  ),
  f AS (
    SELECT * FROM agg WHERE CASE COALESCE(p_filter, 'all')
      WHEN 'missing' THEN missing > 0
      WHEN 'notype' THEN equipment_type_id IS NULL
      WHEN 'norule' THEN equipment_type_id IS NOT NULL AND n = 0
      WHEN 'excluded' THEN excluded > 0
      WHEN 'outside' THEN outside > 0
      ELSE true END
  ),
  pg AS (SELECT * FROM f ORDER BY tag_number LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(p_offset, 0), 0))
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'tag_id', pg.id, 'tag_number', pg.tag_number, 'description', pg.description, 'type_code', pg.type_code,
        'has_type', pg.equipment_type_id IS NOT NULL,
        'reqs', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', r.template_code, 'title', r.template_title, 'state', r.state,
                            'origin', r.origin, 'itr_id', r.itr_id, 'phase', ph.code, 'reason', r.reason)
                          ORDER BY ph.order_index NULLS LAST, r.template_code)
                          FROM r LEFT JOIN project_phases ph ON ph.id = r.phase_id WHERE r.tag_id = pg.id), '[]'::jsonb))
      ORDER BY pg.tag_number) FROM pg), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;
