-- fn: public.handover_snapshot(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.handover_snapshot(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'registers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ri.id, 'number', ri.number, 'kind', ri.kind, 'status', ri.status, 'title', ri.title,
                                    'system', (SELECT code FROM systems WHERE id = ri.system_id)) ORDER BY ri.kind, ri.number)
                          FROM register_items ri WHERE ri.project_id = p_project_id AND ri.status IN ('active', 'removed')), '[]'::jsonb),
    'itrs_in_progress', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', i.id, 'number', i.itr_number, 'tag', t.tag_number, 'progress', i.progress_pct) AS x
          FROM itrs i LEFT JOIN tags t ON t.id = i.tag_id
          WHERE i.project_id = p_project_id AND i.status = 'in_progress' ORDER BY i.itr_number LIMIT 50) q), '[]'::jsonb),
    'itrs_in_progress_total', (SELECT COUNT(*) FROM itrs WHERE project_id = p_project_id AND status = 'in_progress'),
    'punches_a', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', p.id, 'number', p.punch_number, 'description', left(p.description, 160), 'tag', t.tag_number) AS x
          FROM punches p LEFT JOIN tags t ON t.id = p.tag_id
          WHERE p.project_id = p_project_id AND p.category = 'A' AND p.status IN ('open', 'in_progress') ORDER BY p.punch_number LIMIT 50) q), '[]'::jsonb),
    'constraints', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'number', c.number, 'title', c.title, 'level', c.escalation_level,
                                    'need_date', c.need_date, 'system', s.code) ORDER BY c.escalation_level DESC, c.need_date)
                          FROM project_constraints c JOIN systems s ON s.id = c.system_id
                          WHERE c.project_id = p_project_id AND c.status = 'open'), '[]'::jsonb),
    'actions_overdue', COALESCE((SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('id', a.id, 'number', a.number, 'title', a.title, 'due_date', a.due_date) AS x
          FROM actions a WHERE a.project_id = p_project_id AND a.status IN ('open', 'in_progress') AND a.due_date < public.project_today(p_project_id)
          ORDER BY a.due_date LIMIT 50) q), '[]'::jsonb),
    'taken_at', now()
  );
$function$;
