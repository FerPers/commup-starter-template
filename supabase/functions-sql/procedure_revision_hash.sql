-- fn: public.procedure_revision_hash(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.procedure_revision_hash(p_revision_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'procedure', p.number, 'title', p.title, 'rev', r.rev, 'sections', r.sections,
    'steps', COALESCE((SELECT jsonb_agg(jsonb_build_object('ord', s.ord, 'action', s.action, 'responsible', s.responsible,
                'expected', s.expected_value, 'tag', s.tag_id, 'hold', s.is_hold_point, 'capacity', s.hold_capacity,
                'stop', s.stop_criteria)
                -- S25 (E-23): el rango solo entra si existe (las revisiones anteriores conservan su hash).
                || jsonb_strip_nulls(jsonb_build_object('min', s.expected_min, 'max', s.expected_max, 'unit', s.expected_unit)) ORDER BY s.ord)
              FROM procedure_steps s WHERE s.revision_id = r.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
  FROM procedure_revisions r JOIN procedures p ON p.id = r.procedure_id WHERE r.id = p_revision_id;
$function$;
