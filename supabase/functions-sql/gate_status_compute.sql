-- fn: public.gate_status_compute(uuid)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_compute(p_system_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'gate_id', g.gate_id, 'code', g.gate_code, 'name', g.gate_name,
           'order', g.gate_order, 'computed_level', g.computed_level, 'status', g.status,
           'failing', (SELECT COUNT(*) FROM jsonb_array_elements(g.criteria) cr WHERE cr ->> 'result' = 'fail'),
           'approval', g.approval
         ) ORDER BY g.gate_order, g.gate_code), '[]'::jsonb)
  FROM public.compute_system_gates(p_system_id) g
$function$;
