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
           'approval', g.approval,
           -- A08 (E4): «no listo» según su causa (nodata · work · blocked); null en los demás estados.
           'work_state', public.gate_work_state(g.status, g.criteria),
           -- S23 (D-01): primer criterio que falla (bloqueante), sin las listas del detalle, para la fila de la matriz.
           'blocker', (SELECT jsonb_build_object('kind', cr ->> 'kind', 'label', cr ->> 'label',
                         'detail', (SELECT COALESCE(jsonb_object_agg(d.key, d.value), '{}'::jsonb)
                                    FROM jsonb_each(COALESCE(cr -> 'detail', '{}'::jsonb)) d
                                    WHERE jsonb_typeof(d.value) NOT IN ('array', 'object')))
                       FROM jsonb_array_elements(g.criteria) WITH ORDINALITY AS c(cr, ord)
                       WHERE cr ->> 'result' = 'fail'
                       ORDER BY c.ord LIMIT 1)
         ) ORDER BY g.gate_order, g.gate_code), '[]'::jsonb)
  FROM public.compute_system_gates(p_system_id) g
$function$;
