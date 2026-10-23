-- fn: public.tag_ai_signatures(uuid,text,integer,integer)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_ai_signatures(p_project_id uuid, p_status text DEFAULT 'all'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '32MB'
AS $function$
DECLARE v_org uuid; v_res jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  SELECT org_id INTO v_org FROM projects WHERE id = p_project_id;

  WITH active AS (
    SELECT DISTINCT ON (tp.code) tp.code,
           EXISTS (SELECT 1 FROM project_disciplines pd WHERE pd.project_id = p_project_id AND pd.discipline_id = tp.discipline_id) AS in_scope
    FROM itr_templates tp
    WHERE tp.org_id = v_org AND tp.is_active
      AND tp.phase_id IN (SELECT ph.id FROM project_phases ph WHERE ph.org_id = v_org)
      AND NOT EXISTS (SELECT 1 FROM itr_template_items i
                      WHERE i.template_id = tp.id AND i.item_type::text = 'table' AND i.options -> 'rows' ->> 'mode' = 'source')
    ORDER BY tp.code, tp.version DESC, tp.created_at DESC
  ),
  rules AS (
    SELECT m.equipment_type_id, array_agg(DISTINCT a.code ORDER BY a.code) AS codes
    FROM equipment_type_templates m
    JOIN itr_templates mt ON mt.id = m.itr_template_id
    JOIN active a ON a.code = mt.code AND a.in_scope
    WHERE m.org_id = v_org AND m.status = 'accepted'
    GROUP BY m.equipment_type_id
  ),
  u AS (
    SELECT t.tag_number, t.description, t.discipline_id, t.equipment_type_id, t.sil_level, t.fluid_type, t.signal_type,
           public.tag_number_prefix(t.tag_number) AS prefix, public.tag_desc_norm(t.description) AS desc_norm
    FROM tags t WHERE t.project_id = p_project_id AND t.equipment_type_id IS NOT NULL
  ),
  g AS (
    SELECT u.equipment_type_id, u.prefix, u.discipline_id, u.desc_norm, count(*)::int AS n,
           (array_agg(u.tag_number ORDER BY u.tag_number))[1:6] AS samples,
           mode() WITHIN GROUP (ORDER BY u.description) AS description,
           mode() WITHIN GROUP (ORDER BY u.sil_level) AS sil_level,
           mode() WITHIN GROUP (ORDER BY u.fluid_type) AS fluid_type,
           mode() WITHIN GROUP (ORDER BY u.signal_type) AS signal_type
    FROM u GROUP BY 1, 2, 3, 4
  ),
  gr AS (
    SELECT g.*, r.codes AS base, rev.id AS review_id,
           CASE WHEN rev.id IS NULL THEN 'pending' WHEN rev.base_codes = r.codes THEN 'reviewed' ELSE 'stale' END AS review_state
    FROM g JOIN rules r ON r.equipment_type_id = g.equipment_type_id
    LEFT JOIN tag_itr_ai_reviews rev ON rev.project_id = p_project_id AND rev.equipment_type_id = g.equipment_type_id
      AND rev.prefix = g.prefix AND rev.discipline_id IS NOT DISTINCT FROM g.discipline_id AND rev.desc_norm = g.desc_norm
  ),
  props AS (
    SELECT p.review_id,
           jsonb_agg(jsonb_build_object('id', p.id, 'code', p.template_code, 'action', p.action, 'confidence', p.confidence, 'reason', p.reason,
                                        'status', p.status, 'applied_tags', p.applied_tags, 'skipped_tags', p.skipped_tags)
                     ORDER BY p.status <> 'proposed', p.action, p.template_code) AS list,
           count(*) FILTER (WHERE p.status = 'proposed')::int AS open
    FROM tag_itr_ai_proposals p WHERE p.project_id = p_project_id GROUP BY p.review_id
  ),
  full_rows AS (
    SELECT gr.*, COALESCE(props.list, '[]') AS proposals, COALESCE(props.open, 0) AS open
    FROM gr LEFT JOIN props ON props.review_id = gr.review_id
  ),
  filtered AS (
    SELECT * FROM full_rows
    WHERE p_status = 'all' OR (p_status = 'pending' AND review_state <> 'reviewed') OR (p_status = 'open' AND open > 0)
  )
  SELECT jsonb_build_object(
    'groups_total', (SELECT count(*) FROM full_rows),
    'tags_total', (SELECT COALESCE(sum(n), 0) FROM full_rows),
    'pending', (SELECT count(*) FROM full_rows WHERE review_state = 'pending'),
    'stale', (SELECT count(*) FROM full_rows WHERE review_state = 'stale'),
    'reviewed', (SELECT count(*) FROM full_rows WHERE review_state = 'reviewed'),
    'open_proposals', (SELECT COALESCE(sum(open), 0) FROM full_rows),
    'no_rules', (SELECT jsonb_build_object('groups', count(*), 'tags', COALESCE(sum(n), 0)) FROM g WHERE g.equipment_type_id NOT IN (SELECT equipment_type_id FROM rules)),
    'filtered', (SELECT count(*) FROM filtered),
    'groups', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'equipment_type_id', f.equipment_type_id, 'type_code', e.code, 'type_name', e.name,
                 'prefix', f.prefix, 'discipline_id', f.discipline_id, 'discipline_code', d.code, 'discipline_name', d.name,
                 'desc_norm', f.desc_norm, 'description', f.description, 'n', f.n, 'samples', to_jsonb(f.samples),
                 'sil_level', f.sil_level, 'fluid_type', f.fluid_type, 'signal_type', f.signal_type,
                 'base', to_jsonb(f.base), 'review_state', f.review_state, 'proposals', f.proposals, 'open', f.open)
                 ORDER BY f.open DESC, f.n DESC, e.code, f.prefix, f.desc_norm), '[]')
               FROM (SELECT * FROM filtered ORDER BY open DESC, n DESC, equipment_type_id, prefix, desc_norm LIMIT p_limit OFFSET p_offset) f
               JOIN equipment_types e ON e.id = f.equipment_type_id
               LEFT JOIN disciplines d ON d.id = f.discipline_id)
  ) INTO v_res;
  RETURN v_res;
END;
$function$;
